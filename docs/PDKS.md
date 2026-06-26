# PDKS — Personel Devam Kontrol Sistemi

Çok-kiracılı (multi-tenant), konum-doğrulamalı personel giriş/çıkış (devam takip)
modülü. iotomasyon ana uygulamasının içinde, ayrı bir personel PWA'sı (`/personel`,
eski `/pdks` buraya yönlenir) ve
yönetici paneli (`/admin/pdks`) olarak yaşar.

> Durum (2026-06-25): Temel PDKS akışı canlıda ve gerçek telefonla doğrulandı.
> Ürün, Alfa Soylu CRM'inden ayrışıp **aylık/yıllık abonelikli, çok-kiracılı bir
> SaaS**'a dönüştürülüyor. Anasayfa (`iotomasyon.com`) PDKS satış landing'i oldu;
> Alfa Soylu CRM `/alfas`'a taşındı (Faz 1 tamam). Sıradaki: self-servis kayıt +
> tenant-bazlı yönetici paneli + ödeme (Faz 2).

---

## 🎯 Hedef & İş Modeli

PDKS'i, küçük/orta saha işletmelerine **aylık abonelikle satılan** bağımsız bir
SaaS ürününe dönüştürmek.

- **Ürün:** Konum doğrulamalı personel devam takip (geofence check-in/out, otomatik
  çıkış, izin, puantaj, push) — kurulum gerektirmeyen PWA.
- **Fiyatlandırma:** 30 gün ücretsiz deneme · **Aylık ₺499** · **Yıllık ₺4.000**
  (≈%33 tasarruf). Tek paket, tüm özellikler dahil. (KDV hariç.)
- **Hedef müşteri:** şantiye/saha ekibi olan KOBİ'ler; her müşteri = bir **tenant**.
- **Dağıtım:** her müşteriye özel link → çalışanlar PWA'yı ana ekrana ekler; tenant
  yöneticisi kendi panelinden yönetir.

## 🧭 Fazlar

| Faz | Kapsam | Durum |
|---|---|---|
| **Faz 0 — Çekirdek PDKS** | Geofence giriş/çıkış, otomatik çıkış, geç-kalma bildirimi, izin, haftalık program + tatiller, aylık puantaj/CSV, cihaz kilidi, KVKK | ✅ DONE |
| **Faz 1 — Satış sitesi & rota ayrımı** | Anasayfa → PDKS landing (fiyat/SSS/CTA), Alfa Soylu → `/alfas`, SEO (landing index; özel rotalar noindex; robots+sitemap) | ✅ DONE |
| **Faz 2 — Self-servis SaaS** | Müşteri kayıt (kullanıcı adı/slug) → tenant + tenant-admin oluşturma; tenant-bazlı yönetici login & PWA linki; varsayılan değerlerle gelip kişiselleştirilebilen panel; ödeme entegrasyonu (deneme→ücretli), erişim kapısı, yasal sayfalar | 🔜 NOT STARTED |
| **Faz 3 — Kurumsal** | Vardiya yönetimi, onay hiyerarşisi, ERP/bordro entegrasyonu, SSO/2FA, denetim kaydı, gelişmiş raporlama, çoklu lokasyon | 🔭 PLANNED |

## Mimari

- **Şema yerleşimi:** Tüm tablolar `public` şemada, `pdks_` önekli. RLS açık
  (politika yok → `anon`/`authenticated` için deny-all; uygulama `postgres` rolüyle
  bağlanıp RLS'i bypass eder — proje genel güvenlik postürüyle tutarlı).
- **Tenant izolasyonu (uygulama katmanı):** Her istek `lib/pdks/context.ts`
  (`AsyncLocalStorage`) ile tenant bağlamı kurar; `lib/pdks/prisma.ts` içindeki
  scoped Prisma client her sorguya otomatik `tenantId` enjekte eder. "Where'e
  tenantId koymayı unutma" riski tek noktada kapanır.
- **Geofence kararı SUNUCUDA:** İstemci yalnızca ham `latitude/longitude/accuracy`
  gönderir; mesafe (haversine) ve doğruluk/yarıçap kontrolü sunucuda yapılır
  (`lib/pdks/geo.ts`, `app/api/pdks/check-in`).
- **KVKK:** `pdks_personnel.kvkkConsentAt` null ise check-in/out (konum işleme)
  sunucu tarafında engellenir. Varsayılan olarak yalnızca **mesafe** saklanır.

## Veri modeli (Prisma)

| Tablo | Rol |
|---|---|
| `pdks_tenants` | Kiracı (şirket) |
| `pdks_personnel` | Personel; `phone`, `kvkkConsentAt`, `expectedCheckIn`, `lastLateReminderOn` |
| `pdks_worksites` | Şantiye; `latitude/longitude`, `radiusMeters`, `maxAccuracyMeters` |
| `pdks_personnel_worksites` | Personel ↔ şantiye ataması (M:N) |
| `pdks_attendance_records` | Günlük giriş/çıkış; `status` open/closed, mesafeler |
| `pdks_login_codes` | Tek kullanımlık giriş kodu (bcrypt hash, TTL) |
| `pdks_push_subscriptions` | Web Push aboneliği |

## Kimlik doğrulama

- **Personel girişi:** telefon + **kalıcı şifre/PIN** (bcrypt). Admin oluşturur ve
  sıfırlar; SMS yok. Personel kendi telefonunda bir kez girer, oturum 7 gün kalır.
- **Cihaz bağlama (tek cihaz kilidi):** İlk başarılı giriş, personelin cihazına
  uzun ömürlü `pdks_device` cookie token'ı yazar ve hash'ini (`deviceIdHash`,
  SHA-256) saklar. Sonraki girişlerde token eşleşmezse `device_mismatch` (403).
  Cihaz/telefon değişiminde admin **"cihazı sıfırla"** (`resetDeviceAction`) der.
  IP'ye değil cihaza bağlıdır → mobil IP değişiminden etkilenmez.
- Telefon kanonik normalize edilir (`5XXXXXXXXX`); giriş ve kayıt aynı normalize'i
  kullanır. Oturum imzalı cookie ile taşınır (`lib/pdks/session.ts`).
- **Yönetici:** ana uygulama kullanıcısı; `/admin/pdks` `PERMISSIONS.PDKS_MANAGE`
  ile korunur. Personel/şantiye CRUD, şifre/cihaz sıfırlama, puantaj/CSV.

## Geofence ve doğruluk

- **Check-in ve check-out** aynı sunucu-tarafı kontrole tabidir; ikisinde de konum zorunlu.
- En yakın atanmış aktif şantiye haversine ile bulunur (check-out'ta kaydın şantiyesi).
- **Yarıçap kapısı:** mesafe `worksite.radiusMeters`'i (varsayılan 100 m) aşarsa reddedilir.
- **Doğruluk kapısı:** cihaz `accuracy` değeri `worksite.maxAccuracyMeters`'i
  (varsayılan 100 m) aşarsa reddedilir — şantiye-başına ayarlanır (şehir içi/kapalı
  alan GPS'i için gevşetilebilir).

## PWA & bildirim

- `public/personel/manifest.webmanifest` + `sw.js` + ikonlar (192/512). "Ana Ekrana Ekle"
  ile uygulama gibi yüklenir.
- **Web Push (VAPID):** `PDKS_VAPID_PUBLIC_KEY`, `PDKS_VAPID_PRIVATE_KEY`,
  `PDKS_VAPID_SUBJECT` env'leri gerekir (`npx web-push generate-vapid-keys`).
- **Artan geç-kalma hatırlatması:** `/api/pdks/cron/reminders` her 5 dk çalışır;
  giriş yapmamış personele "5/10/…/60 dakika geç kaldınız" gönderir, 60 dk'da durur.
  `lateReminderLastMin` + `lastLateReminderOn` ile aynı dilim tekrar edilmez.
  **Tetikleme:** Vercel Hobby yalnızca günlük cron'a izin verdiğinden bu uç nokta
  `vercel.json`'da değil; harici bir zamanlayıcı (cron-job.org / GitHub Actions) ile
  her 5 dk `Authorization: Bearer $CRON_SECRET` başlığıyla çağrılır. (Vercel Pro'da
  `vercel.json`'a `*/5 * * * *` cron eklenebilir.)

## Kurulum / test

1. Migration'ları uygula — `scripts/pdks/` (Supabase SQL Editor) veya
   `prisma migrate deploy`.
2. Push için VAPID env'leri (Vercel). Giriş/çıkış testi için zorunlu değil.
3. `/admin/pdks` → şantiye (konum + yarıçap + doğruluk) ve personel ekle, giriş kodu üret.
4. Telefonda `/personel` → telefon + şifre → KVKK onayı → GPS check-in/out.

Hızlı test verisi (sabit kod): `scripts/pdks/test_seed.sql`.

## Bilinen tasarım notları

- Çıkıştan sonra aynı gün ikinci giriş **yeni** kayıt açar (çok-vardiya senaryosu için
  kasıtlı). Pano/puantaj aynı günün en son kaydını gösterir.
- Ham koordinatlar varsayılan olarak DB'ye yazılmaz (KVKK); yalnızca mesafe + doğruluk.

---

## Faz 2 — Self-servis SaaS gereksinimleri (detay)

Müşterinin (tenant) ürünü kendi başına alıp kurabildiği akış. Hedef davranış:

- **R1 — Müşteri kullanıcı adı (slug):** Kayıt sırasında her müşteri benzersiz bir
  kullanıcı adı/slug seçer (`pdks_tenants.slug` zaten var). Bu, tenant'ın kalıcı
  kimliği ve URL'sidir.
- **R2 — Tenant'a ait login profili:** Slug ile müşterinin **kendi yönetici hesabı**
  oluşur. (Mevcut model: yönetici = global CRM `User` + `PDKS_MANAGE`; SaaS'ta her
  tenant'ın kendi yöneticisi olmalı → tenant-admin kimliği. Mevcut `pdks_personnel.role
  = 'tenant_admin'` bu role temel olabilir.)
- **R3 — Müşteriye özel link:** Tenant-bazlı URL (örn. `iotomasyon.com/t/{slug}` ya da
  `{slug}.iotomasyon.com`). Çalışanlar bu linkten PWA'yı "ana ekrana ekler". Bugün
  `/personel` global/tek-tenant (`resolveAdminTenantId` ilk aktif tenant'ı seçer);
  tenant'a göre çözülecek hâle gelmeli (manifest `start_url`/`scope` slug'a göre).
- **R4 — Linkte yönetici login:** Aynı tenant URL'sinde yönetici giriş ekranı; tenant
  yöneticisi kendi slug'lı adresinden panele girer (global `/login`'den ayrı, tenant-scoped).
- **R5 — Varsayılan + kişiselleştirme:** Yeni tenant makul **default'larla** açılır
  (haftalık program Pzt–Cuma 08:30–18:30 / Cmt 08:30–13:00, geofence yarıçapı 100 m,
  doğruluk 100 m, TR resmi tatilleri) ve yönetici bunları **kendine göre optimize eder**.
  Default tohumlama tenant oluşturma anında yapılmalı.

**Mimari etkiler / kararlar (Faz 2 başlarken netleşecek):**
1. Tenant routing: path (`/t/{slug}`) mi subdomain mi? (path daha basit; subdomain daha "kurumsal".)
2. Tenant-admin auth: ayrı oturum mu, mevcut JWT'ye `tenantId` + `tenant_admin` rolü mü?
3. Kayıt akışı: form → slug doğrulama (benzersiz/serbest) → tenant + tenant-admin + default seed → deneme başlatma.
4. Ödeme sağlayıcısı: **henüz seçilmedi** (öneri: iyzico — TL tekrarlayan tahsilat). Seçilince abonelik yaşam döngüsü + erişim kapısı + webhook.
5. Erişim kapısı: deneme/abonelik aktif değilse `/personel` ve yönetici paneli kilitlenir.
6. Zorunlu yasal sayfalar: Mesafeli Satış Sözleşmesi, Gizlilik/KVKK, İptal & İade, Ön Bilgilendirme.

---

## Backlog & Hedefler

> Kaynak: 2026-06-25 tam kod analizi (eksikler C*, güvenlik D*) + Faz 2 gereksinimleri.
> Tamamlanan madde "Yapılanlar"a taşınır.

### Faz 2 (öncelik)
- [~] R1–R5 (Artım 1 yapıldı): self-servis kayıt (`/kayit`) + tenant slug + default
  seed (program/tatil) + 30 gün deneme + tenant-admin oluşturma **tamam (feature dalı)**.
  Kalan: tenant-bazlı yönetim paneli + `/t/{slug}` PWA linki + erişim kapısı bağlama (Artım 2).
- [ ] Ödeme sağlayıcısı seçimi → abonelik modeli (`PdksPlan`, `PdksSubscription`) + erişim kapısı
- [ ] Yasal sayfalar (Mesafeli Satış, KVKK, İptal/İade, Ön Bilgilendirme)
- [ ] Landing CTA'larını gerçek kayıt akışına bağla (şu an `#iletisim`/mailto)
- [ ] İletişim e-postası/WhatsApp'ı gerçek değerle güncelle (şu an `info@iotomasyon.com`)

### Güvenlik (analiz D*)
- [ ] **D1 (Kritik):** cron endpoint fail-closed — `CRON_SECRET` yoksa 503/throw (`app/api/pdks/cron/reminders/route.ts:44-47`)
- [ ] **D2 (Yüksek):** push subscribe `deleteMany`'ye açık `tenantId` ekle (`push/subscribe/route.ts:30`)
- [ ] **D3 (Orta):** cihaz kilidi logout'ta sıfırlama seçeneği ("bu cihazı çıkar")
- [ ] **D4 (Orta):** manuel saat düzeltmelerine audit log
- [ ] **D5 (Düşük):** GPS spoofing'e karşı ek sinyaller (kabul: mobil sınırı)

### Ürün eksikleri (analiz C*)
- [ ] **C1:** offline check-in kuyruğu (Service Worker + IndexedDB)
- [ ] **C2:** audit log modeli (`PdksAuditLog`) + manuel düzeltme izleri
- [ ] **C3:** `PdksLoginCode` ile ilk kurulum/şifre belirleme akışı (şu an kullanılmıyor)
- [ ] **C4:** güvenilir cron tetikleyici (cron-job.org / Vercel Pro) — 5 dk kesinliği
- [ ] **C5:** kritik mantığa test (timezone, geofence, otomatik çıkış, izin çakışması)
- [ ] **C6:** hata telemetrisi (Sentry) — sessiz arızaları yakala
- [ ] **C7:** yıllık izin bakiyesi/hakediş (`PdksLeaveBalance`)
- [ ] PDF/Excel rapor (şu an yalnızca CSV)
- [ ] Tekrarlı kod birleştirme: `lib/pdks/time.ts` (zaman parse) + `format.ts` (TR tarih/saat)

---

## Yapılanlar (delta günlüğü)

> Append-only. Her görevden sonra en yeni en üste eklenir (AGENTS.md "Dokümantasyon disiplini").

### 2026-06-26
- **Faz 2 / Artım 1 — Tenant provizyon temeli (feature dalı; prod migration bekliyor):**
  - Şema: `PdksTenant`'a abonelik/deneme alanları eklendi — `subscriptionStatus`
    (default `trial`), `plan`, `trialEndsAt`, `currentPeriodEnd`, `ownerEmail`
    (migration `20260625230000_pdks_tenant_subscription` + idempotent
    `scripts/pdks/apply_tenant_subscription.sql`). **Not:** MCP onay aksaklığı
    nedeniyle canlı DB'ye HENÜZ uygulanmadı; uygulanınca main'e promote edilecek.
  - `lib/pdks/tenant-provision.ts`: `createTenantWithDefaults` (tenant + tenant-admin
    + 30 gün deneme + varsayılan haftalık program + 2026 tatilleri), `slugify`,
    `isSlugAvailable`, `tenantAccessStatus` (erişim kapısı kararı).
  - Self-servis kayıt: `/kayit` sayfası + `components/pdks/register-form.tsx` +
    `lib/actions/pdks-register-actions.ts` (zod doğrulama, slug benzersizlik).
  - Landing CTA'ları (`Ücretsiz Deneyin` + plan butonları) `/kayit`'e bağlandı.
  - `tsc` 0 hata, eslint temiz. Karar (tam yetki): tenant routing **path tabanlı
    `/t/{slug}`**, erişim **deneme-öncelikli** (ödeme sağlayıcı seçilince), tenant-admin
    mevcut personel auth'u `role='tenant_admin'` ile.
  - **Sıradaki (Artım 2):** tenant-bazlı yönetim paneli + `/t/{slug}` PWA linki +
    erişim kapısının `/personel`'e bağlanması.
- **Dokümantasyon kuralı:** AGENTS.md'ye "her görevden sonra MD güncelle" disiplini.

### 2026-06-25
- **Dokümantasyon:** PDKS.md'ye hedef/iş modeli, fazlar, Faz 2 gereksinimleri, backlog
  ve bu günlük eklendi. AGENTS.md'ye "her görevden sonra MD güncelle" kuralı eklendi.
- **Faz 1 — Satış sitesi & rota ayrımı (main'de):**
  - `app/page.tsx` → PDKS satış landing'i (hero, 8 özellik, fiyat, SSS, iletişim).
  - `app/alfas/page.tsx` → eski Alfa Soylu Depo Arama + panel girişi taşındı (noindex).
  - Fiyatlandırma: 30 gün deneme · Aylık ₺499 · Yıllık ₺4.000 (≈%33 tasarruf).
  - SEO: kök global noindex kaldırıldı (landing index); `/alfas`, `/personel`, `/login`,
    panel `(app)`, `/c/*` noindex; `app/robots.ts` + `app/sitemap.ts` eklendi.
  - `tsc` 0 hata, eslint temiz. Commit'ler: `253672f`, `b6510f4` (main).
- **Cron 308 düzeltmesi (main):** GitHub Actions hatırlatma workflow'u `HTTP 308`'e
  takılıp otomatik çıkışı hiç çalıştırmıyordu; `curl -L --location-trusted` eklendi.
  Takılı kalan açık kayıtlar manuel kapatıldı. Commit `bf3da26`.

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

> **🔒 DAHİLİ İŞ KARARI (public'e yansıtılmaz) — 2026-06-26:**
> **10 müşteri bandına ulaşana kadar ödeme sistemi KURULMAYACAK.** Sistem o ana
> kadar herkese sessizce **ücretsiz** çalışmaya devam eder: deneme süresi bitse bile
> **erişim kapısı (lockout) ETKİNLEŞTİRİLMEZ**. Public tarafta (landing/`/kayit`)
> "30 gün deneme" + fiyat mesajı normal görünür; müşteriler ücretsiz devam ettiğini
> bilmez. `tenantAccessStatus` yardımcı fonksiyonu mevcut ama HİÇBİR yere bağlı değil
> (kasıtlı). 10 müşteriye ulaşınca: ödeme sağlayıcı (öneri iyzico) + erişim kapısı
> devreye alınır. Bayrak fikri: `PDKS_BILLING_ENFORCED` (default false).

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
- [x] **R1–R5 TAMAM** (Artım 1+2+3, main, migration canlıda): self-servis kayıt
  (`/kayit`) + tenant slug + default seed + 30 gün deneme; müşteriye özel link
  `/t/{slug}` + tenant-scope'lu PWA; tenant-admin yönetim paneli `/t/{slug}/yonetim`
  (personel + şantiye + atama). Erişim kapısı iş kararı gereği bağlanmadı (10 müşteriye kadar).
  Kalan iyileştirmeler: tenant panelde program/izin/rapor sekmeleri (CRM'de var, tenant
  yüzeyine taşınabilir); push url'sini tenant-aware yapma.
- [ ] Ödeme sağlayıcısı seçimi → abonelik modeli (`PdksPlan`, `PdksSubscription`) + erişim kapısı
- [ ] Yasal sayfalar (Mesafeli Satış, KVKK, İptal/İade, Ön Bilgilendirme)
- [ ] Landing CTA'larını gerçek kayıt akışına bağla (şu an `#iletisim`/mailto)
- [ ] İletişim e-postası/WhatsApp'ı gerçek değerle güncelle (şu an `info@iotomasyon.com`)

### Güvenlik (analiz D*)
> 2026-09-14 taraması: ayrıntı ve satır numaraları `docs/SECURITY-AUDIT-2026-09-14.md`.
- [x] **S-K1 (Kritik):** `next@16.3.5` yükselt — 16.2.6'da kimlik doğrulamasız RCE (image optimization/AVIF + Windows)
- [ ] **S-K2 (Kritik):** Hepsiburada şifresini değiştir (dosya repodan silindi 2026-09-14; **rotasyon + geçmiş temizliği kullanıcıda**)
- [x] **S-Y1 (Yüksek):** `runSync`'i `"use server"` modülünden çıkar (auth'suz SSRF + DB yazma)
- [x] **S-Y2 (Yüksek):** auth'suz okuma action'ları: `getProductImportSnapshotsAction`, `getProductStockAdjustments`, exchange-rate okuyucuları
- [x] **S-Y3 (Yüksek):** PDKS login rate limit + PIN min 6 + tek tip 401 (cihaz kontrolü bcrypt'ten bağımsız)
- [x] **S-Y4 (Yüksek):** `sharp@0.35.4`, `npm audit fix` (tiptap/fast-uri/nanoid); `xlsx` için alternatif değerlendir
- [x] **S-O2 (Orta):** `product.description` sanitize (tedarikçi XML → stored XSS)
- [x] **S-O3 (Orta):** PDKS oturumunu her istekte DB ile doğrula (isActive/rol/cihaz)
- [x] **S-O4 (Orta):** `/kayit`'a Turnstile + rate limit
- [x] **S-O5 (Orta):** `getCurrentSession` fallback'ini yalnız P2021'e daralt (deny override kaybı)
- [x] **D1 (Kritik):** cron endpoint fail-closed — `CRON_SECRET` yoksa 503/throw (`app/api/pdks/cron/reminders/route.ts:44-47`; aynı desen `api/cron/xml-sync`, `api/cron/trendyol-sync`)
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

### 2026-09-14 (devam) — Güvenlik taraması bulgularının düzeltilmesi

- **Kritik:** `next` 16.2.6 → **16.3.5** (RCE advisory'leri kapandı; production build
  doğrulandı). `scripts/hepsiburada-probe.ts` (gömülü şifre) repodan silindi —
  **şifre rotasyonu ve git geçmişi temizliği kullanıcıda.**
- **Yüksek:** `runSync` → `lib/xml-sync-runner.ts` ("use server" DEĞİL; anonim SSRF/DB
  yazma kapandı). `getProductImportSnapshotsAction`, `getProductStockAdjustments`,
  `getExchangeRateForDate`, `getLatestRmbUsdRate` artık `requireUser` ister. PDKS login:
  `lib/pdks/rate-limit.ts` (telefon 5 / IP 20 / 15 dk, 429 + Retry-After), cihaz kontrolü
  bcrypt'ten ÖNCE (şifre oracle'ı kapandı), tüm hatalar 401; yeni PIN min 6 (giriş
  etkilenmez). Bağımlılıklar: `sharp` 0.35.4, `xlsx` 0.20.3 (SheetJS CDN), tiptap 3.31.x.
- **Orta:** `lib/cron-auth.ts` — üç cron ucu fail-closed (secret yoksa 503) + sabit
  zamanlı karşılaştırma. `lib/sanitize-rich-text.ts` (sanitize-html allowlist) ürün
  açıklaması render'ında. PDKS oturumu her istekte DB ile doğrulanıyor (isActive/tenant/
  rol/cihaz). `/kayit`: Turnstile + IP başına 5/saat + admin şifresi min 8.
  `getCurrentSession` fallback yalnız P2021/P2022. CRM JWT `iss=iotomasyon, aud=crm`;
  PDKS JWT `aud=pdks` — **mevcut oturumlar bir kez düşer, yeniden giriş gerekir.**
- **Düşük:** görsel yükleme magic-byte doğrulaması (SVG reddi, ext sabit haritadan,
  productId varlık kontrolü); `lib/safe-error-message.ts` ile 7 uçta ham hata mesajı
  gizlendi; `/c/[token]/interest` rate limit + ürün kapsam kontrolü; `sw.js` slug
  doğrulama + bilinmeyen tenant 404; push unsubscribe `personnelId` kapsamı;
  `/no-access` `(app)` dışına taşındı (redirect döngüsü).
- **Yerleşik CAPTCHA (kullanıcı kararı: dış servis/anahtar istenmedi):** `lib/captcha.ts`
  5 rakamı SVG çizgi yolu olarak çizer (metin öğesi yok), cevap istemciye gitmez; HMAC
  imzalı token (SESSION_SECRET, opsiyonel CAPTCHA_SECRET), 5 dk TTL, tek kullanımlık.
  `components/auth/image-captcha.tsx` + `lib/actions/captcha-actions.ts` (yenile).
  `/login` ve `/kayit` varsayılan olarak bunu kullanır; Turnstile anahtarları tanımlıysa
  o öne geçer. Doğrulama: PNG'ye çevrilen resim okunup doğru cevapla giriş akışı geçti,
  yanlış cevap/süresi dolmuş/kurcalanmış/tekrar kullanılan token reddedildi.
- **Genel `lib/rate-limit.ts`** fabrikası; `lib/login-rate-limit.ts` ona devredildi.
- **Doğrulama:** `tsc` temiz, `next build` başarılı, testler 6/6 + 22/22; dev sunucuda
  cron 503, sw.js 404, PDKS login 4×401 → 429, `/kayit` Turnstile, sanitizer XSS
  vektörlerini temizliyor. `npm run lint`'teki 35 hata dokunulmayan eski dosyalarda
  (eslint-config-next 16.3.5'in yeni react-hooks kuralları) — ayrı iş.
- **Kalan:** `npm audit` 4 yüksek — hepsi `prisma` CLI'ın dev-only bağımlılıkları
  (hono/mysql2/deepmerge-ts), runtime'a girmiyor. Bellek içi limiter'lar örnek başına
  (kalıcı çözüm: Vercel Firewall kuralı / KV).

### 2026-09-14 — Güvenlik taraması + /login CAPTCHA + brute-force sınırı + güvenlik header'ları

- **Tarama:** Tüm API rotaları, 150 server action, PDKS auth, ham SQL, sır taraması
  (git geçmişi dahil) ve `npm audit`. Rapor: `docs/SECURITY-AUDIT-2026-09-14.md`.
  En kritik iki açık bulgu: **Next.js 16.2.6'da kimlik doğrulamasız RCE** (→ 16.3.5)
  ve `scripts/hepsiburada-probe.ts` içinde git'e işlenmiş canlı Hepsiburada şifresi.
- **CAPTCHA (Cloudflare Turnstile):** `lib/turnstile.ts` (siteverify, fail-closed),
  `components/auth/turnstile-widget.tsx` (explicit render, dark tema, `key` ile reset),
  `components/auth/login-form.tsx` + `app/(auth)/login/page.tsx`. Env:
  `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` (ikisi de tanımlıysa açık;
  yoksa kapalı + production'da uyarı). Test anahtarları `.env.example`'da.
- **Brute-force sınırı:** `lib/login-rate-limit.ts` — e-posta başına 5, IP başına 20
  başarısız deneme / 15 dk; bcrypt'ten önce kontrol. Bellek içi (örnek başına), CAPTCHA'nın
  yedeği. Test: `npx tsx __tests__/login-rate-limit.test.ts` (6/6).
- **Header'lar (`next.config.ts`):** HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy,
  Permissions-Policy (geolocation=self — PDKS check-in için), `poweredByHeader: false`.
- **Doğrulama:** Dev sunucuda widget render + token üretimi, yanlış şifrede widget
  sıfırlanması, 6. denemede "Çok fazla başarısız deneme" mesajı, header'lar `fetch` ile.

### 2026-09-09 — Faz 91: Trendyol Finans modülü (fatura/kesinti/hakediş)

- **Amaç:** Trendyol partner panelindeki Finans → Faturalar ekranından indirilen
  dosyalar panele yüklensin, komisyon/kargo/hizmet/reklam/ceza kesintileri tek
  yerde biriksin, net maliyet görülebilsin. API entegrasyonu değil — dosya beslemesi.
- **Şema (`prisma/migrations/20260909220000_trendyol_finance`):** 4 yeni tablo
  (`trendyol_invoice`, `trendyol_invoice_line`, `trendyol_settlement_line`,
  `trendyol_finance_import`) + 2 enum (`TrendyolCostGroup`, `TrendyolInvoiceLineKind`).
  Hepsinde RLS açık (MIGRATION-SAFETY invariantı). Additive, veri silmez.
- **Ayrıştırıcı (`lib/trendyol-finance/parse.ts`):** 9 dosya varyantı tanınır.
  Tanıma **sütun başlıklarından** yapılır, dosya adından değil — tarayıcı
  " (1)" ekliyor, kullanıcı başına rakam yapıştırabiliyor. Dosya adı yalnız
  Trendyol'un iç belge numarasını (`sourceRef`) vermek için kullanılır.
- **PDF okuma (`lib/trendyol-finance/pdf-text.ts`):** Trendyol e-faturaları gömülü
  subset CID font kullanıyor; `Tj` dizileri glyph id. Yeni bağımlılık eklemek
  yerine `/ToUnicode` CMap'lerini çözen ~120 satırlık okuyucu yazıldı. Kritik
  ayrıntı: `Td` boşluk üretmez (yalnız kerning), gerçek boşluk glyph `0x0003`.
- **Fatura ↔ detay eşleştirme:** Detay dosyaları fatura numarası taşımıyor. Detay
  satırlarının toplamı ilgili faturanın tutarına kuruşu kuruşuna eşit çıktığı
  görüldü (20 dosyada doğrulandı: kargo 22.014,30 ₺ → DDF2026020280150 vb.), bu
  yüzden eşleştirme toplam tutar üzerinden yapılıyor. Birden fazla aday varsa
  bağlanmıyor — yanlış bağlamak, bağlamamaktan kötü.
- **Ekranlar:** `/marketplace/trendyol/finans` (kokpit + sürükle-bırak yükleme),
  `…/finans/faturalar` (filtreli liste), `…/finans/siparisler` (sipariş bazında
  maliyet, hakediş ile birleşik). Menüde "Pazaryerleri" bölümünde.
- **API:** `POST /api/marketplace/trendyol-finance/import` (çoklu dosya,
  `EXECUTIVE_READ` izni). Yazıcı idempotent — aynı dosya tekrar yüklenirse satır
  çoğalmaz.
- **Doğrulama:** 50 gerçek dosyanın 49'u ayrıştırıldı (tanınmayan tek dosya 2021
  tarihli, ToUnicode taşımayan eski şablon). `scripts/trendyol-finance-parse-check.ts`
  ile tekrarlanabilir. `tsc` 0 hata (mevcut `web-push` hatası hariç), eslint temiz,
  `npm run build` başarılı.
- **Bekleyen:** migration production'a **uygulanmadı** — kullanıcı onayı bekliyor.

### 2026-06-26 (devam 3)
- **Faz 2 / Artım 3 — Tenant-admin self-servis yönetim paneli (R4, R5):**
  - `app/t/[slug]/yonetim/page.tsx`: tenant-admin paneli. Yetki: `requireTenantAdminFor`
    (pdks_session role=`tenant_admin` + slug↔tenantId eşleşmesi); yoksa `/t/{slug}`'a redirect.
  - `lib/pdks/tenant-admin.ts` (`requireTenantAdminFor`, `runAsTenantAdmin`) +
    `lib/actions/pdks-tenant-actions.ts`: tenant-scope'lu personel (ekle/şifre/cihaz/
    aktif) ve şantiye (ekle/aktif/personel atama) action'ları. Mevcut CRM admin kodu
    (`pdks-admin-actions.ts`) hiç değişmedi — ayrı yüzey.
  - `components/pdks/tenant/admin-panel.tsx`: personel + şantiye yönetimi (konum
    "Konumumu kullan" ile otomatik). Şantiyeye personel atama (geofence için gerekli).
  - `PersonnelApp`'e `adminHref` prop'u: tenant-admin uygulamada "⚙ Yönetim" linki görür.
  - `tsc` 0 hata, eslint temiz. **R1–R5 tamam** (erişim kapısı iş kararı gereği bağlı değil).

### 2026-06-26 (devam 2)
- **Faz 2 / Artım 2 — Müşteriye özel link `/t/{slug}` (R3):**
  - `app/t/[slug]/page.tsx`: tenant-branded personel giriş/çalışma ekranı (slug→tenant,
    yoksa 404). Mevcut `PersonnelApp` yeniden kullanıldı.
  - Tenant-scope'lu PWA: `app/t/[slug]/manifest.webmanifest/route.ts` (şirket adıyla
    branded, start_url/scope=`/t/{slug}`) + `app/t/[slug]/sw.js/route.ts`
    (`Service-Worker-Allowed: /t/{slug}` ile push çalışır) + `layout.tsx`.
  - `PersonnelApp`'e opsiyonel `swUrl`/`swScope`/`brand` prop'ları eklendi; varsayılanlar
    `/personel` davranışını AYNEN korur (mevcut canlı akış bozulmadı).
  - Kayıt başarı ekranı çalışan linkini (`iotomasyon.com/t/{slug}`) gösterir.
  - `robots.ts`'e `/t/` disallow. `tsc` 0 hata, eslint temiz.
  - **Migration CANLIDA** (`apply_migration` başarılı): `pdks_tenants` 5 abonelik kolonu.
  - Erişim kapısı iş kararı gereği BAĞLANMADI.
  - **Sıradaki (Artım 3):** tenant-admin self-servis yönetim paneli (personel/şantiye/
    program CRUD, pdks_session tenantId ile scoped).

### 2026-06-26 (devam)
- **İş kararı:** 10 müşteriye kadar ödeme sistemi yok; erişim kapısı bilinçli kapalı
  (sistem sessizce ücretsiz). Dahili not "Hedef & İş Modeli"ne eklendi.
- **Kayıt akışı sağlamlaştırma:** `registerTenantAction` DB hatalarını yakalayıp
  (ör. migration henüz uygulanmadıysa) 500 yerine nazik mesaj döner → Artım 1
  main'e güvenle promote edilebilir.
- **Promote:** Artım 1 main'e alındı.
- **Cron teşhisi (bildirim gelmedi):** Fix çalışıyor (06:57 UTC run `HTTP 200`,
  `pushConfigured:true`, `candidates:3`, `reminded:0`). Sorun GitHub cron throttling —
  sabah hatırlatma penceresinde (08:35–09:30 TR) hiç tetiklenmedi; tek run 09:57 TR'de
  oldu (60 dk üst sınırı aşıldı → gönderim yok). Kalıcı çözüm: cron-job.org (backlog C4).
- **Canlı DB migration:** MCP onay aksaklığı + ortamda DB kimliği olmaması nedeniyle
  AJAN TARAFINDAN UYGULANAMADI; idempotent SQL kullanıcıya verildi
  (`scripts/pdks/apply_tenant_subscription.sql`).

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

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

### CFO yol haritası — "her 1 TL nereye?" (2026-10-07, Alperen: tam yetki, bağımsız CFO)
> Hedefler: aylık ciro ≥ 100.000 USD · toplam borç < 5.000.000 TL · net sermaye ≥ 300.000 USD. North star: risk ayarlı sürdürülebilir
> net sermaye büyümesi. İlke: hesap/tarama/sıralama deterministik; LLM yalnız muhakemede; maddi değişiklik yoksa AI çağrısı 0.
> Sıra ekonomik değer / maliyet ile belirlenir. Dış işlem (para, kredi, sipariş, fiyat) insan onayı olmadan yapılmaz.
> Durum 07.10: ciro ~53k TL/gün (gereken 181,5k, ~3,4×) · borç 9,24M (açık 4,24M) · net sermaye açığı 11,8M TL ve
> GERİLİYOR (−33k TL/gün; büyük kısmı stok değerleme oynaklığı) · nakit 71k TL · 01.11'de nakit dibi −3,31M (taban −3M).

1. [x] **Sermaye verimliliği + marjinal tahsis motoru** — ✅ TAMAMLANDI 2026-10-07 (`lib/cfo/capital-efficiency.ts`, `/cfo/sermaye`, AI CFO B4h).
2. [x] **VALUE OF INFORMATION ENGINE** — ✅ TAMAMLANDI 2026-10-07 (`lib/cfo/voi.ts`, `/cfo/sorular` üst kartı, AI CFO B4i). Sonraki adım: soru
   üretimini (workflow-plan) VOI eşiğine bağla — değeri eşik altı soru hiç oluşturulmasın; cevapları sayıya çevirip hafızaya yaz.
3. [x] **Decision Memory + beklenen/gerçekleşen ölçümü** — ✅ TAMAMLANDI 2026-10-07 (`lib/cfo/decision-memory.ts`, `/cfo/kararlar`, AI CFO B4j).
   Sonraki adım: sermaye motorunun ve AI içgörülerinin önerileri beklenen değerle `cfo_hamle`'ye kaydedilsin (yazma kuralı +
   onay akışı); yeni hamlelerde `beklenen_deger` zorunlu (bugün kapanmış 5 kararın hiçbirinde yok → isabet ölçülemiyor).
4. [x] **Hedef açığı atfı (goal-gap attribution)** — ✅ TAMAMLANDI 2026-10-07 (`lib/cfo/goal-attribution.ts`, `/cfo/kararlar`, AI CFO B4k).
   Sonraki adım: Goal Engine `wealth_usd` cari hızını operasyonel hızla hesaplasın (bugün değerleme dahil regresyon eğimi).
4b. [x] **Ciro hedefine giden yol — gelir kaldıraçları** — ✅ TAMAMLANDI 2026-10-07 (`lib/cfo/revenue-levers.ts`, `/cfo/sermaye`, AI CFO B4l).
5. [ ] **Nakit tahmini kalibrasyonu** — `cfo_nakit_projeksiyon` tahminleri saklanmıyor; tahmin vs gerçekleşen hata izlenmiyor. Not 07.10: Goal Engine gözlemleri (`fm_goal_observation.projected_value_try/projected_on`) zaten günlük tahmin saklıyor (06.10'dan beri); 2–4 hafta veri birikince kalibrasyon bunun üzerine kurulur. Şimdi değeri düşük → ertelendi (VOI ilkesi).
6. [x] **Aşağı yön senaryoları** — ✅ TAMAMLANDI 2026-10-07 (`lib/cfo/downside.ts`, `/cfo/sermaye`, AI CFO B4m; tahsis stres açığıyla).
   Sonraki adım: (a) ✅ kısmen 2026-10-08: KMH faizi dahil baz dip (−3.958.629, 01.01, FONLANAMIYOR; 120 günde faiz 616.399) artık
   CASH_CRITICAL bulgusunun kanıtında; kanonik dip (projeksiyon, faizsiz) ve kural tetiği değişmedi. **Cowork sırası (2026-10-08):**
   (1) ✅ kapasite alarmı (`capacity_breach`, 21.10'u bugün yakalar); (2) ✅ 2026-10-08 KADEMELİ faiz — yalnız KMH ile fonlanan kısma, banka
   başına ölçülmüş oranla (Ziraat 4,083 · Enpara 4,25 · YKB 4,50; 3 banka ölçülmedi → bilinmiyor), kapasiteyi aşan kısma faiz yok
   (616.399 TL bugün faizi fazla, sorunu az gösteriyor) — üretim 08.10: faiz ≥ 149.411 TL, dip −3.645.356 (01.12, şahsi hesaplar
   gerekiyor); kalan açık: Garanti, Garanti Alp, Akbank Alp, amaca bağlı limit ve şahsi KMH oranları ölçülmedi (faiz alt sınır;
   kullanılan ~281M TL·gün × %4,5/30 ≈ +421k olabilirdi → oran ölçümü yüksek VOI); (3) ✅ 2026-10-08 kural faizli dibe bağlandı (tetik = projeksiyon dibi YA DA faizli dip tabanın altında); (b) emniyet payı ≈ 0 → yeni likidite kaynağı/erteleme seçenekleri (gümrük ödeme zamanlaması, TRIM/LIQUIDATE nakdi)
   senaryoya göre sıralanmalı; (c) ✅ 2026-10-08 uzlaştırıldı: tempo toplamı 34.931 TL/gün ↔ son 30 gün satış × ekstreden ölçülmüş kanal net oranı 36.043 TL/gün (−%3); ~1,0M ↔ ~1,89M farkı komisyon/kargo/kesinti (net oran ~0,63). Kanal bazında dengeleniyor: Trendyol +3,2k/gün fazla, ePttAVM −2,5k, N11 −1,6k, Pazarama −0,65k (defterde hiç alacak yok → tahmin 0), Amazon −0,35k eksik — defter bakımı (panel alacakları) işi, mekanizma değişikliği gerekmiyor.
7. [ ] **Borç maliyeti doğruluğu** — kod hazır (2026-10-08, `lib/cfo/card-cost.ts`); Cowork onayı (3 şart: maliyet tanımı kapandı ✓,
   geri alınabilir migration ✓, sütun listesi PR'da ✓); bekleyen: (a) ✅ migration `20261008180000_cfo_credit_card_revolving` Cowork tarafından uygulandı (2026-10-08), (b) devreden bakiyelerin kart notlarındaki ölçümlerden
   doldurulması (onay), (c) her kartın ekstredeki aylık akdi faizi (kullanıcı). Sonra: kart faizinin nakit projeksiyonuna eklenmesi.

### Backlog — motor tetiği (2026-10-08)
- [x] ✅ TAMAMLANDI 2026-10-08 (PR #202) — Cowork'ün 16:49 okumasından önce güvenilir motor koşusu: `trendyol-sync` Vercel cron'u `0 6` → `0 12` UTC (15:00–15:59 TR; 14 günlük pencere → veri kaybı yok). Alperen: tam yetki (2026-10-08).
- [x] ✅ TAMAMLANDI 2026-10-08 (PR #203) — Bayatlık kapısına önemlilik eşiği (Cowork kararı 2026-10-08): Ziraat USD 419,53 TL (dibin %0,01'i) CASH_CRITICAL'ı susturuyordu. Artık yalnız bakiyesi `materialMinTry` (10.000 TL) üstü ya da bilinmeyen bayat hesap susturur; önemsizler bulguda uyarı. Ekran görüntüsüyle bakiye güncellemesi yine Alperen'de (yarın).

### Backlog — maliyet kapsamı (2026-10-08)
- [x] ✅ TAMAMLANDI 2026-10-09 — Migration `20261008200000_cfo_maliyet_kapsami_satir` Cowork 2026-10-08 20:26 UTC uyguladı (satır toplamı = ciro üretimde doğrulandı); parmak izi yeniden ölçüldü, repo listeleri temizlendi.
- [ ] Kapsamı %95'e çıkaran 8 kalem (veri sahibi Alperen): 6 SKU'ya ürün maliyeti, anunnaki-pointer ürün eşlemesi, 2827456501236 adet/set tanımı.

### Backlog — tahsilat tahmini (2026-10-08)
- [x] ✅ TAMAMLANDI 2026-10-08 (PR #199) — `lib/cfo/engine.ts` haftalık tahmini `cfo_tahsilat_tahmini`'ye bağlandı.
- [ ] `cfo_settings.customsReserveDate` 30.09'da kalmış: gümrük rezervi kartı 09.10 / 21.10 dilimlerini görmüyor (veri sahibi: Alperen/Cowork).
- [ ] `cfo_cash_event` / `cfo_yoldaki_mal` / `cfo_question` üzerinde ~1.000+ karakter metin UPDATE'i 180 sn zaman aşımı (Cowork 4 kez gördü). **Teşhis 2026-10-08 (salt okuma):** veritabanı tarafında sebep yok — üç tabloda tetikleyici, kural, realtime yayını, metin sütunu indeksi yok; asılı işlem yok; `postgres` rolünde statement_timeout yok; `pg_stat_statements`'ta bu tablolara ulaşan her UPDATE ≤ 52 ms. Zaman aşımı istemci/araç katmanında (Postgres'e hiç ulaşmıyor ya da yanıt dönüşünde takılıyor). Doğrulama önerisi (Cowork): aynı UPDATE takılırken ayrı oturumdan `pg_stat_activity`'de görünüyor mu.

### Öncelikli aksiyon planı (2026-10-07)
> Sıralama: güvenlik riski → canlıda yanlış karar üreten veri → canlı AI CFO kalitesi/maliyeti → büyüme → iyileştirme.
> "Kullanıcı" = yalnız Alperen'in yapabileceği (şifre, panel, iş kararı). Her üretim adımı ayrı onay.

**P0 — Hemen**
1. [ ] **S-K2 Hepsiburada şifre rotasyonu + git geçmişi temizliği** (kullanıcı) — dosya silindi ama şifre geçmişte duruyor.
2. [ ] **`cfo_secret` düz metin kimlik bilgileri (5 satır) → Vault + iptal** — anahtarlar: `GITHUB_PAT`, `RAILWAY_PROJECT_TOKEN` (hiçbir yerde kullanılmıyor → kaynağında iptal + satır sil), `TMP_CFO_FILES_VERIFY_TOKEN` (boş → sil), `CFO_GOOGLE_INTERNAL_TOKEN` + `GOOGLE_SA_KEY_JSON` (`cfo-google` köprüsü → Vault). Erişim yalnız postgres/service_role. Taşıma taslağı hazır; uygulama kullanıcı onayı/izni bekliyor.

**P1 — Bu hafta (canlı kararları etkileyen veri + AI CFO)**
10. [x] **CFO motoru için güvenilir tetik** — ✅ TAMAMLANDI 2026-10-08 (PR #199, #202): saatlik yerine günde 3 sabit koşu (07:17 / 12:37 / 16:07 TR) + `workflow_dispatch`, motor bayat alarmı 20 sa; Trendyol senkronu 12:00 UTC. Eski not: GitHub zamanlanmış işleri bu depoda saatte bir koşmuyor (24 saatte ~4). Seçenekler (kullanıcı): (a) harici ücretsiz cron (cron-job.org vb.) `GET /api/cron/ai-cfo-monitor` + `Authorization: Bearer CRON_SECRET` ve ardından `/api/cron/ai-cfo-health`; (b) Vercel Pro saatlik cron; (c) Cowork CFO 08:00 / 16:49 koşusundan önce `workflow_dispatch` tetikler (sıfır maliyet, günde 2 taze koşu garanti).
3. [ ] **Bayat kaynaklar** — teşhis 2026-10-07: Hepsiburada yanlış alarmı düzeltildi (`v7`); Entegra/banka haftalık düzene alındı (`v8`, sistem 7. günde ister). Kalan (kullanıcı): Ziraat USD + Yapı Kredi USD (şirket) bakiyelerini güncelle ya da pasife al (son 17.09).
4. [ ] **Maliyet kapsamı %56,6** — eksik ürün maliyetleri girilmeden kârlılık/marj anomalileri güvenilir değil (kullanıcı + veri girişi ekranı).
5. [ ] **Forecast V2 açma kararı** — eski yolda Trendyol çift sayım + Türkçe-İ hataları satın alma tahminini bozmaya devam ediyor (gölge raporu → onay).
6. [ ] **Haftalık arası boşluk tahmini (Aşama 2):** ✅ 2a satış (Trendyol API × oran, `v9`). ✅ 2b banka ileri taşıma (tarihi geçen kalem; banka takvimden, kanal → `cfo_pay_obs`). XML yalnız çapraz kontrol (günlük gürültülü).
7. [x] **AI CFO 24 saat raporu kalanları** — ✅ TAMAMLANDI 2026-10-08 (PR #197) — mimari kararıyla kapandı (kalan nakit dibi işi CFO-BACKLOG CFO-013'e taşındı): sitede LLM yok (deterministik motor + Cowork CFO). Kalan tek iş: **tek kanonik nakit dibi** — kaynak `cfo_nakit_projeksiyon(120)`; Goal Engine (−3.546.019) ve `cfo_odeme_gunluk` (−3.408.171) farkı açıklanacak.
8. [x] **AI CFO anomali seçiminde kategori çeşitliliği** — ✅ TAMAMLANDI 2026-10-08 (PR #197): seçim kalktı; her anomali şablonlu bulgu olur (görüş kapanmaz).
9. [x] **Tek kur kaynağı** — ✅ TAMAMLANDI 2026-10-07 (PR #191): `lib/fx/current.ts` (USD/TRY `cfo_kur` → `cfo_settings` → elle → varsayılan; RMB/USD elle → `cfo_settings`), 13 okuyucu taşındı.
9a. [x] **Repoda migration'ı olmayan 2 üretim tablosu** — ✅ TAMAMLANDI 2026-10-07 (PR #191): `20261007220000_cfo_ledger_tables_capture`, parmak izi hariç tutmasız üretimle birebir.
9d. [ ] **Meta reklam harcaması kaydedilmiyor** — `/reklamlar` canlı API'den okuyor, tabloya yazmıyor → CFO göremiyor (Trendyol reklamı fatura üzerinden görünüyor). Günlük harcama özeti tablosu + senkron (salt-okunur Meta API).
9e. [ ] **Trendyol fatura/hakediş dosyası 09.09'dan beri yüklenmemiş** (kullanıcı) — CFO kesinti/iade/ceza kanıtını BAYAT işaretliyor.
9c. [ ] **3 yedek tablo silme SQL'i** (kullanıcı, Supabase SQL Editor) — Supabase aracı DROP'ta onay ekranında takılıyor (4 deneme, hiçbiri uygulanmadı). Migration `20261007200000_drop_legacy_backup_tables` repoda, `notAppliedInProduction`'da; çalıştırılınca baseline'dan çıkarılır ve parmak izi yeniden ölçülür.
9b. [ ] **AI CFO girdi paketini küçült** — kanıtta tekrarlanan `asOf` vb. alanlar; hedef 8000 yerine 4500 token sınırına dönmek (maliyet ↓).
10. [ ] **AI CFO kalibrasyon** — 1–2 hafta içgörüleri `/admin/ai-cfo`'da doğru/yanlış işaretleme (`reviewedAt/By` alanları mevcut, UI yok); ret nedeni kodlarını izle (`fabricated_number` oranı).

**P2 — Bu ay (büyüme + teknik borç)**
11. [ ] **Yeni ürünler pazaryeri hazırlığı** (kullanıcı ağırlıklı) — 126/127 üründe görsel yok (en büyük darboğaz), 16 kutu ölçüsü, kategori eşleme, 64 marka, 40 uzun başlık.
12. [ ] **Market Scout yayına alma** — migration + baseline yenileme → eski scout içe aktarımı → buybox (her adım ayrı onay; aşağıdaki madde).
13. [ ] **C6 hata telemetrisi (Sentry)** — bugünkü `monitor_failed`/`provider_http_400` ancak elle sorguyla bulundu.
14. [ ] **Baseline sonrası:** `schema.prisma` ↔ üretim sürüklenmesi (3 tablo) hizalama; `migration-clean-apply` testini kaldır.
15. [ ] **D7: 43 `SECURITY DEFINER` view → `security_invoker`** (39'dan 43'e çıktı; anon yetkisi yok, sömürülemez ama büyüyor).
16. [ ] **Faz 2 vitrin:** landing CTA'larını `/kayit`'a bağla, gerçek iletişim bilgisi, yasal sayfalar (ödeme 10 müşteriye kadar kapalı kalır).

**P3 — Takvime bağlı / iyileştirme**
17. [ ] M7 A-shrink telemetrisi — ilk puan 2026-11-06.
18. [ ] Tahmin temizlik PR'ı — V2 kalıcı olunca.
19. [ ] AI CFO küçükler: çıktıda İngilizce terim sızıntısı ("contribution profit") için prompt; kesilen yanıtın soğumayı tetiklememesi.
20. [ ] D8 (147 fonksiyonda değişken `search_path`), D9 (`vector` public'te), `tmp-cfo-files-verify` Edge Function silme.
21. [ ] PDKS ürün: C4 güvenilir cron, C1 offline kuyruk, C2/D4 audit log, C7 izin bakiyesi, D3 cihaz çıkarma, PDF/Excel rapor, zaman/format kod birleştirme.
22. [ ] `CLAUDE.md` şirket profili yer tutucularını doldur (kullanıcı).

### Ayrıntılı maddeler

- [ ] **Market Scout yayına alma (her adım ayrı onay, `docs/MARKET-SCOUT.md` §10):** migration `20261007100000_market_scout_foundation` üretime + baseline yenileme · eski scout içe aktarımı (dry-run → apply; 107 REJECTED / 93 WATCHING / 3 karar) · `MARKET_SCOUT_TRENDYOL_STOREFRONT_CODE` doğrulama + ilk manuel buybox çalıştırması · sitemap ETag 24–72 sa değişim ölçümü → artımlı strateji kararı · çalıştırıcı kararı (buybox GitHub Actions, sitemap Railway) · Google Trends alpha erişimi · lisanslı sağlayıcı hukuki inceleme.
- [ ] **Forecast V2'yi açma kararı** (ayrı onay): `FORECAST_V2_ENABLED=true` öncesi `/admin/forecast-v2` gölge raporu incelenir; açık DRAFT sipariş ve BEKLIYOR CFO satırları insan tarafından gözden geçirilir. Açılana kadar eski tahmin girdisi hataları (Trendyol çift sayım, Türkçe-İ sızıntısı, max/manuel taban) eski yolda sürer.
- [ ] **M7 A-shrink ileri telemetri:** ilk puan 2026-11-06; ≥12 ileri kesim + ≥150 A gözlemi sonrası kapı değerlendirmesi (terfi ayrı PR/onay).
- [ ] **Tahmin temizlik PR'ı (DEPRECATE):** `lib/procurement.ts` (çağıran yok), executive ölü potansiyel seçimleri; V2 kalıcı olunca `lib/sales-forecast.ts`; stok sağlığı/ürün listesi hız sütunlarını kanoniğe taşıma.

> Kaynak: 2026-06-25 tam kod analizi (eksikler C*, güvenlik D*) + Faz 2 gereksinimleri.
> Tamamlanan madde "Yapılanlar"a taşınır.

- [x] **AI CFO runner adım 8 — STEP F** — ✅ TAMAMLANDI 2026-10-07: ilk onaylı AI koşusu `cmuxqfti…` 2 içgörü kaydetti (1,43 ₺). Kalan: kalibrasyon ve aşağıdaki P1 AI CFO maddeleri.

- [ ] **Güvenlik (sonraya, kritik değil):** `cfo_secret` düz metin kimlik bilgilerini ortam değişkenlerine taşı; pgvector'ü `public` dışına taşı; `tmp-cfo-files-verify` Edge Function'ı panelden sil.

- [ ] **Baseline sonrası (onay bekliyor):** `__tests__/migration-clean-apply.test.ts` kaldırılıp yerine `schema-baseline` (plan §4); `schema.prisma` ↔ üretim sürüklenme (3 tablo) hizalama migration'ı; her yeni üretim migration'ından sonra baseline yenileme politikası (`docs/BASELINE-CAPTURE.md`).

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
- [x] **D2 (Yüksek):** push subscribe artık `upsert` (tenant'sız `deleteMany` kaldırıldı) — `npm run check:push` sabitliyor
- [ ] **D3 (Orta):** cihaz kilidi logout'ta sıfırlama seçeneği ("bu cihazı çıkar")
- [ ] **D4 (Orta):** manuel saat düzeltmelerine audit log
- [ ] **D5 (Düşük):** GPS spoofing'e karşı ek sinyaller (kabul: mobil sınırı)
- [ ] **D6 (Orta) — RLS'i yeni tabloda otomatik kapat.** İki kez aynı açık
  oluştu (13.09: 22 tablo, 18.09: 5 tablo): SQL editöründen elle açılan tablo
  RLS'siz doğuyor ve tek seferlik süpürme migration'ı bunu çözmüyor.
  Kalıcı çözüm `CREATE TABLE` üzerine event trigger (`ddl_command_end`) →
  `public` şemasındaki yeni tabloya deny-all RLS. Süpürme migration'ı
  yazmaya devam etmek, sorunu her defasında **bulunduktan sonra** kapatmak demek.
- [ ] **D7 (Orta):** 39 view `SECURITY DEFINER` (advisor ERROR). `anon` yetkisi
  20260613000100 ile alındığı için sömürülebilir değil; doğru düzeltme
  `ALTER VIEW … SET (security_invoker = on)`. Tek tek doğrulanmalı — uygulama
  `postgres` rolüyle sorguladığı için davranış değişmemeli ama 39 view'da
  "değişmemeli" varsayımla geçilmez.
- [ ] **D8 (Düşük):** 18 fonksiyonda değişken `search_path` (advisor WARN) →
  `SET search_path = public, pg_temp`.
- [ ] **D9 (Düşük):** `vector` eklentisi `public` şemasında (advisor WARN).
  Taşımak index/tip referanslarını kırabilir; ayrı bir bakım penceresi işi.
- [ ] **D10 (Orta) — DDL disiplini.** Canlıya SQL editöründen uygulanan her DDL
  **aynı gün** bir migration dosyasına ve `_prisma_migrations` defterine
  yazılmalı. 18.09'da 16 migration'ın şeması canlıdaydı ama defterde yoktu; bu
  hem "canlı geride" diye yanlış rapor edilmesine hem de 11 dosyada checksum
  kaymasının fark edilmemesine yol açtı (`migrate deploy` o hâlde durur).

### Ürün eksikleri (analiz C*)
- [ ] **C1:** offline check-in kuyruğu (Service Worker + IndexedDB)
- [ ] **C2:** audit log modeli (`PdksAuditLog`) + manuel düzeltme izleri
- [ ] **C3:** `PdksLoginCode` ile ilk kurulum/şifre belirleme akışı (şu an kullanılmıyor)
- [ ] **C4:** güvenilir cron tetikleyici (cron-job.org / Vercel Pro) — 5 dk kesinliği
- [x] **C5:** kritik mantığa test (timezone, geofence, otomatik çıkış, izin çakışması) — `npm run check:pdks`, 32 kontrol
- [ ] **C6:** hata telemetrisi (Sentry) — sessiz arızaları yakala
- [ ] **C7:** yıllık izin bakiyesi/hakediş (`PdksLeaveBalance`)
- [ ] PDF/Excel rapor (şu an yalnızca CSV)
- [ ] Tekrarlı kod birleştirme: `lib/pdks/time.ts` (zaman parse) + `format.ts` (TR tarih/saat)

### Yeni Ürünler (pazaryeri hazırlığı)
- [ ] **16 ürünün kutusu elle ölçülecek** — 10 çanak lavabo + 6 yerden montajlı
  küvet bataryası. Yalnız bu 16'da desi ağırlığı aşıyor, yani kargo faturasını
  kutu ölçüsü belirliyor; kalan 131 tahminin faturaya etkisi yok. Panel bunları
  işaretliyor, ölçü girilince `kutu_kaynak = 'OLCULDU'` yapılmalı.
- [ ] **Görsel** — 127 yeni üründen 126'sında ürün görseli yok. Puandaki en büyük
  tek kalem (17 + 10 = 27 puan) ve kalan tek ciddi darboğaz.
- [ ] Kategori boş (9 puan) — pazaryeri kategori ağacına eşleme kararı Alperen'de.
- [ ] 64 üründe marka boş; "kalanların hepsi Alfas" denirse tek UPDATE.
- [ ] 40 başlık 100 karakteri aşıyor (Trendyol sınırı) — Alperen elle kısaltacak,
  üreticinin 100 karakterlik sürümleri istenirse hazır.
- [ ] 1688 açıklamalarının panele yapıştırılması — üretilen açıklamaların 58'i
  150-399 bandında kaldı, gerçek çözüm bu.

---

## Yapılanlar (delta günlüğü)

- **2026-10-09 — Depo senkronu: 150000–210000 üretimde → baseline + parmak izi + testler:** `prisma/baseline/baseline.json` `notAppliedInProduction` yalnız `market_scout_foundation` + `drop_legacy_backup_tables`; `20261009150000` `appliedAfterCapture` sonuna (cfo_run'a bağlı). `fingerprint.expected.txt` ve `step1-fingerprint.expected.txt` üretimden salt-okunur yeniden ölçüldü (fn 38, view 61, Step 1 fn/view + ALFASHOME seed satırları). Testler üretim durumuna göre yeniden kuruldu: `cfo-net-sermaye`/`cfo-metrik-borc` (üretim kopyasında 170000→190000'ı sırayla yeniden uygular; migration öncesi snapshot'lar sözleşme alanı NULL; eski kapı yolu fonksiyon yokken doğrulanır), `fm-goal-engine` (borç hedefi `debt_below_usd` = 100k USD × TCMB; 5M TL hedefi emekli), `ai-cfo-store`/`ai-cfo-migration-security`/`ai-cfo-source-mapping`/`cfo-gtip-tarife` (bekletiliyor → uygulandı; kart çarpanı 1,20), `migration-clean-apply` (Step 1 `A fn` hash'i boş veritabanında 170000/180000 kurulamadığı için orada yalnız adetle; birebirlik `schema-baseline`'da üretim kopyasında). Yerel CI tamamı yeşil.

- **2026-10-09 — Alperen: "cevabını sen bul, GTİP düzeltmelerini sen yap, tam yetkilisin, Cowork'a iş bırakma" / "Devam et" → üretimde uygulandı (Claude Code, Supabase SQL; tek transaction ya da atomik komut, eski değer korumalı):** (1) **GTİP:** `Product.gtip1` 433/433 maliyetli ürün 12 haneli — 405 (güven yüksek+orta) + 39 teyit turu (28 düşük güven, 8 el telsizi → `8517.69.90.90.24`, 3 hub/OTG → `8471.80`); 443 `cfo_change_log` satırı. (2) **migration 190000** (LCNRV maliyet ÷ 1,2): stok 3.904.570 → 3.340.261 TL, **net sermaye 2.886.674 → 2.322.365 TL** (−564.310). (3) **migration 200000** (Alfashome satış kaynağı): Ekim 3 sipariş 14.865 TL, 3 test siparişi hariç; ciro hafızası sonraki günlük tazelemede. (4) **migration 210000** (`cfo_gtip_tarife` 97 satır + `cfo_gtip_yuk`): 382/433 ürün oranlı; anon/authenticated erişimi yok, RLS açık; `duty_gap` bugün 3 ürün ≈5.870 TL (T-MD3010, T-MD4030, 60W Type-C kablo). Cowork'ün 09.10 10:44–10:48 UTC uyguladıkları doğrulandı: 150000–180000 (checksum'lar repo ile aynı), D-P08, 12 üründe çift KDV. **Teyit turu** (`docs/gtip/gtip-teyit.json`): telsiz ÖTV %20 + TAREKS; kart okuyucu 8471.70 (vergi farkı yok); IP kamera ÖTV belirsiz (GİB özelgesi önerilir); 8526.92 RF kumanda ÖTV %20. **Kalan:** depo senkronu (✅ TAMAMLANDI 2026-10-09 — üstteki madde). Eşleşmeyen 51 ürünün oranı (8203.20.00.00.11, 9620, 8543.20 vb.).

- **2026-10-09 — Alperen: "Tam yetkilisin, onaylıyorum" → üç Cowork dosyası + CFO-026 kodu:** (1) `docs/cowork/2026-10-09-190000-lcnrv-kdv-haric.sql` — migration 190000 (LCNRV maliyet ÷ 1,2; önkoşul toplu paket). (2) `docs/cowork/2026-10-09-gtip-duzeltme.sql` — 405 ürün (güven yüksek+orta) `Product.gtip1`/`gtip1Desc` 12 haneli koda; yalnız eski değer hâlâ duruyorsa, her değişiklik `cfo_change_log`'a; düşük güvenli 28 ürün dışarıda. (3) migration `20261009210000_cfo_gtip_tarife` + `docs/cowork/2026-10-09-gtip-tarife.sql` — `cfo_gtip_tarife` (64 satır: GV/İGV/KDV/ÖTV, kaynak, doğrulandı) + `cfo_gtip_yuk` (en uzun önek eşleşmesi; yasal yük = (1+GV+İGV)×(1+KDV)−1; kayıtlı fark; eksik stok maliyeti; dropship hariç); `duty_gap` alarmı (`lib/cfo-agent/health.ts`, WhatsApp önceliğinde). Bugünkü veriyle: 3 stoklu ürün, ~5.869 TL (T-MD3010 metal dedektörü: kayıtlı %30, yasal %48,4). Üç dosya da üretim kopyasında iki kez çalıştırıldı. Test `cfo-gtip-tarife` (CI).

- **2026-10-09 — CFO-026 GTİP + gümrük yükü analizi (Alperen: "GTİP'leri belirle, mevzuatı araştır"):** `docs/gtip/` — `gtip-siniflandirma.json` (433 maliyetli ürün → 12 haneli GTİP; 317 değişiyor, 116 yalnız 12 haneye tamamlanıyor; güven 202 yüksek / 203 orta / 28 düşük; BTB emsalleri), `gtip-oranlar-2026.json` (57 GTİP: GV/İGV/KDV/ÖTV/anti-damping, Çin = "diğer ülkeler" sütunu), `ithalat-vergi-rejimi-2026.md` (CIF → GV → İGV → ÖTV → KDV matrahı; RG 10790/10791/11506-11508/10813), `CFO-GTIP-ANALIZ.md` (grup karşılaştırması). Bulgular: kayıtlı gümrük % metal dedektörü (%30 / yasal %48,4), kablolar (%30 / %42), LED (%40 / %59) altında; bataryalar (%80 / %52,6), telsiz (%40 / %20), ağ/PC (%30 / %20) üstünde; IP kamera/oyun kolu/amfi ÖTV riski; hızlı kargo %30/%60 rejimi 06.02.2026'dan beri ticari eşyada yok; ithalat KDV'si masrafsız yasal maliyetin tam 1/6'sı → 190000'in ÷1,2'si tutarlı (üst sınır). Üretime yazım yok; GTİP düzeltmesi Alperen onayı + müşavir teyidiyle Cowork'e.

- **2026-10-09 — Alperen yanıtları: gümrük yüzdeleri KDV dahil; Alfashome arşivlenmiş 3 sipariş test.** (1) 12 üründe KDV iki kez → veri düzeltmesi Cowork dosyası `docs/cowork/2026-10-09-maliyet-cift-kdv.sql` (tek transaction; `unitCostUsd`/`unitCostTry` ÷ 1,20 yalnız ölçülen eski değerle eşleşen satırda — ikinci çalıştırmada 0 satır; her ürün için `cfo_change_log` eski/yeni değer; üretim kopyasında iki kez doğrulandı). Stoklu 6 ürünün stok maliyeti 410.625 → ~342.190 TL. (2) Tüm maliyetler ithalat KDV'sini bir kez içerir → migration 190000 (LCNRV maliyet ÷ 1,2) Alperen'in ayrı onayıyla Cowork'e (net sermaye ≈ −547.000 TL). (3) Alfashome arşivlenmiş 3 sipariş test → migration 200000 kuralı (EXCLUDED_TEST) aynen.

- **2026-10-09 — D-P06 maliyet KDV kontrolü (Alperen: "RMB + ağırlık + gümrük %X; gümrük % KDV ve masrafları içerir; iki kez KDV eklenmiş olmasın"):** Kod: `Product.unitCostUsd`'yi uygulamada yazan yol yok (dış kaynaklı); `lib/importer-cost.ts` formülü (ürün + navlun) × (1 + gümrük%) KDV adımı içermez; TS/SQL'de maliyete KDV ekleyen yol bulunmadı → yazılımda çift KDV yok. Veri (433 maliyetli ürün): TL = USD × 48,5 (430); maliyet ÷ (ürün + navlun) medyanı 1,40–1,46 → tek "her şey dahil" oranla uyumlu; Cowork'ün "48,5 → KDV yok" çıkarımı geçersiz (KDV USD'nin içinde). Gümrük oranı kayıtlı 96 üründen 12'si (ürün+navlun)×(1+gümrük%)×1,20'ye birebir uyuyor — kayıtlı %30/%40 KDV dahilse bu ürünlerde KDV iki kez (stoklu 6 ürün 410.625 TL, olası fazlalık ~68.400 TL; AL-PTZ04 tek başına 276.692 TL). 71 ürün uygulama formülüyle (navlun $8/$1/kg, kur 7,0–7,2) yeniden üretilemedi — gerçek navlun/kur farklı. Migration 190000 bekletmede kalır; yönü doğru (ithalat KDV'si indirilir, NRV karşılaştırmasında çıkarılmalı), /1,2 üst sınır. DECISION-LOG D-P06 kontrol satırı, BACKLOG CFO-007.

- **2026-10-09 — D-P05: Alfashome cirosu satış katmanında (migration `20261009200000_fm_sales_alfashome`, yerel, bekletme listesinde; Cowork dosyası `docs/cowork/2026-10-09-alfashome-ciro.sql`, tek transaction, üretim kopyasında iki kez doğrulandı):** `fm_sales_source_rows`'a ALFASHOME kaynağı/kanalı (sipariş toplamı, İstanbul günü, TL); `fm_sales_dispositioned`: canceled/draft → CANCELLED, archived → EXCLUDED_TEST + `alfashome_archived_unverified`; KDV hariç %20 varsayılan (bayraklı); kalite politikası ALFASHOME cirosu B; denetim rolüne `alfashome_order` okuma politikası (security_invoker görünümleri için). Mevcut kanallar birebir aynı (test `fm-sales-alfashome`, CI'da). Mükerrerlik: IDEASOFT = soyluelektronik.com (Entegra, ayrı mağaza), Alfashome = yeni açılan musluk sitesi (Alperen) — ölçümde çakışma yok; Cowork'ün "Alfashome = IDEASOFT" eşleştirmesi yanlıştı. Ekim etkisi +14.865 TL. Bulgular: (a) panel `payment_status`'u boş döndürüyor (6/6 NULL) → mevcut `alfashome-sales.ts` "ödenmiş" kuralı hiçbir siparişi saymıyor; (b) son Alfashome senkronu 08.10 06:10 UTC — senkron yalnız trendyol-sync (12:00 UTC) içinde. Açık soru: arşivlenmiş 3 sipariş (Haz–Ağu, 5.912,50 TL) gerçek mi?

- **2026-10-09 — CFO-009 kısım 3: motor sağlık alarmı GitHub'dan bağımsız (Cowork isteği: "kanal değişikliğiyle motor sağlık alarmı birlikte gitsin"):** Kök neden: GitHub `ai-cfo-schedule.yml` zamanlaması pratikte tetiklenmiyor (şimdiye kadar tek zamanlanmış koşu) → `/api/cron/ai-cfo-health` hiç otomatik çağrılmadı; 09.10'da motor 197 dk `running` kaldı, alarm yok. Çözüm: `lib/cfo-agent/health-notify.ts` (değerlendirme + WhatsApp tek yerde); `scheduleCfoCycle` (xml-sync 02:00 / trendyol-sync 12:00 UTC `after()`) motordan önce ve sonra çağırır — karşılaştırma zincir başlamadan önce tamamlanmış son motor koşusu, aynı zincirde gönderilen anahtar ikinci kez gitmez, sabah hatırlatması yalnız GitHub uç noktasında. `shouldNotify`: `stuck_run` artık motor arızası (her koşuda bildirilir). Bildirim → `cfo_change_log` izi (`cfo-health-notify`, alıcı yazılmaz). Testler `ai-cfo-health` (+4 durum). Önkoşul yine Alperen'de: Meta şablonu `cfo_alarm` + Vercel `CFO_ALARM_WHATSAPP_TO`.

- **2026-10-09 — Cowork toplu uygulama paketi (tek dosya) + D-P06 askıya alındı + D-P08 rakam düzeltmesi:** (1) `docs/cowork/2026-10-09-toplu-uygulama.sql` — Cowork'ün isteği üzerine bekleyen 4 migration (`20261009150000` … `20261009180000`) + D-P08 veri düzeltmesi TEK dosyada, tek transaction (BEGIN…COMMIT), her migration'dan sonra `_prisma_migrations` kaydı (checksum dosyayla aynı, `NOT EXISTS` ile tekrar çalıştırılabilir); sonda salt-okuma doğrulama sorguları. 140000 zaten üretimde (pakette yok). Üretim kopyası (PGlite) üzerinde iki kez üst üste çalıştırıldı: hatasız, 4 migration kaydı, Akbank Alp şahsi, Garanti Alp pasif, değişiklik günlüğü 2 satır. (2) D-P06 ASKIDA: Cowork ölçümü — 431/432 maliyetli üründe maliyet = USD × 48,5 (KDV eklenmemiş), tümü ithalat; migration `20261009190000` (maliyet /1,2) **pakete alınmadı, bekletme listesinde**; soru Alperen'de ("yurt içi" mi "hepsi" mi), öneri geri çekmek. (3) D-P08 etkisi düzeltildi: "her şey dahil" açık −403.698 TL (−252.145 değil; `cfo_kaynak_yeterliligi` nakdi iki kez sayıyordu). DECISION-LOG / BACKLOG (CFO-007 BLOCKED) / RED-FLAGS güncellendi.

- **2026-10-09 — Alperen kararları D-P05/06/07 + uygulama:** (1) D-P05 ciro hedefi KDV DAHİL → Goal Engine'in bugünkü ölçümü doğru (değişiklik yok; Alfashome kapsamı açık soru). (2) [ASKIDA — üstteki 2026-10-09 kaydına bakın; Cowork ölçümü itiraz etti] D-P06 ürün maliyeti KDV DAHİL → net sermaye LCNRV'si KDV dahil maliyeti KDV hariç NRV ile karşılaştırıyordu; migration `20261009190000_cfo_net_sermaye_maliyet_kdv_haric` (yerel, bekletiliyor; 170000'den sonra) maliyeti /1,2 ile KDV hariç karşılaştırır — üretim: stok LCNRV 3.918.459 → 3.370.965, net sermaye 2.900.562 → ~2.353.068; mutabakat SQL'i ve `cfo-net-sermaye` testi buna göre. (3) D-P07 alarmlar WhatsApp: `lib/cfo-agent/alarm-whatsapp.ts` + `/api/cron/ai-cfo-health` — e-posta (503) üreten her durumda (motor arızası / yeni alarm / sabah hatırlatması) mevcut Cloud API istemcisiyle onaylı şablon `cfo_alarm` ({{1}} özet, {{2}} en öncelikli alarm); alıcı `CFO_ALARM_WHATSAPP_TO` ortam değişkeni (numara koda yazılmaz); yapılandırma eksikse sonuç nedenle döner. Test `cfo-alarm-whatsapp` (CI'da). Önkoşullar Alperen'de: Meta'da şablon onayı + Vercel ortam değişkenleri.

- **2026-10-09 — D-P08 kararı (Alperen): "Akbank Alp" şahsi; "Garanti Alp" banka hesabı gerçekte yok → pasif** (Garanti ekranları: 286-6293619 şirket KMH 500.000 = "Garanti" ✓, 286-6673313 şahsi KMH 150.000 = "Garanti Alperen (şahsi)" ✓; şahsi bakiye takip edilmez; şirket genel KMH 1.809.300 → 1.359.300, "her şey dahil" açık −403.698 — Cowork düzeltmesi; ilk hesap −252.145 nakdi iki kez sayıyordu). Veri düzeltmesi Cowork için hazırlandı: `docs/cowork/2026-10-09-d-p08-akbank-alp-sahsi.sql` (tek satır; hesap türü metni elle yazılmaz — veritabanı görünümleri tam "ŞAHSİ" yazımını aradığı için mevcut şahsi satırdan kopyalanır; değişiklik günlüğüne kayıt). Etki: şirket boş genel KMH 1.809.300 → 1.559.300, genel ticari kaynak 1.960.853 → 1.710.853, şahsi KMH 1.100.000 → 1.350.000. Açık soru: kayıtlardaki "Garanti Alperen (şahsi)" hesabı.

- **2026-10-09 — CFO-006 (TS): şirket/şahsi tek sınıflama:** `lib/cfo/ownership.ts` — hesap ŞAHSİ ⇔ `accountType` Türkçe katlanmış "SAHSI" kelimesi, kart ŞAHSİ ⇔ sahibi "Alp"; SQL ifadeleri (`personalAccountSql`, `personalCardSql`) aynı kural. Altı ayrı kural (engine KMH dilimi, capital-efficiency, downside, VOI, decision-memory ×2) tek modüle bağlandı; `card-cost.isPersonalCard` re-export. Eski JS `/ŞAHSİ/i` küçük harf "şahsi"yi yakalamıyordu. Üretim 15 hesap / 6 kart: sınıflama değişmedi. Açık soru D-P08: "Akbank Alp" / "Garanti Alp" hesapları (KMH 450.000) şirket mi şahsi mi. Test `cfo-ownership` (CI'da).

- **2026-10-09 — CFO-003: stratejik kur tek kaynak (Alperen D-P04 onayı) + otomatik TCMB kaydı:** `lib/fx/strategic.ts` — TCMB döviz alış (ayın 15'i), bu ay yoksa önceki ay (B, işaretli), yoksa BİLİNMİYOR; Goal Engine kuralıyla aynı SQL. Tüketiciler: sipariş borç kapısı eşiği (`debt-policy`), ciro hedefi TL karşılığı (`revenue-levers-data`; sabit 45 yedeği kalktı, kur yoksa hedef BİLİNMİYOR; ithal malın TL maliyeti operasyonel kurla), `/cfo` servet kartı USD'si (kaynak etiketi), `/cfo/sermaye` metni, AI kanıt etiketi. Otomatik kayıt `lib/fm/tcmb-fx-sync.ts` + `tcmb-fx-auto.ts`: günlük xml-sync `after()` bu ay/önceki ay eksikse TCMB resmî bülteninden ekler (`ON CONFLICT DO NOTHING`; mevcut satıra dokunmaz; hata/bülten yoksa yazmaz) — Ekim kuru 16.10 sabah otomatik gelir (önceden `scripts/fm-fx-tcmb.ts` elle). Operasyonel kur (`lib/fx/current.ts`) değişmedi. Test `fx-strategic` (CI'da).

- **2026-10-09 — CFO-002: borcun tek tanımı + hedef < 100.000 USD (kod; migration Cowork bekliyor):** migration `20261009180000_cfo_metrik_borc` (yerel, bekletiliyor; 170000'den sonra) — `cfo_metrik_borc()` finansal borç = kredi kalan anapara + kart toplam + kullanılan KMH (D-P03); yoldaki gümrük/navlun taahhüdü (3,79M), erken kapama ve şahsi pay BİLGİ satırları. `cfo_settings."debtTargetUsd"` (varsayılan 100.000), `cfo_snapshot."contractDebtTry"` → `fm_balance_day` `debt_try` v3 → Goal `debt_below_usd` (USD × TCMB); `debt_below_5m_try` emekli. TS: `lib/cfo-agent/debt-policy.ts` sipariş kapısı borcu `cfo_metrik_borc()`'tan, eşiği `debtTargetUsd × TCMB aylık kur`dan okur (fonksiyon yoksa eski `cfo_servet.borc` / 5M TL; varlık `to_regprocedure` ile — satın alma transaction'ı bozulmaz); `debt-forecast.ts` eşiği kapıdan alır. Üretim (salt-okuma): 5.889.904 TL vs eşik 4.855.850 TL → açık 1.034.054 TL (≈ 21,3k USD); kapı kapalı kalır. Üretimdeki `fm_goal_sync` repo ile birebir (md5). Test `cfo-metrik-borc` (CI'da).

- **2026-10-09 — CFO-001 PR-D: net sermayenin tek tanımı (kod; migration Cowork bekliyor):** migration `20261009170000_cfo_metrik_net_sermaye` (yerel, bekletiliyor) — `cfo_metrik_net_sermaye()` bileşen satırları + sira 100 = NET SERMAYE: nakit (artı bakiyeler) + alacak + rafta stok **min(maliyet, KDV hariç NRV)** + yoldaki ödenmiş − kredi kalan anapara − kart toplam − kullanılan KMH (D-P01 GENİŞ, D-P02 LCNRV, D-P03). Değeri bilinmeyen stok 0 sayılmaz: maliyet+satış kanıtı yok (32 SKU, 336 adet) ve satan ama maliyeti olmayan (24 SKU, KDV hariç NRV üst sınır 256.990 TL) BİLGİ satırlarında BILINMIYOR. `cfo_snapshot."contractNetWorthTry"` (yeni kolon; `cfo_take_snapshot` yazar), `fm_balance_refresh` → `net_capital_try` v3, `fm_goal_evaluate` bakiye hedeflerini yalnız EN YENİ tanım sürümünden ölçer (eğilim sürüm karıştırmaz; v3 ilk sözleşme snapshot'ıyla devreye girer). `/cfo` servet kartı manşeti = net sermaye (sözleşme), eski servet "potansiyel değer" (fonksiyon yoksa sayfa eski haliyle). `scripts/cfo/metric-reconciliation.sql` `net_sozlesme` (bağımsız ikinci uygulama). Üretim (salt-okuma, fonksiyon gövdesi): **2.900.562 TL** (DAR 2.467.282 / potansiyel 6.225.616). Üretimdeki `cfo_take_snapshot`, `fm_balance_refresh`, `fm_goal_evaluate` gövdeleri repo ile birebir (md5). Test `cfo-net-sermaye` (CI'da): bileşenler, BİLİNMİYOR, mutabakat eşitliği, snapshot → v3 → Goal, yetki.

- **2026-10-09 — Alperen kararları: kart vergi çarpanı ×1,20, nakit tabanı −3M TL kalır:** Cowork itirazı (BSMV %5, %15 değil) kabul → `lib/cfo/card-cost.ts` `CARD_TAX = { kkdf: 0.15, bsmv: 0.05 }` (sermaye motoru, VOI, Borçlar sayfası, motor kart tasarrufu) + migration `20261009160000_cfo_kart_karari_bsmv` (yerel, bekletiliyor; Cowork uygulayacak; `cfo_kart_karari`'deki üç 1.30 sabiti ve gerekçe metni → 1.20; üretim tanımı 110000 ile birebir olduğu yorumsuz gövde md5 ile doğrulandı). Üretim etkisi (salt-okuma): oranı bilinen 5 kartın devreden 1.984.192 TL'sinin aylık faiz+vergi maliyeti 109.627 → 101.194 TL; Enpara ertelemesi 1.989 → 1.836 TL/ay. Taban: `netPositionFloorTry` −3.000.000 TL olarak kalır (ticari kapasite −1.960.853 TL ile fark bilinçli; karar kaydı). Testler: `cfo-card-cost`, `ai-cfo-source-mapping` (üretim hali ×1,30 → migration sonrası ×1,20).

- **2026-10-09 — CFO-009 kısım 2: ölü motor koşusu kapanır, SAĞLIK satırı alarm olur (Cowork 09.10 bulgusu):** 09.10 02:34 UTC `engine:2026-10-09T05:sync_xml` koşusu xml-sync `after()` içinde Vercel 300 sn sınırında öldü ve 4+ saat `running` kaldı; `cfo_gun_ozeti` SAĞLIK satırı bunu yalnız metinde yazıyordu. (1) `lib/cfo-agent/store.ts` `sweepStuck` — her motor koşusu kilidi aldıktan sonra 15 dk'dan eski `running` motor satırlarını `failed` / `killed_timeout` kapatır (`runner.ts`). (2) `lib/cfo-agent/engine-budget.ts` + `workflow-trigger.ts` — senkron sonrası motor yalnız fonksiyon süresinden ≥150 sn kaldıysa başlar (xml-sync / trendyol-sync `maxDuration` geçirir); atlanırsa `cfo_change_log` izi (`cfo-engine-budget`). (3) Migration `20261009150000_cfo_gun_ozeti_saglik_alarm` (yerel, bekletiliyor; Cowork uygulayacak): SAĞLIK satırı `aciliyet = 'ACİL'` + metin başında neden — son koşu 15 dk+ running (TAKILDI), son koşu tamamlanmadı (BAŞARISIZ), son tamamlanan 20 saatten eski (BAYAT); diğer satırlar/sütunlar/yetkiler aynı. Testler: `ai-cfo-store` (süpürme + üç alarm durumu, idempotent), `ai-cfo-health` (`engineBudgetOk`).

- **2026-10-09 — Üretim senkronu: Cowork 110000 + 120000 (+ hafıza tazelemesi) + 130000 uyguladı:** checksum'lar repo ile aynı. Doğrulama (salt-okuma): KDV hariç ciro Nisan–Ekim boş gün yok, Eylül 1.604.768 TL; hedef hızı 58.318 TL/gün, projeksiyon 1.807.851 TL (`goal_sources_partial`); `cfo_kart_karari` kart faiziyle (Enpara 36.000 → ~1.989 TL/ay). Parmak izi yeniden ölçüldü: Cowork fonksiyonları yorumsuz uygulamış ve bir politika metnini ASCII'ye çevirmiş (yürütülen kod birebir) → parmak izi artık yorumları ve `reason` metnini karşılaştırmaz; ayrıca `cfo_gumruk_dilim` üretimde migration'sız düzeltilmiş (nakit çift sayımı, 151.553,36 TL) → capture migration `20261009140000_cfo_gumruk_dilim_capture`. `baseline.json` bekletilen yalnız 2 (market_scout, drop_legacy). CFO-005 ✅, RF-004/RF-025 RESOLVED, RF-031 (süreç) yeni. Skor 51→52.

- **2026-10-09 — CFO-008 kısım 2: ciro hedefi eksik günleri tam saymıyor (RF-025 ikinci yarı):** migration `20261009130000_fm_goal_kaynak_tazeligi` (yerel; Cowork uygulayacak) — `fm_goal_evaluate` hız / projeksiyon / gereken hızı yalnız her satış kaynağının o gün bittikten sonra okunduğu günlerden hesaplar (Trendyol `syncedAt`, Entegra `importedAt` → `known_at`); gözlenen MTD aynen; bayrak `goal_sources_partial`. Üretim 09.10: Entegra 05.10 12:06'da okunmuş → tam gün 04.10'a kadar; hız 51.941 → 58.318 TL/gün, aylık projeksiyon 1.610.158 → 1.807.851 TL (33,2k → 37,2k USD). Test `fm-goal-kaynak` (CI'ya eklendi).

- **2026-10-09 — CFO-025 ölçümü: sabit kurun 433 maliyetli üründe etkisi (salt-okuma):** 431/433 ürün `unitCostTry = unitCostUsd × 48,50` (≈ TCMB Eylül 48,56). Bugünkü kura göre rafta stok maliyeti +24.634 TL (cfo_kur 48,98) / +43.920 TL (ayarlar 49,20); son 30 gün satılan maliyet +4.475 TL → marj etkisi 0,43 puan. Asıl belirsizlik USD maliyette: ithalat çarpanı (USD / (RMB/6,72)) 1,27–84,6; TE-RINGFILLLIGHT 84× (veri hatası, RF-030). Cowork'ün 8 üründeki 4 sapmasının kaynağı bekleniyor.

- **2026-10-09 — Alperen kararları (Cowork) + KDV hariç ciro (CFO-008 kısım 1):** D-P01 GENİŞ, D-P02 LCNRV (net sermaye 2.973.814 TL ≈ 61,2k USD), D-P03 borç = kredi + kart + kullanılan KMH (yoldaki gümrük iki taraflı kalır) → `CFO-DECISION-LOG.md`. Sıra: önce KDV hariç ciro, sonra sabit kurun 433 maliyetli üründe etkisi (yeni CFO-025). Migration `20261009120000_fm_kdv_haric_ciro` (yerel; Cowork uygulayacak): `fm_sales_canonical` kaynakta KDV hariç tutarı olmayan satırda (Trendyol API %61, Amazon FBA) SKU'nun pazaryeri KDV oranı (2023-07-10 sonrası, ≥%80 baskın) → yoksa %20 ile türetir, bayraklar `ex_vat_derived_sku`/`ex_vat_default_rate`, kalite U → B. Test `fm-kdv-haric` (diğer sütunlar birebir, kimlik, eski %18 öğrenilmez). `migration-clean-apply` Step 1 parmak izini bekletilen migration'lardan önce ölçer (üretim hali). Üretim ölçümü: Eylül KDV hariç 1.604.768 TL.

- **2026-10-09 — CFO-019 ✅ TAMAMLANDI: `db:migrate:deploy` koruması:** `scripts/schema-baseline/guard-deploy.mjs` — `npm run db:migrate:deploy` önce korumayı çalıştırır; baseline.json `notAppliedInProduction` (bugün 3: market_scout_foundation, drop_legacy_backup_tables [DROP TABLE], 20261009110000) varken `ALLOW_HELD_BACK_MIGRATIONS` listeyi aynen saymadıkça ve hedef Supabase iken `ALLOW_PRODUCTION_MIGRATE_DEPLOY=1` olmadıkça reddeder. Test `__tests__/migrate-deploy-guard.test.ts` (CI'ya eklendi). RF-017 RESOLVED. Sınır: doğrudan `npx prisma migrate deploy` korunmaz.

- **2026-10-09 — CFO-010 (kısım 2) ✅ TAMAMLANDI: ödeme durumu tek kaynak = ödeme takvimi:** `lib/cfo-agent/health.ts` `payment_unmarked` yalnız `cfo_cash_event`'ten (taksit başına satır + `isSettled`; projeksiyonla aynı defter) — `currentMonthState` artık okunmuyor (kısım 1 kuralı 16.10'da Garanti için takvimle çift alarm üretecek, takvim işaretlense de susmayacaktı). `ledger_stale` = aktif kredi/kartın takvimde bekleyen sonraki ödemesi yok (`ledgerGapSql`; kredi banka + tutar ±%25, kart banka; Türkçe I/İ/ı katlanır). Yeni `schedule_duplicate` (`scheduleDuplicateSql`: 120 gün ufkunda banka × ay bekleyen taksit > aktif kredi) — üretimde Yapı Kredi Kas/Ara/Oca'da 25'i + eski 28'i kaydı (3 × 33.277 TL; 01.12 dibi 33.277 TL fazla kötü; RF-029, veri düzeltmesi Cowork/Alperen). `lib/cfo/payment-schedule.ts` (aynı eşleşme, saf) → `/cfo/borclar` "Bu ay" (bayat "Ödendi") yerine "takvimde sonraki ödeme" (+ gecikmiş / takvimde yok). Yetim `lib/actions/cfo-actions.ts` silindi (çağıran yok; ikinci snapshot yazarı). Testler: `ai-cfo-health` (PGlite SQL: tek kaynak, çift alarm yok, boşluk, mükerrer, enjeksiyon). Üretim salt-okuma: boşluk 0, gecikmiş 0, mükerrer 3 ay. Skor 50→51.

- **2026-10-09 — Üretim senkronu (200000 + 100000) + backlog tamamlanma kuralı:** Cowork `20261008200000_cfo_maliyet_kapsami_satir` (76abb7a0…, 20:26 UTC) ve `20261009100000_cfo_kredi_kalan_anapara` (2de5c7bb…, 21:25 UTC) uyguladı. Üretim parmak izi salt-okunur yeniden ölçüldü (fn 35→36, fnacl 52→53, view gövdeleri) → `fingerprint.expected.txt`; iki migration `baseline.json` `notAppliedInProduction` ve migration-security listesinden çıktı, source-mapping testindeki açık uygulamaları kaldırıldı (bootstrap uyguluyor). CFO-004 ✅ TAMAMLANDI, RF-005 RESOLVED. Yeni kural (Alperen/Cowork): %100 biten backlog maddesi "✅ TAMAMLANDI YYYY-AA-GG — kısa not" ile işaretlenir → `AGENTS.md` madde 5; `CFO-BACKLOG.md` "Tamamlanan" PR #191–#215 tek tek tarih + not; PDKS backlog'daki biten maddeler aynı biçimde. `20261009110000` (CFO-005b) hâlâ Cowork'te.

- **2026-10-09 — CFO-010 (kısım 1): kredi/kart ödeme alarmı geçen ayın "ODENDI"siyle körleşmesin (RF-028):** `health.ts` "ODENDI" yalnız `lastUpdatedAt > vade − 25 gün` ise sayılır (`PAID_WINDOW_DAYS`); vadesi geçmiş kredi/kart sabah da alarm verir; yeni `ledger_stale` alarmı (vade geçti, ödendi işaretli, sonraki vade girilmemiş). Üretim: 11 kalemin 10'u eski aydan "ODENDI"; 16.10 simülasyonunda eski kural yalnız Ziraat kartını, yeni kural Garanti kredisini de yakalıyor. Test `ai-cfo-health`. Kalan (kısım 2): ödeme işaretinin kendi tarihi + defter yazma yolu.

- **2026-10-09 — CFO-009 (kısım 1): sessiz motor arızaları görünür:** `health.ts` `STUCK_RUN_MINUTES = 15` — uzun süre `running` kalan koşu `stuck` sayılır, `stuck_run` alarmı + ardışık hata sayımı. `runner.ts`: `LockError` satır açılmadan olsa da `engine:<dilim>:<kod>` ile `failed` kaydedilir. `store.ts` `begin`: aynı dilimde başarısız ya da takılmış koşu yeniden denenir (koşullu güncelleme), tamamlanmış/taze koşu tekrar açılmaz. Testler: `ai-cfo-health` (takılmış, ardışık), `ai-cfo-runner` (kilit hatası iz bırakır), `ai-cfo-store` (PGlite: yeniden deneme kuralları). Kalan: bildirim kanalı (D-P07). Skor: 8. boyut 3 → 4 → **50/100**.

- **2026-10-09 — CFO-005b: kart ertelemesi kart faiziyle (`cfo_kart_karari`):** migration `20261009110000_cfo_kart_karari_kart_faizi` — asgariye çekilen bakiyenin aylık faizi eşleşen kartın akdi oranı × 1,30 (KKDF+BSMV), oran yoksa NULL/"BILINMIYOR"; küresel KMH %4,5 kaldırıldı. Üretim tanımı baseline ile birebir aynıydı (md5 doğrulandı); yalnız oran kaynağı ve gerekçe metni değişti. `schema.prisma` `cfo_loan.interestRatePct` yorumu "YILLIK". Test `ai-cfo-source-mapping` (80.000 TL erteleme → 4.420 TL/ay; oran yokken NULL). Held-back (Cowork). Skor değişmez (üretimde uygulanınca RF-004 kapanır).

- **2026-10-09 — CFO-005: düz %4,5 KMH oranı kaldırıldı (TS katmanı):** `lib/cfo/downside.ts` `tieredDrawInterest` (ek çekiliş / kapatma faizi, çekiliş sırası, ölçülmemiş → bilinmiyor, kapasite üstü fonlanamaz) + `measuredRateRange`. `lib/cfo/engine.ts`: KMH faizi hesap başına ölçülmüş oran, oransız kullanım `kmhUsedWithoutRateTry`; `o.monthlyRatePct` → `o.kmh {slices, range}`; gümrük açığı faizi kademeli (+ `interestUnknownTry`); `buildAllocation` gümrük/KMH azaltma getirisi kademeli, KMH kullanılmıyorsa 0, ölçülmemişse UNKNOWN. `capital-efficiency-data.ts` settings oranı yedeği kaldırıldı. Sayfalar: `/cfo` rozeti, `/cfo/borclar` (satır = hesap oranı, toplam tutar; uyarı), `/cfo/gumruk`, `/cfo/sermaye`. Testler: `cfo-engine-forecast` (+KMH), `cfo-downside` (+çekiliş faizi). Kalan: CFO-005b (`cfo_kart_karari` SQL). Skor: 2. boyut 8→9 (borclar tutarlılığı + hayali KMH tasarrufu kalktı) → **49/100**.

- **2026-10-09 — CFO-004: kredi borcu = kalan anapara (RF-005):** migration `20261009100000_cfo_kredi_kalan_anapara` — `cfo_servet_kalem` Krediler satırı ve `cfo_kilometre_yaz` `COALESCE("remainingOverride", "remainingTry")` yerine yalnız `"remainingTry"` (override bir TAKSİT SAYISI). Üretim değerleri değişmez (override'lı kredi yok); migration Cowork'te (`notAppliedInProduction`, BASELINE_DEPENDENT, migration-security listesi). Test: `ai-cfo-source-mapping` (override=12 taksitli 500k kredi borcu 500k artırır; mutabakat SQL'i fark 0). Skor 48 → 48 (latent hata; üretimde uygulanınca H12 için bir P0 eksilir). Red flag pass: yeni bulgu yok; RF-014 ifadesi düzeltildi (`cfo_kilometre_yaz` H01 için ölçüm yazıyor).

- **2026-10-09 — CFO-001 PR-A: metrik sözleşmesi karar memosu + mutabakat ölçümü:** START cde8760. `scripts/cfo/metric-reconciliation.sql` (salt-okunur; tüm net sermaye / borç / nakit / kur / ciro tanımlarını tek satırda ölçer; `ai-cfo-source-mapping` testinde üretim kopyasında koşar: geniş = dar + yoldaki ödenmiş, kredi satırı = kalan anapara, LCNRV ≤ maliyet). `docs/CFO-METRIC-CONTRACT.md`: bugünkü tanımlar + CFO önerileri (D-P01…D-P05). **Üretim:** net sermaye DAR 2.507.805 / GENİŞ 6.266.139 / önerilen LCNRV-geniş **2.973.814 TL ≈ 61,2k USD**; borç bugünkü 9.676.976 / önerilen finansal **5.889.904 TL ≈ 121,3k USD** (+3.787.072 taahhüt); stok maliyet 4,32M · KDV dahil NRV 7,24M · KDV hariç NRV 5,33M · LCNRV 3,95M; 39 SKU KDV sonrası maliyet altında, 32 SKU 0 sayılıyor; KDV hariç ciro hiç ölçülmüyor; 07.10 cirosu eksik ama "A". Yeni red flag: RF-025 (HIGH), RF-026 (MEDIUM), RF-027. Skor 48 (değişmedi: ölçüm, tanım değil). NEXT: CFO-004 (PR-B) + Alperen tanım kararları.

- **2026-10-08 23:45 — İLK TAM CFO SİSTEM DENETİMİ (Master Audit protokolü, Faz 0):** START/END COMMIT 422a6db (yalnız doküman). Kod değişmedi. 3 paralel salt-okunur kod taraması + üretim salt-okunur ölçümleri. Yeni kalıcı belgeler: `docs/CFO-MASTER-PLAN.md` (ana sözleşme + denetim çıktıları A–P), `CFO-BACKLOG.md` (24 madde, sıralı), `CFO-SCORECARD.md` (sabit metodoloji, 12 hard gate), `CFO-RED-FLAGS.md` (append-only, 24 kayıt), `CFO-DECISION-LOG.md` (7 bekleyen tanım kararı). **Skor 48/100; gate 5/12; açık red flag 1 CRITICAL / 9 HIGH / 10 MEDIUM / 4 LOW.** En önemli bulgular: net sermaye 3 sayı (Goal 2,56M ↔ `/cfo` 6,27M ↔ snapshot 6,32M TL); borç hedefi sistemde 5M TL (yeni <100k USD) ve 5 borç formülü (KMH hariç, yoldaki mal vergisi dahil); USD/TRY 4 kaynak (48,56/48,98/49,20 + yedek 1/45/48,5); ciro KDV dahil + 7 formül; düz %4,5 KMH 5 yerde; `remainingOverride` (taksit sayısı) TL olarak toplanıyor (latent); defterlerin yazma yolu/vade devri yok; alarm teslimi GitHub'a bağlı. Hedef açığı (TCMB 48,5585): ciro ≈33,7k/100k USD; net sermaye 52,7k–127,9k/300k USD (tanıma göre, dar seri düşüyor); borç ≈191k USD/<100k. NEXT ACTION: CFO-001 (metrik sözleşmesi; önce karar memosu + mutabakat testi). Bu turda backlog uygulaması BAŞLAMADI (protokol: ilk denetimden sonra dur).

- **2026-10-08 — Maliyet kapsamı açığını kapatan kalem listesi (yerel; migration Cowork uygulayacak):** kapsam %87,5 < %95 → marj/kâr kuralları susuyor; bulgu yalnız yüzde söylüyordu. Migration `20261008200000_cfo_maliyet_kapsami_satir`: satır sınıflaması yeni `cfo_maliyet_kapsami_satir(asof)` fonksiyonuna taşındı, `cfo_maliyet_kapsami_at(asof)` toplamı ondan alır (TEK tanım korunur; imza/dönüş/görünüm aynı; eski gövdeyle birebir aynı sonuç PGlite'ta sınandı; yeni fonksiyondan PUBLIC/anon/authenticated yetkisi alındı). `lib/cfo-agent/cost-coverage.ts` (saf): açık = ceil(eşik × ciro) − kapsanan; en büyük TL'den başlayan en kısa liste, her kalemin işi (maliyet girilmemiş / ürüne eşleşmiyor / adet-set ayrıştırması belirsiz / satır kimliği boş tekrar). `snapshot.ts` kapsam eşik altındaysa ve fonksiyon varsa listeyi kurar; COST_COVERAGE bulgusu: "Eşiğe X TL kapsanan ciro eksik; şu N kalem yeter: …". Fonksiyon yokken eski davranış. **Üretim (salt-okunur, 08.10):** açık 125.642 TL; 8 kalem yeter (133.377 TL → %95,5): anunnaki-pointer 29.148 (eşleşmiyor), 2827456501236 24.885 (güven BILINMIYOR), ANK-IPSET-VRYN 19.900, muk-8li-ip-kamera-seti-sesli 19.840, 543600000 10.605, 4140404044444 9.900, 4224333434117 9.796, 4Q0055916 9.303 (maliyet girilmemiş). Test `ai-cfo-findings` (liste, üst sınır, metin), `ai-cfo-source-mapping` (eski gövdeyle eşlik, kova toplamları, yetki, kapatan liste).

- **2026-10-08 — İki migration üretimde (Cowork uyguladı) — parmak izi yeniden ölçüldü:** `20261008180000_cfo_credit_card_revolving` (checksum fbc2ad78…) ve `20261008190000_cfo_maliyet_kapsami_satir_kimligi` (b47a4553…) `_prisma_migrations`'ta, sütunlar `cfo_credit_card."revolvingTry"` numeric(14,2) / `"contractMonthlyRatePct"` numeric(6,3) var, fonksiyon satır kimliğini kullanıyor. Kapsam (salt-okuma): %87,5 aynı; güvenilmez 101.639,54 → 81.739,54, maliyetsiz 76.750,72 → 96.650,72 (tam 19.900 TL yer değiştirdi; dört kova ciroya 1.675.211,79 TL kuruşu kuruşuna eşit). Üretim parmak izi: yalnız `fn 35 fd044c3d95` ve `rel:r 151 59c7db9733` değişti (beklenen). Repo: `baseline.json` notAppliedInProduction'dan iki migration çıktı, `fingerprint.expected.txt` güncellendi, migration-security beklenen listesi ve source-mapping'deki ayrı uygulama kaldırıldı (bootstrap artık uyguluyor). Kart maliyeti kodu sütunları görüyor; devreden bakiye ve akdi oran girilene kadar kartlar UNKNOWN.

- **2026-10-08 — CASH_CRITICAL tetiği faizli dibe bağlandı (Cowork sırası 3/3):** `anomalies.ts` kural artık projeksiyon dibi YA DA KMH faizi dahil dip (kademeli faiz, `snapshot.cash.minimumWithInterestTry`) tabanın altındaysa tetiklenir; hangisinin tetiklediği `trigger` kanıtında (`projection` / `kmh_interest`). Faizli dip projeksiyondan hiç iyi olmaz → bağlama tetiği yalnız öne çeker, susturamaz. Projeksiyon dibi bilinmiyorsa kural yine susar; banka bayatlık kapısı aynen. Bulgu başlığı faizli tetikte: "Nakit dibi X taban F üstünde, ama KMH faizi dahil dip Y taban altında (tetik faizli dip)". Üretim bugün (08.10): projeksiyon dibi −3.578.121 zaten tabanın (−3.000.000 varsayılan) altında → tetik `projection`, davranış değişmez; fark projeksiyon −3,0M ile faizli dip arasında kaldığı günlerde çıkar. `health.ts` floor/kapasite alarmları değişmedi. Test `ai-cfo-anomalies` (faizli tetik, iki dip de üstte, faizli dip yok, projeksiyon bilinmiyor, ikisi de altta → `projection`), `ai-cfo-findings` (başlık), `ai-cfo-source-mapping` (snapshot alanı).

- **2026-10-08 — KADEMELİ KMH faizi (Cowork sırası 2/3):** `lib/cfo/downside.ts` faizi yalnız KMH ile fonlanan kısma, hesap başına ölçülmüş oranla işletir. Dilimler `cfo_bank_account`'tan (`downside-data.ts` `kmhSlices`): `kmhLimitTry` kendi `monthlyRatePct`'iyle (boş/0 → UNKNOWN), `purposeLimitTry` gümrük dilimi (ayrı ürün, oranı ölçülmedi), 'ŞAHSİ' hesaplar şahsi katman. Çekiliş sırası genel → gümrük → şahsi; katman içinde ölçülmüş ucuzdan pahalıya, ölçülmemiş en sonda; tüm kapasiteyi aşan kısma faiz yok (TL·gün raporlanır). Küresel `cfo_settings.kmhMonthlyRatePct` artık aşağı yönde KULLANILMIYOR. Faiz şoku yalnız ölçülmüş dilimlere. `snapshot.ts`: faizli dip kanıtı ancak en az bir ölçülmüş dilim varsa; ölçülmemiş dilim kullanıldıysa `kmh_orani_olculmemis` kanıtı → bulgu "120 günde KMH faizi en az X TL (oranı ölçülmemiş limit kullanılıyor: …)". B4m kanıtı ve `/cfo/sermaye` (dilim tablosu: limit, oran, en yüksek kullanım, faiz) güncellendi. **Üretim (salt-okunur, 08.10):** projeksiyon dibi −3.578.121 (01.12); kademeli faizle −3.645.356 (01.12) — şahsi hesaplar gerekiyor (eski küresel %4,50: −3.941.724, 01.01, FONLANAMIYOR); 120 günde faiz ≥ 149.411 TL (Ziraat 40.830 · Enpara 18.581 · YKB 90.000); faizi bilinmeyen kullanım ~281M TL·gün (Akbank Alp, Garanti, Garanti Alp, amaca bağlı, şahsi). Kural tetiği DEĞİŞMEDİ (sıra 3/3 bekliyor). Test `cfo-downside` (dilim sırası, tek gün dağılımı, kapasite üstü faizsiz, şok yalnız ölçülmüşe), `ai-cfo-source-mapping` (küresel oran yetmez, hesap oranı gerekir), `ai-cfo-findings` ("en az" metni).

- **2026-10-08 — KMH kapasite alarmı (Cowork sırası 1/3):** `health.ts` `capacity_breach`: `cfo_nakit_projeksiyon(120)` yolunda pozisyonun eksisi şirket kapasitesini (genel KMH + amaca bağlı) ilk aştığı gün ve tutar; şahsi hesaplar yetiyor mu / FONLANAMIYOR. Yalnız genel aşılırsa ayrı anahtar (amaca bağlı limit koşullu: gümrük Ziraat'ten ödenirse). Bugünkü üretim: "Nakit pozisyonu 2026-10-21'de −2.924.473 TL — şirket KMH kapasitesini (genel 1.809.300 + amaca bağlı 750.000) 365.173 TL aşıyor; şahsi hesaplar (1.100.000) gerekiyor". 09.10'da genel KMH'de yalnız 40.688 TL boşluk. Test: ai-cfo-health.
- **2026-10-08 — Mükerrer satır anahtarı düzeltildi (Cowork ölçümü) + hedef gözleminin ölçüm anı:** (kanal, sipariş, model) anahtarı aynı siparişte ayrı koliye giden adetleri mükerrer sayıyordu — tüm tabloda 419 satır (adet_duz > 0); platform satır kimliği (`externalLineId`) eklenince **0** (kaynak tabloda (kanal, sipariş, externalLineId) tekil; kimliği boş satır yok). Örnek Hepsiburada 4823011863: satır 155104 / 155582, farklı kargo no → 19.900 TL doğru ciro. `snapshot.ts` (marj grubu + komisyon örneklemi) ve `acceptance-reconciliation.ts` yeni anahtarı kullanır; üretim fonksiyonu için migration `20261008190000_cfo_maliyet_kapsami_satir_kimligi` (Cowork uygular; etki: 19.900 TL güvenilmez → maliyetsiz, kapsam %87,5 aynı). Hedef bulgusu gözlemin ölçüm anını yazar ("gözlem −3.372.104 TL (08.10 09:11 TR ölçümü)"): alarmın canlı dibi (−3.593.003) ile hedef motorunun sabah gözlemi aynı kaynaktan (`cfo_nakit_projeksiyon(120)`), fark Cowork'ün gün içi veri güncellemeleri. Testler: source-mapping (ayrı satır kimliği → mükerrer değil; kimliği boş → mükerrer), findings.
- **2026-10-08 — CASH_CRITICAL'a KMH faizi dahil dip (yol haritası 6a):** `snapshot.ts` aşağı yön baz senaryosunu (`loadDownside`) okur; akış projeksiyonla birebir tutuyor ve KMH oranı girilmişse `kmh_dahil_dip` / `_tarih` / `_fonlama` / `kmh_faizi_120g` kanıtları eklenir; bulgu: "… KMH faizi dahil dip −3.958.629 TL (2027-01-01) — FONLANAMIYOR; 120 günde KMH faizi 616.399 TL." Kanonik dip ve tetik aynı. Testler: source-mapping (oran yokken eklenmez; varken faizli dip ≤ faizsiz), findings.
- **2026-10-08 — Mükerrer satır şirket çapında kapı değil (Alperen kararı "A" — düzeltme: Cowork'e bu konuda A/B sunulmamıştı; Cowork sonuçta hemfikir):** 1 Hepsiburada sipariş satırının iki kopyası (sipariş 4823011863, ANK-IPSET-VRYN, satır 9.950 TL; iki kopya cironun %1,19'u) bütün MARGIN_DROP / NEGATIVE_PROFIT / PROCUREMENT kurallarını susturuyordu. `anomalies.ts`: kapı yalnız maliyet kapsamına bağlı; mükerrer satır `DUPLICATE_SALES_ROWS` (BİLGİ) uyarısı üretir; ilgili SKU-kanal grubu zaten güvenilmez sayılıp marj hesabından çıkar. Aynı gün önemlilik eşiği canlıda doğrulandı: CASH_CRITICAL yeniden ACİL ("Bayat ama önemsiz hesap … Ziraat USD (şirket) (420 TL)"). Not: satış karşılaştırması (REVENUE_DEVIATION) ve borç tahmini hâlâ mükerrer satır=0 şartı arar — ayrı karar.
- **2026-10-08 — Banka bayatlık kapısı önemlilik eşikli (Cowork kararı):** `snapshot.ts` hesap bazında okur; bayat hesap (8 günden eski / bakiye ya da tarih bilinmiyor) yalnız |bakiye| ≥ `materialMinTry` (10.000 TL) ise `banksFresh=false` yapar. Önemsizler `cash.staleBanks` + `stale_immaterial` kanıtıyla CASH_CRITICAL bulgusuna uyarı olarak girer ("Bayat ama önemsiz hesap (kapıyı kapatmaz): Ziraat USD (420 TL)"); SUSAN satırı önemli hesap adlarını yazar. Testler: source-mapping (üretim kopyası: 419,53 → kapı açık, 50.000 → kapalı), findings.
- **2026-10-08 — Tahsilat temposu ↔ ciro uzlaştırması (yol haritası 6c, salt okuma):** kanal temposu (alacak defteri) toplamı 34.931 TL/gün, son 30 gün satış × `cfo_kanal_net_oran` 36.043 TL/gün (−%3) → dipte sistematik sapma yok (~33k TL/ay karamsar). Kanal bazında: ePttAVM / N11 / Pazarama / Amazon defterde eksik (−5,2k/gün), Trendyol / HB fazla (+3,7k/gün). Pazarama'nın hiç alacak kaydı yok.
- **2026-10-08 — Güvenilir motor tetiği:** `vercel.json` trendyol-sync `0 6 * * *` → `0 12 * * *` (Hobby: saat içinde → 15:00–15:59 TR). Motor artık Cowork'ün iki okumasından önce Vercel cron'uyla koşar: 05:xx (xml-sync) → 08:00 okuması, 15:xx (trendyol-sync) → 16:49 okuması. Trendyol 14 günlük pencere tarar, veri kaybı yok; Trendyol verisi sabah yerine öğleden sonra tazelenir (08:00 okumasında Trendyol verisi 23 yerine ~16 saatlik). GitHub `ai-cfo-schedule` ek koşu + sağlık e-postası olarak kalır.
- **2026-10-08 — Motor uçtan uca doğrulandı + GitHub zamanlayıcısı ölçüldü:** elle tetik (`workflow_dispatch` → `?trigger=manual`, anahtar `engine:2026-10-08T20:m2`) 2 dk'da tamamlandı; kapsam fonksiyondan (%87,5), dip tek mekanizmadan (−3.593.003, 01.12), alarm 2 (taban + Ziraat USD bayat → CASH_CRITICAL susuyor). **GitHub zamanlayıcısı bu repoda güvenilmez:** `*/5` hatırlatma işi gerçekte günde 2–3 kez, rastgele saatte koşuyor; `ai-cfo-schedule` 24 saatte 1 zamanlanmış koşu. Güvenilir tetik yalnız Vercel cron (Hobby: 2 iş, günde 1, saat içinde rastgele dakika): 05:00 TR xml-sync → motor (Cowork 08:00 okumasından önce ✓); 09:00 TR trendyol-sync → motor (16:49 okumasından 8 saat önce). Karar Cowork'te (Backlog).
- **2026-10-08 — Maliyet kapsamı üretimde (Cowork uyguladı):** `20261008160000_cfo_maliyet_kapsami` birebir (checksum 4b9b6ff2…); `cfo_maliyet_kapsami` %87,5, dört parça ciroya eşit, anon/authenticated erişemez. Repo `notAppliedInProduction`'dan çıkarıldı, parmak izi üretimden yeniden ölçüldü. Motor bir sonraki koşuda kapsamı bu fonksiyondan okur. Eşleşmeyen 31.011 TL'nin 29.148'i `anunnaki-pointer` (cfo_norm ile 2 ürün → bilinçli olarak eşleşmez); `productId` ile üçüncü eşleşme adımı Cowork kararına bırakıldı.
- **2026-10-08 — `/cfo` haftalık tahmini tek mekanizmaya bağlandı (Alperen: tam yetki):** Cowork `20261008170000_cfo_tahsilat_tahmini`'yi üretimde uyguladı (16:46 UTC) ve 14 `ce_model_tahsilat_*` kaydının `inflowTry`'ını boşalttı → çift sayım yok; dipler buluştu: `cfo_odeme_gunluk` −3.591.775 ↔ projeksiyon −3.593.003 (ikisi 01.12). `lib/cfo/engine.ts`: haftalık ek tahsilat artık `cfo_tahsilat_tahmini` (kanal temposu, alacak ufku dışı; `lib/cfo/queries.ts` okur) → `/cfo` ufukları, ay sonları ve gümrük kartı da aynı girişi görür; görünüm yoksa eski `last14dRevenueTry/4` yedeği (kaynak `weeklyEstimateSource` ile ekranda yazılı, `/cfo/nakit-akisi`). Test `cfo-engine-forecast`.
- **2026-10-08 — Uzun metin UPDATE zaman aşımı teşhisi (salt okuma):** sebep veritabanında değil; ayrıntı Backlog'da.
- **2026-10-08 — Tahmini tahsilatın tek mekanizması (Cowork kararı; yerel, üretime UYGULANMADI — Cowork uygular):** migration `20261008170000_cfo_tahsilat_tahmini`: `cfo_tahsilat_tahmini` görünümü = `cfo_nakit_projeksiyon`'un `kanal` + `tah` CTE'leri birebir (her kanal kendi son açık vadesinden sonra, tempo = önümüzdeki 30 gün hakedişi/30, ufuk 120 gün); `cfo_yaklasan_odeme`'ye dördüncü GİRİŞ kolu ('Tahmini tahsilat', TAHMINI, id `tahmin:<tarih>`) → `cfo_odeme_gunluk` ve `cfo_nakit_dibi` aynı mekanizmayı görür. Sütun tipleri aynı. Canlı salt-okuma ölçümü (16 `ce_model_tahsilat_*` silinmiş varsayımıyla): `cfo_odeme_gunluk` dibi −3.591.858 (01.12) ↔ projeksiyon −3.593.086 (01.12). ⚠️ Uygulandığı oturumda Cowork 16 model kaydını siler. `/cfo/odemeler`: tahmin satırı işaretlenemez; yalnız tahmin içeren günler kart açmaz, sonraki gerçek hareket gününde tek satırda toplanır. Test: `__tests__/cfo-tahsilat-tahmini.test.ts` (121 gün projeksiyon eşitliği, odeme_gunluk = alacak + tahmin + gerçek inflowTry, ufuk içi çift sayım yok, ACL). Ölçüm: `lib/cfo/engine.ts` `windowSums`/gümrük `expectedInflow` alacak + `last14/4` haftalık tahmin + inflowTry'ı topluyor → 90 günde ~2,29M çift sayım (model kayıtları silinince kapanır); `cfo_settings.customsReserveDate` 30.09'da kalmış (gümrük kartı bayat), `last14dRevenueTry` 23.08 tarihli.
- **2026-10-08 — Cowork kararları (yerel, üretime UYGULANMADI — onay bekliyor):** (1) `ai-cfo-schedule.yml` günde 3 sabit koşu (07:17 / 12:37 / 16:07 TR) + `workflow_dispatch` → `?trigger=manual`; tetik adı `hourly` → `scheduled`; `ENGINE_STALE_HOURS` 6 → 20; günlük hatırlatma sabah penceresi (06–10 TR). (2) Maliyet kapsamı tek tanım: migration `20261008160000_cfo_maliyet_kapsami` (`cfo_maliyet_kapsami_at(asof)` + görünüm `cfo_maliyet_kapsami`; ciro ağırlıklı, son 30 tam gün; güvenilmez → eşleşmeyen → maliyetsiz → kapsanan). Canlı salt-okuma ölçümü: %87,5 (satır %88,4, SKU %72,1, eşleşme %97,8). Motor (`snapshot.ts`) kapsamı artık kendisi hesaplamıyor, fonksiyonu okuyor; yoksa bilinmiyor → kapı kapalı. Eski %56,7: SKU-kanal grubunda tek güvenilmez satır tüm grubu düşürüyordu. Üretim uygulaması + parmak izi + PR açık onaydan sonra.
- **2026-10-08 — CFO motoru üretimde ilk koşu + iki düzeltme:** İlk motor koşusu (GitHub `workflow_dispatch`, 15:20 TR) 123 sn'de tamamlandı: 39 bulgu (10 ACİL — 9 STOCKOUT + taban hedefi), 153 METRIK, 2 alarm (taban −3.272.044 deliniyor; Yapı Kredi USD + Ziraat USD bakiyesi 7 günden eski). Düzeltmeler: (1) `cfo_gun_ozeti` SAGLIK saati UTC sütunu İstanbul yereli sanıp 6 saat geri gösteriyordu (09:20 ↔ 15:20) — migration `20261008130000_cfo_gun_ozeti_tz` (üretimde uygulandı, `_prisma_migrations`'a kayıtlı, yetkiler değişmedi, parmak izi 17/17 birebir); (2) stoğu sıfır SKU'da "0 günde tükenecek" yerine "stokta yok". **Bulgu — zamanlayıcı güvenilmez:** GitHub zamanlanmış işleri bu depoda ağır kısılıyor (son 24 saatte "saatlik" sağlık işi 4 kez, yeni saatlik motor işi birleştirmeden sonra 1 saat içinde 0 kez koştu). Motor şu an yalnız senkron sonrası (05:00 / 09:00 TR) ve GitHub'ın verdiği seyrek slotlarda koşar → Backlog'a güvenilir tetik eklendi.
- **2026-10-08 — Sitede LLM YOK: deterministik CFO motoru + Cowork CFO (Alperen kararı "Sabah + akşam"):** AI yargısı Cowork CFO'ya taşındı (08:00 + 16:49 TR). Site motoru saatte bir: ölçer → tespit eder → **şablonla bulgu** yazar (`lib/cfo-agent/findings.ts`: her anomali — eylemlik olsun olmasın — ne · TL etkisi · kanıt id'leri · aksiyon · aciliyet ACİL/BUGÜN/BU HAFTA/BİLGİ; metindeki her sayı kanıttan; STOCKOUT'ta sipariş miktarı = ⌈hız × 21 gün − stok − yoldaki⌉) → **önemli değişiklik bayrağı** (`materiality.ts`: tüm anomalilerin karar girdisi hash'i; bulgu başına dünden beri yeni/değişti/aynı, dün olup bugün olmayan "kapanan") → **METRIK** satırları (CFO bağlamı Blok B: nakit kapısı, kaynak yeterliliği, dipler, sermaye verimliliği, VOI, karar hafızası, hedef atfı, ciro kaldıraçları, aşağı yön) → **alarm** (`health.ts`: motor 6 saattir yok, üst üste 2 başarısız, taban −3M deliniyor, işaretlenmemiş/vadesi geçmiş ödeme, Entegra/XML/Trendyol/banka ölü; e-posta yalnız arıza, YENİ alarm ve 09:00 TR hatırlatmasında; `no_insight_24h`/bütçe/token alarmları kaldırıldı). Tek kayıt `cfo_run` (`idempotencyKey 'engine:%'`; `type` CHECK'i değişmesin diye `monitor`); snapshot (~164 kB) yalnız karar girdisi değişince yazılır. **`cfo_gun_ozeti`** görünümü (migration `20261008100000_cfo_gun_ozeti`, security_invoker, anon/authenticated kapalı): tek `select *` → SAGLIK · ALARM · BULGU · KAPANAN · SUSAN · METRIK. Saatlik iş: `ai-cfo-schedule.yml` her saat :05 (motor + sağlık tek iş; ayrı sağlık workflow'u kaldırıldı) + XML/Trendyol senkron sonrası (ayrı idempotency anahtarı). Kaldırılanlar: `provider.ts`, `validate-ai-output.ts`, `handbook-core.*`, `rule-cards.*`, `decision-packet.ts`, `budget.ts`, `cost-efficiency.ts`, LLM hafızası, `ai-cfo-morning` ucu, derin inceleme, token/bütçe/sağlayıcı ayarları; `/admin/ai-cfo` motor sayfasına döndü. `cfo_insight`/`cfo_usage` yazılmaz (geçmiş kalır). Testler: `ai-cfo-findings`, `ai-cfo-runner` (motor), `ai-cfo-health`, `ai-cfo-context-blocks`, `ai-cfo-store` (görünüm satırları + ACL).
- **2026-10-08 — Kredi kartı borç maliyeti (CFO yol haritası #7, migration ONAY BEKLİYOR):** Kart notlarındaki ölçümler: Garanti ana kart (asgari ödendi) ~619k, Garanti ek kart ~128k, Enpara ~405k, Akbank Alp ~119k (şahsi) DEVREDİYOR — toplam ~1,27M faiz işliyor; Ziraat 15.10'da %20 ödeme kuralıyla ~630k daha devredecek. Eski hesap: `computeCfo` tüm kart borcunu KMH oranıyla çarpıyordu (dönem içi harcama faizsizdir), sermaye motoru kartları faizsiz sayıyordu → eşik getiri (Garanti kredisi %4,31/ay) ve tahsis sırası yanlış. Kart faizi akdi × (1 + KKDF %15 + BSMV %15) ile büyük olasılıkla en pahalı ticari borç. Yeni: `lib/cfo/card-cost.ts` (saf), `cfo_credit_card.revolvingTry` + `contractMonthlyRatePct` (migration `20261008180000_cfo_credit_card_revolving`, `notAppliedInProduction`), `computeCfo` banka bazlı KMH oranı (şahsi KMH'ye KKDF+BSMV), kart faizi yalnız devreden bakiyeden, "kart borcu azaltma" seçeneği kartın kendi oranıyla (bilinmiyorsa getiri UNKNOWN); sermaye motoru devreden kartları eşik + kapama planına alır (şahsi hariç); VOI kartta devreden/oran bilinmiyorsa sorar; `updateCardAction` iki alanı yazar + değişiklik günlüğü; `/cfo/borclar` sütunu. Test `cfo-card-cost`.
- **2026-10-07 — Aşağı yön senaryoları (CFO yol haritası #6):** `lib/cfo/downside.ts` (saf) + `downside-data.ts`. `cfo_nakit_projeksiyon(120)` yalnız toplam giriş döndürdüğü için aynı kurallarla bileşenlerine ayrılarak okunur (defter alacağı / kanal temposu / çıkış / VERGI_GUMRUK = kur duyarlı) ve her gün fonksiyonla eşlik denetlenir (uyuşmazlıkta senaryolar tahsise bağlanmaz). **Bulgu:** projeksiyon eksi pozisyonun KMH faizini saymıyor — aylık %4,5 ile 120 günde ~558k TL; baz dip −3,28M (01.12) değil **−3,62M (01.01)** ve ancak şahsi hesaplar dahil tüm kaynaklarla, **16k TL payla** fonlanıyor. Emniyet payı: ciro −%0,8 / kur +%0,4 / 1 gün gecikme bile fonlanamaz. Tekil şoklar: kur +%15 −559k, hakediş +14 gün −535k, ciro −%20 −521k, faiz +1 puan −91k; makul stres (yarım şoklar birlikte) dip −4,55M, eksik 916k; ağır stres −5,35M, eksik 1,71M. Tahsis motoru likidite rezervini baz (380k) yerine makul stres açığıyla (~1,55M, taban −3M) ayırır → nakit tüketen stok/borç kullanımları ondan sonra. `/cfo/sermaye` en üst kartı, AI CFO Blok B4m, planlı pakette nakit kararına stres dibi. Not: `cfo_kaynak_yeterliligi` nakdi (59,7k) hem pozisyonda hem kaynakta sayıyor (küçük çift sayım; üretim fonksiyonu değiştirilmedi). Test `cfo-downside`.
- **2026-10-07 — Ciro hedefine giden yol — gelir kaldıraçları:** `lib/cfo/revenue-levers.ts` (saf) + `revenue-levers-data.ts`. Ciro açığı (bugün son 90 gün/3 ≈ 1,89M TL/ay; hedef 100.000 USD × cfo_kur ≈ 4,9M) ve kaldıraçlar: (1) konteynerdeki yeni ürünleri listele — 149 ürün, 145'i katalogda yok, liste değeri 14,73M, parası ödenmiş (gümrüklü 145k USD ≈ 7,1M TL batık sermaye, bugün getirisiz) → ithalat planının 6 ay varsayımıyla ~2,45M TL/ay ciro, EK SERMAYE YOK; (2) stoksuz kalan 47 satan ürün — ~448k TL/ay ciro, ~173k TL/ay malın maliyeti; (3) SCALE stok tamamlama (ciroyu korur). Sıra: önce ek sermaye istemeyen, sonra brüt katkı / ek sermaye; güvenle ağırlıklı açık payı. `/cfo/sermaye` başında kart, AI CFO Blok B4l + planlı pakette ciro kararlarına açık ve kaldıraç #1. Nakit tahmini kalibrasyonu (yol haritası #5) bilinçli ertelendi: veri 06.10'da başladı, 2–4 hafta sonra anlamlı. Test `cfo-revenue-levers`.
- **2026-10-07 — Hedef açığı atfı (CFO yol haritası #4):** `lib/cfo/goal-attribution.ts` (saf) + `goal-attribution-data.ts`. Net sermaye değişimi (fm_balance_day) nakit / alacak / borç / stok MİKTARI (fm_stock_sku_day Δadet × bugünkü birim net değer) / stok DEĞERLEMESİ olarak bölünür; operasyonel (değerleme hariç) günlük hız Goal Engine'in gereken hızıyla karşılaştırılır. `/cfo/kararlar`'da kart, AI CFO Blok B4k. Üretim (salt-okunur): 06.10'daki +1,35M "servet artışı" adet −1.322 iken oldu → tamamı değerleme; 11.09→06.10 (25 gün) bildirilen +227k (+9,1k/gün) ama operasyonel −530k (−21k/gün: nakit −129k, alacak −118k, borç azalışı +161k, stok miktarı −444k), değerleme +1,12M. Wealth hedefi +26k TL/gün istiyor → şirket operasyonel olarak eriyor; Goal Engine'in bildirdiği hız yanıltıcı. Test `cfo-goal-attribution`.
- **2026-10-07 — Decision Memory (CFO yol haritası #3):** `lib/cfo/decision-memory.ts` (saf) + `decision-memory-data.ts`. `cfo_hamle` defteri (15 stratejik karar; dış CFO yazıyor, uygulama hiç okumuyordu) artık veriyle ölçülür: ölçüm metriği metni veri anahtarına eşlenir (toplam borç, kart+KMH, kart, şahsi kart, kamu tahsilatı, FBA cirosu; eşleşmeyen UNMEASURED), başlangıç → bugün → hedef, hedefe giden doğrusal yola göre ilerleme (ACHIEVED / ON_TRACK / BEHIND / WRONG_DIRECTION; hedef sayısı yoksa IMPROVING / WORSENING), hedefe yetişmek için gereken günlük değişim, kapanmış kararlarda tahmin hatası. Son tarih beklenen etki metnindeki gg.aa.yyyy'den, yoksa ilk ölçüm tarihinden. Yeni sayfa `/cfo/kararlar` (menü: CFO → Kararlar ve Sonuçları); AI CFO Blok B4j + planlı pakette nakit kararlarına ters yöndeki ilk karar; paket ekleri karar değerine göre yeniden sıralandı (4 ek sınırı sermaye ve hafıza kanıtını kesiyordu). Deftere YAZILMAZ. Üretim (07.10): H09 toplam borç 9,11M → 9,24M (hedef 6,0M / 31.12) TERS YÖN, artık −38k TL/gün gerekli; H11 kart+KMH 2,37M → 2,43M (hedef 1,0M) TERS YÖN; H07 kart borcu 2,03M → 2,41M kötüleşiyor; H12 şahsi kart 349.335 → değişmedi (hedef 0 / 22.11); kapanmış 5 kararın hiçbirinde beklenen sayı yok → kalibrasyon ölçülemiyor. Test `cfo-decision-memory`.
- **2026-10-07 — VALUE OF INFORMATION ENGINE (CFO yol haritası #2):** `lib/cfo/voi.ts` (saf) + `voi-data.ts` (tek yükleyici; sermaye motorunun çıktısını yeniden kullanır). Her bilinmeyen için etkilediği karar, karar değerinin TL aralığı, yaklaşık bilgi değeri (EVPI ≈ salınım × değişme olasılığı) ve eylem: DECIDE_NOW (değer < 2.000 TL dikkat maliyeti ya da karar aralığın iki ucunda aynı), ASK_FIRST (yalnız Alperen çözebilir), RESEARCH_FIRST (CFO veriden çözer). Kaynaklar: maliyeti bilinmeyen stoklu SKU (maliyet, bilinen SKU'ların maliyet/net oranı p25–p75'inde → sınıf değişiyor mu), satış kanıtı olmayan ölü stok (EVPI = aralık/8), bayat banka bakiyesi (30 gün brüt hareket × bayat gün oranı → likidite açığı kararı), varışı geçmiş ithalat (1 haftalık yanlış plan ≈ aylık kârın 1/4'ü), bayat Trendyol finans dosyası (kesinti ±2 puan × satış), açık serbest metin sorular (metindeki en büyük TL × alan çarpanı; tutarsız/finansal olmayan → ölçülemedi). Dikkat bütçesi: ilk ekranda en çok 5 ASK_FIRST; kalanı bastırılır. `/cfo/sorular` başında "Önce bunu öğren" kartı; AI CFO Blok B4i (toplam, dağılım, ilk 3 sor, ilk 2 araştır). Üretim (salt-okunur): 102 açık sorunun 14'ü değerli, 3'ü şimdi karar verilebilir, 85'inde metinde tutar yok (artık öne itilmiyor); en değerli: 01.11 fon açığı (~147k), 07.26sea gümrük (~80k), 797k ölü stok rafta mı (~80k); veri kaynaklı en değerli: 07.26sea gerçek durumu (~251k). Test `cfo-voi`. Soru kayıtlarının önceliği DEĞİŞTİRİLMEDİ (sıralama okuma anında).
- **2026-10-07 — Sermaye verimliliği + marjinal tahsis motoru (CFO yol haritası #1):** `lib/cfo/capital-efficiency.ts` (saf) + `capital-efficiency-data.ts` (tek yükleyici; sayfa ve AI CFO aynı kodu çağırır). Eşik getiri = en pahalı kapatılabilir ticari borcun aylık faizi (bugün Garanti %51,67/yıl = %4,31/ay; şahsi borç eşik olmaz). Her gerçek stoklu SKU: aylık sermaye getirisi = (birim net değer − maliyet) × aylık satış / bağlı sermaye (yalnız gerçekleşen satış fiyatı; yoksa UNKNOWN), örtü, hedef örtü (deniz tedarik + 30 = 97 gün) üstü fazla, eşik altı değer kaybı, tasfiyenin elde tutmaya eşit olduğu en yüksek indirim (1 − 1/(1+eşik)^T), açığa çıkabilir nakit. Sınıflar SCALE/KEEP/TRIM/FIX_PRICE/LIQUIDATE/UNKNOWN. Tahsis: önce likidite açığı (Goal Engine net pozisyon tabanı), sonra risk ayarlı getiri (stok tamamlama güven 0,6, borç kapama 1). `/cfo/sermaye`'de kartlar + sınıf tablosu + "sıradaki X TL" planı + 3 liste. AI CFO Blok B4h (eşik, kayıp, nakit, sınıflar, en kötü 3 SKU, planın ilk 3 adımı); planlı pakette nakit/stok kararlarına eşik + plan #1. **Hata düzeltmesi:** `cfo_loan.interestRatePct` YILLIK (el kitabı 🔴; amortisman da doğruluyor) ama `buildAllocation` ve `/cfo/borclar` aylık sayıyordu → kredi getirisi 12 kat (Garanti "517k/ay tasarruf", "%620/yıl"); düzeltildi. Üretim (salt-okunur, 07.10): SCALE 15 SKU / 613k sermaye / 140k TL/ay katkı (tamamlama ihtiyacı 650k); TRIM 12 / 1,41M; LIQUIDATE 45 / 1,15M; FIX_PRICE 12 / 617k / −18,5k TL/ay; eşik altı değer kaybı ~121k TL/ay. Test `cfo-capital-efficiency`.
- **2026-10-07 — CFO panel defterlerini okuyor (Blok B4g):** `lib/cfo-agent/finance-ledgers.ts` — hiçbir CFO kodunun/görünümünün okumadığı üç defter: (1) Trendyol fatura + hakediş (`/marketplace/trendyol/finans` yüklemesi): son tam ayın kesinti dökümü (komisyon, kargo, hizmet, ceza, reklam), kesinti oranı, 90 gün iade oranı ve ceza; fiyat/marj kararlarında planlı pakete kesinti oranı eklenir. (2) Banka hareketleri (`cfo_banka_hareket`, ekstre): banka başına son 30 gün giriş/çıkış + son hareket. (3) Açık teklifler (taslak/gönderilmiş, süresi geçmiş). Yükleme bazlı → bayat dosya ölçüm sayılmaz (Trendyol 14 gün, banka 10 gün). Üretim (salt-okunur, 07.10): Ağustos kesinti 394.802 TL / brüt satış 1.512.257 TL = %26,1; 90 gün iade %11,5; 16 ceza faturası; Trendyol dosyası 09.09'dan beri yüklenmemiş (27 gün, BAYAT); 9 açık teklif 248.032 TL, 8'inin süresi Mayıs'ta geçmiş. Test `ai-cfo-decision-packet`.
- **2026-10-07 — Tek kur kaynağı + şema yakalama:** `lib/fx/current.ts` (saf seçim `lib/fx/pick.ts`, test `fx-current`): USD/TRY artık CFO'nun aylık kur defteri `cfo_kur`'dan (Ekim 48,98), yedekler `cfo_settings` → elle (`MonthlyExchangeRate`) → varsayılan; RMB/USD elle girilen son kayıttan (6,8). Elle girilen son kur 2026/06 = 46'da kalmıştı ve 13 yer onu okuyordu: ithalatçı görünümü, sipariş formu, ithalat kokpiti/hesaplayıcı, pazar kârlılığı, gerçekleşen marj, ürün listesi/detayı, ithalat karar kaydı, akıllı öneriler, XML fiyat çevrimi (`MarketplacePrice.priceTry`), dashboard üst şeridi, sermaye sayfası. Pazar kârlılığı ve gerçekleşen marj kuru yılı yok sayarak (yalnız aya göre) seçiyordu — düzeldi. Döviz kurları sayfası panelin kullandığı kuru ve kaynağını gösterir; test, yeni doğrudan kur okuyucusu eklenmesini engeller. Şema: üretimde migration'sız duran `cfo_kaldirac_basamak` + `cfo_kanal_sozluk` için `20261007220000_cfo_ledger_tables_capture` (üretim kataloğundan birebir DDL; üretimde no-op + kayıt, veri dokunulmadı: 7 basamak, 26 sözlük satırı). Parmak izi artık HARİÇ TUTMASIZ tam üretimle birebir (151 tablo). 3 yedek tablonun silme migration'ı repoda ama üretimde bekliyor (Supabase aracı DROP'u onaysız çalıştırmıyor).
- **2026-10-07 — `alfashome_order` üretimde (kullanıcı onayı "Onaylıyorum"):** migration `20261007210000_alfashome_order` tek transaction'da kontrollü SQL ile uygulandı + `_prisma_migrations` kaydı (sha256 `1c8db98f…513e`, dosyayla aynı). Doğrulama: tablo var, RLS açık, anon/authenticated yetkisi yok, `cfo_acceptance_reader` SELECT; 0 satır (ilk senkron sonraki trendyol-sync cron'unda). `baseline.json notAppliedInProduction`'dan çıkarıldı; üretim parmak izi yeniden ölçüldü (`fingerprint.expected.txt`). Bulgu: üretimde repoda migration'ı olmayan iki tablo var — `cfo_kaldirac_basamak`, `cfo_kanal_sozluk` (el kitabı sahibi doğrudan oluşturmuş); parmak izinde hariç tutulup not edildi, ikisi dışında üretim = repo birebir.
- **2026-10-07 — Panel taraması aşama 3: üç sermaye sayfası tek sayfada (`/admin/sermaye`, kullanıcı: "Birleşsin"):** `/admin/sermaye-saglik`, `/admin/capital`, `/admin/executive` silindi, kalıcı yönlendirme (`#saglik`, `#durum`, `#operasyon`). Üçü + dashboard manşeti dört ayrı kopyaydı: üç farklı kur (elle girilen aylık kur 2026/06'da 46'da kalmıştı; CFO 48,98), üç farklı bağlı sermaye kuralı, iki ölü stok tanımı, iki farklı rezerv formülü. Artık tek hesap `lib/capital/health.ts` (+ saf `lib/capital/score.ts`): kur `cfo_settings`, stokta bağlı `cfo_stok_deger.maliyet_degeri`, ölü stok `cfo_olu_stok` (/cfo/olu-stok ile aynı tutar), servet `cfo_servet` (yalnız CFO_READ olana); sayfa TL. Dashboard skoru aynı fonksiyonu okur (USD → TL). Sermaye ayarı formu (CapitalConfig) korundu; rezerv serbest sermayenin yüzdesi. CFO artık sermaye ayarını görür (`capital-config.ts`, Blok B4f: toplam ayar TAHMİNİ, stokta bağlı ölçüm, kullanılabilir). Kaldırılan ölü kod: `lib/capital-allocation.ts` (öneri tablosu zaten kaldırılmıştı), `ImportOrderPointer`. Forecast tüketici kaydı güncellendi (16 çağrı noktası). Üretim (salt-okunur): stokta bağlı 4.357.225 TL, ölü stok 2.431.780 TL, 57 stoklu üründe birim maliyet yok (sayfada uyarı). Veri değişikliği/migration yok.
- **2026-10-07 — Panel taraması aşama 2b: ALFASHOME kanalı:** alfashome.com siparişleri (Entegra'da yok; stok XML'den elle düşülüyor) `alfashome_order` tablosuna günlük yazılır (`lib/alfashome/sync.ts`, trendyol-sync cron'unda CFO döngüsünden önce; kişisel veri yok, yalnız tutar/tarih/durum/adet). CFO `alfashome-sales.ts` ile ayrı kanal cirosu okur (son 30 gün ödenmiş, ay başından, ödeme bekleyen, son sipariş, senkron tazeliği): derin incelemede Blok B, planlı pakette ciro kararlarında. Kalemlerde SKU/fiyat olmadığı için ürün bazlı değil; ürün hızı XML'de zaten var (çift sayım yok). Migration `20261007210000_alfashome_order` üretimde ONAY BEKLİYOR (`baseline.json notAppliedInProduction`); kod tablo yokken sessizce atlar.
- **2026-10-07 — Panel taraması aşama 2a: CFO gelecek ithalatı görüyor:** `import-revenue.ts` — açık ithalat projelerinin beklenen ciro/kâr/aylık katkısı (`cfo_import_project`, TAHMİNİ) ve konteynerdeki yeni ürünlerin liste fiyatlı brüt değeri + katalogda olmayan sayısı (`urun_aday`). Derin incelemede Blok B'de; planlı pakette nakit/stok kararlarında en yakın projenin aylık katkısı. Varış tarihi geçmiş ama YOLDA kalan proje "durum güncellenmeli" diye işaretlenir. Üretim (salt-okunur): 07.26sea 15,47M ciro / 6,04M kâr / 6 ay (aylık ~2,58M), ROMANYA-PARCA 3,34M; 149 yeni ürün 14,73M liste fiyatı, 145'i katalogda yok. Kullanıcı kararları: alfashome siparişleri Entegra'ya düşmüyor (XML stoktan elle düşülüyor) → ayrı kanal; sermaye sayfaları birleşecek; 3 yedek tablo silinecek (SQL kullanıcıya verildi).
- **2026-10-07 — Panel taraması, aşama 1 (güvenli düzeltmeler):** kırık linkler: `/admin/purchase-orders/[id]` detay sayfası eklendi (liste "Detay" ve oluşturma sonrası 404 veriyordu), `/quotes/new` → müşteri sayfasındaki teklif bölümü (`#teklif`), `/admin` → `/dashboard`. Sahipsiz/emekli sayfalar kaldırıldı + kalıcı yönlendirme: `/admin/bulk-import` → `/products` (aynı toplu butonlar orada), `/admin/import-decisions` ve `/admin/procurement` → `/cfo/kazananlar#ithalat`. Menü sayfanın reddettiği kullanıcıya link göstermiyor (`alsoRequires`, `adminOnly`: AI CFO, Satış Eşleştirme; `/cfo`'daki Çalışan CFO linkleri yalnız ADMIN). `proxy.ts` oturum öneki: `/admin`, `/marketplace`, `/warehouse`, `/orders`, `/alfashome`, `/reklamlar`, `/whatsapp`, `/yardim`. CFO borç tahmini `cfo_satis_siparis`'te olmayan `orderDate`/`totalAmountTry` sütunlarını soruyordu (her koşuda düşüyordu) → incelenmiş sütun eşlemesi; üretimde son 30 gün 1.885.425 TL / 30 gün okunuyor.
- **2026-10-07 — İlk planlı koşu (19:53) ve iki düzeltme:** paket tahmini 3.325 token (önce ~24.800); 12 adaydan 9'u önemsiz, 4 açık iş, 2 soğuma → 3 anomali seçildi. Çağrı `blocked_by_daily_budget`: sabahki iki `provider_http_400`'ün 4,20 TL rezervi harcama sayılmıştı. Düzeltme: HTTP hata yanıtında rezerv 0 yazılır (zaman aşımında kalır). Koşu 95 sn sürdü → runner/monitor/morning route `maxDuration` 120 → 300.
- **2026-10-07 — AI CFO maliyet ve görev ayrımı (onaylı refactor):** SCHEDULED_CFO ↔ MANUAL_DEEP_REVIEW. Planlı çağrı: küçük karar paketi (≤3 anomali, ≤6 kanıt, ≤2 rule card — v1, el kitabı §7'den birebir, sahibin seçimi, ≤2 önceki karar; tahmini 1.700–2.800 token), sert 8.000/700 token, önbellek yok, uzak sayım yalnız ≥%80'de. Önemli değişiklik kapısı + `decision_input_hash` (aynı girdi → 0 çağrı). Günde ≤1 zamanlanmış / ≤2 toplam çağrı; koşu 2 TL, gün 5 TL, ay 300 TL; derin inceleme ayrı (8 TL / 100 TL). Kaçınma durumları (`open_task`, `cooldown`, `data_quality_only`, `no_material_change`, `same_input`), admin maliyet verimliliği kartı, derin inceleme butonu, sağlık alarmı uyarlandı. Yeni: `materiality.ts`, `decision-packet.ts`, `rule-cards.md/.ts`, `cost-efficiency.ts`, test `ai-cfo-decision-packet`. Migration yok; finansal formüller, Goal Engine, Forecast, Market Scout, borç kapısı değişmedi.
- **2026-10-07 — Girdi tavanı 50.000 + ölçülen sayı kayıtta:** sınır 20.000'le 07.10 14:11 ve 16:59 koşuları yine `blocked_by_input_tokens` (≈16.000 tahmini tuttu­madı: 28,5 KB Türkçe el kitabı + kanıt id'leri). `config.ts` varsayılan 32.000 / üst 50.000; blokta `cfo_run.error` = `input_tokens:N reserve:512 limit:M` (bayt kapısı da sayıyla). Not: 24.000 üstü env değeri eskiden ayar okumasını düşürüyordu.
- **2026-10-07 — Kanal sözlüğü, merdiven, anında alarm, 5 slot takvim:** banka ileri taşıma hakediş bankasını yalnız `cfo_kanal_sozluk`'tan okur (`cfo_pay_obs` türetmesi kaldırıldı; OLCULMEDI/sözlükte yok → nedeniyle eşlenmeyen); bankasız kalem hesaba atanmaz, yalnız şirket toplamından düşülür (`unassignedTry`). `cfo_kaldirac_basamak` → Blok B `merdiven.*`, istem: BILINCLI_TUTULUYOR önerilmez. `health.ts`: `budget_blocked` + `input_limit_blocked` tek koşuda anında. `ai-cfo-schedule.yml`: 07:55 / 11:50 / 16:50 TR (+ mevcut 05:00 XML, 09:00 Trendyol). Üretim ölçümü: 07.10 hesabı belirsiz tek kalem 100.000 TL sabit gider kalanı.
- **2026-10-07 — Blok A = el kitabı v33 birebir:** `handbook-core.md` (kaynak) → `handbook-core.ts` (üretilmiş, test eşitliği denetler). Girdi sınırı 20.000/24.000. Açık: `AI_CFO_MONTHLY_BUDGET_TRY` 1000 → önbellek her koşuda yazılırsa ~1.300 TL/ay'a çıkabilir (bütçe kapısı ayın sonunda çağrıyı durdurur).
- **2026-10-07 — Aşama 2b: banka bakiyesi takvimden ileri taşıma:** `bank-rollforward.ts` + Blok B; kural: tarihi geçen kalem gerçekleşmiş, banka `cfo_cash_event.bank` / kanal → `cfo_pay_obs`. Eşlenmeyen: banka alanı boş takvim kalemleri, Idefix ve Trendyol Azerbaycan (gözlenmiş ödeme yok).
- **2026-10-07 — AI CFO girdi şartnamesi (madde 2) + TL etkisi (madde 3):** Blok A el kitabı çekirdeği (`handbook-core.ts`, önbellekli), Blok B/C bağlam (`context.ts`), susan kurallar, sınır 12.000, STOCKOUT/PRICE_BELOW_FLOOR/DEAD_STOCK TL etkisi (`alfas-gross-v10`). v33 metni repoda/DB'de/Drive'da yok → çekirdek şartname A1–A9'dan yazıldı; el kitabı sahibi birebir metinle değiştirebilir. Merdivenin "hangi basamak kullanımda" satırı için veri kaynağı yok (açık).
- **2026-10-07 — Haftalık boşluk tahmini (Aşama 2a, satış):** Entegra'nın kapsamadığı günler Trendyol API × Entegra 28 gün oranıyla tahmin (`snapshot.ts`, `alfas-gross-v9`). Ölçüm: 13 günde Entegra-TY ≈ API-TY ≈ 520 bin ₺. Banka bakiyesinin ödeme takviminden ileri taşınması (Aşama 2b) açık.
- **2026-10-07 — Haftalık elle veri düzeni (Aşama 1):** kullanıcı Entegra dökümünü ve banka bakiyelerini haftalık verecek. Tazelik eşiği 8 gün (`snapshot.ts`, `alfas-gross-v8`); 7. günde sağlık alarmı veri ister (`health.ts`: `entegra_upload_due`, `bank_update_due` hesap adlarıyla). Son Entegra yüklemesi 05.10 12:06 (TR); 06.10 tarihli yükleme kaydı yok.
- **2026-10-07 — AI CFO 24 saat raporu, madde 1 + 4:** soğuma yalnız teslimde (`store.ts`; kesilen/başarısız/reddedilen koşu anomaliyi kilitlemez; model iki geçerli yanıtta atlarsa soğur) + sağlık alarmı (`health.ts`, `/api/cron/ai-cfo-health`, `ai-cfo-health.yml`, admin alarm kartı). Not: `PRICE_BELOW_FLOOR`/`DEAD_STOCK`'un 07.10'da düşmesi soğumadan değil, Entegra 48 sa bayat olduğu için (kural tasarım gereği finansal tazelik ister).
- **2026-10-07 — P1-3 bayat kaynak teşhisi:** Entegra = elle Excel yükleme, son 05.10 09:06 (>48 sa) → kullanıcı yüklemeli. Hepsiburada = yanlış alarm (doğrudan API tablosu 0 satır; satışlar Entegra'dan) → kod düzeltildi (`snapshot.ts`, `alfas-gross-v7`). Banka = 15 hesaptan 2'si (Ziraat USD, Yapı Kredi USD şirket) 17.09'dan beri güncellenmemiş → 7 gün kuralı tümünü bayat sayıyor; kullanıcı güncellemeli. P0-2 (`cfo_secret` → Vault) taslağı ortam güvenlik denetimince engellendi (secret-store yazımı); kullanıcı kararı bekliyor.
- **2026-10-07 — Öncelikli aksiyon planı:** backlog P0–P3 sıralandı (üretim salt-okunur doğrulama: bayat kaynaklar Entegra/Hepsiburada/banka, maliyet kapsamı %56,6, `cfo_secret` 5 düz metin satır, 43 definer view, 147 değişken search_path). AI CFO adım 8 STEP F tamam olarak işaretlendi.
- **2026-10-07 — AI CFO STEP F tamam: ilk AI içgörüleri üretimde:** `cmuxqfti…` (09:34, elle): 4 GOAL anomalisi → 2 içgörü kaydedildi (borç 5M hedefi NOT_MET; net pozisyon tabanı OFF_TRACK, ikisi de TAHMİNİ/güven düşük), 1 ret; 1,43 ₺. Kullanıcı onayıyla: kısmi başarı `completed` + ret nedeni kodları (`runner.ts`, `validate-ai-output.ts`, `run-buttons.tsx`, test `ai-cfo-runner`).
- **2026-10-07 — AI CFO STEP F: ilk başarılı sağlayıcı çağrısı, çıktı kesildi:** `maxItems` düzeltmesi (#173) sonrası 09:13 zamanlanmış monitor `cmuxpo8e…` Anthropic'ten yanıt aldı (5.559/800 token, 1,43 ₺) ama 800 tavanında kesildi → `invalid_output`. Çıktı tavanı varsayılan 1500 / üst 2000; kesilme `output_truncated` etiketi. `config.ts`, `runner.ts`, `__tests__/ai-cfo-runner.test.ts`, `docs/AI-CFO-RUNNER.md`.
- **2026-10-07 — AI CFO STEP F: structured outputs `maxItems` 400:** `cmuxn1eh…` `blocked_by_input_tokens` (varsayılan 4500 sınırı; kullanıcı `AI_CFO_MAX_INPUT_TOKENS_PER_RUN=8000` ayarladı, `avoidedCostTry` artık dolu). Ardından `cmuxo5fc…` `provider_http_400`: şemadaki `maxItems` desteklenmiyor → `provider.ts` şemadan kaldırıldı, sınır `validate-ai-output.ts`'te (`MAX_INSIGHTS`). Testler `ai-cfo-provider`, `ai-cfo-runner`.
- **2026-10-07 — AI CFO STEP F engeli: karar hafızası `regclass`:** ilk onaylı AI koşusu `cmuxa4cc…` snapshot sonrası `monitor_failed` (Prisma: "Failed to deserialize column of type 'regclass'", `retrieveRelevantMemory`). `lib/cfo-agent/memory.ts` `::text` cast; `__tests__/ai-cfo-store.test.ts` regresyon. Sağlayıcı çağrılmadı, `cfo_usage` yazılmadı.
- **2026-10-07 — AI CFO elle çalıştırma dilimi:** elle koşular saat yerine 20 dk dilimde idempotent (saatte 3); cron saatlik kalır. `lib/cfo-agent/runner.ts` (`runPeriodKey`), `ai-trigger.ts`, `app/api/admin/ai-cfo/runner/route.ts`, test `ai-cfo-runner`.
- **2026-10-07 — AI CFO STEP C (deterministik gölge) kabulü:** ilk üretim koşusu `cmux810…` (`ai_disabled`): 38 anomali → kullanıcı 37 gerçek / 1 yanlış (FBA STOCKOUT) işaretledi; 13 kontrollük gölge hafta yerine bu inceleme kabul edildi. Düzeltmeler `lib/cfo-agent/snapshot.ts` (FBA stok günü `fba_inventory_unknown`; komisyon `outliers` yalnız uygun örneklem), test `ai-cfo-source-mapping`. Sırada STEP E/F (AI kapalı bütçe/sağlayıcı doğrulaması → tek onaylı AI koşusu), ayrı onayla.
- **2026-10-06 — AI CFO monitor kilidi teşhisi:** ilk elle çalıştırma `monitor_failed` döndü (kayıt açılmadan, kilit bağlantısında). `lock.ts` `LockError` sabit etiketleri + doğrudan host reddi; `runner.ts` etiketi döndürür; test `ai-cfo-runner`. Muhtemel neden: kilit URL'sinde `sslmode=require` (pg bunu `verify-full` sayar; Supabase CA'sı Node'da güvenilir değil).
- **2026-10-06 — AI CFO komisyon örneklem kuralı (`alfas-gross-v6`):** `lib/cfo-agent/snapshot.ts` komisyon örneklemi `adet_duz=1` + `guven='YUKSEK'` + kopyasız + asOf'a sabit 120 gün + SKU ≥10 kayıt; `types.ts`/`calculations.ts` sürüm v6; test `ai-cfo-source-mapping` (çok adetli satır karışımı 0,19 → 0,18). Gölge hafta (STEP C) öncesi şart.
- **2026-10-06 — AI CFO adım 8A: `ai_cfo_v1` üretimde + repo senkronu:** migration kontrollü SQL ile (`postgres`, tek transaction, `_prisma_migrations` checksum `4f03992b…`; `prisma migrate deploy` KULLANILMADI, `market_scout_foundation` bekliyor). `cfo_run`/`cfo_insight`/`cfo_usage`: RLS açık, politika 0, anon/authenticated/PUBLIC/reader yetkisi yok; parmak izi AI CFO nesneleri hariç 17/17 önceki ile aynı (+30 nesne). Repo: `baseline.json` `appliedAfterCapture`, `bootstrap.ts` (geç migration'lar sonda), `fingerprint.expected.txt` (üretimden), testler `schema-baseline`/`ai-cfo-store`/`ai-cfo-migration-security`/`security-defense-in-depth` (ortak `applyPendingInProduction`), `BASELINE-CAPTURE.md`.
- **2026-10-06 — Market Scout (PR3) sitemap koşullu GET düzeltmesi:** Cloudflare zayıf ETag (`W/`) döndürüyor, origin yalnız güçlü ETag'e 304 veriyor → eski kod her taramada tüm dosyaları (~1,9 GB) yeniden indirirdi. `strongEtag` ile doğrulayıcı güçlü formda saklanıp gönderiliyor (ölçüm: 333 koşullu istek 7,5 dk, 309/309 → 304, 429 yok) (`lib/market/providers/trendyol-sitemap.ts`, `scripts/market/sitemap-benchmark.ts`); test sahte taşıyıcısı Cloudflare davranışını taklit ediyor (`market-scout-db`).
- **2026-10-06 — Market Scout (PR3) doğrulama düzeltmesi:** eski scout adaptörü her satırı `original_row` (to_jsonb, tüm kolonlar) ile taşıyor — önceden scores/signals_daily'nin bir kısım kolonu eşlemede kayboluyordu. `lib/market/legacy-scout.ts`, test `market-scout-db` (provenance kontrolleri).
- **2026-10-06 — Market Scout temeli (PR3):** migration `20261007100000_market_scout_foundation` (üretime UYGULANMADI), `lib/market/*` (sources, safe-fetch, trendyol-url, normalize, matching, momentum, scoring, sourcing-query, hunter, image-similarity, legacy-scout, store, providers/*), `lib/actions/market-scout-actions.ts`, `/admin/market-scout`, izinler `marketScout.read/write`, `scripts/market/*` (varsayılan salt-okunur/dry-run), testler `market-scout-core`, `market-safe-fetch`, `market-scout-db` (CI). Yalnız meşru kaynaklar (resmi buybox, izinli sitemap, manuel capture/sourcing); aşma/proxy/scraper yok. Sitemap ölçümü → toplayıcı etkin değil. Eski scout tabloları dokunulmadı. Belge `docs/MARKET-SCOUT.md`.
- **2026-10-06 — Forecast V2 (PR2) uygulaması:** `observed-sales-v2-true30` (kanonik + gerçek 30 gün; max/mevsim/manuel yok) `lib/forecast/{v2,v2-loader,selection,consumer,consumer-audit,shadow-sql,m7-shadow}.ts`; `FORECAST_V2_ENABLED` (varsayılan kapalı) arkasında 10 tüketici taşındı (importer-view, sermaye sağlık, dashboard, akıllı öneriler, kokpit, capital, sipariş formu, ürün detayı, import snapshot); PARTIAL/UNKNOWN karar talebine girmez; manuel yalnız karşılaştırma. Gölge sayfa `/admin/forecast-v2`, uyarı bandı `components/forecast/forecast-v2-notice.tsx`. M7 A-shrink yalnız gölge (keşif 2026-10-06). Testler `forecast-v2`, `forecast-shadow`, `forecast-consumers`. Üretim gölge karşılaştırması `docs/FORECAST-V2.md`. Migration yok, üretime yazma yok, bayrak kapalı.
- **2026-10-06 — Forecast V2 (PR2) aday ölçümü:** ön kayıtlı adaylar M0–M6 + walk-forward kalibrasyon `lib/forecast/candidates{,-sql}.ts`, ortak test verisi `__tests__/forecast-fixture.ts`, test `forecast-candidates` (sızıntı + PGlite eşdeğerlik), `--print-sql candLong|candShort|candHash`. Üretimde salt-okunur çalıştırıldı: ön kayıtlı kapıya göre kazanan **true30**; M5 (kalibre) G4'te kalıyor (C segmenti faktörü tavanda). Sonuçlar `docs/FORECAST-V2.md`. Tüketici geçişi/bayrak kullanıcı kararını bekliyor; üretim davranışı değişmedi.
- **2026-10-06 — Tahmin geri testi PR1 (ölçüm altyapısı):** `lib/forecast/*`, `scripts/forecast-backtest.ts`, testler `forecast-backtest` + `forecast-backtest-sql` (PGlite eşdeğerlik). Üretimde salt-okunur çalıştırıldı; karşılaştırma tablosu + şişme şelalesi `docs/FORECAST-BACKTEST.md`. Üretim davranışı değişmedi. Forecast V2 tasarımı sonuçlara göre kullanıcıyla seçilecek.
- **2026-10-06 — AI CFO adım 7/9 (kolon eşlemesi):** incelenmiş profil varsayılan; kargo `toplam` (işlem bedeli tek sefer), 19.06 geçerlilik, kanal varsayımı (FBA hariç); SET maliyeti `cfo_set_fiyat.maliyet`; nakit `pozisyon` semantiği. `shipping.ts`, `snapshot.ts`, `reviewed-sources.ts`, `calculations.ts` (v5), test `ai-cfo-source-mapping`. Canlı deterministik CFO döngüsü de bu eşlemeyi kullanır (fiyat tabanı/SET maliyeti artık bilinir). Üretim verisi değişmedi. Sırada adım 8, ayrı onayla.
- **2026-10-06 — AI CFO adım 6/9 (test/CI):** `runner-request.ts` (saf kapı) + testler `ai-cfo-runner-route`, `ai-cfo-access`, `ai-cfo-migration-security`; adım 8 operatör kontrolü `scripts/ai-cfo-migration-check.sql` (üretimde "önce" doğrulandı, salt-okunur); build smoke'a AI CFO cron/runner/sayfa kapıları. Üretim DB değişmedi. Sırada adım 7, ayrı onayla.
- **2026-10-06 — AI CFO adım 5/9 (zamanlama + /admin/ai-cfo):** monitor günlük cron'ların after() işinde CFO döngüsünden sonra; `ai-cfo-monitor`/`ai-cfo-morning` cron route'ları; `/admin/ai-cfo` kontrol merkezi + `POST /api/admin/ai-cfo/runner`; `control-center.ts` (`installed:false` adım 8'e kadar); menü CFO → AI CFO. Bayraklar kapalı, üretim DB değişmedi. Sırada adım 6, ayrı onayla.
- **2026-10-06 — AI CFO runner (V1 adım 4/9 + Goal Engine):** runner/store/lock/memory/validate-ai-output/goal-anomalies; testler `ai-cfo-runner` + `ai-cfo-store` (gerçek Prisma/PGlite, bekleyen ai_cfo_v1 ile); baseline `notAppliedInProduction` düzeltmesi. Çağrılmıyor, bayraklar kapalı, üretim değişmedi. Belge `AI-CFO-RUNNER.md`. Sırada adım 5 (cron + /admin/ai-cfo), ayrı onayla.

- **2026-10-06 — AI CFO V2 Step 2: Goal Engine v1:** migration `20261006130000_fm_goal_engine` (üretimde + kayıtlı), `lib/fm/goal-engine.ts`, `lib/fm/goals.ts`, `lib/cfo-agent/workflow*.ts` (goals aşaması + devralma), `/cfo/calisan` paneli, test `fm-goal-engine`; `security-defense-in-depth` testi yeni ilişkilere toleranslı; parmak izleri üretimden güncellendi. İlk sonuç: ciro OFF_TRACK (B), borç NOT_MET (C), servet OFF_TRACK (C), taban OFF_TRACK (D). Belge `GOAL-ENGINE.md`.

- **2026-10-06 — Güvenlik defense-in-depth (faz kapanışı):** migration `20261006120000_security_defense_in_depth` üretime uygulandı + kayıtlı: anon/authenticated → 56 tablo/90 sequence ACL/19 fonksiyon = 0; `cfo_google` reader kapalı; reader 17 salt-okunur fonksiyon açık; service_role/postgres/reader tablo yetkileri değişmedi; RLS-off 0. Parmak izi (baseline + Step 1) üretimle birebir güncellendi; baseline testi artık bekleyen migration'ları uygulayıp karşılaştırıyor. Test `security-defense-in-depth` (CI). Security hardening fazı kapandı.

- **2026-10-06 — Baseline capture (strateji C, adım 1-2-5):** `scripts/schema-baseline/{inventory.sql,fingerprint.sql,fingerprint.expected.txt,bootstrap.ts,build-seed.sh}`, `prisma/baseline/{2026-10-06.sql,2026-10-06.seed.sql,baseline.json}`, `npm run db:bootstrap`, test `__tests__/schema-baseline.test.ts` (CI'ya eklendi). Boş DB 0 hata; tam-şema parmak izi üretimle birebir (17 tür); 113/113 migration applied kaydı; üretime yazma 0; tarihsel migration değişmedi. Doküman: `docs/BASELINE-CAPTURE.md`. Backlog: `migration-clean-apply.test.ts` baseline kanıtlandıktan sonra kaldırılacak; MarketplaceProductMapping/MonthlyExchangeRate/SupplierProduct sürüklenmesi için `schema.prisma` hizalama migration'ı (ayrı onay).

- **2026-10-06 — cfo-files private + anon denetimi:** migration `20261006100000_cfo_files_private` üretime uygulandı + kayıtlı (bucket public=false, 8 referans private, yedek tablo); `lib/cfo-agent/private-files.ts` (`signedCfoFileUrl`), test `cfo-files-private-migration`, `scripts/verify-cfo-files-private.ts`; dokümanlar ANON-GRANTS-FUNCTIONS-AUDIT, SECURITY-HARDENING-ACCEPTANCE. Backlog: 56 tablo anon grant revoke / defense-in-depth (baseline sonrası; tasarım `ANON-GRANTS-FUNCTIONS-AUDIT.md` §5). Geçmiş cfo-files maruziyeti BİLİNMİYOR.
- **2026-10-06 — cfo_google kilidi:** üretimde `CFO_GOOGLE_INTERNAL_TOKEN` (cfo_secret) üretildi, Edge Function `cfo-google` v2 (verify_jwt=false + iç sır), `public.cfo_google()` SECURITY DEFINER + EXECUTE daraltma; migration `20261006110000`; `supabase/functions/cfo-google/*`; test `cfo-google-lockdown`; doküman `CFO-GOOGLE-LOCKDOWN.md`. Anonim Edge/RPC 401, yetkili yol çalışıyor.

- **2026-10-06 — fm_stock_refresh otomasyonu:** `lib/fm/stock-refresh.ts` + `lib/xml-sync-runner.ts` (`finalizeLog` sonunda çağrı); migration `20261005300000_fm_stock_refresh_automation` (`fm_stock_refresh_after_sync(text)`, `fm_stock_freshness`) üretime uygulandı + `_prisma_migrations` kaydı; fingerprint beklenen hash'leri güncellendi. SUCCESS → yenile; PARTIAL/ERROR → `failed` run, yenileme yok; idempotent. Test: `__tests__/xml-sync-fm-refresh.test.ts` (CI'da).

### 2026-10-06 — Stok düzeltme katmanı (AL-CAM03)

`20261005280000_fm_stock_adjustment`, test `fm-stock-adjustment`. Gözlenen (XML) ve düzeltilmiş stok ayrı; sayımdan öncesine geriye uygulama yok. Not: `fm_stock_refresh()` otomatik çalışmıyor — XML senkronundan sonra çağrılmazsa mutabakat `UNEXPLAINED` görünür (bayat hafıza); zamanlama ayrı iş.
### 2026-10-05 — Güvenlik: anon/authenticated daraltma

`20261005270000_security_anon_lockdown` + test `security-anon-lockdown`; üretimde uygulandı, `_prisma_migrations`'a işlendi. Yeni bulgu: 40 security-definer view anon'a açık (onay bekliyor) — `docs/SCHEMA-DRIFT-REPORT.md` §6.

### 2026-10-05 — Step 1 kapanışı (parity + kargo + adli analiz)

Production↔repo şema parity'si (`docs/SCHEMA-DRIFT-REPORT.md`), kargo tarifeleri (`docs/KARGO-TARIFE.md`), banka adli analizi (`docs/BANK-DATA-FORENSICS.md`), final kabul raporu. Açık kararlar: RLS'siz 3 tablo + anon yetkileri, baseline-capture migration'ı, banka nakdi için YKB export'u.

### 2026-10-05 — Financial Memory Step 1E: stok + bakiye hafızası

`20261005250000_fm_stock_balance`, test `fm-stock-balance`. Stok zinciri 274 üründe kopuksuz; zincir toplamı 73.561 adet, `Product.stockQuantity` 74.004
(1 üründe fark: logsuz düzeltme). Aktif 1.311 üründen yalnız 274'ünün logu var (`stock_unlogged_products_excluded`). Bakiye: v2 tanımı 21 gün (09-11 → 10-04),
boş günler bilinmiyor. Banka hareketinden nakit türetilmedi: Ziraat'ta aynı hareketler iki kez yüklü (manuel + ekstre), alt hesaplar tek `banka` altında
karışık, toplam snapshot nakdiyle uyuşmuyor (10-03: 232.637 vs 72.484).

### 2026-10-05 — Financial Memory Step 1F: TCMB aylık USD/TRY

`lib/fm/tcmb-fx.ts`, `scripts/fm-fx-tcmb.ts`, migration `20261005240000_fm_fx_monthly`, testler `fm-tcmb-fx` / `fm-fx-monthly`.
Üretim: `fm_fx_monthly` 74 ay (2020-08 → 2026-09; 26 ay 15'i iş günü olmadığı için önceki bülten). Ekim 2026'nın 15'i gelmediği için
eksik (U). Kalan: 1E (stok + bakiye hafızası), kabul raporu.

### 2026-10-05 — Financial Memory Step 1C/1D: hafıza şeması + satış backfill

Normalize hafıza şeması ve 75 aylık satış backfill'i üretimde tamamlandı; ham = canonical = hafıza (3 tane) 87.617.597,19 TL,
ay bazında fark 0. Ayrıntı: CHANGELOG ve `docs/FINANCIAL-MEMORY.md`.

### 2026-10-05 — Financial Memory Step 1B: canonical satış katmanı

Tek canonical satış katmanı view olarak eklendi (`fm_sales_*`). Ham tablolar değişmez; Financial Memory (1C+)
yalnız buradan beslenecek. Kurallar/mutabakat: `docs/FINANCIAL-MEMORY.md`. Üretimde ham = Σ disposition birebir.
v1'e göre fark (+₺3,93M): IDEASOFT +3,05M, Şubat gap-fill +0,84M, kaynak geçişi +0,04M.

### 2026-10-05 — Financial Memory Step 1A: reader güvenliği

Phase 0B'de bulgu: `cfo_acceptance_reader` `cfo_secret.value` kolonunu okuyabiliyordu
(`USING (true)` policy) ve PUBLIC üzerinden veri yazan fonksiyonları çalıştırabiliyordu.
Migration `20261005200000_cfo_reader_security` ikisini de kapatır, eksik 11 veri tablosuna
yalnız SELECT verir. Üretim uygulaması `postgres` rolüyle bağlandığı için etkilenmez.
Ayrıntı ve test: CHANGELOG 2026-10 "Financial Memory Step 1A".

### 2026-10-05 — AI CFO V1 yeniden inşası, adım 3/9: Anthropic sağlayıcı katmanı

`lib/cfo-agent/provider.ts` — `createCfoProvider`/`reasoningPayload`, parked
daldaki tasarımdan yeniden kuruldu. Henüz hiçbir yerden çağrılmıyor (runner
#4'te bağlanacak); `AI_CFO_PROVIDER` zaten varsayılan `disabled`.

İstek şekli (`output_config`/`json_schema` alanı, `claude-sonnet-4-6` model
kimliği) kopyalanmadan önce 05.10.2026'da platform.claude.com/docs'tan
doğrulandı — kod yazılırken Anthropic Messages API'sinin güncel hâline
bakılmadan "muhtemelen doğrudur" denmedi.

`reasoningPayload` sağlayıcıya giden veriyi kasıtlı bir allowlist'le sınırlar:
yalnız ilgili anomaly'lerin `evidenceIds`'inde geçen evidence satırları (ham
sipariş/müşteri alanı yok), anomalies 8'e, memory 5'e, missingFields 15'e
kırpılır. Testler bu sınırı doğrudan kanıtlıyor — allowlist bozulsa (ör.
`snapshot.evidence`nin tamamı gönderilse) ilgili test kırılır.

`stop_reason==="max_tokens"` iken metin **boş** sayılır: token limitine
takılan yanıt yarım JSON döndürür ve bunu ayrıştırmaya çalışmak uydurma
("hallucinated") bir insight üretebilirdi; kod bunun yerine hiçbir şey
üretmemeyi tercih ediyor.

Testler: `__tests__/ai-cfo-provider.test.ts` (12 kontrol, gerçek ağ/API key
gerektirmez — `fetch` enjekte edilip sahte Anthropic yanıtları kullanılır).

### 2026-10-05 — AI CFO V1 yeniden inşası, adım 2/9: anomali tespiti

`lib/cfo-agent/anomalies.ts` — `detectCfoAnomalies` ve `shouldReopen` parked
`feat/ai-cfo-v1` dalındaki tasarımdan (kural seti, eşik mantığı) yeniden
kuruldu. Doğrudan kopyalama denendi ve `tsc`in sessizce kabul ettiği ama
YANLIŞ olan bir noktayı ortaya çıkardı: main'deki `snapshot.ts`, ürün
sinyalindeki tek `sourceFresh` alanını kasıtlı olarak üçe böldü
(`sourceFresh`=kanal satış verisi tazeliği, `financialSourceFresh`=Entegra
maliyet + canonical doğrulama, `inventorySourceFresh`=XML stok). Eski kodda
tek alan hem fiyat hem maliyet/kâr kurallarını kapatıyordu; yeni alan adı
aynı (`sourceFresh`) kaldığı için derleme hatasız geçiyor ama fiyat/maliyet
kuralları artık YANLIŞ sinyale (kanal tazeliği) bakıyor olacaktı — Entegra
maliyet senkronu gecikse bile PRICE_BELOW_FLOOR/LOW_PRICE_STRUCTURAL_LOSS/
FLOOR_DATA_QUALITY/PROCUREMENT/NEGATIVE_PROFIT (ürün) sessizce yanlış
zamanda üretilir ya da bastırılırdı. Beş kuralın hepsi `financialSourceFresh`e
çevrildi; yalnız kanal fiyatına bakan PRICE_DEAD_BAND kasıtlı olarak
`sourceFresh`te bırakıldı (maliyet verisi gerekmiyor).

Testler: `__tests__/ai-cfo-anomalies.test.ts` (16 kontrol, DB/ağ gerektirmez)
— bu ayrımı doğrudan kanıtlayan dört test dahil (financialSourceFresh=false
iken PRICE_BELOW_FLOOR/NEGATIVE_PROFIT üretmez, PRICE_DEAD_BAND o alandan
bağımsız çalışır). CI'ya eklendi (`cfo-readonly-validation.yml`).

### 2026-10-05 — AI CFO V1 yeniden inşası, adım 1/9: additive migration

`feat/ai-cfo-v1` (PR #131, LLM çağrısı yapan katman) main'e mekanik rebase
edilemediği için (derin yapısal ayrışma, `lib/cfo-agent/*`) sıfırdan, güncel
main üzerine, tasarım korunarak ama kod kopyalanmadan yeniden inşa ediliyor.
Her adım ayrı PR, flag'leri kapalı, test edilmiş. Bkz. `docs/CFO-WORKFLOW.md`
→ "Deliberately not this" paragrafı (PR #145) — karar ve gerekçesi orada.

**Adım 1:** `prisma/schema.prisma` + additive migration — `cfo_run` (monitor/
morning çalışma kaydı), `cfo_insight` (AI bulguları), `cfo_usage` (token/
maliyet). Üçü de yeni, mevcut `cfo_snapshot`/`cfo_question`/`cfo_note`/
`cfo_change_log` ve `/cfo/calisan` deterministik döngüsü değişmedi.
`AI_CFO_ENABLED` vb. flag'ler hâlâ varsayılan kapalı — bu adım hiçbir çalışma
zamanı davranışını değiştirmiyor. RLS deny-all (diğer `cfo_*` tablolarıyla
aynı desen). Doğrulama: `prisma validate`, disposable DB'ye `db push` +
build + `tsc`, `migration.sql` doğrudan `psql` ile iki kez (idempotent),
Prisma Client ile uçtan uca yazma/okuma, mevcut CFO regresyon paketi
(`cfo-workflow-postgres`, `ai-cfo-reconciliation`, `cfo-cost-answer`) aynı
DB'ye karşı yeşil. PR #146.

### 2026-09-28 — ALFAS Home → Sepetler (terk edilen / bekleyen sepetler + mail durumu)

`/alfashome/sepetler`: alfashome.com'da ürünü olup siparişe dönmemiş sepetleri
gösterir — **kayıtlı / kayıtsız** ayrımı, **hatırlatma maili gitti mi / ne zaman
gidecek / gecikti mi** ve iletişim bağlantıları (WhatsApp, Ara, E-posta). Salt
okunur: mail göndermez, sepete dokunmaz.

**Nereden okur:** ALFAS backend'inde yeni salt okunur `GET /crm/carts`
(alfashome `backend/src/api/crm/carts/route.ts`; aynı `CRM_API_TOKEN` kapısı,
yeni env yok). Panelde `lib/alfashome/client.ts` → `fetchAlfasCarts`.

**Karar panelde verilmiyor:** "mail gitti mi / ne zaman gidecek" kararı ALFAS'ta
`backend/src/lib/cart-recovery.ts` içinde ve **mail gönderen job ile AYNI
fonksiyonlar**. Panel yalnız Türkçeye çevirir (`lib/alfashome/sepetler.ts`).
Panel kendi eşiğini yazsaydı "1 saat sonra gidecek" derken job başka eşikle
çalışırdı ve operatör müşteriye yanlış şey söylerdi.

⚠️ **"Kayıtlı" = şifreli hesabı olan.** ALFAS sepete e-posta yazılınca misafir bir
müşteri kaydı da açar (`customer_id` dolar, `has_account=false`); `customer_id`
dolu diye kayıtlı sayılamaz. Sorgu başarısız olursa "bilinmiyor" gösterilir,
tahmin edilmez.

⚠️ **Başarısız mail denemesi KAYDEDİLMİYOR** (job damgayı yalnız başarılı
gönderimden sonra atar). "Gönderilemedi" doğrudan bilinemez; bilinen şey
"sırası geldi ama gitmedi" → **Gecikti** (sebep: Resend hatası / job durmuş —
Railway log'u). Sayfa sebep uydurmaz.

⚠️ **ALFAS'ta RESEND kapalıysa** sayfa üstte kırmızı bant basar ve hiçbir sepete
"Mail bekliyor" demez (hepsi "Gönderilemez · Mail servisi kapalı").

**Eklenenler (öneri):** KPI kartları (bekleyen/terk ₺, kayıtlı/kayıtsız, mail
durumu), süzgeç + sıralama, **en çok sepette kalan ürünler**, **mail sonrası
satın alınan** adet/₺ (korelasyon — "mailin kurtardığı" DEĞİL, sayfada öyle yazıyor).

**Mobil:** dar ekranda tablo yerine kart düzeni. İlk sürümde tablo mobilde yatay
kayıyor ve sayfanın asıl amacı olan "Hatırlatma maili" kolonu ekran dışında
kalıyordu (tarayıcıda ölçülüp düzeltildi).

**Dosyalar:** `lib/alfashome/client.ts` (tipler + `fetchAlfasCarts`, `cek`'e ek
sorgu parametresi, 404 için "uç yok" mesajı), `lib/alfashome/sepetler.ts` (saf
etiket/süzgeç/sıralama), `components/alfashome/sepet-govdesi.tsx`,
`app/(app)/alfashome/sepetler/page.tsx`, menü (`app/(app)/layout.tsx`) +
`basket` ikonu (`components/dashboard/sidebar.tsx`),
`__tests__/alfashome.test.ts` (ALFAS Home 4 → 5 sayfa; +sepet kontrolleri).

**Doğrulama:** `npm run check:alfashome`. Ayrıca gerçek backend uç kodu sahte
sepet verisiyle (tüm durumlar: kayıtlı/misafir/anonim, 1 mail/2 mail/gecikti/eski,
HTML enjeksiyonlu ad+ürün) HTTP üzerinden sunulup panelin gerçek istemcisi ve
bileşeniyle `next dev` + Playwright ile ölçüldü (masaüstü + 390 px, süzgeçler,
sıralama, WhatsApp/tel/mailto bağlantıları, XSS kaçışı, RESEND-kapalı bandı).

⚠️ **Doğrulanmadı:** `/crm/carts`'ın **gerçek Medusa veritabanına** karşı davranışı
(özellikle `query.graph` `filters: { email: [...] }` ve `updated_at` sıralaması).
Ölçülenler sahte `query` ile mantıktır. İlk canlı açılışta sayfa hata kartı
gösterirse Railway log'unda `[crm] sepet…` satırlarına bakın. Bkz. alfashome
`CLAUDE.md` → "CRM Sepet Ucu".

### 2026-09-23 — 🔴 Türkçe "İ" tuzağı: iade sayacı her zaman 0 gösteriyordu

Gerçek Entegra dosyası (500 satır, 17–23.09) ilk kez ayrıştırıldı ve **ekranın
en kritik uyarısının sessizce çalışmadığı** ortaya çıktı.

**Hata:** `/iade|iptal/i.test("İade-İptal")` → **`false`**. Türkçe büyük İ
(U+0130) JS regex'inin basit harf katlamasında ASCII `i`'ye katlanmıyor.
Entegra durumu tam olarak `İade-İptal` yazdığı için `iadeMi()` her gerçek iadeyi
kaçırıyordu: önizlemedeki **"İADEYE DÖNECEK"** sayacı ve kırmızı uyarı kutusu
hiç görünmezdi. Bu dosyadaki **14 iade** sıfır olarak raporlanırdı — yani
"21 iade 12 gün satış sayıldı" vakasının tekrarına karşı konan frenin kendisi
çalışmıyordu. Ekran hata vermiyor, sayı sıfır çıkıyor, kimse fark etmiyor.

⚠️ **Aynı tuzak Postgres'te de var:** `'İade-İptal' ~* 'iade|iptal'` de `false`
döner (canlıda doğrulandı). Kodda iade tespiti JS tarafında olduğu için
düzeltme oraya yapıldı; SQL'de iade sınıflandırması YOK.

**Düzeltme** (`lib/entegra/import.ts` → `iadeMi`): NFD ayrıştırıp birleşen
noktaları atıyor, küçük harfe indiriyor, sonra noktasız `ı`'yı `i`'ye çekiyor.
Yalnız `toLocaleLowerCase("tr")` yetmezdi: tr yerelinde ASCII `I` noktasız
`ı`'ya iner ve bu kez `IPTAL` yazımı kaçardı.

**Regresyon testi:** `npm run check:entegra` (12 kontrol) — ham regex'in
kullanılmadığını, `İade-İptal`/`IPTAL`/`ıptal` yazımlarının yakalandığını,
satış durumlarının iade SAYILMADIĞINI, birebir eşleşmenin cfo_norm'dan önce
geldiğini ve cfo_* tablolarına yazılmadığını sabitliyor.

**Gerçek dosyayla ölçümler (hiçbir şey yazılmadı):**
- 500/500 satır ayrıştırıldı, **0 atlandı**, 0 dosya içi mükerrer, eksik sütun yok.
- 8 kanal doğru normalize: TRENDYOL 333, HEPSIBURADA 75, EPTT 41, N11 23,
  AMAZON 14, PAZARAMA 11, IDEFIX 2, IDEASOFT 1.
- 71 benzersiz model → **70 eşleşti**, 0 belirsiz. 68'i birebir, **2'si
  cfo_norm** ile: `grı-60w-…` → `GRI-60W-…` ve `AY-Balıkgözlens` →
  `AY-BALIKGÖZLENS` — ikisi de **Türkçe noktasız ı** yüzünden `lower()` ile
  eşleşmiyor. Yani ikinci aşama gerçek bir işe yarıyor. Eşleşmeyen tek model:
  `MB600Eldusu` (katalogda yok).
- **`anunnaki-pointer` aşama 1'de `ANUNNAKI-POINTER`'a çözüldü (n=1).** Sıra
  kuralı canlı veride işe yaradı; norm önce koşsaydı yanlış ürüne yazılacaktı.
- Dosyadaki 500 satırın **500'ü veritabanında zaten var**; durum+adet+tutar
  parmak izi iki tarafta da `e438ffa7…` — yani bu dosyanın yeniden yüklenmesi
  gerçek bir **no-op**. Önizleme "0 yeni, 500 güncellenecek, 0 durum değişimi"
  der. İdempotentlik gerçek veriyle doğrulanmış oldu.


### 2026-09-22 — Entegra satış yükleme ekranı + iki menü girişi

**İŞ 1 — Menü.** `/admin/stok-sicrama` → **Ürünler & Stok** altında "Stok
Sıçramaları" (`CFO_READ`), `/admin/entegra-yukleme` → **Pazaryerleri ›
Yapılandırma** altında "Entegra Satış Yükleme" (`CFO_WRITE`). Menü zaten
yetkiye göre süzüyor; girişler sayfaların GERÇEK yetkisiyle yazıldı, aksi
hâlde görünür ama açılmayan satır olurdu. `fileUp` ikonu ICONS haritasına
eklendi.

**İŞ 2 — Entegra satış yükleme.** Akış: yükle → **önizleme** → onayla → yaz.
Önizleme ucu hiçbir şey yazmaz; yazma ucu önizlemeden dönen `fileHash`'i
zorunlu tutar ve dosyayı **yeniden hash'leyip** karşılaştırır — eşleşmezse
409 döner ve tek satır yazılmaz. Böylece "önizlediğim dosya ile yazılan dosya
aynı mı?" sorusu kullanıcının sözüne değil sunucuya bağlanır.

Önizleme şunları ayrı ayrı gösterir: toplam · yeni · güncellenecek · **durumu
değişecek** · **iadeye dönecek** (kırmızı kutu + listede üstte) · tutarı
değişecek · adedi değişecek · ürünle eşleşmeyen (ilk 10 model) · tarih aralığı
· atlanan · dosya içi mükerrer.

**productId türetme — sıra kritik.** (1) `lower(sku)=lower(Model)` birebir,
(2) bulunamazsa `cfo_norm(sku)=cfo_norm(Model)` (SQL fonksiyonu, SALT OKUNUR),
(3) yoksa null. Bir model birden çok ürüne çözülüyorsa **eşleştirme yapılmaz**.
Canlıda doğrulandı: `cfo_norm` alfanümerik dışını siliyor ve katalogda tam bir
çakışan çift var — `ANUNNAKI-POINTER` / `ANUNNAKIPOINTER`. Birebir aşama ikisini
de KENDİ ürününe çözüyor; norm aşaması ikisini de `n=2` görüp reddediyor.
Çifte koruma.

**Yazma.** Benzersiz anahtar `(channel, orderNumber, externalLineId)`; id
deterministik `'ent' || md5(channel|orderNumber|externalLineId)` (md5 kabuk
ile doğrulandı). Önce UPDATE, sonra `INSERT ... ON CONFLICT DO NOTHING`,
250'lik gruplar. UPDATE'te **customerId'ye dokunulmaz** (başka akış bağlamış
olabilir) ve **productId COALESCE** ile korunur — yeni türetme null diye
mevcut iyi bir bağ silinmesin. SQL sütun listesi tek kaynakta
(`lib/entegra/sql.ts`): `unnest` sütunları KONUMA göre eşlediği için iki ayrı
liste bir gün kaysa veri sessizce yanlış kolona giderdi.

🔴 **CSV'de iki gerçek tuzak bulundu ve düzeltildi.** (1) UTF-8 **BOM'lu** CSV,
`codepage 65001` ile okunduğunda SheetJS ilk başlığı kırpıyor ve Türkçe
harfleri bozuyordu: `Entegrasyon`→`tegrasyon`, `Sipariş Numarası`→
`Sipari_ Numaras1` — dosya "eksik sütun" diye reddedilirdi. Excel Türkçe
Windows'ta CSV'yi tam da BOM ile kaydeder. (2) Dosya geçerli UTF-8 değilse
windows-1254 (Türkçe ANSI) olabiliyor; 65001 zorlanırsa harfler yine bozulur.
Artık BOM atılıyor ve kodlama tur-atma sınamasıyla seçiliyor. Üç senaryo da
(BOM'lu / BOM'suz / 1254) birebir aynı sonucu veriyor.

**Sınırlar (şart).** Yalnız `MarketplaceSalesRecord` + `EntegraImportLog`
yazılır; `cfo_*` tablolarına yazılmaz. Dosyadaki TÜM satırlar işlenir.
`ID` boş satır **atlanır** (NULL içeren anahtar Postgres'te benzersizliği
zorlamaz, aynı satır tekrar tekrar eklenirdi); `Durum Adı` boş satır da
atlanır (uydurulmuş durum iade/satış ayrımını bozardı).

**Doğrulama.** `next build` → `Compiled successfully`, **sıfır TS hatası**,
eslint temiz (kalan tek hata `sidebar.tsx`'te önceden var). UPDATE ve INSERT
SQL'i canlı şemaya karşı `PREPARE` ile sınandı — ayrıştırıldı ve planlandı,
**tek satır yazılmadı**. Ayrıştırıcı sentetik Entegra dosyasıyla uçtan uca
test edildi (kanal, tarih biçimleri, `"153936.0"→"153936"`, ondalık/yuvarlama,
dosya içi mükerrer, atlama sebepleri).
⚠️ Ekran gerçek Entegra dosyasıyla ve giriş yapmış kullanıcıyla **denenmedi**.

⚠️ **Migration canlıya UYGULANMALI:** `20260922160000_entegra_import_log`.
Vercel `prisma migrate deploy` çalıştırmıyor; uygulanmadan `/admin/entegra-yukleme`
açılışta hata verir (`EntegraImportLog` yok).


### 2026-09-22 — Stok sıçrama paneli DERLENMİYORDU, düzeltildi

Panel ilk yazıldığında hiç derlenmemişti (`npm install` sheetjs CDN 403'ü
yüzünden çalışmıyordu). Derleme ortamı kurulunca **üç bağımsız kırık** çıktı;
merge edilseydi `next build` **hata verip** production deploy'u kırardı
(`next.config.ts` TS hatalarını yok saymıyor).

| # | Sorun | Düzeltme |
|---|---|---|
| 1 | `@/components/ui/select` ve `dialog` **yok** (uydurulmuş) | yerel `<select>` + tek modal |
| 2 | `date-fns` bağımlılık değil — üstelik import'lar **hiç kullanılmıyordu** | kaldırıldı, `Intl` kullanılıyor |
| 3 | `React.useEffect` — `React` import edilmemiş | `useEffect` |
| 4 | `variant="outline"` (Button) / `"secondary"` (Badge) — geçersiz | `secondary`/`ghost`, Badge `danger/warn/info/ok/neutral` |
| 5 | **`PERMISSIONS.EXECUTIVE_WRITE` yok** | GET'ler `CFO_READ`, POST `CFO_WRITE` |
| 6 | **`bigint`/`numeric` JSON'a serialize EDİLEMEZ** — iki GET de çalışma anında 500 dönerdi, tip denetimi yakalamaz | SQL'de `id::text`, adetler `::int`, tutarlar `::float8` |
| 7 | Kapatma durumu doğrulanmıyordu — geçersiz değer DB CHECK'ine takılıp 500 dönerdi | `lib/cfo/sicrama.ts` tek kaynak, uçta 400 |
| 8 | Effect'te senkron `setState` + yarış koşulu | `iptal` bayrağı, geç yanıt yenisini ezmiyor |

`lib/cfo/sicrama.ts` kapatma durumlarını **tek kaynakta** tutuyor ve
veritabanındaki `cfo_stok_sicrama_durum_check` CHECK constraint'i ile birebir
aynı (doğrulandı). Ayrı yazılsalardı uç geçerli sanıp yazmayı dener, Postgres
reddeder, kullanıcı sebebi anlaşılmayan hata görürdü.

**Doğrulama:** `next build` → `✓ Compiled successfully`, `eslint` temiz. Aynı
xlsx stub'ıyla `main` derlenip karşılaştırıldı: bu dal **fazladan sıfır hata**
üretiyor. ⚠️ Panel gerçek veriyle **elle test EDİLMEDİ** (derleniyor ≠ çalışıyor).

### 2026-09-22 — Belirsiz barkod eşleştirilmiyor + migration canlıyla doğrulandı

**1) `lib/trendyol-product-matching.ts` — belirsiz barkod artık NULL kalır.**
Eski kod `findFirst` ile **rastgele** bir eşleşme seçiyordu. Bir barkod
`MarketplaceProductMapping`'te birden fazla FARKLI `productId`'ye bağlıysa
hangisinin doğru olduğu bilinemez; rastgele seçim satışı yanlış ürüne yazar ve
ciro/stok/kâr sessizce kayar. Artık `distinct` ile tüm farklı ürünler sayılıyor,
>1 ise eşleştirme yapılmıyor ve **alt yöntemlere de düşülmüyor**. Batch sürümü
tek tek çağrıyla aynı kararı veriyor.
Canlı ölçüm: **1 barkod** (`14112021000001`) 2 ayrı ürüne bağlı, bu barkodu
taşıyan **245** satış kaydı var; **28**'i NULL (CFO'nun SQL backfill'i doğru
davranıp bırakmış), 217'si daha önceden dolu.
Yan düzeltme: batch'teki `sku: { in: [...], mode: "insensitive" }` — Prisma `in`
filtresinde `mode`'u **sessizce yok sayar**, yani batch büyük/küçük harf
duyarlıydı ve tekil sürümden farklı sonuç veriyordu. `OR + equals` ile (200'lük
parçalar hâlinde) düzeltildi.

**2) `20260922114138_cfo_triggers_migration` canlıyla karşılaştırıldı.**
`pg_get_functiondef` / `pg_get_triggerdef` ile 4 fonksiyon + 2 trigger tek tek
doğrulandı. İmzalar ve trigger tanımları **birebir**. Tek gerçek sapma
`cfo_sicrama_kapat`'taydı: dosyada `cfo_change_log` INSERT'i
`IF EXISTS (information_schema...)` koşuluna sarılıydı, canlıda koşulsuz —
**kaldırıldı**. Kalan farklar yalnız biçim (küçük→BÜYÜK harf anahtar kelime,
tek satırlık IF/VALUES'ın satırlara bölünmesi, eklenen Türkçe açıklamalar);
gövde md5'leri bu yüzden tutmuyor, davranış farkı değil. Dosya başına bu not
yazıldı. Dosyada üst seviyede **yalnız 8 ifade** var (4× CREATE OR REPLACE
FUNCTION, 2× DROP TRIGGER IF EXISTS, 2× CREATE TRIGGER); **veriye dokunan
hiçbir ifade yok**.

**3) Vercel `prisma migrate deploy` ÇALIŞTIRMIYOR** (`package.json` → `build:
next build`, `postinstall: prisma generate`; `vercel.json`'da yalnız cron var).
Bu yüzden `lib/xml-sync-runner.ts` kolon yokluğuna (42703) karşı korumalı.

### 2026-09-20 — ALFAS bağlantısı CANLIDA doğrulandı (lastOkAt yazıldı)

Panel → ALFAS Home → Ayarlar → "Bağlantıyı dene" çalıştırıldı ve
`AlfashomeConfig.lastOkAt` = **2026-09-20 15:34:42** olarak yazıldı. Yani
`/crm/orders` uçundan gerçek bir **200** alındı: adres, jeton ve ALFAS
tarafındaki 24 karakter alt sınırı birlikte doğrulanmış oldu.

⚠️ **Bu damga neden önemli:** `lastOkAt` yalnız gerçek 200'de yazılıyor
(`testAlfashomeConnectionAction`). Boş kalması "kaydedildi ama hiç
denenmedi" demek — kurulum bitmiş görünürken sayfalar veri getirmeyebilir.
Kayıt 19.09'da girilmişti ama damga boştu; bu turda kapandı.

Etki: yalnız doğrulama, kod değişikliği yok.

### 2026-09-19 — ALFAS bağlantısı PANELDEN yapılandırılır oldu (env zorunluluğu kalktı)

ALFAS Home sayfaları adres + jetonu Vercel ortam değişkeninden okuyordu. Sorun:
değişkeni yazmak Vercel paneline girmeyi **ve yeniden dağıtım beklemeyi**
gerektiriyor; bu ortamdan Vercel bağlayıcısının `projectEnvVars` yetkisi de yok
(list/create ikisi de 403). Yani özellik "kurulum kullanıcıda" diye yarı bitmiş
kalıyordu.

**Çözüm, projenin kendi deseni:** Trendyol ve Hepsiburada kimlik bilgileri
zaten veritabanında singleton satırda tutuluyor ve panelden giriliyor. ALFAS
bağlantısı da aynı yola alındı:

- `AlfashomeConfig` (id=`singleton`, `baseUrl`/`token`/`isEnabled`/`lastOkAt`) —
  migration `20260919180000_alfashome_config`, canlıya uygulandı ve
  `_prisma_migrations` defterine doğru checksum'la yazıldı (13.09/18.09'daki
  "DDL elle uygulandı, defter geride kaldı" hatası tekrarlanmasın).
  Tabloda **RLS açık** (deny-all) — tablo bir SIR tutuyor ve public şemadaki
  RLS'siz tablo bu projede iki kez advisor hatası oldu.
- `lib/alfashome/config.ts` — kaynak sırası **panel ayarı → env**. Env desteği
  kaldırılmadı; mevcut kurulum bozulmasın. `isEnabled=false` ise DB kaydı
  yok sayılıp env'e düşülür ("kapat" gerçekten kapatmalı).
- `/alfashome/ayarlar` sayfası + `saveAlfashomeConfigAction` /
  `testAlfashomeConnectionAction`.

**Kararlar:**

- **Kayıtlı jeton tarayıcıya GERİ BASILMIYOR.** Sayfa yalnız "kayıtlı" ve son 4
  haneyi geçiriyor (`tokenIpucu`), alan boş başlıyor ve **boş = dokunmadım**
  (mevcut jeton korunur). Trendyol formu kayıtlı anahtarı `initialValues` ile
  geri basıyor; o desen bilerek tekrarlanmadı — sırrı her sayfa
  görüntülemesinde HTML'e gömmek gereksiz sızıntı yüzeyi.
- **`https` zorunlu:** jeton `Authorization` başlığında gidiyor, şifresiz
  bağlantıda ağı dinleyen okur.
- **Jeton alt sınırı 24** — ALFAS tarafındaki sınırın aynısı. Panel kısa jetonu
  kabul edip kaydetse, ALFAS 503 dönerdi ve kullanıcı sebebini göremezdi.
- **"Kaydettim" ≠ "çalışıyor":** ayrı "Bağlantıyı dene" düğmesi
  `/crm/orders?limit=1` çağırıp sonucu söylüyor; başarı damgası (`lastOkAt`)
  yalnız gerçekten 200 alındığında yazılıyor. 401/503 için ne yapılacağı
  mesajda yazılı.

**Canlı durum:** bağlantı kaydı veritabanına yazıldı (adres = Railway servis
adresi, jeton = Railway'deki `CRM_API_TOKEN` ile aynı, aktif). Dağıtım bitince
panel → ALFAS Home → Ayarlar sayfasındaki "Bağlantıyı dene" ile teyit edilir;
bu ortamdan Railway'e ağ çıkışı kapalı olduğu için uç canlıda denenemedi.

Testler: `npm run check:alfashome` 18 → **23 kontrol** (jeton ipucu sızdırmıyor,
boş jeton mevcut değeri korumuyorsa kırılır — mutasyonla doğrulandı, https
zorunluluğu, alt sınır 24, menü). `tsc --noEmit`, `eslint`, `next build` temiz.

### 2026-09-19 — ALFAS Home bölümü: Meta Reklamları + Siparişler + Üyeler

Panelde **ALFAS Home** adlı yeni bir menü grubu açıldı ve mağazaya ait üç sayfa
tek yerde toplandı. "Meta Reklamları" eskiden tek başına *Sistem* altındaydı;
aynı mağazanın reklamı, siparişi ve üyesi üç ayrı yere dağılmasın diye taşındı
(yol `/reklamlar` KORUNDU — adres değiştirmek kayıtlı bağlantıları ve komut
paletini kırardı).

**Yeni sayfalar** (`app/(app)/alfashome/siparisler`, `.../uyeler`): son 50
sipariş (müşteri, ürünler, tutar, ödeme durumu; KPI: sipariş, ciro, ortalama
sepet) ve son 200 üye kaydı (tür, sipariş sayısı, harcama, son sipariş).
İkisi de `executive.read` izniyle korunuyor ve `force-dynamic` — bayat sipariş
listesi "sipariş gelmemiş" diye okunur ve sevkiyatı geciktirir.

**Veri nereden:** ALFAS'ın Medusa arka ucuna eklenen **salt okunur** `/crm/orders`
ve `/crm/members` uçları (alfashome repo: `backend/src/api/crm/*`), panel tarafında
`lib/alfashome/client.ts`.

**Medusa admin anahtarı BİLEREK kullanılmadı.** O anahtar ürün silmeye, fiyat
değiştirmeye, iade yapmaya da yetiyor; panelin ihtiyacı yalnız okumak. Dar
kapsamlı iki uç açıldı, jetonu yalnız onlar tanıyor (en az yetki).

**Uçlar fail-closed:** `CRM_API_TOKEN` yoksa **ya da 24 karakterden kısaysa**
uç 503 döner ve hiçbir veri vermez. Medusa'da `/admin` ile `/store` dışındaki
yollar kimlik doğrulamasızdır — yapılandırma yoksa açık kalsaydı müşteri adı,
e-postası ve telefonu internete açık olurdu. Jeton karşılaştırması SHA-256
özetleri üzerinden `timingSafeEqual` ile: ham karşılaştırma jetonun uzunluğunu
sızdırır. Jeton ne yanıta ne log'a yazılır (Railway log'u açıktır).

**Panelde hata SESSİZ KALMAZ:** env eksik, jeton yanlış (401) ya da uç kapalıysa
(503) tablo boş görünmez; sebep ve iki taraftaki kurulum adımı ekranda yazılı.
Boş tablo "hiç sipariş yok" diye okunup yanlış karara yol açardı (reklam
panelindeki aynı ilke).

**Tuzak — "üye" sayısı:** ALFAS'ta müşteri kaydı üç yoldan oluşuyor (hesap açan,
misafir sipariş veren, **e-posta katmanına abone olan**). Bu yüzden tabloda
"Tür" kolonu ve KPI'da hesaplı üye / alıcı ayrı sayılıyor; hepsini "üye" diye
tek sayıda göstermek listeyi olduğundan değerli gösterirdi.

**Tuzak — tutar birimi:** Medusa v2 fiyatı ondalık para birimidir (1518 = 1.518 ₺).
100'e bölmek tutarı yüz kat küçük gösterirdi; iki taraftaki testler bölmeyi
yasaklıyor.

**Kurulum (kullanıcıda):** Railway → `CRM_API_TOKEN` (rastgele 32+ karakter),
Vercel → `ALFASHOME_API_URL` + `ALFASHOME_API_TOKEN` (aynı jeton).

Testler: `npm run check:alfashome` (18 kontrol; sözleşme kayması, env eksikken
hata, jeton sızıntısı, tutar birimi, salt okunurluk, menü) ve alfashome tarafında
`npm run check:crm` (17 kontrol; fail-closed, kısa jeton reddi, sabit zamanlı
karşılaştırma, yazma ucu yokluğu).

### 2026-09-18 — Migration defteri gerçekle hizalandı + RLS açığı (tekrar) kapatıldı

"16 migration canlıya uygulanacak" diye duran iş, **uygulama işi değil defter
işi** çıktı. Sıra: önce ölç, sonra yaz.

**① Şema geride değildi.** 16 "bekleyen" migration'ın ürettiği **her** nesne
canlıda mevcut: 8 tablo, 13 kolon, 27 view, 4 fonksiyon — tek tek `to_regclass` /
`information_schema` / `pg_proc` ile sorgulandı, eksik **0**. Üstüne 27 view'ın
hepsi `select … limit 5` ile okundu ve 4 fonksiyon çağrıldı; hiçbiri hata
vermedi. DDL Supabase SQL editöründen elle uygulanmış, `_prisma_migrations`'a
yazılmamıştı. 13.09'daki "tablolar canlıda yok" bulgusu **camelCase Prisma model
adıyla** arandığı için yanlış çıkmıştı (`UrunAday` yok, `urun_aday` var —
bu nesneler Prisma şemasında hiç geçmiyor).

**Neden migration'ları yeniden çalıştırmadım:** DDL'in tamamı idempotent
(`IF NOT EXISTS` / `CREATE OR REPLACE`), yani yeniden koşmak nesneler için
no-op'tu; ama dosyalar veri geri doldurma UPDATE'leri de taşıyor ve `urun_aday`
17.09'da elle düzenlenmiş (151 satır, son `updated_at` 17.09 18:52). Kazancı
sıfır, riski gerçek olan bir işlem: **defter yazıldı, DDL'e dokunulmadı.**

**② Defterin kendisi de bozuktu — 11 eski migration'da checksum kayması.**
Dosyalar uygulandıktan sonra düzenlenmiş (yorum/açıklama eklenmiş) ve
`prisma migrate deploy` bu durumda "migration modified after applied" ile
**durur**. Yani 16'yı yazmak tek başına yetmezdi. Kaymayı bulmak için
dosya tarafında ve DB tarafında aynı biçimde toplu sha256 alınıp
ay → gün → satır diye daraltıldı. Checksum'ları dosyayla hizalamadan önce
o 11 dosyanın **tüm** DDL nesneleri canlıda arandı (11 tablo, 6 enum tipi,
16 kolon, 42 index, `vector` eklentisi, 3 enum değeri) — eksik **0**, yani
düzenlemeler yalnız yorum. Uygulanmamış DDL'i checksum'la gizleme riski
böylece elendi.

**Sonuç:** 95/95 migration `finished_at` dolu, `rolled_back_at` boş ve
**dosya tarafının toplu hash'i DB tarafıyla birebir aynı** →
`prisma migrate deploy` artık temiz no-op. Yöntem 13.09'daki desenle aynı
(checksum = `migration.sql`'in sha256'sı; önce uygulanmış bir migration
üzerinde doğrulandı).

**③ RLS değişmezi yine kırılmıştı.** 13.09'da "RLS'siz public tablo sıfır"
denmişti; Supabase security advisor bugün **5 tabloda** RLS kapalı buldu
(`cfo_hamle`, `cfo_hamle_olcum`, `cfo_kart_taksit`, `cfo_kilometre_tasi`,
`cfo_kur`). Sebep aynı: bu tablolar 13.09'dan **sonra** SQL editöründen elle
açıldı. Bu bir unutulmuş düzeltme değil, **tekrarlayan bir sınıf** — bu yüzden
backlog'a event trigger maddesi girdi. Migration
`20260918190000_rls_eksik_tablolar_2` (20260613000000 + 20260913235000 ile
birebir aynı deny-all deseni, tablo yoksa atlar) canlıya uygulandı ve deftere
yazıldı. RLS'siz public tablo: **0**.

Beşi de TypeScript kodunda hiç geçmiyor (grep: sıfır eşleşme) ve tüm erişim
Prisma → `postgres` rolüyle, o da `rolbypassrls` taşıyor — kapatmak hiçbir
sayfayı bozmuyor. Advisor'ın kalan bulguları (39 view `SECURITY DEFINER`,
18 fonksiyonda değişken `search_path`, `vector` eklentisi `public` şemasında)
**bilerek bu deltaya alınmadı**: hiçbiri bu oturumun işi değil, üçü de
davranış değiştirebilir ve `anon` yetkisi zaten 20260613000100 ile alınmış.
Backlog'a madde olarak girdiler.

### 2026-09-17 — C5: kritik mantık testleri (+ izin çakışması kuralı eklendi)

Testlerin önündeki engel mantığın YERİ idi: karar kodu DB çağrılarının arasına
gömülü ya da `import "server-only"` taşıyan dosyalardaydı (tsx altında o import
anında patlar). Önce mantık saf modüllere çıkarıldı, sonra sınandı.

- **Yeni saf modüller:** `lib/pdks/tr-time.ts` (TR↔UTC, `toMinutes`),
  `lib/pdks/geofence.ts` (en yakın şantiye + doğruluk/yarıçap kararı + olağandışı
  saat), `lib/pdks/checkout-rules.ts` (otomatik çıkış kararı),
  `lib/pdks/leave-overlap.ts` (izin çakışması).
- **Kopya mantık kalktı:** geofence kuralı check-in ve check-out'ta AYRI
  yazılıydı (biri değişince öbürü sessizce eski kuralda kalıyordu); `toMinutes`
  üç yerde vardı ve `timesheet.ts`'teki kopya saat sınırını kontrol etmiyordu
  ("25:99" geçerli sayılıyordu). Otomatik çıkış eşiği hem sabitte hem bildirim
  metninde yazılıydı — metin artık sabitten okunuyor.
- **`lib/pdks/schedule.ts`'ten `server-only` kaldırıldı** (saf takvim matematiği,
  `holidays.ts` gibi). Test, bu dosyalara prisma/server-only sızmasını yasaklıyor.
- **İzin çakışması kontrolü EKLENDİ — daha önce YOKTU.** Aynı personel için üst
  üste binen izinler oluşturulabiliyordu (hem personel talebi hem admin'in elle
  eklediği izin). Artık iki yolda da engelleniyor (409 / hata mesajı); uçlar
  dahil kesişim çakışma sayılır.
- **`__tests__/pdks-logic.test.ts` + `npm run check:pdks` (32 kontrol):**
  gece yarısı gün dönümü (21:00 UTC'de TR ertesi gün), `currentTimeTR`'nin
  "24:xx" dönmemesi, yaz saati yokluğu, TR→UTC dönüşümü, geçersiz saat reddi,
  haversine (bilinen mesafe + simetri), en yakın şantiye seçimi, doğruluk
  kapısının mesafeden önce gelmesi, sınır değerleri, otomatik çıkışın beş hâli,
  program override/tatil/bozuk JSON, izin çakışmasının bütün geometrileri ve
  uçların bu mantığı gerçekten kullandığı.
- **Testler mutasyonla denendi:** eşiği 15→30 yapmak, çakışmayı yarı-açık
  yapmak ve doğruluk/mesafe sırasını değiştirmek testleri kırıyor. İlk sürümde
  sıra mutasyonu KAÇIYORDU (nokta şantiyenin üstündeydi, mesafe kapısı zaten
  geçiyordu); senaryo "hem uzak hem doğruluğu kötü" hâline çevrildi.


### 2026-09-17 — D2 kapandı: push aboneliğinde tenant sızdırma

- `app/api/pdks/push/subscribe/route.ts`: abonelik yazma **atomik upsert**
  oldu. Eski kod `deleteMany({ where: { endpoint } })` çağırıyordu ve
  `tenantId` YOKTU — `endpoint` global unique olduğu için kayıt başka bir
  tenant'a aitse onu da siliyordu; ayrıca `create`'in catch'i sessiz olduğu
  için araya giren herhangi bir hata aboneliği tamamen yok edip cihazı
  bildirimsiz bırakıyordu. İkisi de sessiz arızaydı.
- `upsert` sahipliği oturumun tenant'ına taşır (endpoint'i tarayıcı üretir ve
  tahmin edilemez; aynı endpoint'i gönderen taraf o cihazın kendisidir) ve
  `p256dh`/`auth` döndüğünde tazeler — eski kodun delete+create ile yapmaya
  çalıştığı da buydu, ama yıkıcı ve atomik olmayan biçimde.
- `__tests__/push-subscribe.test.ts` + `npm run check:push` (5 kontrol):
  `deleteMany` yasak, upsert'te create+update'in ikisinde de `tenantId`,
  anahtar tazeleme, oturum zorunluluğu, hatayı yutan boş catch yasağı.
  Test eski kod metnine karşı denendi: üç eksende de kırılıyor.
  Yorumlar testte AYIKLANIYOR — dosyadaki açıklama eski hatalı deseni birebir
  yazdığı için yorumlara bakan test yanlış alarm veriyordu.


### 15.09.2026 — WhatsApp zamanlanmış mesaj tetiklemesi (GitHub Actions)
5. kurulum adımı (harici zamanlayıcı) elle cron-job.org kurmak yerine repoya
yazıldı: `.github/workflows/whatsapp-schedules.yml`, saat başı
`/api/cron/whatsapp-schedules`'ı `CRON_SECRET` ile çağırıyor. PDKS
hatırlatmalarındaki (`pdks-reminders.yml`) kalıbın aynısı — yönlendirme takibi
(`-L --location-trusted`, yoksa Bearer düşer ve uç 401 verir), secret yokken
sessiz atlama, `concurrency` ile üst üste binmeme.

**Neden repoda, panelde değil:** cron-job.org'da kurulan bir zamanlayıcı hiçbir
yerde iz bırakmaz; kim kurdu, hangi başlıkla çağırıyor, ne zaman bozuldu
görünmez. Workflow sürüm kontrolünde, çalışma geçmişi GitHub'da ve başarısız
çağrı kırmızı yanıyor.

⚠️ **Gün boyu çalışır, mesai saatine daraltılmadı.** PDKS'de pencere 06:00–19:59
çünkü mesai dışı anlamsız. Burada öyle değil: 21:00'e kurulmuş bir görev, o
saatte çağrı yapılmazsa `lastRunOn` damgası yüzünden ertesi sabaha kayar ve
YANLIŞ GÜNDE gider. Saatte bir çağrı ~10 saniye.

**Yeni secret gerekmiyor:** `PDKS_BASE_URL` zaten tanımlıysa o kullanılıyor
(aynı sitenin taban adresi, yalnız adı PDKS'ye özel kalmış). `SITE_BASE_URL`
ileride o adı düzeltmek için öncelikli okunuyor.

### 15.09.2026 — `/api/durum`: kurulumu uzaktan ölçen teşhis ucu
Kurulum adımlarını doğrularken duvara çarpıldı: panel sayfaları kimlik
doğrulaması arkasında, canlı siteye bu ortamdan egress kapalı. "Vercel'e
değişkeni kaydettim" bir şey KANITLAMIYOR — env değişikliği yeniden deploy
edilene kadar etkisiz ve bu sessiz: sayfa normal görünür, entegrasyon çalışmaz.

`GET /api/durum` hangi değişkenin canlıda TANIMLI olduğunu söyler. alfashome'daki
`/api/capi` ile aynı desen; herkese açık olması kasıtlı, çünkü var olma sebebi
uzaktan ölçüm. **Değer döndürmez:** yalnız boolean + biçim geçerliliği.

Kapsam: WhatsApp gönderim ikilisi (`WHATSAPP_TOKEN`, `PHONE_NUMBER_ID`), webhook
ikilisi (`APP_SECRET`, `VERIFY_TOKEN`), `TEMPLATE_LANG` (değeri görünür — gizli
değil ve `tr_TR` gibi yanlış yazım Meta'da `132001` üretiyor), reklam
(`META_ADS_TOKEN` + hesap kimliği **biçim** geçerliliği), `CRON_SECRET`.

**Sızdırma testi** (`npm run check:durum`, 5 kontrol) uçtan değer dönmediğini
sabitler: gizli değişkenler yalnız `tanimli()` içinden okunabilir; doğrudan
atama, `slice`/`substring` ile kırpma ve `.length` ile uzunluk sızdırma yasak.
Bir gün "teşhisi kolaylaştırmak için" anahtarın ilk 4 hanesini eklemek cazip
gelir — test onu kırar. Ayrıca uca auth eklenmediğini de test ediyor, çünkü
auth eklenirse ucun amacı yok olur.

**Bu delta sırasında doğrulananlar:** `WHATSAPP_VERIFY_TOKEN` canlıda tanımlı
(webhook GET'i 403 döndü — tanımsız olsa 503 dönerdi) ve 08:02–08:03 arası yeni
bir production deployment canlıya geçti.

### 13.09.2026 — Canlıya alma + RLS açığı kapatıldı
WhatsApp ve reklam işi canlıya alındı; sırasında **güvenlik açığı bulundu ve
kapatıldı**.

**Uygulananlar (Supabase, proje `frbxpodiostxuwlrubkt`):**
`20260913210000_whatsapp_messaging`, `20260913230000_whatsapp_schedules`,
`20260913235000_rls_eksik_tablolar`. Üçü de `_prisma_migrations`'a **doğru
checksum ile** işlendi — yöntem, uygulanmış bir migration'ın checksum'ı
dosyanın sha256'sıyla karşılaştırılarak önce doğrulandı. Bu adım atlanırsa
`prisma migrate deploy` aynı tabloları yeniden kurmaya çalışıp patlardı.
İzinler (`ads.read`, `whatsapp.read/send/manage`) ve rol varsayılanları
seed.ts ile birebir aynı şekilde, idempotent olarak yazıldı.

⚠️ **BULGU 1 — canlı DB 16 migration geride.** `20260828000000_cfo_disiplin`
ve sonrasındaki 16 migration hiç uygulanmamış; `UrunAday` ve `CfoAlacakBorc`
tabloları canlıda **yok**. Yani o özellikler canlıda çalışmıyor. Bunlara
DOKUNULMADI — başka oturumların işi, gözden geçirilmeden production'a
uygulanmaz. Sıra dışı değil: benim migration'larım daha sonraki tarihli
olduğu için `migrate deploy` o 16'sını yine de uygular.

> ❌ **BU BULGU YANLIŞTI (18.09.2026'da düzeltildi).** Şema geride DEĞİLDİ:
> 16 migration'ın ürettiği tabloların, kolonların, view'ların ve
> fonksiyonların **tamamı canlıda mevcut** — DDL Supabase SQL editöründen
> elle uygulanmış, yalnız `_prisma_migrations` defterine yazılmamıştı.
> "Tablo yok" sonucu **camelCase Prisma model adıyla** (`UrunAday`,
> `CfoAlacakBorc`) arandığı için çıktı; gerçek nesneler snake_case
> (`urun_aday` tablosu, `cfo_alacak_borc` view'ı) ve bu adlar Prisma
> şemasında hiç geçmiyor (SQL-only nesneler). Ayrıntı ve yapılan düzeltme:
> aşağıdaki **18.09.2026 — Migration defteri** deltası.

⚠️ **BULGU 2 — RLS değişmezi kırılmıştı (kapatıldı).** 22 public tabloda RLS
kapalı VE `anon` SELECT yetkisi vardı. Sebep: 20260613000000 yalnız o gün var
olan tabloları kapatmış; sonradan **SQL editöründen elle** açılan tablolar
korumasız kalmış. Düzeltmeden önce uygulamanın bu tabloları Supabase
istemcisiyle okumadığı doğrulandı (repoda `createClient` ve anon anahtar
referansı **yok**; erişim Prisma → `postgres`, o da RLS'i bypass eder), yani
kapatmak hiçbir sayfayı bozmuyor. Sonuç: RLS'siz public tablo **sıfır**.

**Duman testi:** kişi → görev → alıcı bağı → soru → cevap → `replyToId` zinciri
canlı şemada uçtan uca çalıştırıldı ve `ROLLBACK` ile geri alındı; canlı veriye
hiçbir satır eklenmedi.

### 13.09.2026 — Meta reklam paneli (`/reklamlar`)
alfashome'un 50 ₺/gün katalog kampanyası Meta panelinden izleniyordu; artık
kampanya bazında harcama/ciro/ROAS iotomasyon'dan görülüyor.

**SALT OKUNUR — bilerek.** Modül yalnız `insights` ve para birimi çeker; bütçe
değiştirmez, kampanya durdurmaz. Reklam harcaması geri alınamaz bir işlem ve
panelden yanlışlıkla tetiklenmemeli; bütçe kararı Meta panelinden, bilerek
verilir. `ads.read` izni var, yazma izni YOK.

**Biçim kararı: grafik yok.** Manşet sayılar KPI kartı, kampanyalar tablo.
Birkaç kampanyayı çubuk grafiğe dökmek okunurluğu artırmaz; tablo hem
sıralanabilir hem tüm sütunları aynı anda gösterir. Renk yalnız **durum**
bildiriyor (ROAS 1×'in altı kırmızı), seri kimliği için değil.

**Graph API'nin üç sessiz tuzağı** `lib/meta/insights.ts`'te saf fonksiyonlarla
çözüldü ve 15 testle sabitlendi (`npm run check:ads`):

1. **Tüm sayılar STRING gelir.** Çevrilmezse `"12" + "34" = "1234"`.
2. **Satın alma üç ayrı `action_type` altında AYNI ANDA raporlanır**
   (`omni_purchase`, `offsite_conversion.fb_pixel_purchase`, `purchase`).
   Toplamak **ciroyu üçe katlar** ve ROAS'ı uydurur. Kod tek tip seçer,
   toplamaz; öncelik `omni_purchase` (Meta'nın tekilleştirilmiş ölçüsü).
3. **Hiç dönüşüm yoksa alan boş dizi değil, HİÇ YOKTUR.**

**Özet oranları toplam paydan hesaplanır, kampanya oranlarının ortalaması
alınmaz.** Ortalama almak 1 ₺ harcayan kampanyayı 1.000 ₺ harcayanla eşit
ağırlığa sokar; testte bu fark 51× ile 2,1× arasında.

**Tanımsız ölçü `—` gösterilir, 0 değil.** Satış yokken CPA "0" demek "satın
alma bedavaya geldi", harcama yokken ROAS "0" demek "hiç getirisi yok"
demekti — ikisi de yanlış.

**Hata SESSİZ KALMIYOR.** Anahtar süresi dolduğunda panel boşalırdı ve bu
"kampanya durmuş" diye okunurdu; artık sebep ve çözüm ekranda yazılı. Veri
DB'ye yazılıp bayatı sunulmuyor (bilerek): eski sayıya bakıp bütçe kararı
vermek en tehlikeli durum. Yalnız 60 saniyelik bellek önbelleği var, hızlı
yenilemeleri yumuşatmak için.

⚠️ **Canlı API'ye bu ortamdan erişilemiyor** (egress kapalı). Kod gerçek yanıt
biçimleri taklit edilerek test edildi; ilk çalıştırmada anahtar/hesap kimliği
doğrulaması kullanıcı tarafında yapılmalı.

**Gerekli env:** `META_ADS_TOKEN` (ads_read, süresiz), `META_AD_ACCOUNT_ID`.

### 13.09.2026 — WhatsApp Faz 2: zamanlanmış mesajlar + soru/cevap takibi
Faz 1 borular döşemişti (webhook, şema, gönderim). Bu delta kullanıcının asıl
istediğini kuruyor: *"depocuya her sabah işe başladınız mı diye mesaj attıracağım,
cevabını da iotomasyon üzerinden takip edeceğim."*

**Panel:** `/whatsapp` (Sistem menüsü). En üstte **cevap bekleyenler** —
sorulmuş ama cevabı gelmemiş mesajlar. Altında zamanlanmış görevler, son
gönderilenler (her mesajın cevabı **kendi içine gömülü**, ayrı satır açmaz),
bağımsız gelen mesajlar ve kişi listesi.

**Soru↔cevap bağı:** gelen mesaj, son 48 saatte sorulmuş ve hâlâ cevapsız
bekleyen SON soruya bağlanır (`WhatsAppMessage.replyToId`, TEKİL). Bağlamamak
kesin kayıptı; yanlış bağlama riski var ama 48 saat sınırı onu tutuyor —
üç gün önceki soruya bağlanan bir "tamam" yanlış kayıt olurdu ve **yanlış
kayıt, kayıt olmamasından kötüdür**.

**Zamanlama Europe/Istanbul yereline göre.** UTC saklamak yaz saati değişiminde
mesajı bir saat kaydırırdı; "her sabah 08:30" kullanıcı için yerel bir vaat.

**Mükerrer freni `lastRunOn` damgası** (yerel gün), "şu kadar dakika önce"
penceresi değil. Harici zamanlayıcı gecikirse pencere tabanlı kural mesajı
kaçırır, iki kez çağırırsa iki kez gönderirdi. Damga ile: saati geçen görev gün
içinde **hâlâ** gider (08:30 kaçarsa 09:00'da gider), ama günde bir kez.
Damga gönderimden ÖNCE atılır — yarıda çökersek eksik gönderim olur, mükerrer
olmaz; mükerrer olan hem ücretli hem güven kırıcı.

**Tetikleme `vercel.json`'da DEĞİL.** Hobby yalnız günlük cron'a izin veriyor ve
iki günlük cron zaten dolu; bu görev saat başı kontrol edilmeli. PDKS
hatırlatmalarındaki yolun aynısı: harici zamanlayıcı
`/api/cron/whatsapp-schedules` adresini `Authorization: Bearer $CRON_SECRET`
ile çağırır. Panelde **"Görevleri şimdi çalıştır"** düğmesi var — *"görev
tanımlı" olması mesajın gittiğini KANITLAMAZ*, bu düğme kurulumu beklemeden
boru hattını doğrular.

**İzinler ayrı tutuldu:** `whatsapp.read` / `whatsapp.send` / `whatsapp.manage`.
Gönderim para harcar ve alıcıyı rahatsız eder; geçmişi okumak zararsızdır.
DEPO **okur, gönderemez**; OPERASYON okur ve gönderir; görev/kişi tanımı
(`manage`) ADMIN'de — yanlış tanımlanmış bir görev her gün yanlış kişiye mesaj
atar ve bunu kimse fark etmez.

**Şema:** `WhatsAppSchedule`, `WhatsAppScheduleRecipient`; `WhatsAppMessage`'a
`scheduleId` + `awaitingReply` + `replyToId`. Migration
`20260913230000_whatsapp_schedules` salt ekleme, yeni kolonlar nullable/DEFAULT'lu
(backfill gerekmez), iki yeni tabloda RLS açık, FK'ler RESTRICT/SET NULL —
**CASCADE yok** (repo kuralı açık onay istiyor), görev silinince mesaj geçmişi
durur.

**Testler:** `npm run check:wa` 17 → **30 kontrol**. Yeni 13'ü zamanlama
kararını sınıyor: yerel saat dönüşümü, gece yarısı `24 → 0` düzeltmesi (olmasa
00:30'da hiçbir görev tetiklenmezdi), yerel günün UTC gününden ayrışması, gün
filtresi, mükerrer freni, geç kalan tetikleme.

**Formlar da eklendi:** kişi ekle/düzenle/sil ve zamanlanmış mesaj
ekle/düzenle/sil, panelin içinde. Görev formunda şablon adı boş bırakılırsa
ekran **uyarıyor** — serbest metin yalnız 24 saatlik pencerede gider ve sabah
yoklamasında o pencere kapalıdır; uyarı olmasa görev "aktif" görünür ve hiçbir
mesaj ulaşmazdı. Kişi formu numarayı serbest biçimde kabul eder (boşluklu,
`+90`'lı, `0`'lı) ve kaydederken tek biçime çevirir.

**Henüz YOK:** reklam paneli (`ads_read` ile Meta kampanya özeti).

### 13.09.2026 — WhatsApp mesaj merkezi: temel katman (Faz 1)
Sipariş bildirimleri alfashome backend'inden gidiyor ama **cevaplar hiçbir yere
düşmüyordu**. Amaç: depoya/ekibe düzenli mesaj atmak ve gelen cevabı iotomasyon
üzerinden takip etmek. Bu delta o işin taşıyıcı katmanı.

**Neden burada, alfashome'da değil:** Meta her WhatsApp numarası için **TEK**
callback adresi kabul eder. Gönderim iki sistemden de yapılabilir, **alma tek
yerden** olmak zorunda — o yer iotomasyon (`/api/whatsapp/webhook`). alfashome
yalnız gönderir, cevapları göremez.

Eklenenler:
- `lib/whatsapp/phone.ts` — numara normalleştirme, alıcı listesi, şablon
  parametresi temizliği, 24 saatlik pencere hesabı.
- `lib/whatsapp/signature.ts` — Meta webhook imzası (HMAC-SHA256, `timingSafeEqual`).
- `lib/whatsapp/client.ts` — `sendTemplate` / `sendText` (Cloud API v21).
- `app/api/whatsapp/webhook/route.ts` — GET doğrulama el sıkışması, POST gelen
  mesaj + durum kaydı.
- `prisma/schema.prisma` + migration `20260913210000_whatsapp_messaging` —
  `WhatsAppContact`, `WhatsAppMessage`. İkisinde de RLS açık (public tablo
  değişmezi), FK `ON DELETE RESTRICT`.
- `__tests__/whatsapp.test.ts` (16 kontrol) → `npm run check:wa`.
  Mevcut RBAC testi de betiklendi: `npm run check:rbac`.

**Testin bulduğu iki gerçek hata:**
1. Alıcı listesi **boşlukta da bölünüyordu**. Türkiye'de numara `0532 111 22 33`
   diye yazılır; liste dört parçaya ayrılıp dördü de eleniyor ve **sessizce
   boşalıyordu** — hiç mesaj gitmezdi, hata da dönmezdi. Artık önce parçanın
   tamamı tek numara olarak denenir; boşluk ancak o okunamazsa ayırıcı sayılır,
   böylece boşlukla ayrılmış liste de çalışmaya devam eder.
2. Numarada **üst sınır yoktu**. Boşlukla ayrılmış iki numara tek diziye yapışıp
   24 haneye çıkıyor, "10+ hane" kuralını geçiyor ve **var olmayan bir numaraya**
   mesaj gidiyordu (Meta böyle bir durumda hata döndürmez). Artık E.164 üst
   sınırı 15 hane uygulanıyor.

**İmza doğrulaması neden ayrı dosyaya taşındı:** route içindeyken `@/lib/prisma`
→ `server-only` zinciri yüzünden Next bağlamı dışında import edilemiyordu, yani
**güvenliğin tek kritik noktası test edilemiyordu**. `lib/whatsapp/signature.ts`
saf `node:crypto`; artık `npx tsx` ile doğrulanıyor.

**Henüz YOK (Faz 2-3):** kişi yönetim ekranı, zamanlanmış mesajlar (Vercel cron),
soru↔cevap eşleştirme, reklam paneli. Webhook Meta paneline de bağlanmadı —
`WHATSAPP_APP_SECRET` + `WHATSAPP_VERIFY_TOKEN` Vercel'e girilmeden çalışmaz
(imzasız istek 401, anahtarsız kurulum 503 döner — sessiz kabul YOK).
### 13.09.2026 — Menşei CN, garanti 24 ay, kutu ölçüleri
Alperen: "hepsine menşei cn ve kutu ölçüleri ekle / ayrıca garanti 24 ay ekle."

Menşei ve garanti tek UPDATE: 151/151 → CN / 24 ay. Tartışılacak bir şey yok,
karar Alperen'in.

**Kutu ölçüsü başka bir şey ve bunu ayırmak gerekiyordu.** Beyan edilen desi
pazaryerinin keseceği kargo ücretini belirliyor: az beyan edersen ürünü yeniden
tartıp fark kesiyorlar, çok beyan edersen her gönderide fazla ödüyorsun. Yani
oraya yazılan sayı doğrudan para. Elimde gerçek ölçü **yalnız 6 üründe** vardı
(1 elle ölçülmüş, 5'i faturada yazıyordu).

Kalan 141'i boş bırakmak da uydurmak da yanlıştı. Türettim ve **türettiğimi
kaydettim**: yeni `kutu_kaynak` sütunu OLCULDU / FATURADAN / TAHMINI taşıyor.
İşaretsiz bıraksaydım bir sonraki pazaryeri ihracı tahmini ölçülmüş gibi
gönderirdi — ve hata ortaya ancak kargo faturası gelince çıkardı.

Tahmin kuralını (`urun_kutu_tahmin`) elimdeki tek gerçek kayda çapaladım:
AS304167 0,80 kg → 20×10×10. Kural o kaydı birebir üretiyor. Çanak lavaboda
ölçü zaten başlıkta yazıyor, kutu = ürün + 5 cm pay.

**Asıl iş şuydu: hangi tahmin paraya dönüyor?** Kargo `max(desi, ağırlık)`
kesiliyor, yani ağırlığın baskın olduğu üründe kutu ölçüsünün faturaya etkisi
yok. Saydım: 147 kutulu üründen 21'inde desi belirleyici, 5'inin ölçüsü zaten
gerçek. Geriye **elle ölçülmesi gereken 16 ürün** kalıyor (10 çanak lavabo,
6 yerden montajlı küvet bataryası). Panel 147 ürün için değil, tam o 16 için
uyarı veriyor — listede sayıyı yazıyor, editörde kutu alanını kırmızıya alıyor.
Kalan 131'de rozet gri: "tahmini, ama faturanı değiştirmez."

Bir de deploy öncesi yakalanan hata: `urun_aday_skor` sütun listesini
donduruyor (`select *` değil), panel sorgusu `kutu_kaynak` istiyordu →
"column does not exist". Görünümler yeniden kuruldu.

Puan ortalaması 46,4 → **58,2**; 60+ puanlı ürün 1 → **46**. Kalan tek büyük
darboğaz görsel: 127 yeni üründen 126'sında ürün görseli yok (27 puan).
Etki: `prisma/migrations/20260913120000_urun_mensei_garanti_kutu/`,
`app/(app)/admin/yeni-urunler/` (liste + editör).

### 13.09.2026 — 124 ürün açıklaması başlıktan üretildi
Alperen: "yeni ürünlerde açıklamaları doldur."

Açıklama 15 puanlık tek kalem ve 151 adayın 150'sinde boştu. Elde ne olduğuna
baktım: başlık (147), ağırlık (151), marka (87). Kategori, menşei, garanti, kutu
ölçüsü **hepsi boş** — yani açıklama ancak başlıktan üretilebilirdi.

Başlıklar şansıma nitelik dolu: malzeme (304 çelik / pirinç / zamak), kaplama
(PVD, krom), montaj (tezgah üstü, sıva altı, duvara monte), fonksiyon (termostatik,
fotoselli, spiralli, arıtmalı, N fonksiyonlu), ölçü. Bunları ayrıştırıp madde
madde yazan bir SQL fonksiyonu kurdum — script değil fonksiyon, çünkü gelecek
partilerde de gerekecek.

**Hiçbir şey uydurmadım.** Garanti, menşei, sertifika, su basıncı, kutu içeriği
yazılmıyor; bilinmiyor. Marka boşsa cümlede geçmiyor.

**Dolgu da yapmadım.** 124 üründen 66'sı 400 karakteri geçti (15 puan), 58'i
150-399'da kaldı (7 puan). O 58'i 400'e çıkarmak için genel pazarlama cümlesi
eklemek mümkündü — eklemedim. Başlıkları çıplak ("Alfas Çanak Lavabo Bataryası"),
anlatacak nitelik yok. Uzatmak dolgu olurdu, pazaryerinde de işe yaramaz.
Gerçek çözüm 1688 açıklamalarının yapıştırılması.

Yedek parçaları (somun, rakor, gövde aksamı) ayırdım: 16.000 ve 4.000 adetlik
üretim kalemleri, pazaryeri ürünü değil. Onlara "yüzeyi bezle silin" demek saçma
olurdu.

Puan ortalaması 35,6 → **46,4**. Kalan darboğaz görsel (27 puan) ve
kategori/menşei/garanti/kutu — hepsi Alperen'de.
Etki: `prisma/migrations/20260913090000_urun_aciklama_uret/`.

### 12.09.2026 — Genel tarama + XML hareketinden satış sinyali
Alperen genel denetim istedi. Çıkanlar ve yapılanlar:

**En büyük bulgu — Trendyol verisi kullanılmıyor.** Günlük cron `TrendyolSalesRecord`'a
yazıyor ve bugüne kadar güncel, ama CFO görünümlerinin hepsi yalnız
`MarketplaceSalesRecord`'u okuyor. **1.245 sipariş / 1.255.234 ₺ hiçbir analizde
görünmüyor.** Çift sayım riski var (7.255 sipariş ikisinde de), doğru anahtar
`split_part(orderNumber,'-',2) = orderId`. **Henüz bağlanmadı, sırada.**

**Satış verisi haftalık geliyormuş** — Alperen söyledi, deftere yazıldı (§4.4b).
Ajan artık her raporda istemeyecek. İki yükleme arası sessizlik arıza değil.

**Boşluğu XML kapattım.** Entegra XML'i her gece 02:31'de stok çekiyor; azalış
satış demek. Kurmadan önce kalibre ettim: son 30 günde gerçek 1.877, XML 1.872 →
%99,7. Bir gün kaydırma gerektiğini de ölçtüm (korelasyon 0,19 → 0,56), eşikleri
(±100) hareket dağılımındaki kopuştan seçtim.

İlk kalibrasyonu 60 gün yapmıştım, %67,4 çıktı ve `guvenilir=false` dedi. Kovalayınca
13.07–02.08 arası XML'in neredeyse hiç hareket kaydetmediğini buldum (haftada 11-16
ürün, normalde 60-114). Pencereyi 30 güne çektim — uyduruk bir daraltma değil, o
dönem kaynağın kendisi çalışmamış.

**Sonuç:** ölü stokta 6 yanlış alarm engellendi. En büyüğü `AL-PTZ04` (292.968 ₺)
"30 günde hiç satmadı" diyordu, 11.09'da satmış.

**XML her şeyi görmüyor:** `AL-CAM03` (940.900 ₺) 07.09'da Trendyol'da gerçekten
satılmış ama Entegra stoğu 90 gündür sabit — stoğu sanal tutulan SKU'larda XML
kıpırdamıyor. Bunu da deftere yazdım; o tür ürün için Trendyol tablosuna bakılacak.

**Taramanın diğer bulguları (henüz yapılmadı):** kredi/kart 19 gün bayat ·
`cfo_settings` 11 gün (kur oradan) · `cfo_defter_denetim()` bayatlık kontrolü
yalnız bankaya bakıyor · `cfo_stok_deger` ölü `Product.category` sütununu okuyor
(gerçek kategori `categoryId`'de, %98 dolu) · 1.093/1.285 üründe maliyet yok ·
CRM boş (teklif 9, timeline notu 32, mesaj şablonu 0).
Etki: `prisma/migrations/20260912140000_xml_satis_sinyali/`,
`20260912150000_olu_stok_xml_sinyali/`, `app/(app)/cfo/olu-stok/page.tsx`,
`docs/CFO-GOREV.md`.

### 12.09.2026 — Ölü stoka oran kuralı: 90g satış / stok değeri < %20
Alperen: "son 90 günlük satış stok değerinin %20'sinden düşükse o ürün bu listeye
alınsın / bunu cowork her bu görevi yaptığında kontrol etsin."

Kural kuruldu, eşik `cfo_settings.deadStockSalesRatioPct`'te ayarlanabilir.
Ama uygulamadan önce ölçtüm ve **%20'de tek başına hiçbir ürün eklemiyor**:
yakaladığı 20 ürünün hepsi zaten "30 günde sıfır" ya da "örtü > 180 gün"
kuralında. Sebep matematiksel — satış stok değerinin %20'sinden düşükse örtü
zaten 180 günü çoktan aşıyor. Listenin dışındaki en yavaş ürünün oranı %72; kural
ancak eşik ~%72 üstüne çıkarsa ısırır. `cfo_olu_stok_ozet`'e `sadece_oran_kurali`
sütunu koydum ki bu her turda ölçülsün, benim bir kerelik tespitim olarak kalmasın.

Asıl kazanç başka yerden geldi: kuralı değerlendirmek için stok değeri gerekiyordu
ve eski görünüm bağlı sermayeyi yalnız `unitCostTry`den hesaplıyordu — yani
**maliyeti girilmemiş ürünü hiç görmüyordu**. 1.299 üründe maliyet 76'sında dolu
olduğuna göre kör nokta kuralın kendisinden büyüktü. Değer artık maliyet yoksa
90 günde gerçekleşen satış fiyatından türetiliyor: liste 64 → 75 SKU.

`cfo_stok_istisna`ya dokunmadım. Oran kuralının yakaladığı en büyük kalem
(`40005100051`, 1,98 M TL) oradaydı — stok sanal, gerçek bağlı sermaye 9.700 TL,
Alperen 31.08'de beyan etmiş 07.09'da teyit edilmiş. İstisnayı çiğnemek insanın
cevapladığı soruyu yeniden sormak olurdu.

Cowork görevi: `docs/CFO-GOREV.md` §5 "Ölü stok (Sal)" + sabitlenmiş `cfo_note`.
Etki: `prisma/migrations/20260912090000_olu_stok_satis_orani/`,
`app/(app)/cfo/olu-stok/page.tsx`, `docs/CFO-GOREV.md`.

### 11.09.2026 — Ödeme Takvimi'ne toplam alacak/borç
Alperen: "ödeme takvimi üst kısımda alacakların ve borçların toplamı da yazılsın
… alt toplamlar yazsın / Cowork defterine buraya toplamları işlemeyi unutmaması
için görev not düşülsün."

Takvim gün gün AKIŞI gösteriyordu; STOK sorusu ("toplamda kime ne borcum var")
cevapsızdı. Üst şeride kalem kalem tablo eklendi, iki tarafta alt toplam ve altta
net pozisyon: alacak 1.201.163, borç 9.401.291, net −8.200.128.

İki tuzağa dikkat ettim:
- **Mükerrer sayım.** `cfo_cash_event`'teki kredi taksiti (1,12 M) ve kart ödemesi
  (1,20 M) takvimde duruyor ama borç toplamına eklemedim — bunlar kredi
  bakiyesinin (3,53 M) ve kart borcunun (2,03 M) İÇİNDEN ödenecek taksitler.
  Eklemek aynı borcu iki kez yazmak olurdu. Sabit gider de borç değil.
- **İkinci bir borç modeli kurmamak.** Borç kalemleri `cfo_servet_kalem`'den
  okunuyor; orası kural el kitabında tek doğru kaynak (§4E). Ayrı hesap kursaydım
  servet ekranıyla çelişirdi.

Veri bayatlığı ortaya çıktı: kredi ve kart bakiyeleri **18 gündür** elle
güncellenmemiş — yani 5,5 M TL'lik borç üç haftadır doğrulanmamış. Ekranda
gösteriliyor (7 günü aşınca sarı) ve CFO ajanına günlük görev olarak yazıldı:
`docs/CFO-GOREV.md` §4.5 + panoya sabitlenmiş `cfo_note`.
Etki: `prisma/migrations/20260911140000_cfo_alacak_borc/`,
`app/(app)/cfo/odemeler/page.tsx`, `docs/CFO-GOREV.md`.

### 11.09.2026 — Marka faturadan dolduruldu, Flextail başlıkları düzeltildi
Alperen: "marka bazılarında alfas bazılarında flextail olmalı / ikisinden biri
yazıyorsa yazanla doldur" + "AS304179 inox".

Marka dolduracakken bir hatamı buldum: ürettiğim 147 başlığın **hepsine** "Alfas"
öneki koymuştum, oysa 4 ürün Flextail. Hepsiburada başlığın MARKA ile başlamasını
istediği için bu ürünler yanlış markayla listelenecekti.

Bu yüzden markayı başlıktan okumak olmazdı — başlık zaten benim koyduğum öneki
taşıyor, kendi hatamı kanıt sayardım. Faturadaki orijinal metne bakıldı:
83 Alfas, 4 Flextail (2'si faturadan, 2'si katalog adından), 64 boş. Boş kalan
64'e marka uydurulmadı; Alperen'in kuralı "yazıyorsa yazanla doldur"du.

Flextail başlıklarındaki yanlış önek söküldü. Üretici de düzeltildi: markayı
faturadan okuyor, baştaki yanlış markayı söküp doğrusunu koyuyor. Panelde de
uyarı var — marka yazılıysa ve başlık onunla başlamıyorsa alan sarıya dönüyor.

AS304179 inox olarak teyit edildi; başlık zaten inox diyordu, değişmedi.
Yeni ürünlerin puan ortalaması 32,1 → 35,6.

**Açık kalan:** 64 üründe marka yazmıyor. Hepsi kendi üretimimiz olduğuna göre
muhtemelen Alfas ama bu tahmin; Alperen'e soruldu.
Etki: `scripts/urun-basligi-uret.py`, `app/(app)/admin/yeni-urunler/[sku]/editor.tsx`.

### 11.09.2026 — "Yeni Ürünler"in 24'ü aslında yeni değilmiş
Alperen: "4902837173724 ve 4267192047364 bizim zaten sattığımız ürün ama yeni
gibi koymuşsun buraya."

Haklıydı ve iki üründen ibaret değildi. Katalog kontrolü **hiç uygulanmamış** —
SKU'su birebir aynı olan 3 ürün bile listede duruyordu. Doğru sayı: 151 adayın
**24'ü katalogda**, hepsi aktif, 730 adet. Gerçekten yeni olan 127 kalem.

Daha önce "148 SKU katalogda yok"u doğruladığımı yazmışım; o doğrulama yanlıştı.
Eşleştirmeyi SKU'nun rakam çekirdeğinden kurmak gerekiyormuş: faturadaki kod
katalog kodunun önüne harf alıyor (`426M-4267192047364` ↔ `4267192047364`).
Eşleşenlerin rakam dizisi 9-13 haneli, rastlantı değil.

Eşleşmeyi sütuna yazmadım, görünümde tutuyorum — sütun olsa katalog değişince
bayatlardı ve asıl hata da bir kez bakıp bir daha bakmamaktı. İsim benzerliğini
bilerek kullanmadım: "Spiralli Mutfak Eviye Bataryası Siyah" iki ayrı SKU'da
geçiyor ve bunlar varyant, aynı ürün değil.

Katalogdakiler artık hazırlık sayılarının dışında; ayrı filtre, rozet ve ürün
sayfasında açıklama var. Sunucu tarafında da kapı kondu: katalogdaki ürün
HAZIR/LISTELENDI yapılamıyor, çünkü mükerrer ilan pazaryerinde cezalandırılıyor.
Etki: `prisma/migrations/20260911120000_urun_aday_katalog/`,
`app/(app)/admin/yeni-urunler/`, `lib/actions/urun-aday-actions.ts`.

### 11.09.2026 — Başlık karakter sayacı, 100 karakter sınırı
Alperen: "başlık alanına karakter sayacı koy / Trendyol'da 100 karakter limit
olduğundan 100'ü geçen başlıkları kısaltacağım."

Sayaç `72/100` yazıyor, sınır aşılınca kaç fazla olduğunu da söylüyor. Tek başına
yetmezdi: 147 başlığın **40'ı** sınırın üstünde ve hangileri olduğunu bulmak için
tek tek açmak gerekirdi. Listeye "Başlık 100+ karakter" filtresi, satırlara
karakter sayısı ve üst şeride uyarı eklendi.

Üreticinin hedefi 120'den 100'e indirildi. Bunu yaparken **kırpmanın 100'de
mükerrer başlık ürettiği** çıktı: `AS304168` "… Düz Gaga 29x10cm" ile `AS304170`
"… Kavisli Gaga 29x11.5cm" aynı başlığa iniyordu. Daha önce yalnız sondaki RENGİ
koruyordum; ayırt edici renk değil biçim+ölçüymüş. Kural genişletildi — elle
kısaltırken de aynı tuzak var, ayırt eden ek atılmamalı.

Mevcut 40 başlık ELLE kısaltılacak (Alperen'in tercihi); üretilmiş 100 karakterlik
sürümleri toplu basmak tek komut, istenirse yapılır.
Etki: `lib/urun-aday/sabitler.ts`, `app/(app)/admin/yeni-urunler/`,
`scripts/urun-basligi-uret.py`.

### 11.09.2026 — SKU düzenlenebilir, barkod puanlamadan çıktı, başlıklar dolduruldu
Alperen: "sku alanı ekle değiştirebileyim / hiçbir üründe barkod yok puanlamadan
çıkart / excelden ürün başlıklarını otomatik doldur, ben kontrol ederim."

**SKU artık düzenlenebilir.** Faturadaki kod bizim katalog kodumuz olmak zorunda
değil. Orijinal kod `fatura_sku`ya kopyalandı ve orada sabit duruyor; konteyner
kalemiyle (`cfo_yoldaki_kalem.sku`) bağ oradan kurulduğu için yeniden adlandırma
bağı koparmıyor. Benzersizlik DB'de unique, panelde anlaşılır mesaja çevriliyor.

**Barkod puanlamadan çıkarıldı.** 151 ürünün hiçbirinde barkod yok — kimsenin
sağlayamadığı bir şart herkesi eşit bloke eder, ayırt etmez. Alan formda duruyor,
sadece puana girmiyor. Boşalan 8 puan gerçekten ilanı bloke eden yerlere dağıtıldı:
kategori 8→9, açıklama 12→15, ana görsel 15→17, 3+ görsel 8→10. Toplam 100, eşik 90.

**147 başlık faturadan üretildi** (4'ünde faturada hiç metin yok — uydurulmadı,
boş bırakıldı). Üretici önce temizliyor, çeviri son çare: iç notlar (1688/video/
ödendi/koli/GTİP/CJ linki/Çince paket ölçüsü) atılıyor, TAMAMI BÜYÜK yazımlar
düzeltiliyor, Hepsiburada kuralı gereği başa "Alfas" geliyor.

İlk turda üretilenler yüklendi ama **kontrolde dört gerçek kusur çıktı ve düzeltildi**:
- `"İ".lower()` Python'da "i"+U+0307 veriyor → "Evi̇ye", "Si̇yah" gibi ~20 bozuk
  başlık. Türkçeye duyarlı dönüşüm yazıldı. (Yazarken bir de tersini yaptım:
  İ→ı, I→i. "ANTRASİT"→"Antrasıt" çıkınca yakalandı.)
- Caps düzeltmesi başlığın %75'i büyükse çalışıyordu; karışık yazımlar eşiğin
  altında kalıyordu. Artık kelime bazında.
- **120 karakterde kırpma rengi düşürüyordu** ve iki varyant AYNI başlığa iniyordu
  (TD1 Antrasit/Beyaz, 4903046045 inox/Siyah). Pazaryerinde mükerrer ilan demek.
  Kırpma artık sondaki rengi koruyor.
- Faturada satır sarması var ("… BATARYASI 4" / "FONKSİYONLU … ANTRASİT"); 2. satır
  not sayılıp atılınca üç CSF satırı aynı başlığa iniyordu. Yalnız sarkan sayı
  durumunda birleştiriliyor — diğer 7 çok satırlı kayıtta 2. satır gerçekten not.

Doğrulandı: 147 başlık, hepsi "Alfas" ile başlıyor, hiçbiri 120'yi aşmıyor,
mükerrer yok, birleşik nokta yok.

**Sırada:** puan ortalaması hâlâ 32,1 ve yalnız 1 ürün 90+. Başlık darboğaz
değilmiş. 150 üründe marka, kategori, açıklama, görsel, kutu ölçüsü ve menşei
boş. En ucuz kazanç marka (hepsi Alfas, 5 puan) ve kategori (başlıktan türetilir,
9 puan); menşei+garanti için garanti süresi şirket kararı — sorulacak.
Etki: `lib/actions/urun-aday-actions.ts`, `app/(app)/admin/yeni-urunler/`,
`prisma/migrations/20260911100000_urun_aday/migration.sql`.

### 11.09.2026 — Görsel yüklemede 404: sunucu eylemi gövde sınırı
Alperen: "yükleme limiti mi var, yeni görsel yüklediğimde site 404 veriyor."
Vardı ama benim koyduğum limit değil: Next.js sunucu eylemlerinde gövde sınırı
varsayılan 1 MB ve aşan istek sunucu koduna ULAŞMADAN reddediliyor — runtime
log'da POST kaydı olmaması teşhisi verdi. Eyleme yazdığım 10 MB anlamsızdı.

Sınırı yükseltmek tek başına yanlış çözüm olurdu (Vercel ~4,5 MB'ta keser).
Asıl çözüm istemcide küçültme: 2000 piksel + JPEG, ~300-800 KB. Pazaryerleri
zaten 2000'den fazlasını kullanmıyor. EXIF dönüklüğü, saydam PNG ve GIF
animasyonu için ayrı ayrı önlem alındı.
Etki: `next.config.ts`, `lib/urun-aday/gorsel-kucult.ts`,
`app/(app)/admin/yeni-urunler/[sku]/editor.tsx`, `lib/actions/urun-aday-actions.ts`.

### 10.09.2026 — Kayıt hatası + 07.26sea içeriği yüklendi
Alperen: "cevap veriyorum ama kaydedilemedi diyor". Sebep bendendi:
`cfo_change_log.kind` CHECK ile sınırlı ve ben listede olmayan "cevap" değerini
yazmıştım. Cevap `cfo_question`'a YAZILMIŞTI; patlayan yalnız log satırıydı — yani
kullanıcı veriyi girmediğini sandı. En kötü hata türü. kind→"teyit", ikisi tek
transaction'a alındı, catch artık hatayı yutmuyor.

`İthalatlar.xlsx`'teki `07.26sea` sayfası yüklendi: 152 kalem / 29.420 adet /
59.147 USD / 8.646 kg — dördü de kayıtlı rakamlarla birebir. Kapsam %0 → %100.
SKU'ları kırpmadan yazmışım, düzeltildi; ama kırpma sonrası da 148 SKU katalogda
yok — CFO'nun tespiti biçim sorunu değil, gerçek.

`yolda_yeterli` kuralı YANLIŞTI ve veri gelince ortaya çıktı: "tükenişten önce
gelsin" diyordu, oysa doğru kıyas yeni siparişin varışıyla yapılır. Düzeltildi ve
ilk mükerrer sipariş yakalandı — 470764214647 konteynerde 80 adet, deniz siparişi
elendi (17→16 kalem, 12.998,60→11.882,60 USD), hava köprüsü korundu çünkü hava
konteynerden 3 gün önce varıyor.
Etki: `lib/actions/cfo-row-qa.ts`, `prisma/migrations/20260911000000_cfo_yoldaki_kalem/`.

### 10.09.2026 — Kazananlar 500 hatası + yoldaki mal öneriye dahil
İki bildirim: sayfa açılmıyor, ve "ekim başı gelecek ürünler yok sayılıyor".

(1) 500 hatası bendendi: `cfo_aylik_urun_kar`'da `channel` sütunu olduğunu varsaymışım.
Sütun listesini iki tabloyu birleşik okuyup yanlış çıkarım yapmıştım; o view ürün×ay
düzeyinde ve yalnız `kanal_sayisi` tutuyor. Kanal adı `cfo_satis_birim`de. Düzeltildi.

(2) Asıl eksik yapısaldı: `cfo_yoldaki_mal` yalnız para tutuyordu, içerik hiçbir
tabloda yoktu. `cfo_yoldaki_kalem` + `cfo_yolda_sku` + `cfo_yoldaki_kapsam` kuruldu;
`cfo_ithalat_oneri` artık yoldaki malı düşüyor. `yolda_yeterli` bilerek iki koşullu:
tükenişten önce varış VE en az bir aylık satışı karşılayan adet.

07.26sea'nın faturası (`30062601_COMMERCIAL_INVOICE_40GP.xlsx`) 07.09'da cfo-files
kovasında bulundu ama proxy supabase.co'ya çıkışı kestiği için indirilemedi. Kapsam
şu an 0/152 ve sayfa bunu kırmızı uyarıyla yazıyor — eksikliği gizlemek, düzeltilen
hatanın aynısını yapmak olurdu.
Etki: `prisma/migrations/20260911000000_cfo_yoldaki_kalem/`,
`app/(app)/cfo/kazananlar/{page,import-order}.tsx`.

### 10.09.2026 — Satır bazında soru-cevap: bilgi iki yönlü akıyor
Alperen'in isteği: "eksik bilgilerinle ilgili soruları satır sonundan sor, ben de neden
bu ürünü yazmamak gerektiğini aynı yerden yazayım, bilgilerimiz bütünleşsin".

Yeni tablo açmadım: `cfo_question` zaten CFO'nun okuduğu kanal, eksik olan satır
kimliğiydi (`scope` + `entity_key` + `code`). Sorular türetilmiş — eksik kapanınca
kendiliğinden kayboluyor; cevap gelince soru metni + gerekçesi + cevap birlikte
kaydediliyor. Ürün vetosu için `cfo_urun_karar` açıldı (gerekçe zorunlu, süreli olabilir)
ve `cfo_ithalat_oneri` bunu okuyor.

Kurarken bir hata yaptım ve yakaladım: `haric` sütununu `(ka.karar = 'ALMA')` diye
yazmıştım; karar satırı olmayan ürünlerde bu NULL dönüyor ve özetteki `where not haric`
TÜM satırları eliyordu — öneri bölümü tamamen boşalmıştı. `coalesce(..., false)` ile
düzeltildi. Canlıda uçtan uca test edildi: bir kaleme "alma" denince deniz partisi
17→16 kalem, 12.998,60→12.894,87 USD oldu; karar silinince geri döndü.

`KAPSAM_UZUN` eşiğini 12 aydan 6 aya indirdim: 12 ayda bugünkü listede hiçbir satır
yakalanmıyordu (en uzun kapsam 8,0 ay) ve hiç tetiklenmeyen soru olmayan sorudur.

CFO el kitabına §6.1/§6.2 yazıldı; oturum başında işlenmemiş cevapları çekmek zorunlu
ve `karar='ALMA'` olan ürüne yeni sipariş satırı açmak yasak.
Etki: `prisma/migrations/20260910230000_cfo_satir_bilgi/`, `lib/cfo/row-qa.ts`,
`lib/actions/cfo-row-qa.ts`, `components/cfo/row-qa-panel.tsx`,
`app/(app)/cfo/kazananlar/{page,import-order}.tsx`, `docs/CFO-GOREV.md`.

### 10.09.2026 — Servet gerçek stoktan hesaplanıyor, kokpit bağlandı
CFO servet veri katmanını kurdu (`cfo_servet`, `cfo_servet_kalem`, `cfo_stok_deger`,
`cfo_yoldaki_mal`, `cfo_servet_likidite`); kokpite bağlama işi bu tarafa verilmişti.

Önce doğrulama: kokpitteki 13.130.432,65 TL'lik stok satırının **on bir ardışık
snapshot boyunca kuruşu kuruşuna sabit** kaldığı `cfo_snapshot` üzerinden teyit
edildi. Kök neden `lib/cfo/engine.ts`: stok = `cfo_settings.stockCostUsd` (elle
girilmiş 100.000 USD) × kur. CFO'nun bütün rakamları tek tek doğrulandı ve tuttu —
aynı gün eski yöntem 8.970.674 TL, yeni yöntem 5.946.316 TL, fark −%33,7.

Yapılanlar: `lib/cfo/wealth.ts` (tek yükleyici), `app/(app)/cfo/wealth-section.tsx`
(manşet + kalem dökümü + likidite + yoğunlaşma), kokpitin eski servet kartı ve
sabit-tabanlı stok KPI'si kaldırıldı, `takeCfoSnapshotAction` görünüme bağlandı,
engine'in sabit-tabanlı alanlarına uyarı yazıldı, ayarlar sayfasında sabitler
"eski" olarak etiketlendi.

Şartnamenin ötesinde bulunan: (1) **AL-CAM03**, "satış kanıtı yok, maliyetle"
satırının **%91,1'i** (726.045 / 797.342 TL) — ve bu ürün zaten ölü stok olarak
biliniyor (Amazon kamera seti ilanı bunu eritmek için açılmıştı). Yani servetin bu
satırı fiilen tek bir ölü stok kalemi. (2) Likidite dilimlerinde 66 ürün "satmıyor"
sayılıyor ama yalnız 7'sinde maliyet var; kalan 59 ürün (317 adet) sıfır değerle
duruyor — kalem açıklamasındaki "7 SKU" ile likidite tablosundaki "66 ürün" aynı
tutarı anlatıyor, arayüzde bu ayrım yazıldı.
Etki: `lib/cfo/wealth.ts`, `app/(app)/cfo/{page,wealth-section}.tsx`,
`lib/actions/cfo-actions.ts`, `lib/cfo/engine.ts`, `app/(app)/cfo/ayarlar/page.tsx`,
`prisma/migrations/20260910200000_cfo_servet/`.

### 10.09.2026 — İthalat sipariş önerisi tek sayfada toplandı
"Sıradaki siparişte ne alalım?" sorusu panelde **sekiz** ayrı yerde, sekiz ayrı
hesapla cevaplanıyordu (import-cockpit, import-decisions, procurement, capital,
ithalatçı görünümü, sermaye-sağlık, executive, dashboard). Hepsi Trendyol
satışından kendi başına türetiyordu; hiçbiri CFO'nun fiilen karar verdiği parti
defterini (`cfo_order_batch` / `cfo_order_line`) okumuyordu — sayfa başına farklı
cevap çıkıyordu.

Karar tek yere alındı: `/cfo/kazananlar` → "İthalat sipariş önerisi". Üç yeni view
(`cfo_ithalat_oneri`, `cfo_ithalat_oneri_ozet`, `cfo_ciro_hedef`) ve kurallar
`cfo_settings`'e taşındı (hava termini 22 gün, deniz 67 gün, min ithalat 10.000 USD,
min satır adedi 5, hedef aylık ciro 100.000 USD).

Kaldırılanlar: `/admin/procurement` ve `/admin/import-decisions` emekliye ayrıldı
(yönlendirme sayfası bırakıldı, menüden çıkarıldı); `/admin/capital` "Satın alma
önerileri" tablosu, `/admin/executive` "Tedarik Aciliyeti" kartı,
`/admin/sermaye-saglik` "Acil Sipariş" listesi ve `lib/smart-recommendations.ts`
"acil sipariş" satırları kaldırıldı. `/admin/import-cockpit` ve ithalatçı görünümü
KALDI — onlar ürün bazında maliyet/navlun analizi, sipariş listesi değil; kokpite
bu ayrımı yazan bir açıklama şeridi eklendi.

Şartnamenin ötesinde eklenenler: (1) **nakit kapısı** — tavsiye tarihi stok
ihtiyacı ile nakdin oluştuğu tarihin geç olanıdır; kapı hiç açılmıyorsa tarih
uydurulmaz, açık yazılır (bugün her iki parti de böyle: hava 491.489 TL / deniz
630.432 TL gerekiyor, 28.12'ye kadarki en yüksek projeksiyon 305.098 TL).
(2) **hava köprüsü** rozeti — 4 SKU hem hava hem deniz listesinde; bu mükerrer
değil, kasıtlı. (3) **gecikme** sayacı — 29 kalemin 28'inde en geç sipariş tarihi
geçmiş. (4) **maliyet eksik** rozeti — 2 deniz kaleminde birim maliyet yok, parti
toplamı olduğundan düşük görünüyor. (5) Ciro hedefi paneli, bu partilerin ciroyu
büyütmediğini, mevcut 17.694 USD/ay'lık kısmı koruduğunu açıkça yazıyor.
Etki: `prisma/migrations/20260910120000_cfo_ithalat_oneri/`, `prisma/schema.prisma`,
`app/(app)/cfo/kazananlar/{page,import-order}.tsx`,
`components/cfo/import-order-pointer.tsx`, `app/(app)/layout.tsx`, ve yukarıdaki
6 sayfa + `lib/smart-recommendations.ts`.

### 10.09.2026 — CFO / Ayın Kazananları sayfası
CFO veri katmanını kurdu (`cfo_ay_kazanan` dondurulmuş tablo + `cfo_ay_kazanan_ozet`,
20 ay geriye doldurulmuş) ama ekran yoktu. Sayfa yazıldı: ay seçici, ilk 10 tablosu,
aylık seyir. Şartnameye üç ekleme yapıldı — CFO raporunda olmayan bulgular:
(1) `oran_guveni` satır bazında gösteriliyor; Ağustos'ta ilk 10 kârının %76,8'i
ölçülmemiş kanal oranına dayanıyor (Mayıs'ta %23,4 idi — ölçüm kalitesi düşmüş).
(2) Kapsam %14,9→%98,6 arasında değiştiği için aylar karşılaştırılamaz; zayıf aylar
soluk ve uyarı metni bunu açıkça söylüyor. (3) Toplam kâr negatif olan aylarda "pay"
yüzdesi anlamsız olduğu için sütun gizleniyor.
Etki: `app/(app)/cfo/kazananlar/page.tsx`, `app/(app)/layout.tsx`,
`components/dashboard/sidebar.tsx`.

### 10.09.2026 — Ödeme Takvimi: defter denetimi rozeti
CFO `cfo_defter_denetim()` fonksiyonunu kurdu (10 kontrol) ama yalnız sabah
koşusunda çalışıyordu. Sayfaya bağlandı: en üstte, rakamlardan önce. Temizse tek
satır, bulgu varsa açılır liste + ne yapılacağı. Sadece `YESIL` temiz sayılıyor;
bilinmeyen seviye kırmızı muamelesi görür. Sayfadaki ayrı bayat-bakiye uyarısı
kaldırıldı (denetimin `BAYAT_BAKIYE` kontrolüyle mükerrerdi); bakiyenin yaşı alt
notta her durumda yazıyor — eskiden "bugün itibarıyla" diyordu, bu yanlıştı.
Etki: `app/(app)/cfo/odemeler/audit-panel.tsx`, `app/(app)/cfo/odemeler/page.tsx`.

### 10.09.2026 — Ödeme Takvimi: işaretleme parayı yok ediyordu
Alperen bildirdi: "tahsil edildi"ye tıklayınca o günün ve sonraki günlerin gün sonu
bakiyesi düşüyor. Doğruydu. Görünüm `where odendi = false` filtresiyle çalıştığı için
işaretlenen satır projeksiyondan siliniyor, ama karşılığı banka bakiyesine
eklenmediği için para ortadan kayboluyordu. Yürüyen bakiye artık `odendi` alanına
bakmıyor; işaretleme salt muhasebe kaydı. Gerçek satırda toggle edilip 7 günün
7'sinde farkın 0 olduğu doğrulandı, test satırı geri alındı.
Etki: `prisma/migrations/20260910000000_cfo_odeme_takvimi/migration.sql` (4. bölüm),
`app/(app)/cfo/odemeler/*`.

### 10.09.2026 — CFO / Ödeme Takvimi + gün sonu bakiye hatası
CFO üç görünüm kurmuştu (`cfo_yaklasan_odeme`, `cfo_odeme_gunluk`, `cfo_nakit_dibi`)
ama bunlar yalnız canlı veritabanındaydı, repoda karşılığı yoktu. Üçü de migration'a
alındı ve **`cfo_odeme_gunluk.gun_sonu_nakit` hesap hatası düzeltildi**: gün sonu
bakiyesi `min(kalan_nakit)` ile hesaplanıyordu; bu gün içi en dip noktayı verir, gün
sonunu değil. Günün son hareketi giriş olan her günde bakiye olduğundan düşük
görünüyordu (17.09.2026 gerçek +51.560 TL iken görünüm −90.705 TL diyordu). Doğru
formül: açılış bakiyesi + kümülatif net. Gün içi dip bilgisi `gun_ici_dip` sütununa
alındı, silinmedi.
Sayfa yazıldı: gün gün kartlar, yürüyen bakiye, çıkış/giriş ayrımı, tahmini kayıtlar
soluk, satır başına tek dokunuş "Ödendi/Tahsil edildi" (geri alınabilir, ikisi de
`cfo_change_log`'a yazar), 30/60/90/tümü ufku. Şartnameye üç ekleme yapıldı:
kullanılabilir KMH kapasitesi (nakit tek başına yanlış alarm veriyor), bayat bakiye
uyarısı (yürüyen bakiyenin tamamı açılış bakiyesine dayanır) ve geri alma.
Etki: `prisma/migrations/20260910000000_cfo_odeme_takvimi/`,
`app/(app)/cfo/odemeler/*`, `lib/actions/cfo-payment-actions.ts`,
`app/(app)/layout.tsx`, `components/dashboard/sidebar.tsx`.

### 29.08.2026 — CFO / Ölü Stok sayfası
CFO veri katmanını kurmuştu (`cfo_olu_stok`, `cfo_olu_stok_ozet` görünümleri +
`cfo_dead_stock_finding`'e alarm/kontrol kolonları) ama deploy edemiyordu. Sayfa
yazıldı ve canlıya alındı: üst şerit, bağlı sermayeye göre sıralı tablo, satır
başına üç aksiyon (kontrol/aksiyon/kapat) ve aylık "temizlenen sermaye" tablosu.
Etki: `app/(app)/cfo/olu-stok/*`, `lib/actions/cfo-dead-stock-actions.ts`,
`app/(app)/layout.tsx`.

### 28.08.2026 — CFO disiplin altyapısı + görev tanımı repoya taşındı
Günlük CFO Routine'i incelendi: çok iş üretiyor (4 günde 470 log, maliyet kapsamı
1→76) ama üç yerde tıkalıydı — snapshot tablosu boş (zaman serisi yok), 31 adayın
0'ı karara bağlanmış, log `area`'sında 63 değer. Üçü için altyapı kuruldu:
`cfo_take_snapshot()` + delta görünümleri, `cfo_gecikmis_karar` kuyruğu, iki eksenli
log taksonomisi (`area` konu + `kind` tür, ikisi de CHECK'li). Ajanın elle açtığı iki
tablo migration'a alındı. Görev tanımı `docs/CFO-GOREV.md`'ye taşındı.
Etki: `prisma/migrations/20260828000000_cfo_disiplin/`, `prisma/schema.prisma`,
`lib/actions/cfo-actions.ts`, `docs/CFO-GOREV.md`.

### 27.08.2026 — Storage anahtar rolü doğrulaması (anon ≠ service_role)
`Invalid Compact JWS` düzeltildikten sonra yükleme RLS'e takıldı: girilen anahtar
`anon` rolündeydi. `getStorageConfig()` artık JWT payload'ından `role` okuyup
`service_role` değilse isteği göndermeden açıklayıcı hata veriyor.
Etki: `lib/storage/supabase-storage.ts`.

### 27.08.2026 — Storage "Invalid Compact JWS" çözümü
Production'a `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` eklendi ama Storage
`Invalid Compact JWS` döndü: yeni format (`sb_secret_…`) anahtar, Storage'ın
beklediği JWT değil. Ortak `lib/storage/supabase-storage.ts` modülü yazıldı —
değer temizleme (tırnak/boşluk), biçim doğrulama, anlaşılır hata çevirisi.
CFO soru ekleri + ürün görselleri aynı modüle bağlandı. Kalıcı düzeltme için
Vercel'e Legacy API keys altındaki `service_role` JWT'si (`eyJ…`) girilmeli.

### 27.08.2026 — CFO Not Defteri (`/cfo/defter`) + soru limiti kaldırıldı
- Soru defterindeki 20 açık soru limiti kaldırıldı; sıralama `priority` ile yapılıyor.
- Yeni `cfo_note` tablosu ve `/cfo/defter` sayfası: cevaplardan çıkan kalıcı bilgiler,
  güvenilirlik etiketi, sabitleme, gözden geçirme tarihi, arşivleme (silme yok).
- Etki: `lib/cfo/questions.ts`, `lib/actions/cfo-question-actions.ts`,
  `lib/actions/cfo-note-actions.ts`, `app/(app)/cfo/sorular/page.tsx`,
  `app/(app)/cfo/defter/*`, `app/(app)/layout.tsx`, `prisma/schema.prisma`.

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
- ~~**Bekleyen:** migration production'a **uygulanmadı** — kullanıcı onayı bekliyor.~~
  **Güncel (18.09.2026):** uygulandı. `_prisma_migrations` kaydı
  `20260909220000_trendyol_finance`, `finished_at = 2026-09-09 19:12`.

### 2026-08-25 — CFO/Borçlar: kalan taksit, bitiş tarihi, YKB şahsi hesap
- `app/(app)/cfo/borclar/page.tsx` — Krediler tablosuna "Kalan taksit" ve
  "Bitiş tarihi" kolonları; TOPLAM satırına aktif kredilerin en geç bitiş tarihi.
- `lib/cfo/engine.ts` — `remainingInstallments()` yardımcısı; `LoanRow`'a
  `totalInstallments` + `remainingOverride`.
- `prisma/schema.prisma` + `prisma/migrations/20260825000000_cfo_loan_installments`
  — iki nullable INTEGER kolon (additive).
- `prisma/seed-cfo.ts` — banka ve kredi listeleri canlı veriyle hizalandı;
  seed'in kopya kayıt üretme ve KMH limitlerini geri alma riski giderildi.
- DB: Yapı Kredi Alperen (şahsi) hesabı eklendi (KMH 150.000, bakiye bilinmiyor).

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
### 2026-07-16
- **Satış / ciro düşüşü analizi (`docs/SATIS-DUSUS-ANALIZI.md`):**
  - Kaynak `docs/urunler.xlsx` → `raw_ciro` (3.643 ürün, tüm-zaman + ürün-başı son
    satış tarihi). Bulgu: düşüşün kök nedeni **(a)** tarihi hero ürünlerin stok 0'a
    düşüp yeniden alınmaması (top-20 cironun %52'si / 15,2M TL sessiz) ve **(b)** yeni
    ürün girişinin çökmesi (ayda ~30 → 2026-04'te 1).
  - Ek bulgular: ciro top-100'de %69 yoğunlaşmış; kanal Trendyol+HB %87; tüm-zaman
    cironun %63'ü 60+ gündür satmıyor.
  - Öneriler: ölü hero'ları ikmal, yeni-ürün motorunu yeniden çalıştır, kanal
    çeşitlendir, ölü stok erit, "hero stok 0 / 30+ gün satış yok" erken-uyarı paneli.
  - **Veri sınırı belgelendi:** kesin aylık ciro serisi xlsx'te yok (`Malidurum` boş);
    kesin "bu ay vs geçen yıl" için DB `MarketplaceSalesRecord.orderDate` gerekli —
    bu oturumda `execute_sql` onayı alınamadı, DB açılınca seri eklenecek.


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
    `scripts/pdks/apply_tenant_subscription.sql`). ~~**Not:** MCP onay aksaklığı
    nedeniyle canlı DB'ye HENÜZ uygulanmadı; uygulanınca main'e promote edilecek.~~
    **Güncel (18.09.2026):** uygulandı — defter kaydı
    `20260625230000_pdks_tenant_subscription` mevcut.
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

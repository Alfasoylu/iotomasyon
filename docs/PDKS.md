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

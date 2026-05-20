# Ürün Kataloğu — Sektör Odaklı Aksiyon Planı (v3 — Onaylı)

**Tarih:** 2026-05-20
**Sahibi:** Alfa Soylu Elektronik
**Hedef:** Satış temsilcisi telefon görüşmesi sonrası müşteriye sektör-odaklı PDF/web katalog gönderir; müşterinin reaksiyonu (açılma, ürün ilgisi, geri dönüş) otomatik takip edilir.

---

## 0.5 Onaylanan Kararlar (2026-05-20)

| # | Karar | Sonuç |
|---|---|---|
| 1 | Faz sıralaması: 2 → 1 → 4 → 3 → 5 → 6 | ✅ Onaylı |
| 2 | Sektör haritası (12 sektör, §2) | ✅ Onaylı (genişletilebilir) |
| 3 | Şema yaklaşımı: Hard-coded A → DB-based B migration | ✅ Onaylı |
| 4 | **ProductBundle MVP'de?** | 🟡 **Yargı çağrısı:** Faz 3'e atıldı. MVP'de sektör kataloğu zaten "paket teklif" hissi veriyor. |
| 5 | **MVP scope** | 🟡 **Yargı çağrısı:** Faz 2 + Faz 1 + **Faz 4** (public link). WhatsApp paylaşımı core value; PDF tek başına yarım kalır. |
| 6 | SALES rolüne wholesale erişimi | ❌ **HAYIR** — sadece ADMIN. SALES `retail` + `hidden` modlarına erişebilir. |
| 7 | B2B watermark stratejisi | ❌ Kaldırıldı — yetki matrisi (madde 6) zaten leak'i önlüyor |
| 8 | Public katalogta lead capture form | ❌ Kaldırıldı — sadece "İlgilendim" işareti yeterli |
| 9 | Faz 6 (performans raporu) zamanlaması | ✅ **Hemen** — Faz 4 ile birlikte yayında |

### ⚡ Yeni kritik kural: Katalog fiyatları **USD + KDV hariç**

- Sales rep ne TRY ne KDV-dahil görür — sadece **USD net** fiyat
- Mevcut TRY alanları (`sellingPriceTry`, `wholesalePriceTry`) quote sistemi için kalır
- Katalog için **yeni USD alanları** Product şemasına eklenir (bkz. §3.3)
- PDF'te fiyat formatı: **"$X.XX (KDV hariç)"**
- Public link'te de aynı: **"$X.XX net"**

---

## 0. Vizyon — Firma Sahibi Bakışı

Sales rep bir bayi/montaj müşterisini arar. Müşteri _"Bana kataloğunuzu gönderir misiniz?"_ der. Üç gerçek senaryo:

1. **Güvenlik bayisi** (toptan alacak): _"IP kamera + NVR fiyat listesi lazım, marjıma yer var mı?"_ → **toptan fiyatlı katalog**
2. **Restoran/Cafe** (tek seferlik montaj): _"4-8 kamera kurabilirsiniz mi, ne kadara olur?"_ → **fiyatlı paket kataloğu**
3. **Nalbur/elektronik mağazası**: _"Önce ne sattığınızı görelim, fiyat sonra konuşuruz"_ → **fiyatsız ürün kataloğu**

**Genişletilmiş vizyon:**
- Sales rep kataloğu sadece "gönderip unutmaz" — sistem **müşterinin açma zamanını, hangi ürüne uzun baktığını, hangi ürünleri istediğini** kayıt altına alır.
- Müşteri kataloğu açtıktan 24 saat sonra otomatik **takip görevi** sales rep'e atanır ("Ahmet bey kataloğu dün açtı, ara").
- Müşteri **kataloğun içinden "ilgilendim" işaretlerse**, otomatik `ProductInterest` oluşur ve quote'a hazırlık başlar.

Her birine aynı PDF'i göndermek yanlış. Plan, sektöre göre içerik + fiyat görünürlüğü + kişiselleştirme katmanları sunar.

---

## 1. Mevcut Durum — Veri Realiteleri

### 1.1 Kategori dağılımı (canlı DB sorgusu sonucu)

| Kategori | Ürün | Aktif stokta | Ort. satış ₺ |
|---|---|---|---|
| **CCTV & Kamera Sistemleri** | 104 | **78** | henüz boş |
| Bilgisayar Çevre Birimi | 148 | 76 | henüz boş |
| Akıllı Ev & IoT | 81 | 4 | henüz boş |
| Metal Dedektörü & Güvenlik | 17 | 8 | 6.800 ₺ |
| Telsiz & Haberleşme | 23 | 5 | 1.299 ₺ |
| Audio, Amfi & Hoparlör | 42 | 8 | henüz boş |
| Aydınlatma & LED | 41 | 1 | henüz boş |
| Diğer (28+ kategori) | ~600 | ~50 | henüz boş |

### 1.2 ⚠️ Kritik kısıtlar

| Kısıt | Etki | Çözüm |
|---|---|---|
| Ürünlerin %95+'ında `sellingPriceTry` boş | Fiyatlı katalog mümkün değil | **Faz 2 önce** — fiyat doldurma kritik |
| `imageUrl` doluluk durumu test edilmedi | Görselsiz katalog = zayıf | Yedek: kategori varsayılan ikon |
| Trendyol/Hepsiburada SKU ile iç SKU farklı | Müşteri "şu ürün" derse karışıklık | İç SKU + pazaryeri SKU çift göster |
| Sektör=null müşteri (yeni eklenen) | Hangi katalog? | Fallback: "Genel Katalog" — fiyatsız |

### 1.3 Mevcut altyapı (reuse edilecek)

| Mevcut | Faz | Nasıl kullanılır |
|---|---|---|
| `pdf-lib` + Geist font + logo embed | Quote PDF (Soylu logo) | Katalog PDF generator template |
| `Industry` hiyerarşisi (5 grup, 23 alt-sektör) | Phase 99 | Sektör → katalog profili eşleştirme |
| `MessageTemplate` (WhatsApp şablonları) | Phase 96d | `{{katalog_linki}}` değişkeni eklenir |
| `markCustomerContactedAction` | Phase 95 | Katalog gönderildiğinde otomatik lastContactedAt |
| `customer.timelineEntries` | Phase 94 | "Katalog gönderildi: X" event eklenir |
| `ProductInterest` | Phase 7 | Müşteri katalogtan ilgi işaretlerse otomatik kayıt |
| `CategoryInterest` | Phase 7 | Müşterinin geçmiş ilgisi → katalog kişiselleştirme |
| `Product.tags` + `brand` | Schema | Marka bazında filtre |

---

## 2. Sektör → Katalog Eşleştirmesi

Phase 99'da kurulan `Industry` hiyerarşisini kullanıyoruz:

| Industry (alt sektör) | Hedef katalog | İçerik | Fiyat görünürlüğü |
|---|---|---|---|
| **Güvenlik Sistemi Tedarikçisi** | _Bayi Toptan Kataloğu_ | CCTV (tüm) + Telsiz + Metal Dedektör + Akıllı Ev | Toptan ₺ |
| **Güvenlik Sistemi Kurulum** | _Kurulumcu Kataloğu_ | CCTV + kablolama aksesuar + Akıllı Ev kit | Toptan ₺ |
| **Güvenlik Şirketi** | _Kurumsal Güvenlik_ | Üst seviye IP kameralar + NVR + erişim kontrol | Toptan ₺ |
| **Bilgisayar Güvenlik Hizmetleri** | _Bilişim Bayi_ | CCTV + Bilgisayar Çevre Birimi + Akıllı Ev | Toptan ₺ |
| **Nalbur / Yapı Marketi** | _Nalbur Hızlı Satış_ | Popüler AHD/IP + DVR + alarm | Toptan ₺ |
| **Elektronik Mağaza** | _Mağaza Tezgah Ürünleri_ | Hazır kameralar + perakende kit | Toptan ₺ + perakende ₺ |
| **Bilgisayar Servisi** | _IT Servisi Ürünleri_ | CCTV starter + Bilgisayar Çevre Birimi | Toptan ₺ |
| **Elektrikçi** | _Elektrikçi Aksesuar_ | Aydınlatma + kameralar + güç kaynağı | Toptan ₺ |
| **Restoran / Cafe** | _Restoran Güvenlik Paketi_ | 4-8 kamera mini set + alarm | Perakende ₺ + paket fiyat |
| **Site Yönetimi** | _Site Güvenlik Paketi_ | IP PTZ + NVR + access | Perakende ₺ + paket fiyat |
| **Otel / Pansiyon** | _Otel Güvenlik Çözümü_ | IP backbone + NVR + room access | Perakende ₺ + paket fiyat |
| **Ofis / İşyeri** | _Ofis Güvenlik Paketi_ | Mini IP set + alarm | Perakende ₺ + paket fiyat |

**Genel kural:**
- **B2B (Bayi)** → toptan fiyatlı, geniş ürün yelpazesi (50-100 ürün)
- **Installation (Montaj)** → perakende fiyatlı + paket çözüm (10-20 ürün + 2-3 paket)
- **Sektör fark etmez** modu: sadece "fiyat için iletişime geçin" → sektör seçilmediğinde fallback

---

## 3. Tasarım Kararları

### 3.1 PDF formatı + Sayfa yapısı

**Mevcut altyapı reuse:** `pdf-lib` + Geist font + logo embed (quote PDF'inde çalışıyor)

**Sayfa yapısı (yukarıdan aşağı):**

1. **Kapak sayfası**
   - Üstte turuncu accent şerit (brand)
   - Merkezde firma logosu
   - Sektörel başlık: "Güvenlik Bayileri için Ürün Kataloğu — 2026"
   - Hedef müşteri adı (kişiselleştirme): "Hazırlayan: Alfa Soylu Elektronik · Müşteri: {Müşteri Adı}"
   - Hazırlama tarihi + geçerlilik tarihi
   - Sektör-spesifik hero image (CCTV bayisi için kamera fotoğrafı, restoran için tezgah fotoğrafı)
   - Alt: WhatsApp + telefon + email iletişim bilgileri

2. **Kapak notu (opsiyonel, sales rep kişisel mesaj)**
   - "Ahmet Bey merhaba, dün görüşmemizden sonra kataloğumuzu hazırladık. AHD ürünlerinde özel marjlarımız var." gibi serbest metin
   - Sales rep modal'da yazar, PDF'in kapak sayfasından sonra render edilir

3. **İçindekiler tablosu (TOC)**
   - Kategori adı + sayfa numarası
   - Sayfa numaraları sağ alt köşede (Sayfa X / Y)

4. **Kategori bölümleri** (her kategori için ayrı sayfa grupları)
   - Bölüm başlığı sayfa üstünde turuncu underline
   - Ürün gridi: 4 ürün/sayfa (görsel + ad + SKU + açıklama + fiyat)
   - Stok rozeti: yeşil "Stokta" / gri "Sipariş üzerine"
   - Marka rozeti (Hikvision/Dahua/Avocon vb.) eğer Product.brand doluysa

5. **Paket çözümler bölümü** (sadece Installation segmenti)
   - "4 Kameralı Restoran Paketi" gibi kompozit ürünler
   - Paket içeriği + indirimli toplam + ayrı ayrı alış fiyatı karşılaştırması

6. **Ödeme & Teslimat şartları**
   - Banka IBAN bilgisi (mevcut quote PDF reuse)
   - Standart teslimat süresi: "Stoklu ürünlerde 1-3 iş günü"
   - Garanti: 2 yıl üretici garantisi
   - Fiyat/KDV: **"Tüm fiyatlar USD bazındadır ve KDV hariçtir."** (sabit, override yok)
   - Faturalama: "Türk Lirası karşılığı, fatura kesim günündeki TCMB döviz kuru üzerinden hesaplanır."

7. **Kapanış sayfası (CTA)**
   - "Hemen sipariş için: WhatsApp / Telefon"
   - "Bu kataloğun web versiyonu: {public_link}"
   - Geçerlilik: "Bu fiyatlar {validityDate} tarihine kadar geçerlidir"
   - KDV notu: "Tüm fiyatlar USD bazındadır ve KDV hariçtir. KDV: %20 (genel oran)."

**PDF teknik özellikleri:**
- Boyut: A4 portrait (210x297mm)
- Maksimum sayfa: 60 (WhatsApp 16MB limit için)
- Resim sıkıştırma: 200x200px, JPEG quality 70
- Font embed: Geist Regular (mevcut)
- Sayfa numarası: alt orta, "Sayfa X / Y" formatı
- PDF metadata: Title=Müşteri+Sektör, Author=Sales Rep, Subject=Ürün Kataloğu

### 3.2 Şema değişikliği — Yaklaşım

**Yaklaşım A — Hard-coded mapping (MVP, hızlı):**
```ts
// lib/catalog-mapping.ts
export const CATALOG_PROFILES: Record<string, CatalogProfile> = {
  "guvenlik-sistemi-tedarikcisi": { categories: [...], priceMode: "wholesale", coverTitle: "..." },
  ...
};
```

**Yaklaşım B — DB profili (Faz 5'te taşı):**
```prisma
model Industry {
  ...mevcut...
  catalogIncludeCategorySlugs String[]  // "cctv-kamera-sistemleri", ...
  catalogPriceMode String?              // "wholesale" | "retail" | "hidden"
  catalogCoverTitle String?
  catalogHeroImageUrl String?           // sektörel kapak görseli
}
```

**Yaklaşım C — Yeni `Catalog` modeli (önerilmez, over-engineering):**
Statik DB kaydı dinamik üretim ile çakışır.

**Karar: Yaklaşım A ile başla → Faz 5'te B'ye taşı.**

### 3.3 Yeni şemalar (Faz 2 + Faz 3 + Faz 4 için)

```prisma
// Faz 2: USD net fiyat (KDV hariç) — katalog için yeni alanlar
model Product {
  // ...mevcut alanlar (sellingPriceTry, wholesalePriceTry vb. dokunulmaz — quote için)...

  // YENİ — katalog özel, USD net, KDV hariç
  wholesalePriceUsd  Decimal? @db.Decimal(12, 2)  // Bayi katalog fiyatı
  retailPriceUsd     Decimal? @db.Decimal(12, 2)  // Son müşteri katalog fiyatı
  // NOT: KDV `vatRate` mevcut alanından okunur, fiyatlara dahil değildir.
}

// Faz 3: Paket çözümler
model ProductBundle {
  id              String   @id @default(cuid())
  name            String   // "Restoran 4 Kamera Standart Paket"
  description     String?
  targetIndustry  String?  // "restoran-cafe" — null ise tüm sektörler
  items           ProductBundleItem[]
  bundlePriceTry  Decimal? // Paket toplam (indirimli)
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  @@index([targetIndustry])
}
model ProductBundleItem {
  bundleId  String
  productId String
  quantity  Int @default(1)
  bundle    ProductBundle @relation(fields: [bundleId], references: [id], onDelete: Cascade)
  product   Product       @relation(fields: [productId], references: [id], onDelete: Cascade)
  @@id([bundleId, productId])
  @@index([productId])
}

// Faz 4: Public link + analytics
model CatalogShare {
  id              String   @id @default(cuid())
  token           String   @unique // /c/{token} public route
  customerId      String
  sentById        String   // Sales rep userId
  profileSlug     String   // "guvenlik-sistemi-tedarikcisi"
  priceMode       String   // "wholesale" | "retail" | "hidden"
  coverNote       String?  // Sales rep'in kişisel mesajı
  expiresAt       DateTime
  viewCount       Int      @default(0)
  firstViewedAt   DateTime?
  lastViewedAt    DateTime?
  productInterests CatalogProductInterest[]
  createdAt       DateTime @default(now())
  customer        Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  sentBy          User     @relation(fields: [sentById], references: [id], onDelete: SetNull)
  @@index([token])
  @@index([customerId])
  @@index([sentById])
}

// Müşteri kataloğun içinden "ilgilendim" işaretlerse
model CatalogProductInterest {
  id            String   @id @default(cuid())
  catalogShareId String
  productId     String
  action        String   // "INTERESTED" | "ADD_TO_CART" | "VIEWED_LONG"
  createdAt     DateTime @default(now())
  share         CatalogShare @relation(fields: [catalogShareId], references: [id], onDelete: Cascade)
  product       Product      @relation(fields: [productId], references: [id], onDelete: Cascade)
  @@index([catalogShareId])
  @@index([productId])
}
```

### 3.4 Fiyatlama detayı (revize — v3, USD + KDV hariç)

| Mod | Hangi alan | Kim için | Format |
|---|---|---|---|
| `wholesale` | `Product.wholesalePriceUsd` | B2B bayi | **"$X.XX (KDV hariç)"** |
| `retail` | `Product.retailPriceUsd` | Installation / son müşteri | **"$X.XX (KDV hariç)"** |
| `hidden` | — | Yeni müşteri (sektör=null) | "Fiyat için iletişime geçin" |

**Tüm fiyatlar USD + KDV hariç.** TRY hiçbir yerde gösterilmez. KDV not olarak en altta yazılır: _"Tüm fiyatlar USD bazındadır ve KDV hariçtir. KDV oranı: %20 (genel)."_

**Boş fiyatlı ürünler:**
- `wholesale` mode'da `wholesalePriceUsd` null ise ürün katalogtan **otomatik dışlanır**
- `retail` mode'da `retailPriceUsd` null ise dışlanır
- `hidden` mode'da hepsi gösterilir (fiyat satırı boş)

**Kur değişimi:** USD net fiyat sabittir, gönderim anında snapshot alınmaz — müşteri katalogta gördüğü USD fiyat 30 günlük geçerlilik içinde aynı kalır.

### 3.5 Kişiselleştirme (yeni — v2)

Müşterinin **geçmiş `CategoryInterest` ve `ProductInterest`** kayıtlarına göre:

1. **Ürün sıralama:** Müşterinin geçmişte ilgilendiği kategoriler katalog başına alınır
2. **Vurgulu ürünler:** Müşterinin önceden ilgilendiği spesifik ürünler "⭐ Geçmişte İlgilendin" rozet ile işaretlenir
3. **Özel teklif önerileri:** Müşterinin `tags` alanında `wa-grup` varsa "WhatsApp Grubu Özel İndirim" notu eklenir
4. **Mevcut tedarikçi rekabeti:** `Customer.currentSupplier` doluysa (örn. "Hikvision"), katalogta o markanın alternatifleri "🆚 Karşılaştırma" işaretli

### 3.6 Marka filtresi (yeni — v2)

Modal'da ekstra opsiyon: **"Sadece bu markalardan göster"** multi-select
- `Product.brand` distinct değerlerden çekilir
- Kullanım: "Müşteri Hikvision istedi, sadece Hikvision ürünlerinden katalog yap"
- Boş bırakılırsa tüm markalar dahil

### 3.7 Görseller + fallback

- `Product.imageUrl` varsa kullanılır (CDN URL bekleniyor)
- Yoksa kategori bazlı default SVG ikon (`public/category-icons/cctv.svg`, vs.)
- Boş resimli ürün için "📷 Resim yakında" placeholder

### 3.8 Yetkilendirme (yeni — v2)

| Rol | Erişim |
|---|---|
| **ADMIN** | Tüm katalogları üretebilir, herhangi bir profili + tüm fiyat modlarını (wholesale/retail/hidden) seçebilir |
| **SALES** | Kendi atadığı müşterilere katalog üretebilir, **`wholesale` modu YOKTUR** — sadece `retail` veya `hidden` seçebilir |
| **OPERATIONS** | Katalog üretemez (görür ama buton disabled) |
| **MARKETPLACE_OPERATOR** | Erişim yok |
| **WAREHOUSE** | Erişim yok |

İki permission eklenir:
- `CATALOGS_CREATE` — ADMIN + SALES
- `CATALOGS_WHOLESALE_MODE` — sadece ADMIN

Bu sayede bayi toptan fiyat sızıntısı yapısal olarak engellenir (watermark gerekmez).

### 3.9 Sales rep kişisel mesaj (cover note)

Modal'da textarea (max 500 karakter):
- _"Ahmet Bey, dün görüşmemizden sonra kataloğumuzu hazırladık. AHD ürünlerinde özel marjlarımız var, ek olarak DVR seçeneklerimizi de eklediğim sayfaya bakabilirsiniz. Sorularınız için 0850 307 7397'den ulaşabilirsiniz."_

PDF kapak sonrası sayfada `Geist` regular ile render edilir.

---

## 4. Faz Planı — PR'lara Bölünme

### **Faz 2 (önce) — USD net fiyat doldurma** (4-5 saat, 1 PR)

**Çıktı:** Admin **USD + KDV hariç** toptan ve perakende fiyatlarını toplu girer.

**Schema değişikliği:**
```prisma
model Product {
  wholesalePriceUsd  Decimal? @db.Decimal(12, 2)  // Bayi katalog fiyatı (USD net)
  retailPriceUsd     Decimal? @db.Decimal(12, 2)  // Son müşteri katalog fiyatı (USD net)
}
```

**İçerik:**
- `/admin/product-pricing` yeni sayfa — sadece **USD alanları** için inline edit
- Tablo kolonları: Görsel · SKU · Ad · Kategori · `unitCostUsd` (mevcut) · **`wholesalePriceUsd` (yeni)** · **`retailPriceUsd` (yeni)** · Marj %
- Filtre: "Sadece USD fiyatı boş olanlar" + kategori + marka
- Kategori bazında toplu marj uygulama: "Tüm aktif CCTV: `unitCostUsd × 1.25 = wholesale`, `wholesale × 1.30 = retail`"
- CSV import şablonu: `sku, wholesalePriceUsd, retailPriceUsd`
- Migration: `wholesalePriceUsd` + `retailPriceUsd` alanları + index'siz (büyük write yok)
- **Validation:** `retailPriceUsd >= wholesalePriceUsd` uyarısı (zorlama yok, sadece warning)

**NOT:** TRY alanlarına (`sellingPriceTry`, `wholesalePriceTry`) dokunulmuyor — quote sistemi onları kullanmaya devam ediyor. USD katalog için, TRY quote için.

**Acceptance:** Admin 30 dakikada 78 aktif CCTV ürünün `wholesalePriceUsd` + `retailPriceUsd` alanlarını doldurur.

---

### **Faz 1 — Temel katalog motoru + WhatsApp paylaş** (1.5-2 gün, 1 PR)

**Çıktı:** Sales rep müşteri detayında "Katalog Gönder" butonuna basar → modal açılır → sektör + fiyat + marka seçer → PDF üretilir → WhatsApp ile paylaşır.

**İçerik:**
- `lib/catalog-mapping.ts` — Hard-coded sektör→kategori mapping (12 sektör profili)
- `lib/catalog-pdf-generator.ts` — `pdf-lib` ile sektörel PDF üretici:
  - Kapak sayfası + kapak notu + içindekiler + kategori bölümleri + ödeme şartları + kapanış
  - Sayfa numarası + watermark (B2B fiyatlı kataloglarda)
  - Kişiselleştirme: `CategoryInterest` + `currentSupplier` rakip rozetleri
- `/api/catalogs/[customerId]/pdf` endpoint — server-side PDF stream
- `components/customers/catalog-modal.tsx` — Müşteri detayında "Katalog Gönder" buton + modal:
  - **Sektör profili** (varsayılan: `Industry.slug`'undan otomatik seçili)
  - **Fiyat görünürlüğü**: Toptan / Perakende / Gizli (3 seçenek + rol bazlı kısıtlama)
  - **Marka filtresi** (multi-select, opsiyonel)
  - **Stoktaki ürünler** toggle (varsayılan açık)
  - **Müşteri adı kapağa** toggle (kişiselleştirme)
  - **Sales rep kişisel mesaj** textarea (opsiyonel, max 500 karakter)
- **Timeline event:** Müşteri detayında "Katalog gönderildi: {profil}, {tarih}" timeline entry (Phase 94 reuse)
- **WhatsApp template entegrasyonu:** Yeni `{{katalog_linki}}` değişkeni — Phase 96d MessageTemplate'lere eklenir
- **markCustomerContactedAction**: Katalog gönderildiğinde otomatik `lastContactedAt` güncellenir

**Permission:** `CATALOGS_CREATE` eklenir, SALES/ADMIN için aktif.

**Acceptance:** Sales rep telefonda "Hatay güvenlik şirketleri" listesi açar → en üstteki müşteriyi tıklar → "Katalog Gönder" → 5 saniyede sektör-odaklı PDF indirilir + WhatsApp ile paylaşılır.

---

### **Faz 4 — Public link + analytics + müşteri geri dönüşü** (1 gün, 1 PR)

**Çıktı:**
1. Sales rep PDF yerine **link** gönderir
2. Müşteri linke tıklar → tarayıcıda web sayfası (PDF değil)
3. Müşteri ürünlere "İlgilendim" işaretleyebilir
4. Sales rep'e "Müşteri açtı / ilgilendi" bildirimleri

**İçerik:**
- Schema: `CatalogShare` + `CatalogProductInterest` (yukarıda §3.3)
- `/c/[token]` public route — login gerektirmez, token tabanlı erişim
- Web sayfa: PDF'tekiyle aynı içerik, responsive (mobile-friendly)
- Müşteri sayfada "⭐ İlgilendim" butonu → `CatalogProductInterest` create + sales rep'e bildirim
- **OG meta tags** — WhatsApp link preview: og:image (firma logo), og:title (sektör başlığı), og:description
- **Açılma takibi:**
  - `firstViewedAt`, `lastViewedAt`, `viewCount` artar
  - 24 saat sonra "Ahmet bey kataloğu dün açtı, ara" otomatik **görev** oluşur (sales rep'e atanır)
- **Müşteri detay sayfasında:** "Gönderilen kataloglar" timeline bölümü
  - Her kataloğun: ne zaman gönderildi, açıldı mı, hangi ürünlere ilgi gösterdi
- **Otomatik ProductInterest:** Müşteri katalogtan "İlgilendim" işaretlerse `ProductInterest` (mevcut Phase 7 schema) otomatik oluşur — quote oluştururken hazır

**Permission:** Public route, ama token kontrol — `expiresAt` geçtiyse 410 Gone.

**Acceptance:** Sales rep telefonda kataloğu WhatsApp linki olarak gönderir → müşteri 2 saat sonra açar → 3 ürünü "İlgilendim" işaretler → sales rep "Ahmet bey 3 üründe ilgi gösterdi, ara" bildirimi alır.

---

### **Faz 3 — Paket çözümler (Installation segment)** (1 gün, 1 PR)

**Çıktı:** "Restoran 4 kameralı paket", "Site 16 kamera + 1 NVR paket" gibi hazır setler katalogta ve müşteri detayında.

**İçerik:**
- Schema: `ProductBundle` + `ProductBundleItem` (yukarıda §3.3)
- `/admin/bundles` — admin paket yönetimi sayfası (CRUD)
- Katalog PDF'i: Installation sektörü için kapaktan sonra **"Önerilen Paketler" bölümü**
- Public web katalog: paket detay popover (içeriğe tıkla, açılır)
- 4-5 standart paket seed:
  - Restoran 4 Kamera Standart (4× AHD + DVR + kablo seti)
  - Site 8 Kamera Pro (8× IP PoE + NVR + access)
  - Otel 16 Kamera Premium (16× IP + NVR + alarm + access)
  - Ofis 2 Kamera Mini (2× IP + cloud kayıt)
  - Mağaza 4 Kamera Tezgah (4× AHD + DVR + monitör)
- **Müşteri detay paket önerisi:** Müşterinin sektörüne ve önceki ilgilerine göre "Bu paket size uygun" önerisi widget

**Acceptance:** Restoran müşteriye gönderilen PDF'te ilk sayfada "4 Kameralı Restoran Paketi ₺X" hazır seçeneği görünür + müşteri detay sağ kolonunda "Önerilen Paket" kart.

---

### **Faz 5 — Admin katalog profili UI** (4-6 saat, 1 PR)

**Çıktı:** Admin hard-coded mapping yerine UI'dan sektör profili düzenler.

**İçerik:**
- Schema: Yaklaşım B'ye geçiş — `Industry.catalogIncludeCategorySlugs[]` + `catalogPriceMode` + `catalogCoverTitle` + `catalogHeroImageUrl`
- `/admin/catalogs` — her sektör profili için form:
  - Hangi kategoriler dahil (multi-select)
  - Hangi fiyat mode varsayılan
  - Kapak başlığı
  - Kapak hero görseli upload
- Migration: hard-coded mapping'ten DB'ye taşı (seed)
- Faz 1'in `lib/catalog-mapping.ts` artık DB okur

**Acceptance:** Admin yeni bir sektör profili eklediğinde (örn. "Eczane Güvenlik"), kod değişikliği olmadan katalog hemen üretilebilir.

---

### **Faz 6 (yeni — v2) — Performans raporu** (4-6 saat, 1 PR)

**Çıktı:** Admin/sales manager katalog→quote→satış dönüşüm raporu görür.

**İçerik:**
- `/admin/catalog-performance` yeni sayfa
- KPI'lar:
  - Bu ay kaç katalog gönderildi
  - Açılma oranı: gönderilen/açılan %
  - Açılan kaç tane ilgilendim işareti aldı
  - Hangi sektör profili en yüksek conversion (katalog→quote→won)
- Sales rep bazında sıralama: "Geçen ay en çok katalog gönderen + en yüksek conversion"
- Detay drill-down: tıkla → o kataloğun timeline'ı (gönder/aç/ilgi/quote/satış)
- **A/B test desteği:** Aynı müşteriye iki farklı sektör profili gönder, hangisi daha iyi conversion → veri toplama

**Permission:** `EXECUTIVE_READ` (mevcut admin metrics gibi).

**Acceptance:** Sales manager ayda 1 raporu açar, "Restoran profili %30 conversion'la en iyi, Nalbur %5 — neden düşük?" gibi karar verebilir.

---

## 5. Önerilen Sıralama + Toplam Effort

| Faz | İş | Tahmin | Bağımlılık | MVP? |
|---|---|---|---|---|
| **Faz 2 (önce)** | USD net fiyat doldurma — admin UI + CSV | 4-5 sa | Yok | ✅ |
| **Faz 1** | Temel katalog motoru + WhatsApp paylaş + timeline event | 1.5-2 gün | Faz 2 | ✅ |
| **Faz 4** | Public link + analytics + müşteri geri dönüşü | 1 gün | Faz 1 | ✅ |
| **Faz 6** | Catalog→quote performans raporu | 4-6 sa | Faz 4 | ⏩ MVP+1 |
| **Faz 3** | Paket çözümler (Installation) | 1 gün | Faz 1 | — |
| **Faz 5** | Admin katalog profili UI (hard-code→DB) | 4-6 sa | Faz 1 | — |

**Toplam:** 5.5-6.5 iş günü, 6 PR.
**MVP:** Faz 2 + 1 + 4 = ~3-3.5 iş günü, 3 PR.

---

## 6. MVP Tanımı (revize — v3)

**Minimum çalışan versiyon: Faz 2 + Faz 1 + Faz 4 — 3-3.5 iş günü.**

WhatsApp paylaşımı core value olduğu için public link (Faz 4) MVP'ye dahil edildi — PDF yalnız başına yarım kalır.

**MVP işleyişi:**
1. **Sales rep** telefonda → müşteri detayında "Katalog Gönder" → modal'da sektör + fiyat + marka seçer
2. **Sistem** USD net + KDV hariç fiyatlı PDF üretir + public link oluşturur
3. **Sales rep** WhatsApp'tan link gönderir (PDF yedek olarak indirilebilir)
4. **Müşteri** linke tıklar → mobile-friendly web katalog → "İlgilendim" işaretleyebilir
5. **Sistem** açılma + ilgi event'lerini takip eder → 24 saat sonra otomatik takip görevi oluşturur
6. **Müşteri detay timeline:** "Katalog gönderildi · Açıldı · 3 üründe ilgi gösterdi"

**MVP sonrası önerilen sıra:**
1. **Faz 3** (Paketler) — Installation segment için sahnede
2. **Faz 5** (Admin UI) — sales manager profil düzenleyebilir
3. **Faz 6** (Performans raporu) — **Faz 4 ile birlikte yayında** olduğu için aslında MVP+1 ile birlikte gider

---

## 7. Risk + Edge Case Analizi (genişletildi — v2)

| Risk | İhtimal | Etki | Önlem |
|---|---|---|---|
| Ürün fiyatları boş, "fiyat için arayın" tüm satırlarda | **Yüksek** | Profesyonelliği bozar | Faz 2 önce yapılmalı |
| Ürün resmi yok, placeholder göze batar | Orta | Tasarım zayıflar | Kategori default ikonu fallback |
| Restoran müşteriye 100 ürünlü CCTV katalogu gider | Düşük | İlgisiz teklif | `Industry.slug` doğru atanmalı |
| PDF boyutu çok büyük | Orta | WhatsApp 16MB limit | Resim 200x200 + JPEG q70 + 60 sayfa max |
| Public link kötüye kullanım | Düşük | Fiyat sızıntısı | Token + `expiresAt` (30 gün) + view limit |
| `wholesale` vs `retail` mod karışıklığı | Orta | Yanlış müşteriye yanlış fiyat | **SALES rolünde `wholesale` modu YOK** (yetki matrisi §3.8) — yapısal koruma |
| Sektörü olmayan müşteri (Industry null) | Orta | Belirsizlik | "Genel Katalog" fallback — fiyatsız |
| Müşteri bir kataloğu iki kez açar — duplicate task | Orta | Görev spam'i | 24 saat içinde tek görev |
| **CategoryInterest yoksa kişiselleştirme zayıf** (yeni) | Orta | Standart sıralama | Fallback: kategori popüleritesine göre |
| **Mobile WhatsApp PDF açma sorunu** (yeni) | Yüksek | Müşteri açamaz | Public link öncelikli (Faz 4); PDF yedek |
| **B2B müşteri kataloğu pazarda paylaşır** (v3) | Düşük | Bayi fiyatı sızar | Sadece ADMIN wholesale üretebilir + token istatistiği + kapakta müşteri adı kişiselleştirme |
| **USD kur farkı şikayeti** (v3) | Orta | Müşteri "ben başka kurla bekledim" der | PDF + public katalogta TCMB notu (faturalama günü kuru) |
| **`wholesalePriceUsd`/`retailPriceUsd` boş ürün** (v3) | Yüksek (başlangıçta) | Katalog seyrek | Faz 2 önce; otomatik filtreleme; `unitCostUsd` varsa marj önerisi |
| **Cover note'ta yanlış müşteri adı** (yeni) | Düşük | Profesyonellik | Modal'da preview göster |
| **Aynı müşteriye versiyon karışıklığı** (yeni) | Orta | "Hangisi son?" | Timeline'da gönderilen tüm kataloglar listelenir |
| **İptal/iade edilmiş ürün katalogta** (yeni) | Düşük | Yanlış teklif | Sadece `isActive=true` + `stockQuantity>0` |

---

## 8. Implementation File Structure (yeni — v2)

```
lib/
├── catalog-mapping.ts          # Faz 1: Hard-coded sektör profili (Faz 5'te DB'ye taşınır)
├── catalog-pdf-generator.ts    # Faz 1: pdf-lib ile PDF üretici
└── catalog-analytics.ts        # Faz 6: Conversion hesaplama

app/(app)/customers/[id]/page.tsx
└── "Katalog Gönder" buton eklenir

app/api/catalogs/[customerId]/pdf/route.ts  # Faz 1: PDF stream
app/api/catalogs/share/route.ts             # Faz 4: Public link create
app/c/[token]/page.tsx                      # Faz 4: Public web katalog
app/c/[token]/interest/route.ts             # Faz 4: "İlgilendim" işareti
app/(app)/admin/product-pricing/page.tsx    # Faz 2: Fiyat doldurma
app/(app)/admin/bundles/page.tsx            # Faz 3: Paket yönetimi
app/(app)/admin/catalogs/page.tsx           # Faz 5: Profil yönetimi
app/(app)/admin/catalog-performance/page.tsx # Faz 6: Conversion raporu

components/
├── customers/catalog-modal.tsx        # Faz 1: "Katalog Gönder" modal
├── customers/catalog-timeline.tsx     # Faz 4: Müşteri detayında gönderilen kataloglar
├── admin/bundle-form.tsx              # Faz 3
└── admin/catalog-profile-form.tsx     # Faz 5

services/
├── catalog-service.ts                 # Faz 1: getCatalogProducts(profile, mode)
├── catalog-share-service.ts           # Faz 4: createShare, getShareByToken, recordView
└── catalog-performance-service.ts     # Faz 6: getConversionStats

prisma/schema.prisma
├── ProductBundle + ProductBundleItem  # Faz 3
├── CatalogShare + CatalogProductInterest  # Faz 4
└── Industry.catalogIncludeCategorySlugs[]  # Faz 5

lib/permissions.ts
└── CATALOGS_CREATE: { ADMIN: true, SALES: true, OPERATIONS: false }  # Faz 1

scripts/
├── backfill-prices-from-trendyol.ts   # Faz 2
└── seed-product-bundles.ts            # Faz 3
```

---

## 9. Acceptance Smoke Test (yeni — v2)

MVP (Faz 2 + 1 + 4) bittiğinde uçtan uca test:

1. **Admin** /admin/product-pricing → 78 aktif CCTV ürününün `wholesalePriceUsd` + `retailPriceUsd` (USD net) alanlarını 30 dk'da doldurur
2. **Sales rep** /customers'a gider → Industry=Güvenlik Tedarikçisi olan bir müşteriyi açar
3. "Katalog Gönder" → modal açılır → Sektör otomatik seçili, Fiyat=Retail (SALES'in wholesale modu yok), Marka=Tümü
4. Cover note ekler: "Ahmet bey, dün konuştuk, AHD ürünlerimize bakın"
5. PDF üretilir (5 sn) — fiyatlar **"$X.XX (KDV hariç)"** formatında → public link de oluşur
6. Sales rep WhatsApp template ile link gönderir (`{{katalog_linki}}` çözülür)
7. **Timeline:** "Katalog gönderildi: Bayi Kataloğu, 2026-05-20 14:30" eventi
8. Müşteri WhatsApp'tan linke tıklar → web katalog açılır (USD net fiyatlar)
9. 2 ürünü "İlgilendim" işaretler → `ProductInterest` otomatik oluşur
10. Sales rep dashboard'da "Ahmet bey 2 üründe ilgi gösterdi" bildirim
11. 24 saat sonra otomatik takip görevi oluşur
12. **Faz 6:** Admin /admin/catalog-performance → "Bu hafta gönderilen 14 katalog, açılma %71, ilgi %43" raporunu görür

---

## 10. Sıradaki Aksiyon (v3 — Onaylı)

9 karar maddesi yanıtlandı (bkz. §0.5). Plan dondu, implementation başlayabilir.

**MVP yolu (3 PR, ~3-3.5 iş günü):**

1. **PR-1 (Faz 2):** USD net fiyat şeması + admin doldurma UI
   - Schema migration: `Product.wholesalePriceUsd` + `Product.retailPriceUsd`
   - `/admin/product-pricing` sayfası — filtreli inline edit
   - Kategori bazında toplu marj uygulama
   - CSV import şablonu

2. **PR-2 (Faz 1):** Katalog motoru + PDF + WhatsApp paylaş
   - `lib/catalog-mapping.ts` (12 sektör hard-coded)
   - `lib/catalog-pdf-generator.ts` (pdf-lib + Geist + logo)
   - `app/api/catalogs/[customerId]/pdf/route.ts`
   - `components/customers/catalog-modal.tsx`
   - Permission: `CATALOGS_CREATE` (ADMIN + SALES), `CATALOGS_WHOLESALE_MODE` (ADMIN only)
   - WhatsApp template: `{{katalog_linki}}` değişkeni

3. **PR-3 (Faz 4 + Faz 6):** Public link + analytics + performans raporu
   - Schema: `CatalogShare` + `CatalogProductInterest`
   - `app/c/[token]/page.tsx` (mobile-friendly web katalog)
   - "İlgilendim" event + otomatik takip görevi (24 saat)
   - `/admin/catalog-performance` sayfası (Faz 6 hemen yayında)

**Sonraki adım:** PR-1'i (Faz 2) başlatmak için onay bekleniyor.

---

## v3 Değişiklikleri (özet — v2'den)

**Yeni kurallar:**
- ⚡ Tüm katalog fiyatları **USD + KDV hariç** (sabit, override yok)
- 🔒 SALES rolü `wholesale` modunu seçemez (sadece ADMIN)
- 🚫 Watermark ve lead capture kaldırıldı (yetki matrisi yeterli)

**MVP scope genişlemesi:**
- Faz 2 + Faz 1 → **Faz 2 + Faz 1 + Faz 4** (3 PR)
- Faz 6 (performans raporu) artık Faz 4 ile birlikte yayında — sales manager geri besleme günden bir alır

**Schema değişiklikleri:**
- `Product.wholesalePriceUsd` (yeni)
- `Product.retailPriceUsd` (yeni)
- TRY alanları dokunulmaz (quote sistemi bağımlı)

**Yetki güçlendirmesi:**
- `CATALOGS_CREATE` (ADMIN + SALES)
- `CATALOGS_WHOLESALE_MODE` (ADMIN only)

---

## v2 Eklemeleri (özet — referans)

**v1'e göre yeni içerikler:**
- §0: Genişletilmiş vizyon (takip + ilgi + otomatik görev)
- §1.3: Mevcut altyapı reuse tablosu
- §3.1: Detaylı PDF sayfa yapısı (7 bölüm)
- §3.3: Yeni şemalar (ProductBundle + CatalogShare + CatalogProductInterest)
- §3.4: Fiyatlama detayı
- §3.5: Kişiselleştirme (CategoryInterest + tags + currentSupplier)
- §3.6: Marka filtresi
- §3.8: Yetkilendirme matrisi
- §3.9: Sales rep kişisel mesaj
- §4 Faz 1: Timeline event + WhatsApp template entegrasyonu
- §4 Faz 4: Lead capture + OG meta tags + otomatik görev
- §4 Faz 6: Performans raporu (catalog→quote conversion)
- §7: Genişletilmiş risk matrisi
- §8: Implementation file structure
- §9: Acceptance smoke test

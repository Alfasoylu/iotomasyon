# Ürün Kataloğu — Sektör Odaklı Aksiyon Planı (v2)

**Tarih:** 2026-05-20
**Sahibi:** Alfa Soylu Elektronik
**Hedef:** Satış temsilcisi telefon görüşmesi sonrası müşteriye sektör-odaklı PDF/web katalog gönderir; müşterinin reaksiyonu (açılma, ürün ilgisi, geri dönüş) otomatik takip edilir.

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
   - KDV durumu: "Tüm fiyatlara KDV dahildir" (veya hariç — config)

7. **Kapanış sayfası (CTA)**
   - "Hemen sipariş için: WhatsApp / Telefon"
   - "Bu kataloğun web versiyonu: {public_link}"
   - Geçerlilik: "Bu fiyatlar {validityDate} tarihine kadar geçerlidir"
   - Watermark (B2B fiyatlı kataloglarda): "Gizli — Sadece bayi kullanımı içindir. Müşteri ile paylaşmayınız."

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

### 3.3 Yeni şemalar (Faz 3 + Faz 4 için)

```prisma
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

### 3.4 Fiyatlama detayı

| Mod | Hangi alan | Kim için | Format |
|---|---|---|---|
| `wholesale` | `Product.wholesalePriceTry` | B2B bayi | "Toptan: ₺X (KDV hariç)" |
| `retail` | `Product.sellingPriceTry` | Installation müşteri | "₺X (KDV dahil)" |
| `hidden` | — | Yeni müşteri (sektör=null) | "Fiyat için iletişime geçin" |
| `marketplace` | `Product.marketplacePriceTry` | Pazaryeri rakip referansı | Sadece admin görsün, dahili |

**Boş fiyatlı ürünler:**
- `wholesale` mode'da `wholesalePriceTry` null ise ürün katalogtan **otomatik dışlanır**
- `retail` mode'da `sellingPriceTry` null ise dışlanır
- `hidden` mode'da hepsi gösterilir (fiyat satırı boş)

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
| **ADMIN** | Tüm katalogları üretebilir, herhangi bir profili seçebilir, fiyat mode override edebilir |
| **SALES** | Kendi atadığı müşterilere katalog üretebilir, fiyat mode sadece "wholesale" veya "retail" (profile'a bağlı), "hidden" mode SALES'e açık |
| **OPERATIONS** | Katalog üretemez (görür ama buton disabled) |
| **MARKETPLACE_OPERATOR** | Erişim yok |
| **WAREHOUSE** | Erişim yok |

Yeni permission: `CATALOGS_CREATE` — `lib/permissions.ts`'a eklenir.

### 3.9 Sales rep kişisel mesaj (cover note)

Modal'da textarea (max 500 karakter):
- _"Ahmet Bey, dün görüşmemizden sonra kataloğumuzu hazırladık. AHD ürünlerinde özel marjlarımız var, ek olarak DVR seçeneklerimizi de eklediğim sayfaya bakabilirsiniz. Sorularınız için 0850 307 7397'den ulaşabilirsiniz."_

PDF kapak sonrası sayfada `Geist` regular ile render edilir.

---

## 4. Faz Planı — PR'lara Bölünme

### **Faz 2 (önce) — Ürün fiyatları doldurma** (3-4 saat, 1 PR)

**Çıktı:** Admin toplu fiyat girer, eksik fiyatları görür.

**İçerik:**
- `/admin/product-pricing` yeni sayfa — fiyatı boş ürünler tablosu + inline edit
- Kategori bazında toplu fiyat girme (örn. "Tüm aktif CCTV ürünlerine min ₺X marj uygula")
- CSV import şablon güncellemesi (`wholesalePriceTry`, `sellingPriceTry`, `marketplacePriceTry` ayrı kolonlar)
- **Trendyol/Hepsiburada satış fiyatından `marketplacePriceTry` otomatik backfill** scripti
- Bayi marjı şablonu: "Maliyet × 1.25 = wholesale, wholesale × 1.30 = retail"

**Acceptance:** Admin 30 dakikada 78 aktif CCTV ürünün toptan + perakende fiyatlarını doldurur.

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
- **Lead capture (opsiyonel):** Public katalogta küçük form: "Telefon numaranızı bırakın, sizi arayalım" — Customer yoksa yeni Customer oluşturur

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

| Faz | İş | Tahmin | Bağımlılık |
|---|---|---|---|
| **Faz 2 (önce)** | Ürün fiyatları doldurma — admin UI + CSV | 3-4 sa | Yok |
| **Faz 1** | Temel katalog motoru + WhatsApp paylaş + timeline event | 1.5-2 gün | Faz 2 |
| **Faz 4** | Public link + analytics + müşteri geri dönüşü | 1 gün | Faz 1 |
| **Faz 3** | Paket çözümler (Installation) | 1 gün | Faz 1 |
| **Faz 5** | Admin katalog profili UI (hard-code→DB) | 4-6 sa | Faz 1 |
| **Faz 6** | Catalog→quote performans raporu | 4-6 sa | Faz 4 |

**Toplam:** 5.5-6.5 iş günü, 6 PR.

---

## 6. MVP Tanımı (revize — v2)

**Minimum çalışan versiyon: Faz 2 + Faz 1 — 2 gün.**

- Sales rep telefonda → müşteri detayında "Katalog Gönder" → modal'da sektör + fiyat seçer → PDF üretir → WhatsApp paylaşır
- Fiyatlar dolu (Faz 2'den), sektör doğru (Industry'den), kişiselleştirme aktif (CategoryInterest'ten)
- Müşteri detay timeline'da "Katalog gönderildi" eventi

**Ardından önerilen sıra:**
1. **Faz 4** (Public link + analytics) — sales rep "açıldı mı?" geri besleme alır, en yüksek katma değer
2. **Faz 3** (Paketler) — Installation segment için sahnede
3. **Faz 5** (Admin UI) — sales manager profil düzenleyebilir
4. **Faz 6** (Performans raporu) — uzun dönem optimizasyon

---

## 7. Risk + Edge Case Analizi (genişletildi — v2)

| Risk | İhtimal | Etki | Önlem |
|---|---|---|---|
| Ürün fiyatları boş, "fiyat için arayın" tüm satırlarda | **Yüksek** | Profesyonelliği bozar | Faz 2 önce yapılmalı |
| Ürün resmi yok, placeholder göze batar | Orta | Tasarım zayıflar | Kategori default ikonu fallback |
| Restoran müşteriye 100 ürünlü CCTV katalogu gider | Düşük | İlgisiz teklif | `Industry.slug` doğru atanmalı |
| PDF boyutu çok büyük | Orta | WhatsApp 16MB limit | Resim 200x200 + JPEG q70 + 60 sayfa max |
| Public link kötüye kullanım | Düşük | Fiyat sızıntısı | Token + expiresAt + view limit + watermark (B2B) |
| `wholesalePriceTry` vs `sellingPriceTry` karışıklığı | Orta | Yanlış müşteriye yanlış fiyat | UI'da label sıkı + rol bazlı kısıt |
| Sektörü olmayan müşteri (Industry null) | Orta | Belirsizlik | "Genel Katalog" fallback — fiyatsız |
| Müşteri bir kataloğu iki kez açar — duplicate task | Orta | Görev spam'i | 24 saat içinde tek görev |
| **CategoryInterest yoksa kişiselleştirme zayıf** (yeni) | Orta | Standart sıralama | Fallback: kategori popüleritesine göre |
| **Mobile WhatsApp PDF açma sorunu** (yeni) | Yüksek | Müşteri açamaz | Public link öncelikli (Faz 4); PDF yedek |
| **B2B müşteri kataloğu pazarda paylaşır** (yeni) | Orta | Toptan fiyat sızıntısı | Watermark + müşteri adı kapak + token istatistiği |
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

MVP (Faz 1+2) bittiğinde uçtan uca test:

1. **Admin** /admin/product-pricing → 78 aktif CCTV ürünün toptan fiyatlarını 15 dk'da doldurur
2. **Sales rep** /customers'a gider → Industry=Güvenlik Tedarikçisi olan bir müşteriyi açar
3. "Katalog Gönder" → modal açılır → Sektör otomatik seçili, Fiyat=Toptan, Marka=Tümü
4. Cover note ekler: "Ahmet bey, dün konuştuk, AHD ürünlerimize bakın"
5. PDF üretilir (5 sn) → indirilir veya WhatsApp ile paylaşılır
6. **Timeline:** Müşteri detayında "Katalog gönderildi: Bayi Toptan Kataloğu, 2026-05-20 14:30" eventi
7. **MessageTemplate dropdown'unda** {{katalog_linki}} değişkeni kullanılan şablonlar görünür

Faz 4 sonrası:
8. Müşteri WhatsApp'tan linke tıklar → web katalog açılır
9. 2 ürünü "İlgilendim" işaretler → `ProductInterest` otomatik oluşur
10. Sales rep dashboard'da "Ahmet bey 2 üründe ilgi gösterdi" bildirim
11. 24 saat sonra otomatik takip görevi oluşur

---

## 10. Karar Beklenenler (revize — v2)

Bu plan'ı onaylar mısın? Sırayla:

1. **Faz sıralaması doğru mu?** (Faz 2 fiyat → Faz 1 motor → Faz 4 public link → Faz 3 paket → Faz 5 admin → Faz 6 rapor)
2. **Sektör mapping'i** (Tablo §2) doğru mu? Eklemek/kaldırmak istediğin sektör/kategori var mı?
3. **Şema yaklaşımı**: Yaklaşım A (hard-coded) → Yaklaşım B (DB) geçişi mantıklı mı?
4. **Paket fiyatlandırma**: Installation segment için pre-defined bundle'lar gerekli mi, yoksa katalog ürün ürün yeterli mi?
5. **MVP scope'u**: Sadece Faz 2 + Faz 1 ile başlayalım mı, yoksa Public link (Faz 4) MVP'ye dahil mi?
6. **Yetkilendirme**: SALES rolüne `wholesale` mode'a erişim açık mı, yoksa sadece ADMIN mi yapsın?
7. **Watermark stratejisi**: B2B toptan fiyatlı katalogta "Gizli — sadece bayi kullanımı" damgası uygun mu?
8. **Lead capture (Faz 4)**: Public katalogta "Beni arayın" formu gerekli mi, yoksa sadece "İlgilendim" yeterli mi?
9. **Performans raporu (Faz 6)**: Sales manager için gerekli mi, yoksa daha sonra eklensin mi?

Onay verirsen Faz 2'den başlarım (ürün fiyatlarını dolduran admin UI + Trendyol backfill scripti).

---

## v2 Eklemeleri (özet)

**v1'e göre yeni içerikler:**
- §0: Genişletilmiş vizyon (takip + ilgi + otomatik görev)
- §1.3: Mevcut altyapı reuse tablosu
- §3.1: Detaylı PDF sayfa yapısı (7 bölüm)
- §3.3: Yeni şemalar (ProductBundle + CatalogShare + CatalogProductInterest)
- §3.4: Fiyatlama detayı (3 mode + boş fiyat davranışı)
- §3.5: Kişiselleştirme (CategoryInterest + tags + currentSupplier)
- §3.6: Marka filtresi
- §3.8: Yetkilendirme matrisi
- §3.9: Sales rep kişisel mesaj
- §4 Faz 1: Timeline event + WhatsApp template entegrasyonu
- §4 Faz 4: Lead capture + OG meta tags + otomatik görev
- §4 Faz 6: Yeni — Performans raporu (catalog→quote conversion)
- §7: Genişletilmiş risk matrisi (8 yeni edge case)
- §8: Implementation file structure
- §9: Acceptance smoke test
- §10: 9 karar maddesi (v1'de 5'ti)

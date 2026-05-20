# Ürün Kataloğu — Sektör Odaklı Aksiyon Planı

**Tarih:** 2026-05-20
**Sahibi:** Alfa Soylu Elektronik
**Hedef:** Satış temsilcisi telefon görüşmesi sonrası müşteriye sektör-odaklı PDF katalog gönderir (fiyatlı veya fiyatsız).

---

## 0. Vizyon — Firma Sahibi Bakışı

Sales rep bir bayi/montaj müşterisini arar. Müşteri _"Bana kataloğunuzu gönderir misiniz?"_ der. Üç gerçek senaryo:

1. **Güvenlik bayisi** (toptan alacak): _"IP kamera + NVR fiyat listesi lazım, marjıma yer var mı?"_ → **toptan fiyatlı katalog**
2. **Restoran/Cafe** (tek seferlik montaj): _"4-8 kamera kurabilirsiniz mi, ne kadara olur?"_ → **fiyatlı paket kataloğu**
3. **Nalbur/elektronik mağazası**: _"Önce ne sattığınızı görelim, fiyat sonra konuşuruz"_ → **fiyatsız ürün kataloğu**

Her birine **aynı PDF'i göndermek yanlış**. Plan, sektöre göre içerik + fiyat görünürlüğü farklı versiyonlar üretir.

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
| Elektronik Modül & Geliştirme | 95 | 10 | henüz boş |
| Diğer (28+ kategori) | ~600 | ~50 | henüz boş |

### 1.2 ⚠️ Kritik kısıt
- **Ürünlerin %95+'ında `sellingPriceTry` boş**. Sadece Metal Dedektörü ve Telsiz kategorilerinde fiyatlama var.
- Toptan fiyatlama (`wholesalePriceTry`) için ayrıca alan mevcut ama doluluk durumu test edilmeli.
- **Karar:** Fiyatlı katalog üretmeden önce **ürün fiyatlarını doldurma faz'ı** kritik. Aksi halde PDF'te _"fiyat için iletişime geçin"_ etiketi tüm satırlarda olur — ki bu profesyonel görünmez.

### 1.3 Görsel
- `Product.imageUrl` alanı mevcut. Doluluk yine kontrol edilmeli. Ürün resmi yoksa katalogta "logo placeholder" gösterilir.

---

## 2. Sektör → Katalog Eşleştirmesi

Phase 99'da kurulan `Industry` hiyerarşisini kullanıyoruz:

| Industry (alt sektör) | Hedef katalog | İçerik | Fiyat görünürlüğü |
|---|---|---|---|
| **Güvenlik Sistemi Tedarikçisi** | _Bayi Toptan Kataloğu_ | CCTV (tüm) + Telsiz + Metal Dedektör + Akıllı Ev | Toptan ₺ (wholesalePriceTry) |
| **Güvenlik Sistemi Kurulum** | _Kurulumcu Kataloğu_ | CCTV + kablolama aksesuar + Akıllı Ev kit | Toptan ₺ |
| **Güvenlik Şirketi** | _Kurumsal Güvenlik_ | Üst seviye IP kameralar + NVR + erişim kontrol | Toptan ₺ |
| **Bilgisayar Güvenlik Hizmetleri** | _Bilişim Bayi_ | CCTV + Bilgisayar Çevre Birimi + Akıllı Ev | Toptan ₺ |
| **Nalbur / Yapı Marketi** | _Nalbur Hızlı Satış_ | Popüler AHD/IP + DVR + alarm | Toptan ₺ |
| **Elektronik Mağaza** | _Mağaza Tezgah Ürünleri_ | Hazır kameralar + perakende kit | Toptan ₺ + Önerilen perakende ₺ |
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

### 3.1 PDF formatı (mevcut quote PDF altyapısı reuse)
- Mevcut `pdf-lib` + Geist font + logo embed çalışıyor (quote PDF'inde)
- Sektörel kapak sayfası: turuncu accent + logo + "Güvenlik Bayileri için Ürün Kataloğu" başlık + müşteri adı (kişiselleştirme) + tarih + geçerlilik
- Bölüm sayfaları: her kategori bir bölüm — başlık + 4-8 ürün/sayfa, fotoğraf yanında ad/SKU/açıklama/fiyat
- Son sayfa: iletişim + IBAN + ödeme şartları (quote PDF'inden alındı)

### 3.2 Şema değişikliği — Gerekli mi?
**Yaklaşım A — Yeni `Catalog` modeli (önerilmez):**
```prisma
model Catalog { id, name, industryId, sectorSlug, categoryIds[], priceMode, ... }
```
Fazla mühendislik. Kataloglar dinamik üretilecekse statik DB'ye gerek yok.

**Yaklaşım B — `Industry` modeline `catalogConfig` alanı (önerilen):**
```prisma
model Industry {
  ...mevcut...
  catalogIncludeCategorySlugs String[]  // "cctv-kamera-sistemleri", "akilli-ev-iot" ...
  catalogPriceMode String?              // "wholesale" | "retail" | "hidden"
  catalogCoverTitle String?             // "Güvenlik Bayileri için Ürün Kataloğu"
}
```
Veya **Yaklaşım C — Hard-coded mapping (en hızlı, sezgisel ilk versiyon):**
```ts
// lib/catalog-mapping.ts
export const CATALOG_PROFILES: Record<string, CatalogProfile> = {
  "guvenlik-sistemi-tedarikcisi": { categories: [...], priceMode: "wholesale", coverTitle: "Güvenlik Bayilerimiz İçin..." },
  ...
};
```

**Önerim: C ile başla, lazım olursa B'ye taşı.** İlk PR'da hard-coded mapping yeter, admin sonradan UI'dan düzenler.

### 3.3 Fiyatlama
- `Product.sellingPriceTry` ve `Product.wholesalePriceTry` zaten mevcut → kullan
- **Boş fiyat ürünleri** katalogtan **otomatik dışla** (yoksa "fiyatsız satır" göz tırmalar)
- **İskonto/ek vergi**: PDF'te göstermez — "fiyatlar KDV hariç, geçerlilik 30 gün" notu altta

### 3.4 Görseller
- Mevcut `Product.imageUrl` varsa kullan (Cloudinary/CDN URL bekleniyor)
- Yoksa kategori başına default placeholder ikonu (lokal SVG seti)
- Boş resimli ürün için "📷 Resim yakında" placeholder

---

## 4. Faz Planı — PR'lara Bölünme

### **Faz 1 (P-Cat-A) — Temel katalog motoru** (1-1.5 gün, 1 PR)

**Çıktı:** Sales rep müşteri detayında "Katalog Gönder" butonuna basar → modal açılır → sektör + fiyat görünürlüğü seçer → PDF üretilir → indir/WhatsApp paylaş.

**İçerik:**
- `lib/catalog-mapping.ts` — Hard-coded sektör→kategori mapping (12 sektör profili)
- `lib/catalog-pdf-generator.ts` — `pdf-lib` ile sektörel PDF üretici (quote PDF'ten clone + modifikasyon)
- `/api/catalogs/[customerId]/pdf` endpoint — server-side PDF stream (quote pdf'i gibi)
- `components/customers/catalog-modal.tsx` — Müşteri detayında "Katalog Gönder" buton + modal
- Modal seçimleri:
  - **Sektör profili** (varsayılan: müşterinin `Industry.slug`'undan otomatik seçili)
  - **Fiyat görünürlüğü**: Toptan / Perakende / Gizli (3 seçenek)
  - **Stoktaki ürünler** toggle (varsayılan açık)
  - **Müşteri adı kapağa yazılsın mı** toggle (kişiselleştirme)
- Müşteri detay sayfasında **WhatsApp template ile paylaş** entegrasyonu (mevcut Phase 96d altyapısı reuse)

**Acceptance:** Sales rep telefonda "Hatay güvenlik şirketleri" listesi açar → en üstteki müşteriyi tıklar → "Katalog Gönder" → 5 saniyede sektör-odaklı PDF indirilir.

---

### **Faz 2 (P-Cat-B) — Fiyat doldurma araçları** (3-4 saat, 1 PR)

**Çıktı:** Admin toplu fiyat girer, eksik fiyatları görür.

**İçerik:**
- `/admin/product-pricing` yeni sayfa — fiyatı boş ürünler tablosu + inline edit
- Kategori bazında toplu fiyat girme (örn. "Tüm aktif CCTV ürünlerine min ₺X marj uygula")
- CSV import şablon güncellemesi (`wholesalePriceTry`, `sellingPriceTry`, `marketplacePriceTry` ayrı kolonlar)
- Trendyol fiyatlarından `sellingPriceTry` otomatik backfill scripti (eğer Trendyol satış kaydı varsa)

**Acceptance:** Admin 30 dakikada 78 aktif CCTV ürünün toptan + perakende fiyatlarını doldurur.

---

### **Faz 3 (P-Cat-C) — Paket çözümler (Installation segment)** (1 gün, 1 PR)

**Çıktı:** "Restoran 4 kameralı paket", "Site 16 kamera + 1 NVR paket" gibi hazır setler katalogta gösterilir.

**İçerik:**
- `prisma/schema.prisma` — Yeni `ProductBundle` modeli:
  ```prisma
  model ProductBundle {
    id              String   @id
    name            String   // "Restoran 4 Kamera Standart Paket"
    targetIndustry  String?  // "restoran-cafe"
    items           ProductBundleItem[]
    bundlePrice     Decimal?  // Paket toplam (indirimli)
    description     String?
    isActive        Boolean  @default(true)
  }
  model ProductBundleItem {
    bundleId  String
    productId String
    quantity  Int @default(1)
    bundle    ProductBundle @relation(...)
    product   Product       @relation(...)
  }
  ```
- `/admin/bundles` — admin paket yönetimi sayfası
- Katalog PDF'i: Installation sektörü için **kapak sayfasından sonra "Önerilen Paketler" bölümü**
- 4-5 standart paket seed: Restoran (4 kamera), Site (8 + NVR), Otel (16 + NVR + access), Ofis (2 + alarm)

**Acceptance:** Restoran/cafe müşteriye gönderilen PDF'te ilk sayfada "4 Kameralı Restoran Paketi ₺X" hazır seçeneği görünür.

---

### **Faz 4 (P-Cat-D) — Public paylaşım linki** (4-6 saat, 1 PR)

**Çıktı:** Sales rep katalog PDF yerine WhatsApp ile **link** gönderir. Müşteri linke tıklayınca tarayıcıda görür (PDF değil, web sayfası).

**İçerik:**
- `/c/[token]` public route — login gerektirmez, token tabanlı erişim
- Schema: `CatalogShare { id, token, customerId, profileSlug, priceMode, expiresAt, viewCount, createdAt }`
- Link oluşturulduğunda WhatsApp template'te `{{katalog_linki}}` değişkeni desteklenir
- Müşteri linke tıklarsa `viewCount` artar — sales rep'e bildirim ("Müşteri X kataloğu açtı")
- Geçerlilik süresi default 7 gün (override edilebilir)

**Acceptance:** Müşteri "Kataloğunuza baktım, X ürünü hakkında konuşabilir miyiz?" diye geri arayabilir. Sales rep "katalog açıldı mı?" bildirimi alır.

---

### **Faz 5 (P-Cat-E) — Admin katalog profili UI** (4-6 saat, 1 PR)

**Çıktı:** Admin hard-coded mapping yerine UI'dan sektör profili düzenler.

**İçerik:**
- Schema: Yaklaşım B'ye geçiş — `Industry.catalogIncludeCategorySlugs[]` + `catalogPriceMode` + `catalogCoverTitle`
- `/admin/catalogs` — her sektör profili için form:
  - Hangi kategoriler dahil
  - Hangi fiyat görünür
  - Kapak başlığı
- Migration: hard-coded mapping'ten DB'ye taşı
- Faz 1'in `lib/catalog-mapping.ts` artık DB okur

**Acceptance:** Admin yeni bir sektör profili eklediğinde (örn. "Eczane Güvenlik"), kod değişikliği olmadan katalog hemen üretilebilir.

---

## 5. Risk + Edge Case Analizi

| Risk | İhtimal | Etki | Önlem |
|---|---|---|---|
| Ürün fiyatları boş, "fiyat için arayın" tüm satırlarda | **Yüksek** | Profesyonelliği bozar | Faz 2 önce yapılmalı — fiyat doldurma kritik |
| Ürün resmi yok, placeholder göze batar | Orta | Tasarım zayıflar | Kategori default ikonu fallback |
| Restoran müşteriye 100 ürünlü CCTV katalogu gider (yanlış sektör) | Düşük | İlgisiz teklif | Industry.slug doğru atanmalı (mevcut bilgi yeterli) |
| PDF boyutu çok büyük (100 ürün × görsel) | Orta | WhatsApp 16MB sınırı | Görselleri 200x200'e küçült + JPEG quality 70 |
| Public link kötüye kullanım (rakip görür) | Düşük | Fiyat sızıntısı | Token + geçerlilik + view limit; toptan fiyat hassas → varsayılan "gizli" mode |
| `wholesalePriceTry` ile `sellingPriceTry` karışıklığı | Orta | Yanlış müşteriye yanlış fiyat | Schema'da netleştir + UI'da label sıkı |
| Sektörü olmayan müşteri (Industry null) | Orta | "Hangi katalog?" belirsiz | Fallback: "Genel Katalog" — fiyatsız, geniş içerik |

---

## 6. Önerilen Sıralama + Toplam Effort

| Faz | İş | Tahmin | Bağımlılık |
|---|---|---|---|
| **Faz 2 (önce)** | Ürün fiyatları doldurma — admin UI + CSV | 3-4 sa | Yok |
| **Faz 1** | Temel katalog motoru + hard-coded sektör | 1-1.5 gün | Faz 2 (fiyat olmalı) |
| **Faz 4** | Public link + WhatsApp share | 4-6 sa | Faz 1 |
| **Faz 3** | Paket çözümler (Installation) | 1 gün | Faz 1 |
| **Faz 5** | Admin katalog profili UI (hard-code'dan DB'ye) | 4-6 sa | Faz 1 |

**Toplam:** 4-5 iş günü, 5 PR.

---

## 7. Minimum Çalışan Versiyon (MVP)

Sadece bunu yaparsak şimdi: **Faz 2 + Faz 1 — 2 gün**, en kritik gerçekleşim.

- Sales rep telefonda → müşteri detayında "Katalog Gönder" → sektörel PDF → WhatsApp ile paylaş
- Fiyatlar dolu, sektör doğru, sayfa profesyonel

İleri özellikler (Faz 3-4-5) bunlar bittikten sonra. Public link özellikle değerli — açma istatistiği sales rep için kritik geri besleme.

---

## 8. Karar Beklenenler

Bu plan'ı onaylar mısın? Sırayla:

1. **Faz sıralaması doğru mu?** (Faz 2 fiyat doldurma → Faz 1 katalog motoru) sıralamasını öneriyorum. Aksi durumda PDF gönderilse de fiyatsız olur.
2. **Sektör mapping'i** (Tablo §2) doğru mu? Eklemek/kaldırmak istediğin sektör/kategori var mı?
3. **Şema yaklaşımı**: Hard-coded mapping (Yaklaşım C) ile başla → ileride DB'ye taşı (Yaklaşım B) — kabul mü?
4. **Paket fiyatlandırma**: Installation segment için "4 kameralı paket ₺X" gibi pre-defined bundle'lar gerekli mi, yoksa katalog ürün ürün yeterli mi?
5. **MVP scope'u**: Sadece Faz 2 + Faz 1 ile başlayalım mı, yoksa public link (Faz 4) da MVP'ye dahil mi?

Onay verirsen Faz 2'den başlarım (ürün fiyatlarını dolduran admin UI + CSV bulk update aracı).

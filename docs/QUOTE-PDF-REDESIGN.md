# Teklif PDF Reformu (Quote PDF Redesign) — 2026

> **Hedef:** Müşteriye giden her teklif PDF'i, **Stripe / Linear / Vercel kalitesinde** bir B2B doküman olsun. Şu anki PDF (orange/charcoal palet, yoğun zebra striping, eski katalog hissi) yerini, **endüstriyel-minimal**, modern tipografi hiyerarşili, **scan edilebilir** ve **dijital olarak interaktif** bir teklife bırakacak.

## 1. Mevcut Durumun Eleştirisi

`app/(app)/quotes/[id]/pdf/route.ts` (493 satır, tek dosya):

| Sorun | Etki |
|---|---|
| Tek route handler içinde tüm PDF mantığı | Bakım zor, test imkânsız, modüler değil |
| Eski palet (`#F97316` orange + `#111827` charcoal) | Yeni CRM tasarımı (#e8ff5a electric yellow) ile uyumsuz |
| Zebra striping satırlar | "Excel basılmış" hissi, 2026 standartında değil |
| Logo + firma bilgisi + "FİYAT TEKLİFİ" header'ı sıkışık | Premium hissi yok, hiyerarşi zayıf |
| Cover-page yok — direkt veriyle başlıyor | Müşteriye gönderilen ilk şey doğrudan tablo → soğuk |
| Sayfa numarası yok (`Sayfa X / Y`) | Çok sayfalı tekliflerde profesyonel değil |
| Revizyon işareti yok | "REVIZYON 2" gibi watermark eksik |
| QR kod yok | 2026'da müşteri telefonla taratıp dijital sürümü açamıyor |
| İmza alanı yok | Kabul/red için elle yazılı veya geri gönderim gerekiyor |
| `ensureSpace()` çağrıları manuel & dağınık | Sayfa kırılması beklenmedik yerde olabiliyor |
| TRY/USD/BOTH currency formatı her satırda iki satır | Görsel kirlilik, tek bir özet kart daha temiz |
| Bank info kartı altta sıkışık (56pt) | IBAN okunmuyor, accent şerit zayıf |

---

## 2. Görsel Referans Analizi (Best-in-Class B2B PDFs, 2024-2026)

İncelediğimiz ve örnek aldığımız sistemler:

### 2a. Stripe Invoices
- **Minimum kromatik palet** (siyah/beyaz/tek aksan)
- Üst kısımda **büyük tutar ön plana**, hemen altında küçük metadata
- Line items'da **mono tabular sayılar**, hover-style bordür yok
- Sade IBAN/payment kartı altta
- ✅ **Aldığımız ders:** Sayısal kolonlar mono, tek aksan rengi, ferah satır aralığı

### 2b. Linear Billing
- **Tipografi hiyerarşi keskin**: H1 (28-32px), section labels 11px uppercase tracking-widest
- Border'lar 0.5-1px, hiç shadow yok
- Status badge tek tip (sadece outline + 11px text)
- ✅ **Aldığımız ders:** 11px uppercase tracking-widest section başlığı standardı (catalog reform'a paralel)

### 2c. Vercel Receipts
- **Cover-style header**: logo solda, dokuman tipi sağda büyük (`Receipt #INV-001`)
- Tek bir geniş "Total" kartı — diğer satırlardan koparılmış, charcoal box
- Footer'da bir cümle ile özet ("Charged to Visa ending 4242")
- ✅ **Aldığımız ders:** Genel Toplam'ı dramatik kartla göster

### 2d. HubSpot Proposals
- **2 sayfalık cover** + içerik
- Cover'da müşteri ismi büyük (40-60px), sektör/açıklama altta
- Açılış mektubu (cover note) opsiyonel
- ✅ **Aldığımız ders:** Cover note opsiyonu, müşteri ismi büyük

### 2e. DocuSign / PandaDoc
- **Acceptance section** sonda — "Kabul ediyorum" + imza alanı + tarih
- Reciprocal QR / link — "Bu teklifi çevrimiçi inceleyin"
- Revision tracker: "Revision 2 — Updated Mar 15, 2026"
- ✅ **Aldığımız ders:** Acceptance + QR + revision marker

### 2f. Apple Billing
- **Restrained, neredeyse boşluk hissi**
- Footer'da hassas gizlilik notu
- Tek "primary action" hissi (download link)
- ✅ **Aldığımız ders:** Boşluğa saygı, restraint

### 2g. Notion Exported Docs
- **Embed font sade** (sans-serif tek aile, 2-3 ağırlık)
- Code block'lar mono — IBAN/SKU bu hissi versin
- ✅ **Aldığımız ders:** Tek font ailesi (Inter veya Geist), mono'yu sayılarda kullan

---

## 3. Tasarım İlkeleri (Kesin Kurallar)

| Kural | Açıklama |
|---|---|
| **Tek aksan rengi** | `#e8ff5a` (Soylu elektrik sarısı) — sadece KEY moments'ta (Genel Toplam, vurgular). Diğer her şey nötr. |
| **Charcoal değil, fully dark** | `#0f0f0f` zemin değil — PDF beyaz, ama vurgu blok'ları `#0f0f0f` (CRM'deki surface-0) |
| **Gradient yasak** | Her geçiş düz renkli blok |
| **Shadow yasak** | Border ve renk kontrastı ile hiyerarşi |
| **Pill (rounded-full) yasak** | Tüm rounded'lar 4-6px |
| **Sayılar mono + tabular** | IBAN, SKU, fiyat, tarih → JetBrains Mono / Geist Mono |
| **Section başlığı standardı** | 9-10px uppercase tracking-widest text-muted |
| **Tipografi hiyerarşisi** | H1 28px / H2 14px / Body 10px / Caption 7-8px |
| **Border 0.5pt** | Her yerde aynı kalınlık |
| **Page break-aware** | Otomatik header repeat, "Sayfa X / Y" |
| **Sayısal kolonlar sağa hizalı** | Mono fontla birlikte profesyonel görünür |

---

## 4. Renk & Tipografi Sistemi

### Renk Paleti (PDF için, dark CRM token'larından adapte)

```ts
const C = {
  // Base
  white:        rgb(1, 1, 1),
  ink:          rgb(0.067, 0.067, 0.067),  // #111 — birincil metin
  muted:        rgb(0.4, 0.4, 0.4),         // #666 — ikincil metin
  caption:      rgb(0.6, 0.6, 0.6),         // #999 — etiketler

  // Surfaces
  paper:        rgb(1, 1, 1),
  surface1:     rgb(0.98, 0.98, 0.98),     // #fafafa — alt blok
  surface2:     rgb(0.95, 0.95, 0.95),     // #f2f2f2 — section divider

  // Borders
  borderSubtle: rgb(0.91, 0.91, 0.91),     // #e8e8e8
  borderDefault:rgb(0.82, 0.82, 0.82),     // #d2d2d2
  borderStrong: rgb(0.4, 0.4, 0.4),

  // Accent (Soylu electric yellow)
  accent:       rgb(0.910, 1.000, 0.353),  // #e8ff5a
  accentInk:    rgb(0.067, 0.067, 0.067),  // accent üstünde text rengi

  // Semantic (dim — dokunabilir ama dominant değil)
  ok:           rgb(0.165, 0.502, 0.275),  // #2a8047 — kabul/onay
  warn:         rgb(0.745, 0.451, 0.090),  // #be7317
  danger:       rgb(0.749, 0.235, 0.184),  // #bf3c2f

  // Document-specific
  charcoal:     rgb(0.067, 0.067, 0.067),  // big "TOTAL" box
};
```

### Tipografi

```ts
// Font ailesi: Geist (zaten kurulu) — Regular + Mono variants
//   - node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf
//   - Geist Mono için ek font dosyası ekleyeceğiz (subset)

const TYPE = {
  // Cover page
  brandWordmark:    { size: 18, weight: "regular", letterSpacing: 0 },
  documentTitle:    { size: 32, weight: "semibold", letterSpacing: -0.3 },
  customerName:     { size: 22, weight: "semibold", letterSpacing: -0.2 },

  // Section headers
  sectionLabel:     { size: 9,  weight: "medium",   letterSpacing: 1.8, uppercase: true },
  sectionTitle:     { size: 13, weight: "semibold" },

  // Body
  body:             { size: 10, weight: "regular" },
  bodyEmphasis:     { size: 10, weight: "medium" },
  caption:          { size: 8,  weight: "regular" },
  tinyCaption:      { size: 7,  weight: "regular" },

  // Numeric (mono)
  monoBody:         { size: 10, weight: "regular", mono: true },
  monoMoney:        { size: 11, weight: "medium",  mono: true },
  monoMoneyLarge:   { size: 28, weight: "semibold", mono: true },

  // Special
  quoteNumber:      { size: 14, weight: "medium",  mono: true },
  tableHeader:      { size: 8,  weight: "medium",  letterSpacing: 1.5, uppercase: true },
};
```

---

## 5. Sayfa Yapısı (4-5 Bölüm)

```
┌──────────────────────────────────┐
│  SAYFA 1 — COVER                  │
│  • Logo + brand mark              │
│  • Doküman tipi + numara          │
│  • Müşteri bloğu (büyük)          │
│  • Cover note (opsiyonel)         │
│  • QR kod (dijital sürüm linki)   │
│  • Geçerlilik + revision marker   │
└──────────────────────────────────┘
┌──────────────────────────────────┐
│  SAYFA 2-N — LINE ITEMS           │
│  • Sticky header (her sayfada)   │
│  • Ürün/açıklama/adet/birim/KDV  │
│  • Mono tabular sayılar           │
│  • Page break aware               │
│  • Footer: Sayfa X / Y            │
└──────────────────────────────────┘
┌──────────────────────────────────┐
│  SON SAYFA — TOTALS + TERMS       │
│  • Subtotal / İndirim / KDV       │
│  • GENEL TOPLAM (dramatic)        │
│  • Ödeme bilgileri (IBAN mono)    │
│  • Ticari koşullar                │
│  • Acceptance section + imza alanı│
└──────────────────────────────────┘
```

---

## 6. Sayfa-Sayfa Detaylı Layout

### 6a. COVER PAGE (Sayfa 1)

```
┌────────────────────────────────────────────────────────────────┐
│ ▌ ▌ ▌ ← üst sağda 3 ince accent çubuk (Soylu kimliği)        │
│                                                                  │
│  ALFA SOYLU                                                     │
│  Elektronik & Güvenlik Sistemleri                                │
│                                                                  │
│  [LOGO 140px width]                                              │
│  ━━━━ accent strip 80x4                                          │
│                                                                  │
│  MART 2026                                                       │
│  Fiyat Teklifi                                ← H1 32px         │
│  #QT-2026-0142                                ← mono 14px       │
│                                                                  │
│  ┌─────────────────────────────────────────────┐                │
│  │ HAZIRLANAN MÜŞTERİ        ← 9px uppercase   │                │
│  │ Ahmet Yılmaz Elektronik Ltd. ← 22px semibold │                │
│  │ Yetkili: Ahmet Yılmaz · Bursa · Bayi        │                │
│  │ Hazırlayan: Mehmet (Soylu)                  │                │
│  └─────────────────────────────────────────────┘                │
│                                                                  │
│  ┌──────────── Ön Söz (opsiyonel) ─────────────┐                │
│  │ Sayın Ahmet bey,                            │                │
│  │ Görüşmemiz doğrultusunda hazırladığım kanun │                │
│  │ üzere 5 kalemlik bayi teklifimizi ekte...   │                │
│  └─────────────────────────────────────────────┘                │
│                                                                  │
│  ─────────────────────────────────────────────                  │
│                                                                  │
│  ┌─── QR ──┐    KAPSAM                  GEÇERLİLİK              │
│  │ ▓░▓░▓░  │    5 kalem                 27 Mart 2026 →           │
│  │ ░▓░▓░▓  │    Toplam: ₺125.450        26 Nisan 2026            │
│  └─────────┘    (KDV dahil)              (30 gün)                │
│                                                                  │
│  Dijital sürüm: iotomasyon.com/q/abc123                         │
│                                                                  │
│  ───────────────────────────────────────────                     │
│  📞 0850 307 7397 · info@soyluelektronik.com                    │
└────────────────────────────────────────────────────────────────┘
```

**Önemli detaylar:**
- Üst sağ köşede **3 yatay aksent çubuk** (catalog PDF cover'la tutarlı)
- Logo **140px** (eskisi 70px'di — küçük kalıyordu)
- "Mart 2026" eyebrow + "Fiyat Teklifi" H1 — Vercel receipt patterni
- Müşteri bloğu **beyaz kart, hafif border**, accent şerit üstte
- **QR kod sol altta** — `qrcode` paketi ile PNG embed, dijital sürüm linkine yönlendirir
- "KAPSAM / GEÇERLİLİK" iki sütun stat
- Footer'da iletişim — restraint, tek satır

### 6b. LINE ITEMS PAGE (Sayfa 2+)

```
┌────────────────────────────────────────────────────────────────┐
│ ALFA SOYLU      FIYAT TEKLİFİ          #QT-2026-0142  2 / 4    │  ← sticky header
│ ──── accent strip 100% width × 1px ─────                         │
│                                                                  │
│ ÜRÜNLER VE FİYATLAR                                              │
│                                                                  │
│ NO  ÜRÜN / AÇIKLAMA              ADET   BİRİM    KDV  TOPLAM     │  ← sticky table head
│ ────────────────────────────────────────────────────────────     │
│  1  AHD-HD-4K-2MP                 10    ₺2.450   %20  ₺24.500   │
│     8 kanal AHD kayıt cihazı                                     │
│     SKU: AHD-2MP-4K                                              │
│ ────────────────────────────────────────────────────────────     │
│  2  Hikvision DS-2CD1043G2-LIUF   25    ₺1.180   %20  ₺29.500   │
│     4MP Bullet IP kamera, IR 30m                                 │
│     SKU: HIK-1043G2                                              │
│ ────────────────────────────────────────────────────────────     │
│                                                                  │
│ ─────────────────────────────────────────────                    │
│ ALFA SOYLU ELEKTRONIK SAN. TIC. LTD. ŞTI.  |  Sayfa 2 / 4       │  ← footer
└────────────────────────────────────────────────────────────────┘
```

**Önemli detaylar:**
- **Sticky header her sayfada otomatik repeat** (`drawPageChrome()` fonksiyonu)
- Tablo başlığı sayfa kırılınca her sayfada yeniden çizilir
- Zebra striping **YOK** — sadece subtle row divider (`border-bottom 0.5pt`)
- Numerik kolonlar **sağa hizalı + Geist Mono**
- KDV oranı `%20` formatında, küçük caption
- Sayfa numarası footer'da "Sayfa X / Y" — Y'yi yazmak için **iki geçişli render**

### 6c. TOTALS + TERMS PAGE (Son Sayfa)

```
┌────────────────────────────────────────────────────────────────┐
│ ALFA SOYLU      FIYAT TEKLİFİ          #QT-2026-0142  4 / 4    │
│                                                                  │
│ FİYAT ÖZETİ                                                      │
│                                                                  │
│                              Ara Toplam        ₺104.530          │
│                              İndirim           -₺0               │
│                              KDV (%20)         ₺20.906           │
│                              ─────────────────                   │
│                                                                  │
│ ┌─────────────────────────────────────────────────────────┐    │
│ │ GENEL TOPLAM                              ₺125.436      │    │
│ │ KDV Dahil  |  TL                          ←28px mono    │    │
│ └─────────────────────────────────────────────────────────┘    │
│   • accent yellow ince şerit solda (4px)                         │
│   • charcoal (#0f0f0f) bg, white text                            │
│                                                                  │
│ Kur: 1 USD = ₺34.20  (TCMB, 27 Mart 2026)                       │
│                                                                  │
│ ─────────────────────────────────────────────                    │
│                                                                  │
│ ÖDEME BİLGİLERİ                                                  │
│ ┌──────────────────────────────────────────────────────────┐    │
│ │ Garanti Bankası          Ticari Hesap                    │    │
│ │ TR12 0006 2000 0000 0006 0001 23      ← IBAN MONO 14px  │    │
│ │ Alfa Soylu Elektronik San. Tic. Ltd. Şti.                │    │
│ └──────────────────────────────────────────────────────────┘    │
│                                                                  │
│ TİCARİ KOŞULLAR                                                  │
│ Ödeme: %50 sipariş, %50 teslimat                                 │
│ Teslimat: 5-7 iş günü içinde, ücretsiz kargo                     │
│ Garanti: 2 yıl üretici garantisi                                 │
│ Not: Stoklarımız sınırlıdır, geçerlilik süresine dikkat ediniz. │
│                                                                  │
│ ─────────────────────────────────────────────                    │
│                                                                  │
│ KABUL                                                            │
│ Bu teklifi koşullarıyla birlikte kabul ediyorum.                 │
│                                                                  │
│ Müşteri imzası: ______________________  Tarih: ____ / ____ / ___│
│                                                                  │
│ Online onay: iotomasyon.com/q/abc123/accept                      │
│                                                                  │
│ ─────────────────────────────────────────────                    │
│ ALFA SOYLU ELEKTRONIK SAN. TIC. LTD. ŞTI.  |  Sayfa 4 / 4       │
└────────────────────────────────────────────────────────────────┘
```

**Önemli detaylar:**
- Subtotal/İndirim/KDV satırları **sağ kolonda, mono, küçük**
- Genel Toplam **dramatic charcoal box**, accent yellow şerit solda (4px), tutar 28px mono
- IBAN **mono 14px** — kopyalanabilir görünür
- Acceptance section **boş imza satırı** + dijital onay linki
- Footer **legal name + sayfa no** her sayfada aynı

---

## 7. Teknik Mimari

### 7a. Modüler Yapı

Mevcut **tek-dosya route handler** yerine, ayrı bir generator modülü:

```
lib/quote-pdf/
├── index.ts                    ← public API: buildQuotePdf()
├── pdf-document.ts             ← PDFDocument oluşturma + font + logo embed
├── layout/
│   ├── cover-page.ts           ← sayfa 1
│   ├── line-items.ts           ← sayfa 2-N
│   ├── totals-page.ts          ← son sayfa
│   └── page-chrome.ts          ← header + footer (her sayfa)
├── primitives/
│   ├── typography.ts           ← drawText helpers (TYPE token'ları)
│   ├── table.ts                ← table primitive (header + row + page break)
│   ├── card.ts                 ← card with border + accent strip
│   └── qr-code.ts              ← qrcode lib + embed PNG
├── currency.ts                 ← format/convert helpers
└── types.ts                    ← QuotePdfOptions interface

app/(app)/quotes/[id]/pdf/route.ts
  → 30 satır (auth + quote fetch + buildQuotePdf çağrısı + Response)
```

**Faydaları:**
- **Test edilebilir** (her layout fonksiyonu izole)
- **Yeniden kullanılabilir** (catalog PDF de paylaşılan primitivleri kullanabilir)
- **Bakım kolay** (cover değiştirmek için cover-page.ts'i aç)

### 7b. 2026 Teknoloji Tercihleri

| Teknoloji | Karar | Gerekçe |
|---|---|---|
| **pdf-lib** | ✅ Devam | Vector PDF, mevcut altyapı, fontkit subset, performans iyi |
| **@react-pdf/renderer** | ❌ Geçiş yok | JSX cazip ama mevcut pdf-lib kodu/cataloğu paralel; iki ayrı motor karmaşa |
| **Puppeteer / HTML→PDF** | ❌ | 5x daha ağır, soğuk başlangıç sorunlu, Vercel timeout riski |
| **@vercel/og** | ⚠️ Kısmen | OG image için kullanılabilir ama PDF içeriği için image-based PDF olur (copy/paste yok) |
| **pdfme** | ❌ | Template-based, programmatic özgürlük az |
| **qrcode** (npm) | ✅ Yeni | QR kod üretmek için, PNG output → pdf-lib `embedPng` |
| **Geist Mono** | ✅ Yeni | Numerikler için, font dosyası eklenecek |

### 7c. Yeni Dependencies

```json
{
  "dependencies": {
    "qrcode": "^1.5.4"      // QR code generation
  },
  "devDependencies": {
    "@types/qrcode": "^1.5.5"
  }
}
```

Font dosyaları (`public/fonts/` veya `lib/quote-pdf/fonts/`):
- `Geist-Regular.ttf` (var)
- `Geist-Medium.ttf` (yeni — bold yerine medium hissi için)
- `Geist-Semibold.ttf` (yeni)
- `GeistMono-Regular.ttf` (yeni)
- `GeistMono-Medium.ttf` (yeni)

Tüm font'lar `fontkit subset:true` ile embed edilecek — PDF boyutu artmaz (tek tek glyph subset).

### 7d. Page Break Stratejisi

Şu anki kod **manuel `ensureSpace()`** ile çalışıyor — hata-eğilimli. Yenisi:

```ts
class PdfDocument {
  // Otomatik page break: render() çağrısı yetersiz alan görürse yeni sayfa
  renderBlock(block: BlockSpec) {
    const measured = this.measure(block);
    if (this.yCursor - measured.height < this.minY) {
      this.startNewPage();
    }
    block.draw(this.currentPage, this.yCursor);
    this.yCursor -= measured.height;
  }

  startNewPage() {
    this.currentPage = this.pdf.addPage();
    this.pageNumber++;
    this.drawHeader();   // sticky chrome
    this.drawFooter();
    this.yCursor = this.contentTop;
  }
}
```

**Bonus:** İki-geçişli render ile **Sayfa X / Y** doğru göster:
- 1. geçiş: tüm sayfaları render et, page count'u hesapla
- 2. geçiş: footer'lara `Sayfa 1 / 4`, `Sayfa 2 / 4`, ... yaz

---

## 8. Yeni Özellikler (2026 standardı)

### 8a. QR Kod → Dijital Sürüm

- Cover sayfasında **80x80px QR kod**
- URL: `https://iotomasyon.com/q/{shareToken}`
- Müşteri telefonla taradığında **public quote sayfası** açılır (HTML, mobil uyumlu)
- Public quote sayfası (Faz 2 implement) → kabul/red butonları + revision history
- **Bu doc'un scope'unda QR kodun PDF'e basılması yeterli — public sayfa Faz 2.**

### 8b. Page Numbers (Sayfa X / Y)

- Her sayfa footer'ında: `Sayfa 2 / 4`
- Mono font, sağa hizalı
- İki-geçişli render ile total sayfa sayısını yazılabilir

### 8c. Revision Watermark

- `quote.version > 1` ise sayfa kenarına diagonal watermark
- "REVİZYON 2" — light gray, 80px, rotated -30°, opacity 0.06
- Sadece **cover page'de** göster (line items'ı kirletmesin)

### 8d. Acceptance Section

- Son sayfada **"KABUL"** section
- "Bu teklifi koşullarıyla kabul ediyorum"
- İmza satırı (boş çizgi) + tarih alanı
- Online onay linki (QR ile aynı yere yönlendirir)

### 8e. Stok Durumu Inline

- Line items tablosunda her ürün için **stok rozet** (opsiyonel):
  - ● Stokta (yeşil dot)
  - ◐ Az stokta (3 adet) (sarı dot)
  - ○ Sipariş üzerine (gri dot)
- Müşteri "ne kadar bekleyeceğini" anlasın
- 1 küçük caption olarak SKU altına

### 8f. Discount Visualization

- Line item'da `discount > 0` varsa:
  - Birim fiyat: `~~₺2.450~~ ₺2.205` (struck-through önceki + yeni)
  - İndirim oranı yanında: `-%10`
- Mono font ile

### 8g. Multi-page TOC (Optional, scope dışı)

- 4+ sayfalık tekliflerde 2. sayfada "İçindekiler" — şu an scope dışı, ileride

---

## 9. Implementation Faz Planı

### Faz 1 — Modüler refactor (Hazırlık)
**Hedef:** Mevcut PDF'in görsel/işlevsel sürümünü, yeni modüler mimariye taşı (visual değişiklik yok)

- [ ] `lib/quote-pdf/` dizini oluştur
- [ ] `pdf-document.ts` — PDFDocument + font registration + helper'lar
- [ ] `primitives/typography.ts` — drawText, drawCentered, wrapText helpers
- [ ] `primitives/table.ts` — table primitive (header + row + iteration)
- [ ] `currency.ts` — `pdfAmt`, `pdfLines` (mevcut kodun extract'i)
- [ ] `route.ts`'i 493 → ~30 satıra düşür
- [ ] Build + tsc temiz, görsel çıktı **birebir eski PDF**

**Çıktı:** PR (visual diff yok ama mimari hazır). ~2 saat.

### Faz 2 — Geist Mono + yeni renk paleti
**Hedef:** Tipografi ve renk paletini 2026 standardına çek

- [ ] GeistMono-Regular.ttf + Medium.ttf font dosyalarını ekle
- [ ] `TYPE` token'larını uygula (TYPE.body, TYPE.monoMoney, vb.)
- [ ] Yeni `C` paletini uygula (accent yellow, charcoal yerine ink)
- [ ] Mevcut PDF'in görselini yeni palet/tipografi ile yenile (cover/items/totals)
- [ ] Eski orange'ı tüm dosyadan kaldır

**Çıktı:** PR — visual diff var: yeni renk + tipografi. ~3 saat.

### Faz 3 — Yeni cover page
**Hedef:** Cover sayfasını HubSpot/Vercel kalitesine çek

- [ ] `layout/cover-page.ts` yeni dosya
- [ ] Logo 140px, üst sağ 3-çubuk accent
- [ ] "Mart 2026" eyebrow + "Fiyat Teklifi" H1
- [ ] Müşteri kartı 22px isim + meta satır
- [ ] Cover note (varsa) — bordered card
- [ ] QR kod sol altta (qrcode lib + embedPng)
- [ ] KAPSAM/GEÇERLİLİK iki sütun stat
- [ ] Revision watermark (eğer version > 1)

**Çıktı:** PR — cover yeni, line items + totals eski (geçiş fazı). ~3 saat.

### Faz 4 — Yeni line items + totals + acceptance
**Hedef:** İçerik sayfalarını ve totals'ı yenile, kabul bölümü ekle

- [ ] `layout/line-items.ts` — sticky table header repeat
- [ ] Zebra striping kaldır, subtle 0.5pt divider
- [ ] Mono tabular sayılar, sağa hizalı
- [ ] Stok rozet inline (varsa)
- [ ] İndirim struck-through (varsa)
- [ ] `layout/totals-page.ts` — yeni totals tasarımı
- [ ] Genel Toplam dramatic charcoal box (accent yellow şerit solda)
- [ ] IBAN mono 14px ödeme bilgileri kartı
- [ ] Acceptance section + imza satırı + dijital onay link
- [ ] Footer "Sayfa X / Y" (iki-geçişli render)

**Çıktı:** PR — tam yeni PDF. ~4 saat.

### Faz 5 — Quality polish + edge cases
**Hedef:** Production-ready

- [ ] Çok kalemli teklif (50+) testleri — page break smooth mu?
- [ ] BOTH currency mode (TRY + USD birlikte) görsel test
- [ ] Uzun açıklamalı kalem (200 karakter) test
- [ ] Çok uzun firma adı (50 karakter) test
- [ ] Tek kalemli teklif (sadece cover + 1 satır + totals)
- [ ] Notes 500 karakter test
- [ ] Footer pagination accuracy
- [ ] QR kod scannable mı (telefondan test)
- [ ] Print önizleme — A4 sığma kontrolü
- [ ] PDF boyutu (target: <500KB tipik teklif)
- [ ] Metadata: title, author, subject, keywords set
- [ ] Feature flag `FEATURE_NEW_QUOTE_PDF=true` ile A/B paralel deploy

**Çıktı:** Final PR + production rollout. ~3 saat.

**Toplam tahmini süre:** ~15 saat (5 faz × 3 saat ortalama)

---

## 10. Test Stratejisi

### 10a. Visual Regression
- **Önce/sonra PDF görsel karşılaştırma**: tipik 5-kalemli teklif, BOTH currency, indirimli kalem
- Eski versiyon (`?old=1` query param) feature flag ile paralel erişilebilir kalsın

### 10b. Edge Cases (manuel)
| Durum | Beklenti |
|---|---|
| 1 kalem | Cover + 1 sayfa, totals alta sığar |
| 50 kalem | 4-5 sayfa, smooth page break |
| BOTH currency | Her kalemde 2 satır (USD + TRY) |
| Uzun ad (50+ karakter) | Ellipsis, taşma yok |
| Uzun not (500 karakter) | Notes wrap, max 8 satır |
| Revision 2 | Cover'da watermark |
| Cover note yok | Boş kart gösterilmez |
| Logo yok | Fallback orange bar (eski davranış korunur) |

### 10c. Automated Tests
- `lib/quote-pdf/__tests__/currency.test.ts` — pdfLines, pdfAmt edge cases
- `lib/quote-pdf/__tests__/table.test.ts` — page break logic
- Visual snapshot test: SVG export et, Playwright ile karşılaştır (opsiyonel)

### 10d. Browser Test (Claude in Chrome MCP)
- Üretim deploy sonrası: gerçek bir teklif aç, PDF indir, ekran görüntüsü al
- 3 farklı senaryoda (kısa/uzun/multi-currency) test et

---

## 11. Migration & Rollout

### 11a. Feature Flag
```ts
// lib/feature-flags.ts
export const FEATURES = {
  NEW_QUOTE_PDF: process.env.FEATURE_NEW_QUOTE_PDF === "true",
};
```

- Vercel'de **Preview**: `FEATURE_NEW_QUOTE_PDF=true`
- Vercel'de **Production**: önce `false` (eski PDF), test sonrası `true`
- `?preview=new` query param ile elle override edilebilir

### 11b. Rollback Plan
- Eski generator dosyasını `route.ts` içinde tut, `?old=1` query ile erişilebilir
- Sorun çıkarsa env flag'i `false`'a çek, restart gereksiz

### 11c. Communication
- Customer'a giden ilk birkaç teklifte yeni format için **kısa açıklama** (e-posta'da değil PDF'in cover'ında bir satır):
  > "Bu teklif yenilenmiş formatımızla hazırlanmıştır. Geri bildiriminiz değerlidir."

---

## 12. Başarı Kriterleri

### Niceliksel
- ✅ Build + tsc temiz (her faz)
- ✅ PDF boyutu < 500KB (tipik 5 kalemli teklif)
- ✅ Render süresi < 800ms (P95)
- ✅ Page break edge case'leri (1/5/50 kalem) sorunsuz
- ✅ QR kod telefondan tarandığında çalışır (https + valid token)

### Niteliksel (kullanıcı algısı)
- ✅ Müşteri PDF'i açtığında "premium" hissi
- ✅ Genel toplam ilk bakışta görünüyor
- ✅ IBAN tek tıkla kopyalanabilir görünüyor (mono font)
- ✅ Sayfalar arası tutarlı (sticky header)
- ✅ Stripe/Linear seviyesinde minimalism

### Karşılaştırmalı (eski vs yeni)
- Tasarım inceleme: kullanıcı (sen) onayı
- A/B mini-test: 5 müşteriye yeni format gönderildiğinde dönüş süresi / kabul oranı

---

## 13. Geleceğe Yönelik (scope dışı)

- **E-imza entegrasyonu** — DocuSign / iyzico Çevrimiçi İmza
- **Çoklu dil** — İngilizce teklif (uluslararası bayiler için)
- **Müşteri portalı** — Public quote sayfasında kabul/red butonu, revision history
- **Live preview** — admin paneli kotacısı yazarken canlı PDF preview
- **Watermark on demand** — "TASLAK", "ÖRNEK", "İPTAL" damgaları
- **Embedded video link** — QR kodun yanında "Tanıtım videosu" linki
- **AI-powered cover note** — müşteri bilgisinden otomatik kişiselleştirilmiş ön söz önerisi (Vercel AI Gateway)

---

## 14. Karar Verme Noktaları (Senin Onayın Lazım)

1. **Cover'da Türkçe vs İngilizce**: "FİYAT TEKLİFİ" mi, "QUOTATION" mı, "TEKLİF #QT-..." mi? → Önerim: Türkçe + numara mono.
2. **Accent yellow PDF'te ne kadar kullanılsın**: Sadece "Genel Toplam" şeridi mi, yoksa cover'da accent çubuklar + section divider'lar da mı? → Önerim: Cover'da 3 küçük accent şerit + Genel Toplam şeridi, başka yer yok (restraint).
3. **QR kod hangi link'e gitsin**: Şu anki sistemde public quote sayfası yok. Faz 2'de eklenecek. Şimdilik `/quotes/[id]/preview` route'una mı yönlendirelim? → Önerim: Şimdilik dummy URL göster (`iotomasyon.com/q/{token}`), public sayfa hazırlanınca aktif olur.
4. **İmza alanı dijital onay zorunlu mu**: Online onay her zaman var olsun mu (URL göster), yoksa sadece müşteri istemişse mi? → Önerim: Her zaman göster, kullanmak müşterinin tercihi.
5. **Eski PDF erişilebilir kalsın mı**: `?old=1` query ile eski format erişilebilir kalsın mı (rollback için), yoksa yenisi hard cut over mı? → Önerim: 30 gün boyunca `?old=1` aktif, sonra silinir.

---

## 15. Şu An İçin Sonraki Adım

Bu doc onaylandıktan sonra:
1. **Faz 1** branch'i açılır (`claude/quote-pdf-refactor`)
2. Modüler yapı kurulur, görsel değişiklik yok, hızlı PR
3. Faz 2 başlar (`claude/quote-pdf-typography`)
4. Her faz **kendi PR'ı** — risk küçük, kolay rollback
5. Her faz sonunda **PDF örneği** sana gösterilir, onay alınır
6. Faz 5'in sonunda **production rollout + browser smoke test**

---

> **Not:** Bu doc, mevcut catalog PDF (PR #67'de yenilenmiş) ile tutarlı bir kalite seviyesi hedefler. İki PDF aynı dile konuşmalı: müşteri Soylu'dan bir doküman aldığında "bu aynı firma" demeli.

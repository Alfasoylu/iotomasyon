# CHANGELOG

## Changelog Rules

- Only completed and verified work should be listed.
- Do not add future planned work.
- If a change is inferred from documentation but not independently verified in code, avoid wording it as fully implemented.
- ROADMAP items must not appear here unless implemented.

## 2026-05

### Phase 71 — PRODUCT PROFIT ENGINE REFACTOR (2026-05-18)

**Amaç:**
MarketplacePrice tablosu eklenerek fiyat verisi dağınık XML alanlarından kanonik bir kayıt defterine taşındı. Ürün listesine kâr sütunları eklendi, health cue'lar yeniden düzenlendi, XML sync MarketplacePrice'a yazıyor, ürün detay Trendyol Kâr Analizi kartı MarketplacePrice'ı birincil kaynak olarak kullanıyor.

Değişiklikler:
- **`prisma/schema.prisma`**: `PriceMarketplace` enum (TRENDYOL/HEPSIBURADA/AMAZON/N11/PAZARAMA/IDEFIX/WEBSITE/OTHER), `PriceSource` enum (XML/API/MANUAL), `MarketplacePrice` model (`@@unique([productId, marketplace])`); Product modeline `marketplacePrices MarketplacePrice[]` ilişkisi eklendi
- **`lib/actions/xml-sync-actions.ts`**: `runSync()` başında exchange rate çekiliyor; step 7b eklendi — her XML sync sonrası TRENDYOL/HEPSIBURADA/AMAZON/PAZARAMA/IDEFIX için batch upsert (20'lik gruplar, USD×usdTryRate dönüşümü)
- **`services/product-service.ts`**: `listProducts` + `getProductById` includelerine `marketplacePrices` eklendi
- **`app/(app)/products/page.tsx`**: `getHealthCues()` yeniden düzenlendi (Maliyet eksik / Ağırlık eksik / Trendyol fiyat yok); `calcProfit()` fonksiyonu eklendi (kargo=10 USD/kg, gümrük=customsRatePct, komisyon=%20, sabit kesinti=₺150 >₺250); Durum tierleri: LOSS/LOW/GOOD/EXCELLENT; tabloya 4 yeni sütun: Net Kâr / Marj% / ROI / Durum
- **`app/(app)/products/[id]/page.tsx`**: `trendyolPriceTry` hesabı MarketplacePrice'ı birincil, xmlData'yı fallback olarak kullanıyor; kart alt başlığı kaynak etiketini (XML/Manuel) gösteriyor
- **Migration**: `20260518000000_phase71_marketplace_price_table` (Supabase MCP ile apply_migration)
- **Backfill**: 1715 satır — TRENDYOL:646 / HEPSIBURADA:584 / AMAZON:221 / PAZARAMA:146 / IDEFIX:118 (usdTryRate=46.0)
- **Legacy fields preserved**: `unitCostTry`, `sellingPriceTry`, `marketplacePriceTry`, `importUnitCostUsd`, `sourceCostRmb`, `shippingCostOverride` korundu; 51+ dosya bunlara referans veriyor; Phases 3+4 (column drop) ertelendi

SKU 2251930284620 doğrulanan metrikler (MarketplacePrice kaynaklı): Trendyol Satış ₺383.33 (XML) | Net Kâr ₺44.80 | Marj %11.7 | ROI %40.1 | Durum: Düşük

Durum: tsc 0 yeni hata ✓, lint pre-existing ✓, commit 4e40c2a ✓, READY dpl_FYRZSLcUkmHYodP3ScbLUVyBG3AY ✓, browser-verified 2026-05-18 ✓

---

### Bugfix — Maliyet/Kâr Hesaplama Akışı (2026-05-18)

**Amaç:**
SKU 2251930284620 üzerinde tespit edilen 4 UI bug'ı düzeltildi: "Maliyet yok" ve "Fiyat yok" health badge'leri RMB/XML verisi varken yanlış gösteriliyordu; kâr analizi hiçbir yerde görünmüyordu; rmbUsdRate DB null olduğunda import decision MISSING_DATA dönüyordu.

Değişiklikler:
- `services/product-service.ts`: `xmlData: { select: { xmlTrendyolPrice: true } }` join eklendi — XML Trendyol fiyatı liste sayfasına aktarılıyor
- `app/(app)/products/page.tsx`:
  - `getHealthCues()` tip genişletildi: `sourceCostRmb`, `importUnitCostUsd`, `marketplacePriceTry`, `xmlTrendyolPrice`
  - "Maliyet yok": `!unitCostTry && !sourceCostRmb && !importUnitCostUsd` koşuluna güncellendi
  - "Fiyat yok": `!sellingPriceTry && !marketplacePriceTry && !xmlTrendyolPrice` koşuluna güncellendi
  - Call site: `xmlTrendyolPrice: product.xmlData?.xmlTrendyolPrice ?? null` ile besleniyor
- `app/(app)/products/[id]/page.tsx`:
  - `rmbUsdRate`: `?? 7.0` default değer eklendi (DB null → import engine artık çalışıyor)
  - `sellingPriceTry` fallback: `xmlTrendyolPrice * usdTryRate` eklendi
  - "Trendyol Kâr Analizi" kartı eklendi: sourceCostRmb + weightKg + xmlTrendyolPrice olan ürünlerde gösterilir; kargo 8 USD/kg, komisyon %20, sabit kesinti ₺150 (>₺250 sipariş); 8 metrik grid (RMB alış, Ağırlık+Kargo, Gümrük, Toplam Maliyet, Trendyol Satış, Net Kalan, Net Kâr+Marj, ROI); renk kodlu: emerald pozitif, amber düşük, red negatif
- `components/products/product-form.tsx`: Fiyatlandırma bölümü başlığı "Manuel fiyatlandırma ve TL maliyet (opsiyonel)" olarak yeniden etiketlendi; açıklama paragrafı eklendi
- Schema değişikliği: YOK

Doğrulanan değerler (SKU 2251930284620, usdTryRate=46, rmbUsdRate=7):
- RMB alış: ¥10.00 = ₺65.71 | Kargo: ₺18.40 | Gümrük: ₺25.23 | Toplam maliyet: ₺109.35
- Trendyol satış: ₺383.33 (XML $8.333) | Net kalan: ₺156.67 | Net kâr: ₺47.32 | Marj: %12.3 | ROI: %43.3

Durum: tsc 0 yeni hata ✓, commit 46da9ee ✓, READY dpl_2gbAExUU9G2ZgUVD799v9rowUqVj, browser-verified 2026-05-18 ✓

---

### Phase 79 — İthalatçı Görünümü (2026-05-18)

**Amaç:**
Ürünler listesine admin-only "İthalatçı Görünümü" eklendi. Tüm ithalat ekonomisi (alış maliyeti, kargo, gümrük, kâr, ROI, stok günleri) tek tabloda hesaplanıp gösteriliyor. Bütçe dağılımı ve sipariş önerisi client-side çalışıyor — parametreler gerçek zamanlı değiştirilebilir.

Değişiklikler:
- **`lib/importer-cost.ts`** (YENİ): Saf hesaplama kütüphanesi — `calcImportCost()`, `calcRevenue()`, `calcProfit()`, `calcStockDays()`, `calcDecisionLabel()`, `calcHealthScore()`, `allocateBudget()`. Sabitler: AIR=8$/kg, SEA=1$/kg, SEA_AUTO≥5kg, AIR_CYCLE=120g, SEA_CYCLE=210g, komisyon=%20, sabit kesinti=₺150
- **`app/api/products/importer-view/route.ts`** (YENİ): ADMIN-only API endpoint — rol kontrolü (ADMIN || isOwner), MonthlyExchangeRate çekme, T30G velocity (son 30g, iptal filtreli), tüm hesaplamalar server-side. `ImporterProduct[]` döner. Hassas alanlar (maliyet, kâr) non-admin'e asla gönderilmez
- **`components/products/importer-view-client.tsx`** (YENİ): `/api/products/importer-view` fetch, `allocateBudget()` useMemo, 6 özet kart (stok maliyeti/aylık kâr/önerilen bütçe/ilk10 kâr/veri eksik/zarar eden), bütçe parametreleri paneli, filtre sekmesi (Sipariş Önerisi/Yüksek ROI/Zarar/Maliyet Eksik/T.Fiyat Yok/Düşük Stok), sort butonları, 16 sütunlu tablo
- **`app/(app)/products/page.tsx`** (GÜNCELLENDİ): `?view=importer` param; admin-only view switcher toggle; `ImporterViewClient` koşullu render
- **Prisma client**: `npx prisma generate` — `marketplacePrices` ilişkisi `ProductInclude`'a eklendi (Phase 71'den beri stale)
- Schema değişikliği: YOK

Doğrulanan değerler (browser):
- 762 ürün / Sipariş Önerisi: 2 / Yüksek ROI: 19 / Zarar: 3 / Maliyet Eksik: 735
- Stok maliyeti: $12,445 | Aylık kâr: $274 | Önerilen bütçe: $1,062

Durum: tsc 0 hata ✓, commit 59433f9 ✓, READY dpl_AHpCzDDTJL5kEJr9tN1y5oSBbbu1 ✓, browser-verified 2026-05-18 ✓

---

### Phase 78 — Toplu İthalat Verisi Girişi — XLSX (2026-05-18)

**Amaç:**
Ürün başına ithalat alanlarını (sourceCostRmb, weightKg, customsRatePct, shippingMethodPref, importPaymentFeePct) toplu düzenlemek için Excel şablonu indir-doldur-yükle akışı. CSV'nin Türkçe karakter sorununu çözmek için xlsx formatına geçildi.

Değişiklikler:
- **`app/api/products/bulk-export/route.ts`**: SheetJS ile `.xlsx` üretimi — koyu mavi kalın başlık, eksik hücre sarı vurgusu, kolon genişlikleri, dondurulmuş satır
- **`app/api/products/bulk-import/route.ts`**: SheetJS ile `.xlsx` ve `.csv` parse; toplu Prisma update; boş hücre → mevcut değer korunur
- **`components/products/product-bulk-buttons.tsx`** (YENİ): Ürünler listesi header'ına inline ⬇/⬆ butonları; sonuç özeti (X güncellendi, Y atlandı)
- **`app/(app)/products/page.tsx`**: `ProductBulkButtons` header'a eklendi
- **`package.json`**: `xlsx@^0.18.5` eklendi
- **`docs/CODEX_INSTRUCTIONS.md`**: Entegra ERP stok mimarisi belgelendi

Durum: tsc clean ✓, commit eeb240f ✓, READY dpl_6Qh1AEHrAKf6GQpm5QumWdNgK6NA ✓, browser-verified ✓

---

### Phase 70 — Trendyol Rapor Ay Drill-Down (2026-05-17)

**Amaç:**
Trendyol aylık raporu 12 aylık özet tabloya sahipti ama bir aya tıklayıp o ayın en çok satan ürünlerini görmek mümkün değildi. Drill-down bu interaktiviteyi ekliyor.

Değişiklikler:
- `app/(app)/admin/trendyol-report/page.tsx`:
  - `searchParams` eklendi, `selectedMonth` (YYYY-MM) parse ediliyor
  - `drillSales`: selectedMonth varsa o aya, yoksa son 30 güne filtreleniyor
  - `drillLabel`: "Son 30 Gün" ya da "Oca 2026" gibi
  - Aylık tablo satırları: Link to `?month=YYYY-MM`; seçili satır `bg-slate-900 text-white`
  - Top-10 kart başlığı `drillLabel` kullanıyor; "← Son 30 güne dön" back-link
  - Boş durum mesajı `drillLabel` ile dinamik
- Schema değişikliği: YOK

Durum: tsc clean ✓, commit 34b83e2 ✓, READY dpl_7ZWTqV8XZG43kfxH9M363sX9KtQu, browser-verified 2026-05-18 ✓

---

### Phase 69 — Siparişler Sayfası Arama (2026-05-17)

**Amaç:**
/orders sayfası 5 sekme ve sayfalama sunuyordu ama ürün bazında sipariş bulmak için tüm listeye bakılması gerekiyordu. Arama çubuğu bu süreyi saniyelere indiriyor.

Değişiklikler:
- `app/(app)/orders/page.tsx`:
  - `q` search param eklendi
  - `searchFilter: Prisma.TrendyolSalesRecordWhereInput` — `q ≥ 2 char` ise OR on `productName` / `barcode` / `merchantSku` / `orderId`
  - Tab sayaçları (`totalOrders`, `totalDelivered`, `totalCancelled`, `totalUnmatched`) artık `searchFilter` ile filtreleniyor
  - Returns tab query da `q` ile `productName` filtreliyor
  - `salesWhere` `searchFilter` ile birleştiriliyor (`AND`)
  - `tabHref()` q parametresini koruyor
  - Arama formu UI: `<form method="GET">` + input + Ara butonu + ✕ Temizle linki
- Schema değişikliği: YOK

Durum: tsc clean ✓, commit 6986a2e ✓, READY dpl_7ZWTqV8XZG43kfxH9M363sX9KtQu, browser-verified 2026-05-18 ✓

---

### Phase 68 — Ürün XML Stok Değişim Geçmişi (2026-05-17)

**Amaç:**
Phase 49 XML stok değişim loglarını global /admin/xml-sync sayfasına ekledi ama ürün bazında bakılamıyordu. Ürün detay sayfasında kendi stok geçmişi görünmeli.

Değişiklikler:
- `app/(app)/products/[id]/page.tsx`:
  - `xmlStockChangeLogs` Promise.all'a eklendi: `prisma.xmlStockChangeLog.findMany({ where: { productId }, orderBy: { syncedAt: "desc" }, take: 30 })`
  - "XML Stok Değişim Geçmişi" kartı StockAdjustmentCard öncesine eklendi
  - Tablo: Tarih / Önceki Qty / Yeni Qty / Delta (emerald + / red - / slate 0)
  - Kart yalnızca log varsa render edilir
- Schema değişikliği: YOK

Durum: tsc clean ✓, commit 24fb968 ✓, READY dpl_7ZWTqV8XZG43kfxH9M363sX9KtQu, browser-verified 2026-05-18 ✓

---

### Phase 67 — Admin Dashboard Trendyol MoM Karşılaştırma (2026-05-17)

**Amaç:**
Admin dashboardunda Trendyol'un bu ay ve geçen ay performansını (sipariş adedi, ciro, eşleşme oranı) delta arrow'larla karşılaştırmak. Tek bakışta "bu ay daha iyi mi daha kötü mü?" sorusunu yanıtlar.

Değişiklikler:
- `services/dashboard-service.ts`:
  - `getAdminEnhancedData()` Promise.all'a 2 yeni sorgu eklendi: `trendyolThisMonth` + `trendyolLastMonth`
  - `cancelledFilter` shared nesnesi (iptal/cancel case-insensitive)
  - `aggregateTrendyol()` yardımcı fonksiyon: orders, revenue, matchRate hesabı
  - `trendyolMoM: { thisMonth, lastMonth }` dönüş değerine eklendi
  - `databaseAvailable: false` fallback'i `emptyMoM` ile güncellendi
- `app/(app)/dashboard/_components/admin-workspace.tsx`:
  - "Trendyol Aylık Karşılaştırma" bölümü eklendi (3 kart: Sipariş Adedi / Ciro / Eşleşme Oranı)
  - `DeltaBadge` inline bileşen: ↑ emerald / ↓ red / → slate, yüzde delta ile
  - Geçen ay değerleri alt satırda gri olarak gösteriliyor
- Schema değişikliği: YOK

Durum: tsc clean ✓, commit 8ed85e7 ✓, READY dpl_3gPeDmEfFq6DcbYaE1eWohps9SWi

---

### Phase 66 — Import Cockpit Stok Kapsamı Kolonu (2026-05-17)

**Amaç:**
Import cockpit'te "Stok" kolonu adet gösteriyordu ama bu adedi satış hızına bölünce kaç günlük stok kaldığı görünmüyordu. "Kapsama" kolonu bu hesabı yaparak acil satın alma kararlarını netleştirir.

Değişiklikler:
- `app/(app)/admin/import-cockpit/page.tsx`:
  - `Row.daysOfCoverage: number | null` tipi eklendi
  - `daysOfCoverage = Math.round(stockQuantity / (effectiveMonthlyUnits / 30))` — `effectiveMonthlyUnits` null veya sıfırsa null
  - Yeni "Kapsama" sütunu (Stok ile Kaynak arasına): red ≤30g / amber 31-90g / slate >90g; "—" veri yoksa
- Schema değişikliği: YOK; yeni DB sorgusu YOK

Durum: tsc clean ✓, commit 1be7075 ✓, READY dpl_3gPeDmEfFq6DcbYaE1eWohps9SWi

---

### Phase 65 — Ürün Listesi T30G Satış Hızı Kolonu (2026-05-17)

**Amaç:**
Admin ürün listesinde hangi ürünün son 30 günde Trendyol'da ne kadar sattığını tek bakışta göremiyordu. Yeni T30G kolonu bu sinyali doğrudan tabloya ekler.

Değişiklikler:
- `app/(app)/products/page.tsx`:
  - `prisma` import eklendi
  - `listProducts()` ile paralel `trendyolSalesRecord.findMany` — son 30 gün, matched (productId not null), non-cancelled (iptal/cancel case-insensitive)
  - `velocity30d: Map<productId, qty>` build edildi
  - Yeni "T30G" sütunu (Stok ile Sağlık arasında): emerald font ≥10 adet, amber ≥3, slate <3, "—" eşleşme yoksa
  - `colSpan` 7 → 8 güncellendi
- Schema değişikliği: YOK

Durum: tsc clean ✓, commit bbb39b1 ✓, READY dpl_3gPeDmEfFq6DcbYaE1eWohps9SWi

---

### Phase 64 — Trendyol Aylık Satış Trendi Kartı (2026-05-17)

**Amaç:**
Ürün detay sayfasında o ürünün Trendyol'daki aylık satış eğilimini görmek — büyüyor mu, küçülüyor mu? Mevcut TrendyolSalesRecord verisi schema değişikliği olmadan kullanıldı.

Değişiklikler:
- `app/(app)/products/[id]/page.tsx`:
  - `toMonthKey()` + `monthTrendMap` — mevcut `activeRecords` üzerinden aylık aggregation
  - `trendDir: "up" | "down" | "flat" | "none"` — son ay vs önceki ay qty karşılaştırması
  - `trendMonthLabel()` — "Oca 2026" formatı
  - Yeni "Trendyol Aylık Satış Trendi" kartı (Phase 26 Realized Sales kartının altında):
    - Trend badge: ↑ Artış (emerald) / ↓ Düşüş (red) / → Sabit (slate)
    - Tablo: Ay / Adet (+/- delta vs önceki ay) / Ciro / Ort. Fiyat; Son satır badge'i
    - Totals footer row
    - Kart yalnızca veri varsa render edilir
- Schema değişikliği: YOK

Durum: tsc clean ✓, commit 7fdc124 ✓, READY dpl_3gPeDmEfFq6DcbYaE1eWohps9SWi

---

### Phase 63 — Trendyol Aylık Satış Raporu (2026-05-17)

**Amaç:**
Yönetici takımın Trendyol satış performansını tek ekranda izleyebilmesi için son 12 aylık sipariş, ciro, iade ve eşleşme oranı raporu oluşturuldu. Mevcut TrendyolSalesRecord + TrendyolReturnRecord tablolarından schema değişikliği olmadan türetildi.

Değişiklikler:
- `app/(app)/admin/trendyol-report/page.tsx` (YENİ):
  - EXECUTIVE_READ permission gate; `force-dynamic` export
  - Parallel fetch: son 12 ay TrendyolSalesRecord + TrendyolReturnRecord
  - JS-side monthly aggregation: `toMonthKey()` + `isCancelled()` filtresi
  - `MonthData` tip: totalOrders, totalUnits, grossRevenue, matchedOrders, returnCount, returnValue
  - 12 ay aylık özet tablosu: Ay / Sipariş / Adet / Brüt Ciro / İade / İade Oranı (renk kodlu: kırmızı>%15, amber>%8, yeşil diğer) / Net Ciro / Eşleşme % (yeşil≥%70, amber≥%40, kırmızı<%40)
  - Toplam footer satırı
  - Son 30 gün 6 KPI kartı: Sipariş, Adet, Brüt Ciro, İade, Net Ciro, Eşleşme %
  - Top-10 eşleşmiş ürün ciro tablosu (ürün linkleri dahil)
  - Boş durum fallback → /admin/marketplace-mappings linki
- `app/(app)/layout.tsx`: "Trendyol Raporu" nav item eklendi (İthalat & Analiz, EXECUTIVE_READ)
- Schema değişikliği: YOK

Kabul kriteri:
- KPI kartları render oluyor: 659 sipariş, ₺612.218 brüt ciro ✓
- Aylık tablo: May/Nis/Şub 2026 satırları, iade oranı renk kodlaması ✓
- Top-10 ürün tablosu product linki dahil görünüyor ✓
- Sidebar "Trendyol Raporu" linki aktif ✓
- Vercel READY: dpl_5DHWKsJJ6L5N61Ti8iNZopndpriH ✓

---

### Phase 62 — TrendyolReturnRecord Normalized Re-Match (2026-05-17)

**Amaç:**
Phase 61 normalizeKey() mantığını yalnızca TrendyolSalesRecord için uyguladı. TrendyolReturnRecord da aynı barcode format uyuşmazlığı sorununa sahipti — null-productId iade kayıtları return analizi ve eşleşme oranından düşüyordu.

Değişiklikler:
- `lib/actions/marketplace-mapping-actions.ts`:
  - `resolveMatch()` yardımcı fonksiyonu eklendi (barcode+SKU normalize çözümlemesini DRY yapar)
  - `prisma.trendyolReturnRecord.findMany({ where: { productId: null } })` — TrendyolSalesRecord ile paralel çekilir
  - İade kayıtları için aynı normalize eşleştirme ve 100'lük batch bulk-update
  - Başarı mesajı: `"${matchedSales} sipariş, ${matchedReturns} iade eşleştirildi. ${remaining} sipariş + ${remainingReturns} iade hâlâ eşleşmemiş."`
- Schema değişikliği: YOK
- Yeni UI: YOK (mevcut RematchNormalizedButton güncellenen mesajı gösterir)

Kabul kriteri:
- Sayfa yükleniyor, buton çalışıyor ✓
- Vercel READY: dpl_FF8MmKYk3BhQMgqaAnhbioSCYgc8 ✓

---

### Phase 61 — Normalized Barcode Re-Match (2026-05-17)

**Amaç:**
Trendyol siparişlerinde barkod formatı uyuşmazlığı (tire, boşluk, büyük/küçük harf) yüzünden 131 barkod / ₺936k ciro eşleşmeden kalıyordu. Bu fazda normalize edilmiş barkod karşılaştırması eklenerek hem yeni siparişlerde (cron sync) hem geriye dönük re-match aracında bu uyuşmazlık çözüldü.

Değişiklikler:
- `app/api/cron/trendyol-sync/route.ts`:
  - `normalizeKey(s)`: `s.replace(/[^a-z0-9]/gi, "").toLowerCase()` helper eklendi
  - `resolveProductId()`: exact → normalized fallback sırasıyla barcode+SKU çözümler
  - `normalizedBarcodeMap` + `normalizedSkuMap` mevcut exact map'lerle paralel build edilir
  - `syncOrders()` ve `syncReturns()` imzaları yeni map'leri kabul edecek şekilde güncellendi
- `lib/actions/marketplace-mapping-actions.ts`:
  - `rematchNormalizedBarcodesAction()`: tüm null-productId TrendyolSalesRecord satırlarını tarar, normalize karşılaştırması ile eşleştirir, 100'lük batch'ler halinde bulk-update
- `components/marketplace/rematch-normalized-button.tsx`: Yeni client component — "Barkodları Normalize Et & Eşleştir" butonu, başarıda sayfa yeniler
- `app/(app)/admin/marketplace-mappings/page.tsx`: `RematchNormalizedButton` header'a eklendi
- Schema değişikliği: YOK

Kabul kriteri:
- "Barkodları Normalize Et & Eşleştir" butonu header'da görünür ✓
- Unmatched inbox: 131 barkod / ₺936.283 gösteriliyor ✓
- Vercel READY: dpl_FM1WF6drTKPn96N8kupT8Gr6tmVU ✓

---

### Phase 60 — Trendyol Velocity → Import Decision Input (2026-05-17)

**Amaç:**
Phase 59 Trendyol satış hızını yalnızca display olarak eklemişti. Bu fazda gerçek Trendyol satış verisi import karar motoruna input olarak beslendi; manual tahmin girilmemiş ama Trendyol satış geçmişi olan ürünler artık MISSING_DATA yerine gerçek skor alıyor.

Değişiklikler:
- `app/(app)/admin/import-decisions/page.tsx`:
  - `manualMonthlyUnits` / `trendyolMonthly` ayrımı yapıldı
  - `effectiveMonthlyUnits = Math.max(manualMonthlyUnits, trendyolMonthly) || null` — her ikisi sıfırsa `null`
  - `monthlyUnitsSource: "trendyol" | "manual" | "combined" | "none"` hesaplandı
  - `calculateImportDecision()` artık `effectiveMonthlyUnits` alıyor (önceden sadece manual)
  - "Talep/ay" hücresi: kaynak badge gösteriyor (emerald=Trendyol, blue=İkisi de, slate=Manuel, "—"=none)
- Schema değişikliği: YOK

Kabul kriteri:
- "Trendyol" emerald badge'ler Talep/ay sütununda görünür ✓
- "İkisi de" mavi badge'ler (manual+trendyol her ikisi de > 0) görünür ✓
- ALWAYS_STOCK ve BUY_SMALL kararlar aktif (Trendyol velocity ile skorlanan ürünler) ✓
- Vercel READY: dpl_8zd2WpGzqG6QVdrWPhi2mvEqgR3R ✓

---

### Phase 59 — Trendyol Satış Hızı (2026-05-17)

**Amaç:**
Import Decisions cockpit'te ürün bazında Trendyol satış hızı yoktu. Hangi ürünün gerçekten satıldığını bilmeden stok kararı vermek güçtü.

Değişiklikler:
- `app/(app)/admin/import-decisions/page.tsx`:
  - 90-günlük pencere hesabı (`ninetyDaysAgo`) eklendi
  - `prisma.trendyolSalesRecord.findMany` son 90 gün, iptal olmayanlar, `productId` eşleşenler — mevcut sorgularla `Promise.all` içinde paralel çalışır
  - `velocityByProduct` map: `productId → { qty90d, monthlyVelocity }` (monthlyVelocity = qty90d / 3)
  - İptal varyant filtresi: "cancel" veya "iptal" içeren status'lar çift filtreden geçer
  - "Trendyol 90g" kolon başlığı eklendi (Gerekli Sermaye ile Talep/ay arasına)
  - Eşleşen ürünler: emerald yeşil `{qty90d} adet` + `~{monthlyVelocity}/ay` ikili display
  - Eşleşmeyen ürünler: `—` slate-300
- Schema değişikliği: YOK (TrendyolSalesRecord ve productId ilişkisi zaten mevcuttu)

Kabul kriteri:
- `/admin/import-decisions` sayfasında "Trendyol 90g" kolon başlığı görünür ✓
- TrendyolSalesRecord ile productId eşleşen ürünlerde emerald yeşil veri gösterilir (2 adet / ~1/ay doğrulandı) ✓
- Eşleşmeyen ürünlerde "—" görünür ✓
- Import karar mantığı (score, recommendation) etkilenmez ✓
- Vercel READY: dpl_9t2yUijYB6a3946XhXFvbnAsq72y ✓

---

### Phase 58 — Operasyon Koordinasyon Katmanı (2026-05-17)

**Amaç:**
`tasks.assign` permission var ama UI yoktu. Operations koordinatörü ekip üyelerine görev atayamıyor, ekibinin açık görev yükünü tek ekranda göremiyordu.

Değişiklikler:
- `lib/validations/customer-crm.ts`: `customerTaskSchema` — `assignedToId?: string` eklendi
- `lib/actions/customer-crm-actions.ts`: `createCustomerTaskAction` — kullanıcı kendi dışına atama yaparken `tasks.assign` permission kontrol edilir; `assignedToId` DB'ye kaydedilir
- `components/customers/customer-task-form.tsx`: `canAssign` + `users` props eklendi; admin/ops kullanıcıları görev oluştururken aynı satırda "Ata" dropdown görür
- `app/(app)/customers/[id]/page.tsx`: `requirePermission` sonucu kullanılarak `checkPermission(TASKS_ASSIGN)` değerlendirilir; izin varsa `listUsersWithTasks()` çağrılıp form'a aktarılır
- `services/task-service.ts`: `userId` filtresi `createdById` → `assignedToId` (ekip görev panosu için doğru filtre)
- `app/(app)/tasks/page.tsx`: Görev kartlarında atanan kişi gösterilir (`→ fatih aydın` format); filtre etiketi "Tüm atananlar"
- `services/dashboard-service.ts`: `getOperationsDashboardData()` — `teamTaskBreakdown` eklendi (tüm atanmış açık görevler kullanıcıya göre gruplandırılır, open+overdue count)
- `app/(app)/dashboard/_components/operations-workspace.tsx`: "Ekip Görev Dağılımı" bölümü — her ekip üyesi için açık ve gecikmiş görev sayısı, `/tasks?userId=` deeplink
- Schema değişikliği: YOK

Kabul kriteri:
- Görev formu: `tasks.assign` izni olan kullanıcı "Ata" dropdown görür ✓
- Görev DB'ye `assignedToId` ile kaydedilir ✓
- `/tasks` sayfası: atanan kişi `→ {name}` olarak görünür, filtre `assignedToId` üzerinden çalışır ✓
- Operations dashboard: "Ekip Görev Dağılımı" ekip üyelerini ve görev yükünü gösterir ✓
- Round-trip: form oluştur → customer detail'de görünür → /tasks'da assignee gösterilir ✓
- tsc --noEmit temiz ✓
- READY: dpl_3A5DU9KfNffMJZEFUa465TdMr4kQ

---

### Phase 56 — Satış Fırsat Motoru (2026-05-17)

**Amaç:**
Satış temsilcisi ürün detay sayfasından "bu ürünü hangi müşteriye satarım?" sorusunu yanıtlayamıyordu. Veri modeli (ProductInterest, CategoryInterest, CustomerAttributeInterest) hazırdı; UI'da aşama/öncelik/temsilci bağlamı yoktu.

Değişiklikler:
- `services/category-service.ts`: `getProductIntelligence()` `interests` select'i `stage`, `status`, `priority`, `lastContactedAt`, `followUpAt`, `assignedTo` ile genişletildi; `orderBy: { updatedAt: "desc" }` eklendi
- `services/dashboard-service.ts`: `getSalesPipelineData()` — `topOpportunities` paralel sorgu eklendi (HIGH/URGENT öncelik, `status: NEW|WAITING_STOCK|CONTACTED`, atanan temsilci, `take: 5`); `SalesPipelineData` tipi güncellendi; hata fallback'i `topOpportunities: []` döndürür
- `app/(app)/dashboard/_components/sales-workspace.tsx`: `STAGE_LABELS` + `STAGE_COLORS` maps eklendi; aktif fırsatlar listesi — öncelik emoji indicator (🔴/🟠), aşama badge (renk kodlu), son temas tarihi; "Önerilen Fırsatlar" bölümü — HIGH/URGENT ekip geneli top-5 fırsat kartları (müşteri → `/customers/:id` link, aşama/durum badge, temsilci, son temas)
- `app/(app)/products/[id]/page.tsx`: "Doğrudan ilgili" kartları — renkli aşama badge, 🔴/🟠 öncelik göstergesi, son temas tarihi (`formatDateTime`), atanan temsilci adı
- Schema değişikliği: YOK — mevcut `ProductInterest` alanları kullanıldı

Güvenlik: Tüm sorgu sonuçlarında finansal alan (`sourceCostRmb`, `importUnitCostUsd`, `marketplacePriceTry` vb.) döndürülmez.

Kabul kriteri:
- Satış temsilcisi `/products/:id` → "Doğrudan ilgili" bölümünde aşama, öncelik, son temas tarihi, temsilci adı görür ✓
- `/dashboard` (SALES rolü) → "Önerilen Fırsatlar" ekip geneli HIGH/URGENT fırsatları gösterir ✓
- tsc --noEmit temiz ✓
- READY: dpl_EnxAtoQH3aqnWqWyCXhHRaKaskrA

---

### Phase 54 Faz F — Marketplace Workspace (2026-05-17)

**Amaç:**
MARKETPLACE_OPERATOR rolü admin dashboard'ını görüyordu — gelir, ithalat zekası, sermaye kartları dahil. Pazar yeri operatörü için doğru bilgi: aktif listeleme durumu, sipariş ve iade sinyalleri, müşteri soruları, eşleşmemiş sipariş uyarısı. Finansal bağlam görünmemeli.

Değişiklikler:
- `services/dashboard-service.ts`: `getMarketplaceDashboardData()` eklendi — aktif listeleme sayısı (`status="ACTIVE"`), eşleşmemiş sipariş sayısı, son 7 gün iade sayısı, son 7 gün non-cancelled sipariş adedi, açık görev sayısı; **hiçbir finansal alan döndürülmez**; `MarketplaceDashboardData` tipi dışa aktarıldı
- `app/(app)/dashboard/_components/marketplace-workspace.tsx`: `MarketplaceWorkspace` bileşeni — "Pazar Yeri" badge başlığı; Trendyol Paneli + Müşteri Soruları header butonları; Listeleme & Sipariş bölümü (Aktif Listeleme, Son 7 Gün Sipariş, Eşleşmemiş Sipariş [warning]); İade & Görevler bölümü (Son 7 Gün İade [warning], Açık Görev); 4 hızlı aksiyon kartı (Müşteri Soruları, İade Merkezi, Trendyol Paneli, Ürün Eşleştirme)
- `app/(app)/dashboard/page.tsx`: `user.role === "MARKETPLACE_OPERATOR"` dalı eklendi; "ADMIN, MARKETPLACE_OPERATOR" yorumu güncellendi → "ADMIN, CUSTOM"
- Düzeltme: `isActive: true` → `status: "ACTIVE"` (`ListingStatus` enum); Badge `tone="info"` → `tone` kaldırıldı (geçerli değer değil)

Güvenlik: `getMarketplaceDashboardData()` `trendyolRevenue`, `cost`, `margin`, `importUnitCostUsd` ve benzeri finansal alanları hiçbir zaman döndürmez — service fonksiyonu düzeyinde zorunlu kural.

Kabul kriteri:
- MARKETPLACE_OPERATOR `/dashboard` açtığında: gelir, ithalat, sermaye kartı DOM'da bulunmaz ✓
- Aktif listeleme, sipariş/iade sinyalleri görünür ✓
- Admin dashboard değişmedi ✓
- tsc --noEmit temiz ✓
- READY: dpl_6j2QbVahxSmYdVz6FUDwqkWYSHXX

---

### Phase 55 — Warehouse Mode (2026-05-17)

**Amaç:**
Depo çalışanları (WAREHOUSE rolü) stok durumunu görmek ve sayım girişi yapmak için admin arayüzüne ihtiyaç duyuyordu. Finans verisi görmemeli, sadece stok durumu ve günlük görevlere erişmeli. Mobil öncelikli, barkod/SKU araması ve hızlı sayım akışı gerekiyordu.

Değişiklikler:
- `prisma/schema.prisma`: `UserRole` enum'una `WAREHOUSE` eklendi; `prisma db push` ile production DB'ye uygulandı
- `prisma/seed.ts`: `PrismaPg` adapter pattern eklendi (Prisma v7 uyumu); `WAREHOUSE` rolü 9 izinle seed edildi (`products.read`, `inventory.read`, `inventory.write`, `inventory.count`, `categories.read`, `attributes.read`, `tasks.read`, `tasks.update`, `search.read`)
- `lib/actions/inventory-count-actions.ts`: `createInventoryCountAction` — `INVENTORY_COUNT` izni gerektirir; mutlak yeni adet → delta = newQty − previousQty → `StockAdjustmentLog.CORRECTION` kaydı; delta=0 ise idempotent skip
- `app/(app)/warehouse/page.tsx`: Mobil-öncelikli arama sayfası — barkod/SKU/ürün adı ile arama (min 2 karakter); ürün kartları: görsel, ad, SKU, konum, stok adedi (kırmızı=kritik, sarı=düşük, yeşil=ok); **hiçbir maliyet/fiyat/marj alanı yok**
- `app/(app)/warehouse/count/page.tsx`: Stok sayım giriş sayfası — URL params'tan productId/productName/sku; büyük sayı inputu (text-3xl); `createInventoryCountAction` çağrısı; ✅ başarı ekranı + 1.8s sonra /warehouse yönlendirmesi
- `app/(app)/dashboard/_components/warehouse-workspace.tsx`: `WarehouseWorkspace` bileşeni — `OperationsDashboardData` yeniden kullanır; "Depo" badge başlığı; Kritik Stok / Düşük Stok / 7d Sipariş KPI kartları; Görev KPI kartları; Ürün Ara + Stok Sayımı hızlı aksiyon kartları; bugün yapılacaklar listesi
- `app/(app)/dashboard/page.tsx`: `user.role === "WAREHOUSE"` dalı eklendi (Faz E) — `getOperationsDashboardData()` → `WarehouseWorkspace`
- `app/(app)/layout.tsx`: `/warehouse` (`INVENTORY_READ`) ve `/warehouse/count` (`INVENTORY_COUNT`) sidebar nav öğeleri eklendi

Güvenlik: `/warehouse` ve `WarehouseWorkspace` hiçbir zaman maliyet, gelir, marj veya finansal bağlam döndürmez — service fonksiyonu düzeyinde uygulanan kural.

Kabul kriteri:
- `/warehouse` yükleniyor, arama çalışıyor (20 "kablo" sonucu doğrulandı) ✓
- Sayım formu: productId/productName/sku URL'den okunuyor ✓  
- Sayım gönder → `createInventoryCountAction` → başarı → /warehouse yönlendirmesi ✓
- Admin dashboard değişmedi ✓
- READY: dpl_FZUREkAgckL52vByKEobiDVMJFc8

### Phase 54 Faz C — Operations Workspace (2026-05-17)

**Amaç:**
OPERATIONS rolü tüm admin dashboard'ını görüyordu — gelir, trendyol ciro, ithalat kartları, satış hunisi dahil. Operations için doğru bilgi: görev durumu, stok uyarıları, sipariş sinyalleri. Finansal veri görünmemeli.

Değişiklikler:
- `services/dashboard-service.ts`: `getOperationsDashboardData()` eklendi — açık/geciken/bugün görev sayıları, dueTodayTasks (atanan kişiyle birlikte), criticalStockCount, lowStockCount (raw SQL kolon karşılaştırması), unmatchedOrdersCount, recentOrderQty7d; **hiçbir finansal alan döndürülmez**
- `app/(app)/dashboard/_components/operations-workspace.tsx`: `OperationsWorkspace` bileşeni — 4 KPI kartı (açık görev, geciken, bugün, kritik stok), stok kartları (kritik/düşük), sipariş sinyal kartları derin bağlantılarla, bugün yapılacaklar listesi (atanan kişi adıyla)
- `app/(app)/dashboard/page.tsx`: `user.role === "OPERATIONS"` dalı eklendi, `OperationsDashboardData` tipi dışa aktarıldı
- `services/dashboard-service.ts`: `OperationsDashboardData` tip dışa aktarımı eklendi

Güvenlik: `getOperationsDashboardData()` `trendyolRevenue`, `cost`, `margin` alanlarını kasıtlı olarak dışarıda bırakır.

Kabul kriteri:
- OPERATIONS rolü `/dashboard` açtığında: gelir, trendyol ciro, ithalat, sermaye kartı DOM'da bulunmaz; görev ve stok uyarıları görünür
- Admin view değişmedi ✓
- READY: dpl_ESQS1sQTWPXrs4iCPhUeEG7QtpCY

### Phase 54 Faz A+B — Rol Bazlı Dashboard Workspace (2026-05-17)

**Amaç:**
Tüm roller aynı `/dashboard` URL'ini görüyordu; SALES rolü gelir, trendyol ciro ve ithalat alanlarını görebiliyordu. Rol bazlı workspace mimarisi: aynı URL, server-side rol dallanması, her rol için ayrı veri ve bileşen.

Değişiklikler (Faz A — Yapı):
- `app/(app)/dashboard/_components/shared/stat-card.tsx`: `StatCard` + `LinkedStatCard` + `TONE_CLASSES` + `StatTone` type'ları paylaşılan bileşen olarak çıkarıldı
- `app/(app)/dashboard/_components/admin-workspace.tsx`: Mevcut admin dashboard içeriği bağımsız bileşene taşındı
- `app/(app)/dashboard/page.tsx`: ~40 satır rol router'a dönüştürüldü; `user.role === "SALES"` → `SalesWorkspace`; diğer roller → `AdminWorkspace`
- `services/dashboard-service.ts`: `DashboardStats`, `OperationalAlerts`, `DueTodayFollowups` tip dışa aktarımları eklendi

Değişiklikler (Faz B — Sales Workspace):
- `services/dashboard-service.ts`: `getSalesPipelineData(userId)` eklendi — aktif ilgi (assignedToId), bugünkü görevler, son 7 günde aktif müşteriler, açık/geciken görev sayıları; **hiçbir finansal alan döndürülmez**
- `app/(app)/dashboard/_components/sales-workspace.tsx`: `SalesWorkspace` bileşeni — 4 KPI kartı (aktif fırsat, bugün takip, açık görev, geciken görev), aktif pipeline listesi, bugün yapılacaklar, son müşteri aktivitesi; DOM'da trendyol ciro, ithalat, sermaye kartı yok
- `services/dashboard-service.ts`: `SalesPipelineData` tip dışa aktarımı eklendi

Güvenlik:
- `getSalesPipelineData()` `quotedPrice` alanını kasıtlı olarak dışarıda bırakır
- Service fonksiyon ve bileşen katmanı birlikte no-financial-data kuralını uygular
- Admin view görsel olarak değişmedi (Faz A browser-verified: CRM panosu, Gelir, Satış Hunisi, Operasyon, Trendyol & Stok bölümleri ✓)

Kabul kriterleri:
- Admin `/dashboard` açtığında: CRM panosu + Gelir + Satış Hunisi + Operasyon + Trendyol & Stok görünür ✓
- SALES rolü `/dashboard` açtığında: trendyol revenue, ithalat, sermaye kartı DOM'da bulunmaz; kendi pipeline'ı görünür
- READY: dpl_AiLn79jzds4B1oJauke3LuM4jQB9

### Phase 57 — Ürün Formu Rol Görünürlüğü (2026-05-17)

**Amaç:**
OPERATIONS ve SALES rollerine sahip kullanıcılar ürün formunu düzenlerken finansal/maliyet/ithalat alanlarını görmemelidir.
"ADMIN dışı kimse maliyet görmez" kuralı UI katmanında uygulandı. Şema değişikliği yok.

Değişiklikler:
- `components/products/product-form.tsx`: `showFinancialFields?: boolean` prop eklendi (varsayılan `true` — admin backward-compat).
  `false` olduğunda "Fiyatlandırma ve kârlılık", "Pazar yeri maliyet geçersiz kılmaları", "Satış potansiyeli",
  "İthalat kararı girdileri" section'ları DOM'da render edilmez.
- `lib/actions/product-actions.ts`: `updateProductAction` EXECUTIVE_READ kontrolü eklendi.
  Admin olmayan kullanıcılar için `normalizeProductDataNonFinancial()` kullanılır — finansal alanlar Prisma update'e dahil edilmez,
  mevcut DB değerleri korunur. Tamper ile field gönderilse bile yok sayılır.
- `app/(app)/products/[id]/edit/page.tsx`: `checkPermission(user, PERMISSIONS.EXECUTIVE_READ)` → `showFinancialFields` çözümlenir,
  `ProductForm`'a geçilir.
- `app/(app)/products/new/page.tsx`: Aynı EXECUTIVE_READ kontrolü, `ProductForm`'a geçilir.

Kabul kriterleri:
- Admin ürün formunu açtığında tüm finansal alanları görür ✓ (Vercel READY browser-verified dpl_3ge5Xx4gFjBy6fnUQVAUjMYjCb17)
- OPERATIONS kullanıcısı ürün formunu açtığında: unitCostTry, sourceCostRmb, importUnitCostUsd ve ilgili section'lar DOM'da bulunmaz
- Server action: finansal field gönderilse bile non-admin için mevcut DB değerleri korunur

### Rol Bazlı Sistem Analizi + Yeni Yol Haritası (Dokümantasyon, 2026-05-17)

**Amaç:**
Sistemdeki kullanıcı rolleri analiz edildi (ADMIN, OPERATIONS, SALES, MARKETPLACE_OPERATOR).
Eksiklikler, yetki riskleri ve tasarım ihtiyaçları tespit edilerek docs dosyalarına yansıtıldı.
Kod/şema/migration değişikliği yapılmadı.

Güncellenen dosyalar:
- `docs/PERMISSION-MODEL.md` — WAREHOUSE rol tanımı (NOT YET IMPLEMENTED), yeni permission key'leri (warehouse.*, import.*, productFinance.read, salesOpportunities.*), ithalat gizliliği HARD RULE bölümü, rol uyum matrisi, UI katmanı açığı not edildi
- `docs/ROADMAP.md` — Phase 54-58 eklendi: Rol Bazlı Dashboard, Warehouse Mode, Satış Fırsat Motoru, Owner-Only Import Intelligence (Ürün Formu), Operasyon Koordinasyon Katmanı
- `docs/phase-plan.md` — Phase 54-58 için execution sırası, dependency rationale, risk notları eklendi
- `docs/NEXT-STEPS.md` — Rol coverage gap özeti eklendi; Priority 57→55→54→56→58 stack'i bağımlılık sırasıyla tanımlandı
- `docs/current-state.md` — "Role Coverage Gaps" bölümü eklendi: uygulanan vs uygulanmayan 6 gap net yazıldı

Tespit edilen en kritik açıklar:
1. WAREHOUSE rolü UserRole enum'unda yok (Phase 55)
2. Ürün formu tüm finansal alanları `products.update`'e sahip herkese gösteriyor (Phase 57)
3. Rol bazlı dashboard yok (Phase 54)
4. Satış fırsat motoru yok (Phase 56)
5. Operasyon koordinasyon UI yok (Phase 58)
6. executive.read çok geniş — ileride bölünmesi gerekecek

### Phase 53 — Sidebar Gruplandırma + Rol Bazlı Bölüm Görünürlüğü (2026-05-17)

**Amaç:**
49 öğeli düz navigasyon listesi okunaksız hale gelmişti; roller arası ayrım da görsel olarak belli değildi. Satıcılar (SALES rolü) ithalat/finans bölümlerini görmemeli, depo personeli (OPERATIONS, EXECUTIVE_READ'siz) fiyat/marj sayfalarına erişmemeli.

- Sidebar: düz 49 öğeli liste → 5 bölüm (CRM, Ürünler & Stok, Pazar Yeri, İthalat & Analiz, Yönetim)
- Bölümler chevron ile daraltılabilir; aktif bölüm her zaman açık kalır
- `NavItem` tipine isteğe bağlı `section` alanı eklendi; sunucu tarafı izin filtresi bu alanı korur
- `layout.tsx`: `ALL_NAV` açık bölüm atamaları ve satır içi rol yorumlarıyla yeniden düzenlendi
- "İthalat & Analiz" bölümü tamamen `EXECUTIVE_READ` ile korunuyor → SALES/OPERATIONS rolleri bu bölümü hiç görmez
- Kenar çubuğu genişliği 72 (288px) → 64 (256px) mobil uyum için daraltıldı
- tsc clean; browser-verified (5 bölüm başlığı, daraltma çalışıyor 36→30 link); 2026-05-17 ✓

### Phase 52 — Ürün Finans Alanı Konsolidasyonu (Priority 0A, 2026-05-17)

**Amaç:**
Ürün düzenleme formunda birden fazla çakışan "kaynak maliyet" alanı vardı: `importUnitCostUsd` "İthalat ve envanter" bölümünde, `sourceCostRmb` ise "İthalat kararı girdileri" bölümünde "opsiyonel" olarak gösteriliyordu — bu da RMB'nin tercih edilen birincil kaynak olduğunu gizliyordu. `marketplacePriceTry` "temel kârlılık" olarak etiketleniyordu; oysa gerçek platform fiyatları XML beslemesinden geliyor ve bu alan yalnızca XML yoksa devreye giren bir fallback. Override bölümünde ise 4-katmanlı çözümleme hiyerarşisi hiç açıklanmıyordu.

- `importUnitCostUsd` "İthalat ve envanter" bölümünden kaldırılıp "İthalat kararı girdileri" içine taşındı
- Yeni kaynak maliyet alt-bölümü: Birincil (RMB, emerald) / Yedek (USD, slate) görsel hiyerarşisi
- `marketplacePriceTry` etiketi "Pazar yeri fiyatı — genel fallback (₺)" olarak değiştirildi
- Footer notu: platform bazlı XML fiyatlarının birincil kaynak olduğunu, fallback'in yalnızca XML yoksa devreye girdiğini açıklıyor
- Override bölümü başlığı "Tier 1" eki ile güncellendi; 4-katmanlı çözümleme (ürün → platform → sistem) açıklandı
- Schema değişikliği yok; tsc clean; browser-verified 2026-05-17 ✓

### Phase 51 — USD Kademeli Kargo + Cockpit Politika Düzeltmeleri (2026-05-17)

**Amaç:**
İthalat Cockpiti'nde komisyon ve kargo için hardcoded `0` kullanılıyordu — bu, her ürünün sanki kargo ve komisyon yokmuş gibi hesaplanmasına yol açıyordu. Trendyol satışlarında gerçek kargo maliyeti USD bazlı ve satış fiyatına göre kademeli olduğundan (ucuz ürünler az kargo, pahalı ürünler daha fazla), düz sabit bir TRY kargo değeri de yetersizdi. Ayrıca Trendyol'da henüz satışı olmayan ürünlerin XML kaynaklı fiyatları (xmlTrendyolPrice) hesaplamalarda hiç kullanılmıyordu.

Bu phase üç şeyi düzeltti: (1) Kargo ve komisyonu `resolveMarginPolicy()` üzerinden çözümle, (2) Platform politikasına USD eşikli kargo kademesi ekle, (3) XML fiyatını cockpit fiyat hiyerarşisine bağla.

- `MarketplacePlatformPolicy.shippingTiersJson String?` schema sütunu eklendi
- `resolveMarginPolicy()`: `context.sellingPriceUsd` ile USD eşikli kargo kademesi çözümlemesi
- `parseShippingTiers()` / `resolveTieredShipping()` saf yardımcı fonksiyonlar
- Platform politika formu: kademeli kargo tablosu UI, varsayılan Trendyol kademeleri butonu (`<$5 → $1.2`, `$5–7.5 → $2.0`, `>$7.5 → $3.3`)
- `import-cockpit`: komisyon + kargo artık `resolveMarginPolicy()` ile çözümleniyor (hardcoded `0` kaldırıldı)
- `import-cockpit`: `xmlTrendyolPrice` — Trendyol gerçekleşen sonrası, manuel öncesi fiyat kaynağı olarak bağlandı
- "XML Fiyat" badge (mavi) kaynak etiket sistemi eklendi

### Foundation
- Established Next.js App Router application structure
- Added TypeScript, Tailwind, and ESLint baseline
- Created scalable project architecture for app, components, services, types, and Prisma
- Aligned runtime architecture to Prisma + Supabase PostgreSQL + Vercel
- Added fail-fast environment validation

### CRM
- Implemented single internal authentication flow
- Added protected application shell
- Added RBAC foundation with role and permission schema support
- Added admin user management routes
- Added permission-aware navigation filtering
- Added server-side permission resolution foundation
- Implemented customer CRUD
- Added customer lifecycle status flow
- Added customer note and task linkage foundations
- Added Turkish location selection layer for customer records

### Quote System
- Implemented quote workflow v1
- Added quote creation
- Added quote listing
- Added quote editing
- Added quote detail page
- Added PDF quote generation
- Added WhatsApp quote sharing
- Added quote currency mode and exchange-rate aware display behavior
- Improved legacy quote compatibility in tax display logic

### Relationship Engine
- Added category management
- Added product/category relationship structure
- Added attribute system
- Added product/customer interest linking
- Added category/customer relationship linking

### Tasking and Outreach
- Added task management foundations
- Added follow-up task structures and views
- Added outreach/campaign module foundation
- Added campaign listing and campaign detail flow

### Search and Activity
- Added search module
- Added activity timeline/module support

### Technical Hardening
- Removed SQLite runtime architecture
- Standardized on PostgreSQL-compatible Prisma runtime
- Added Prisma migration structure
- Fixed build safety issues caused by eager session secret loading
- Fixed build safety issues caused by eager database loading
- Expanded protected route coverage
- Tracked required location CSV files in repository

### Documentation Governance
- Created `docs/ROADMAP.md` as target architecture reference
- Created `docs/PROGRESS.md` as factual implementation reference
- Created `docs/NEXT-STEPS.md` as execution priority reference
- Created `docs/CHANGELOG.md` as factual history reference
- Created `docs/current-state.md`
- Created `docs/phase-plan.md`

### Priority 0A — Ürün Finans Alan Konsolidasyonu (UI-only) (2026-05-17)

**Amaç:**
Ürün formunda kargo maliyeti, komisyon, ödeme ücreti ve iade rezervi için birden fazla çakışan alan vardı. Hangisinin öncelikli olduğu belirsizdi; platform politikası da ürün formuyla çelişiyordu. Bu kural netleştirilmeden marketplace marj normalizasyonu ve import kararı sayfaları güvenilmez veriye dayanıyordu. Bu phase UI'yi yeniden düzenledi: override alanlarını tek bölümde topladı, varsayılan değerlerin nereden geldiğini açıkladı ve platform politikası sayfasına bağlantı ekledi.

- `components/products/product-form.tsx`: renamed "Maliyet girdileri" section → "PAZAR YERİ MALİYET GEÇERSİZ KILMALARI"
- Added blue info box linking to /admin/marketplace-policies: explains overrides are product-level only; platform-wide defaults live in Pazar Yeri Politikaları
- Consolidated override fields: `shippingCostOverride` (KARGO MALİYET GEÇERSİZ KILMASI ₺), `marketplaceCommissionOverride` (KOMİSYON GEÇERSİZ KILMASI %), `paymentFeeRate` (ÖDEME İŞLEM ÜCRETİ GEÇERSİZ KILMASI %), `returnReserveRate` (İADE/KUSUR KARŞILIĞI GEÇERSİZ KILMASI %) — all with "Boş = platform politikasını kullan" placeholders
- Added note: "Değer girilmezse platform politikası → sistem varsayılanı sırasıyla uygulanır."
- Moved `paymentFeeRate` + `returnReserveRate` OUT of the Fiyatlandırma section INTO the new override section
- Added hidden inputs to preserve legacy `shippingCost` + `marketplaceCommission` DB values without showing them in the UI
- Renamed `marketplacePriceTry` label → "PAZAR YERİ GENEL FİYATI (₺) — TEMEL KÂRLILIK" with explanatory note clarifying its role vs. per-platform canonical pricing
- Added amber warning in stok section: "Güncel stok Entegra ERP üzerinden XML senkronizasyonu ile güncellenir..."
- No schema change — UI-only restructure
- ESLint fixes: removed dead `STATUS_ORDER` const in `recipient-list.tsx` (replaced with inline union type); added `eslint-disable-next-line` for `form.watch()` in `category-form.tsx` (React Compiler incompatible-library)
- All quality gates: prisma validate ✓, prisma generate ✓, tsc --noEmit ✓, eslint 0 warnings ✓, npm run build ✓
- Browser round-trip verified 2026-05-17: form section visible with blue info box, override fields with correct placeholders, shippingCostOverride save→detail shows "Ürün Geçersiz Kılma" badge at ₺25, 4-tier resolution working, clear→save→redirect clean ✓

### Phase 50 — İthalat Karar Cockpiti v2 (Priority 22, 2026-05-17)

**Amaç:**
Firma ithalatçı — temel iş kararı şu: "Bu ürünü çinden getireyim mi, getirirsem kazanır mıyım?" Bu soruyu yanıtlamak için daha önce tahminlere dayalı v1 cockpit vardı. Ancak Trendyol'dan gelen gerçek satış fiyatı, satış hızı ve iade oranı sistemde zaten mevcuttu — cockpit bu veriyi kullanmıyordu.

Phase 50, v1'in yerini alacak yeni cockpit'i oluşturdu: Trendyol gerçekleşen ortalama satış fiyatı + 30 günlük satış hızı + iade oranı → ithal maliyet ile karşılaştırılıyor → AL / BEKLE / ALMA sinyali üretiliyor. Eşleşmemiş ürünler için manuel tahmine düşüyor ve bunu açıkça gösteriyor.

- New page: `/admin/import-cockpit` (no schema change, reads existing tables)
- Trendyol 90-day realized avg sale price via `groupBy` on TrendyolSalesRecord (Delivered orders only)
- Trendyol 30-day velocity (units sold) via `groupBy` on TrendyolSalesRecord
- Return rate = TrendyolReturnRecord count / (sales90d + returns) per product
- Import landed cost (TRY) via existing `calculateImportDecision` engine × exchange rate
- Net profit/unit (TRY) = (price × (1−commission%) − shipping) − landedCostTry
- Margin % = netProfitTry / resolvedPriceTry × 100
- Effective monthly units = 30d velocity × (1 − returnRate); falls back to manual estimates
- Monthly profit estimate = netProfitTry × effectiveMonthlyUnits
- Signal: ✓ AL (marj ≥ %25) / ⏸ BEKLE (marj ≥ %15) / ✗ ALMA / — Veri Eksik
- Price source badge: Trendyol / Manuel / Fiyat yok
- Unmatched warning banner with link to marketplace mappings
- Tab bar: Tümü | AL | BEKLE | ALMA | Veri Eksik with live counts
- "v1 Görünüm →" link to existing /admin/import-decisions
- Sidebar: "İthalat Cockpiti v2" added; v1 renamed "İthalat Kararları v1"
- tsc clean, Vercel READY (dpl_71WA3rEYVH6XPiQaeEdBgC3vHsSt), browser-verified 2026-05-17 ✓

### Priority 23 — Yanlış Yöndeki Sayfaların Temizlenmesi (2026-05-17)

**Amaç:**
Trendyol API'ye stok ve fiyat push eden Phase 45 kodu hatalı yönde oluşturulmuştu — mimari kural gereği Trendyol READ-ONLY, stok yönetimi Entegra ERP üzerinden XML sync ile yapılır. Bu kod canlıda kalırsa operatörlerin yanlışlıkla Trendyol'a veri yazma riski doğuyor. Ayrıca /orders sayfasındaki stok düşüm butonu da aynı yanlış mimariye dayanıyordu. Bu phase zararlı kodu devre dışı bıraktı ve kullanıcıya neden çalışmadığını açıkladı.

- Removed "Trendyol Stok Senkronu" sidebar nav link from `layout.tsx`
- `/admin/trendyol-stock-sync/page.tsx` replaced with locked amber warning card: explains Trendyol is read-only, links to XML Sync + Stock Health pages
- `pushTrendyolStockAction()` disabled: returns immediate error message; no DB or API calls
- `/orders/page.tsx`: removed `TrendyolStockDeductionButton` and `getPendingDeductionCount` import/usage; removed amber "Stok Düşümü" card (Entegra ERP manages stock via XML sync)
- No schema change; `TrendyolSalesRecord.stockDeducted` field preserved (removing requires migration with no benefit)
- tsc clean, eslint 0 warnings, build ✓

### Phase 49 — XML Stok Değişim Logu (2026-05-17)

**Amaç:**
Entegra ERP'den gelen XML sync günlük stok güncellemesi yapıyordu ama "hangi ürünün stoğu ne kadar değişti?" sorusu yanıtsız kalıyordu. Operatör senkronizasyon logunu görüyor ama değişim detayı göremiyordu. Bu phase her sync'te stok değişen ürünlerin önceki/yeni miktarını kaydederek denetlenebilir bir stok geçmişi oluşturdu.

- Added `XmlStockChangeLog` Prisma model: productId, syncLogId, sourceId, previousQty, newQty, delta, syncedAt
- Migration: `20260517490000_phase49_xml_stock_change_log` applied to production
- `runSync` in `lib/actions/xml-sync-actions.ts`: fetches `stockQuantity` for existing products; compares previousQty vs newQty per product; batch-inserts `XmlStockChangeLog` records for all products whose stock actually changed (excludes no-change and MANUAL-source products)
- Sync result message now reports count of products whose stock changed
- `/admin/xml-sync` page: new "Son Senkronizasyon Değişimleri" section — queries latest 100 change logs, groups by `syncLogId` to isolate the most recent sync run, shows product name/SKU/previous qty/new qty with ↑ emerald / ↓ red delta badges; empty state for no-change syncs
- No UI changes to existing sync form or log table
- tsc clean, eslint 0 warnings, build ✓, migration applied ✓

### Phase 48 — Trendyol Daily Sync Cron (2026-05-17)

**Amaç:**
Trendyol sipariş ve iade verisi manuel tetiklemeyle çekiliyordu — bu, güncel veri için her gün birinin sayfaya gidip butona basması anlamına geliyordu. Import cockpit, stok sağlığı ve gerçekleşen marj gibi sayfaların anlamlı veri gösterebilmesi için Trendyol verisinin günlük otomatik güncellenmesi gerekiyordu. Bu phase veriyi 06:00 UTC'de otomatik çeken cron'u oluşturdu.

- Added `app/api/cron/trendyol-sync/route.ts`: Vercel cron route called daily at 06:00 UTC, CRON_SECRET Bearer auth, 14-day sliding window, parallel `syncOrders` + `syncReturns` via `Promise.allSettled`
- `syncOrders`: paginates `fetchTrendyolOrders` (page/size=50), upserts `TrendyolSalesRecord` (barcode/SKU product match, discountedPrice fallback, status update)
- `syncReturns`: paginates `fetchTrendyolReturns` (page/size=50), upserts `TrendyolReturnRecord` (claimItemStatus, customerClaimItemReason/trendyolClaimItemReason, barcode/SKU match)
- `vercel.json` updated: added `{ "path": "/api/cron/trendyol-sync", "schedule": "0 6 * * *" }` cron entry
- No schema change; deployment READY, tsc clean

### Phase 47 — Operational Intelligence Dashboard (2026-05-17)

**Amaç:**
Ana pano sadece satış hunisi ve gelir rakamlarını gösteriyordu. Kritik stok, eşleşmemiş sipariş ve Trendyol cirosu gibi operasyonel sinyaller dağınık sayfalarda gizliydi. Operatör sabah açtığında neye öncelik vereceğini göremiyordu. Bu phase panoya "Trendyol & Stok" bölümü ekleyerek en önemli operasyonel uyarıları tek ekranda ve ilgili sayfaya doğrudan bağlantıyla sundu.

- Added `getOperationalAlerts()` to `services/dashboard-service.ts`: parallel-fetches criticalStockCount (stockQuantity ≤ 0), pending deduction rows (non-cancelled, matched, stockDeducted=false), unmatchedOrdersCount (productId=null), 7-day order qty, 30-day Trendyol revenue
- `/dashboard` new "Trendyol & Stok" section with 5 `LinkedStatCard` tiles: Kritik Stok → /admin/stock-health, Bekleyen Stok Düşümü → /orders, Son 7 Gün Sipariş → /orders, Eşleşmemiş Sipariş → /admin/marketplace-mappings, Trendyol Ciro (30 Gün) → /marketplace/realized-margin
- `LinkedStatCard` component: clickable Card with hover shadow, renders as `<Link>` when `href` provided
- Dashboard hero badge updated from "Faz 8" → "Faz 47"
- No schema change — reads existing Product, TrendyolSalesRecord tables
- tsc clean, browser-verified 2026-05-17: "Faz 47" badge, Trendyol & Stok section, 5 linked tiles, 651 ürün in ops section ✓

### Phase 46 — Trendyol Catalog View (2026-05-17)
- Added `fetchTrendyolCatalog()` to `lib/trendyol-api.ts` — GET `/integration/product/sellers/{id}/products`, `page`/`size`/`approved` params, typed `TrendyolCatalogProduct` + `TrendyolCatalogResponse`
- `/admin/trendyol-catalog` server page: fetches up to 4 pages (200 products), cross-references with internal barcodes (all Product.barcode values) and MarketplaceProductMapping barcodes/SKUs
- KPI cards: Trendyol'da (total fetched) / Aşım Riski (Trendyol qty > internal) / Senkron (delta = 0) / Eşleşmemiş (no internal match)
- Matched table: Trendyol product, barcode, Trendyol qty, internal qty, delta badge (red=Trendyol fazla/amber=iç fazla/green=Senkron); sorted by |delta| descending
- Unmatched table: title, barcode, Trendyol qty, "Eşleştir →" link pre-filling /admin/marketplace-mappings?barcode=&title=
- Warning banners: oversell risk alert + surplus stock push suggestion
- Graceful TrendyolApiError display; shows "(İlk N / total ürün gösteriliyor)" note
- "Trendyol Katalog" nav link added (EXECUTIVE_READ)
- No schema change — reads live Trendyol API + Product + MarketplaceProductMapping
- tsc clean, browser-verified 2026-05-17: 200/6176 ürün fetched, 12 matched, 188 unmatched, oversell warning rendered, nav link active ✓

### Phase 45 — Trendyol Stock Sync (2026-05-17)
- Added `updateTrendyolInventory()` to `lib/trendyol-api.ts` — PUT `/integration/product/sellers/{id}/products/price-and-inventory` with batches of 100, returns `batchRequestId`
- `getTrendyolStockPushPreviewAction()`: EXECUTIVE_READ gated; reads all TRENDYOL MarketplaceProductMapping entries joined with Product; skips rows without platformBarcode or sellingPriceTry; returns preview rows
- `pushTrendyolStockAction()`: EXECUTIVE_READ gated; splits into batches of 100; pushes stockQuantity + sellingPriceTry (as both salePrice and listPrice); returns array of batchIds
- `TrendyolStockPushButton` client component: shows product count, transitions to "Gönderiliyor…" then "✓ Tamamlandı"; displays batchIds on success with async note
- `/admin/trendyol-stock-sync` page: KPI cards (Gönderilecek / Sıfır Stok / Düşük Stok / Atlanan), push action card, preview table (product link / SKU / barcode / stock / price)
- "Trendyol Stok Senkronu" nav link added (EXECUTIVE_READ)
- No schema change — reads MarketplaceProductMapping + Product
- tsc clean, browser-verified 2026-05-17: 2 matched products shown, push button renders, nav link active ✓

### Phase 44 — Stock Health Dashboard (2026-05-17)
- New page `/admin/stock-health` (EXECUTIVE_READ gated)
- Parallel-fetches all products, 30-day `TrendyolSalesRecord`, last 15 `StockAdjustmentLog` entries
- Classifies products: Critical (stockQuantity ≤ 0), Low (<30 days coverage = stock / (30d velocity / 30)), Healthy
- KPI summary cards: Kritik (red), Düşük (amber), Sağlıklı (emerald) with product counts
- Critical table: product link, SKU, qty, 30d Trendyol sales — red row styling
- Low table: product link, SKU, qty, 30d sales, coverage-days badge (≤7g red, ≤14g amber, <30g yellow)
- Recent adjustments table: product link, type badge (ADJ_LABEL/ADJ_COLOR), ±delta, newQty, notes, date
- "Stok Sağlığı" nav link added to sidebar (EXECUTIVE_READ)
- No schema change — reads existing Product, TrendyolSalesRecord, StockAdjustmentLog models
- tsc clean, browser-verified 2026-05-17: KPI cards render, 606 critical products shown, adjustments table ✓

### Phase 43 — Trendyol → Stock Auto-Deduction (2026-05-17)
- Added `stockDeducted Boolean @default(false)` to `TrendyolSalesRecord`
- Applied migration `20260517430000_phase43_trendyol_stock_deduction` to production
- `getPendingDeductionCount()`: counts matched non-cancelled unprocessed order lines
- `applyTrendyolStockDeductionAction()`: PRODUCTS_UPDATE gated; groups pending records by productId; for each product runs Prisma `$transaction` (read stockQuantity → create StockAdjustmentLog SALE → update product stock → mark records `stockDeducted=true`); returns aggregate count
- `TrendyolStockDeductionButton` client component: amber "N satır bekliyor" badge, "Stoktan Düş" button, success message, auto-reload
- Orders page: `pendingDeductionCount` parallel-fetched; amber card rendered when > 0; hidden after deduction
- Browser-verified 2026-05-17: 183 order lines across 21 products deducted atomically, amber card disappears, 21 StockAdjustmentLog SALE entries created ✓

### Phase 42 — Stock Adjustment Log (2026-05-17)
- Added `StockAdjustmentType` enum: RESTOCK / CORRECTION / DAMAGE / RETURN / SALE / OTHER
- Added `StockAdjustmentLog` model: productId FK, adjustmentType, quantityChange, previousQty, newQty, notes, createdById FK, createdAt
- Applied migration `20260517420000_phase42_stock_adjustment_log` to production Supabase
- `createStockAdjustmentAction`: PRODUCTS_UPDATE gated, Prisma `$transaction` (lock product → compute newQty → reject if <0 → update stockQuantity → write log entry)
- `getProductStockAdjustments`: last 20 entries newest-first, includes createdBy name
- `StockAdjustmentCard` client component: form (Hareket Türü select, +Giriş/−Çıkış toggle, Adet, Not) + history table (Tür badge, ±Değişim, Önceki, Sonraki, Not, Kaydeden, Tarih), optimistic UI prepend on success, "Güncel: N adet" live badge
- Product detail page: `StockAdjustmentCard` added at bottom, `getProductStockAdjustments` parallel-fetched
- Browser-verified 2026-05-17: form renders, save creates row (100→105), success message "Stok hareketi kaydedildi.", optimistic update ✓

### Phase 5 — RBAC (Role Based Access Control)
- Expanded `UserRole` enum: ADMIN, SALES, OPERATIONS, MARKETPLACE_OPERATOR, CUSTOM
- Created `Role`, `Permission`, `RolePermission`, `UserPermission` tables and applied migration to production
- Seeded 5 system roles, 62 permissions across 12 categories
- Implemented `resolvePermission()` 6-step engine: dangerous gate → ADMIN bypass → explicit deny → explicit grant → role default → deny
- Implemented `DANGEROUS_PERMISSIONS` gate for `migrations.approve` and `destructiveActions.approve`
- Seeded SALES role with 15 default permissions, OPERATIONS with 12, MARKETPLACE_OPERATOR with 11
- Implemented per-user permission override UI with Varsayılan → Verildi → Engellendi → Varsayılan cycle
- Added permission-aware sidebar with parallel `checkPermission` calls and zero-access `/no-access` redirect
- Enforced `requirePermission()` on all protected routes and `checkPermission()` in all server actions
- Added graceful degradation throughout — app remains operational if Phase 5 tables are absent
- Added 22 automated unit tests for permission engine (`__tests__/resolve-permission.test.ts`)
- Added `isSchemaMismatchError()` helper for pre-migration environment handling

### Phase 6 — Customer Intelligence Expansion
- Added `CustomerType` enum: TOPTAN, PERAKENDE, SITE_YONETICISI, GUVENLIK_SIRKETI, MAGAZA, ONLINE_SATICI, CUSTOM
- Added `monthlySalesPotential DECIMAL(15,2)` column to `Customer` table
- Added `platformNotes TEXT` column to `Customer` table
- Migrated `customerType` column from untyped TEXT to `CustomerType` enum in production
- Exposed `customerType`, `monthlySalesPotential`, and `platformNotes` in customer create/edit forms
- Updated CSV import action to use explicit `SELECT` avoiding Phase 6 columns before migration

### Phase 7 — Inventory Intelligence Core
- Added `StockSource` enum: MANUAL, XML, API, IMPORT
- Added `StockConfidence` enum: HIGH, MEDIUM, LOW
- Added `barcode TEXT UNIQUE` column to `Product` table
- Added `imageUrl TEXT` column to `Product` table
- Added `supplier TEXT` column to `Product` table
- Added `stockSource StockSource` column to `Product` table
- Added `stockConfidence StockConfidence` column to `Product` table
- Added `lastStockSyncAt TIMESTAMP` column to `Product` table
- Added `lastStockCountById TEXT` FK column to `Product` table (→ `User` via named relation `StockCountedBy`)
- Added `reorderLeadTime INTEGER` column to `Product` table
- Added `shippingCost DECIMAL` column to `Product` table
- Added `shippingCostOverride DECIMAL` column to `Product` table
- Added `marketplaceCommission DECIMAL` column to `Product` table
- Added `marketplaceCommissionOverride DECIMAL` column to `Product` table
- Applied migration to production Supabase PostgreSQL
- Reorganized product create/edit form into 4 sections: Temel bilgiler, Stok ve konum, Maliyet girdileri, İthalat ve envanter
- Added StockSource and StockConfidence dropdowns to product form
- Added user dropdown for last manual stock count user
- Updated product detail page to display all new inventory intelligence fields
- Added product image preview card to detail page
- Updated Zod validation schema and `normalizeProductData()` for all new fields

### Phase 8 — Profitability Engine
- Added `unitCostTry DECIMAL` column to `Product` table (TRY unit cost)
- Added `sellingPriceTry DECIMAL` column to `Product` table (retail price)
- Added `wholesalePriceTry DECIMAL` column to `Product` table
- Added `marketplacePriceTry DECIMAL` column to `Product` table
- Added `packagingCost DECIMAL` column to `Product` table
- Added `vatRate DECIMAL` column to `Product` table (VAT %)
- Added `paymentFeeRate DECIMAL` column to `Product` table (payment processing %)
- Added `returnReserveRate DECIMAL` column to `Product` table (return/defect reserve %)
- Applied migration to production Supabase PostgreSQL
- Created `lib/profitability.ts`: pure calculation engine, KDV-inclusive model
- Per-channel profitability: perakende (retail), toptan (wholesale), pazar yeri (marketplace)
- Metrics per channel: net profit, margin %, ROI %, cost breakdown
- Added "Fiyatlandırma ve kârlılık" section to product create/edit form
- Added "Kârlılık analizi" card to product detail page with per-channel ProfitCard
- Added "Kârlı" / "Kaybettiriyor" badge to product detail header

### Phase 9 — Sales Potential Engine
- Added `onlineSalesPotential INTEGER` column to `Product` table
- Added `wholesaleSalesPotential INTEGER` column to `Product` table
- Added `installerSalesPotential INTEGER` column to `Product` table
- Applied migration to production Supabase PostgreSQL
- Created `lib/sales-potential.ts`: demand-based monthly revenue/profit projection, turnover speed, investment score (0–100), BUY/WAIT/DO_NOT_BUY/UNKNOWN signal
- Added "Satış potansiyeli" section to product create/edit form (3 channel inputs)
- Added "Yatırım skoru" card to product detail page: monthly ciro, kâr, adet, devir süresi, per-channel breakdown
- Added SATIN AL / BEKLE / ALMA / Veri yok badge to product detail header

### Phase 11 — XML Inventory Sync
- Created `XmlSyncStatus` enum: RUNNING, SUCCESS, PARTIAL, ERROR
- Created `XmlSyncSource` table: id, name, url, isEnabled, authHeader, lastSyncAt, lastStatus
- Created `XmlSyncLog` table: sourceId (FK CASCADE), startedAt, completedAt, status, recordsFound, recordsUpdated, recordsSkipped, errorMessage
- Added `xmlLocked BOOLEAN DEFAULT false` to `Product` table
- Applied all migrations to production Supabase PostgreSQL
- Created `lib/xml-sync.ts`: regex-based feed parser supporting element-based and attribute-based XML, multi-alias field detection
- Created `lib/actions/xml-sync-actions.ts`: save/delete source, manual sync trigger, `runSync()` shared engine, `finalizeLog()` helper
- Created `app/api/cron/xml-sync/route.ts`: Vercel cron endpoint iterating all enabled sources (daily 02:00 UTC)
- Created `/admin/xml-sync` page: source cards with status badges, edit form, sync log table, add-source form, override protection info card
- Created `components/xml-sync/xml-sync-form.tsx`: source CRUD + manual trigger client component
- Added "XML senkronizasyon" section to product edit form with xmlLocked checkbox (amber warning style)
- Added "XML Senkron" link to sidebar (EXECUTIVE_READ permission)
- Created `vercel.json` with `0 2 * * *` cron schedule (Hobby plan compatible)
- Override rules: xmlLocked=true skips product entirely; stockSource=MANUAL skips stock update, price still updated
- Sync log persists per-run: found/updated/skipped counts + error message

### Phase 11A — XML Product Foundation
- Added `ProductKind` enum (MAIN_STOCK / LISTING_PACKAGE) and self-referential `Product.mainProductId` hierarchy
- Added `ProductImage` model: multi-image support per product (resim1–5, sortOrder 0–4, source XML|MANUAL)
- Added `XmlProductData` model: one row per product, stores all 21 Entegra XML feed fields as raw snapshot (USD prices, marketplace prices, KDV, dates, parent code, images)
- Added `XmlSyncLog.recordsCreated` column for tracking new products created per sync run
- Applied migration `20260517030000_phase11a_xml_product_foundation` to production Supabase
- Rewrote `lib/xml-sync.ts`: auto-detect Format A (wrapped `<Urun>`) vs Format B (flat Entegra, no wrapper — products delimited by `<urun_kodu>`); fixed 0-record bug on real iotomasyon.xml feed
- Rewrote `lib/actions/xml-sync-actions.ts` with batched DB operations:
  - `findMany` for all SKUs at once, `createManyAndReturn` for batch product creation
  - `Promise.all(batch of 20)` for XmlProductData upserts and stock updates (eliminates transaction timeout)
  - `deleteMany` + `createMany` for ProductImage (2 queries total per sync)
  - Creates new products with `xmlImported=true` for unmatched SKUs; respects xmlLocked and MANUAL stock override
  - Fixes stuck RUNNING logs from previous timeouts at start of each sync run
- Added `maxDuration = 300` to `/admin/xml-sync` page (Vercel Server Action timeout for 660-product syncs)
- Added "Oluşturulan" column to XML sync admin log table
- Product detail page: multi-image gallery, "XML Kaynak Verisi" data card with full USD price grid, "XML İthalatı" badge, parent product link section
- Extended `getProductById` to include `images`, `xmlData`, `mainProduct`
- Browser-verified: 649 products synced in 24 seconds, 2534 images stored, all XmlProductData rows populated

### Phase 10 — Capital Allocation Engine (ADMIN ONLY)
- Created `CapitalConfig` table: totalCapitalTry, reservePct, desiredTurnoverMonths
- Applied migration to production Supabase PostgreSQL
- Created `lib/capital-allocation.ts`: locked capital, deployable capital, greedy ranked allocation engine
- Created `/admin/capital` page: capital config form, 5-column summary, purchase suggestion table with safety warning
- Added "Sermaye" link to sidebar (EXECUTIVE_READ permission)
- Reserve safety enforced: reserve % of available capital never allocated

### Phase 13 — Marketplace Monitoring Dashboard
- Created `/marketplace/monitoring` page: three server-side alert sections (no new schema)
- Gap alert: active products with zero marketplace listings (with "+ Listeleme ekle" link)
- Problem alert: listings with SUSPENDED or UNKNOWN status
- Stale alert: ACTIVE listings with null `lastCheckedAt`
- Summary cards: per-category alert counts + total alert headline
- Created `components/marketplace/create-monitoring-task-button.tsx`: client component creates HIGH-priority `FollowUpTask` per alert row
- Added `createListingMonitoringTaskAction` to `marketplace-listing-actions.ts`
- Added "⚠ İzleme" button to `/marketplace` page header

### Phase 14 — Trendyol API Integration (READ ONLY)
- Created `TrendyolConfig` table (singleton row): supplierId, apiKey, apiSecret, isEnabled, lastSyncAt, updatedAt
- Applied migration to production Supabase PostgreSQL
- Created `lib/trendyol-api.ts`: `TrendyolApiError` (status + body), `trendyolFetch<T>()` with Basic auth header and `revalidate: 0`, `fetchTrendyolOrders()`, `fetchTrendyolReturns()`, `testTrendyolConnection()` with Turkish error messages
- Created `lib/actions/trendyol-actions.ts`: `saveTrendyolConfigAction` (Zod-validated singleton upsert, EXECUTIVE_READ), `testTrendyolConnectionAction` (live connectivity test, EXECUTIVE_READ)
- Created `components/trendyol/trendyol-config-form.tsx`: client component with supplierId / apiKey / apiSecret (password) / isEnabled inputs, Kaydet + Bağlantıyı test et buttons, inline success/error feedback, amber security note
- Created `/admin/trendyol` settings page: status badge (aktif/pasif), supplierId display, last updated timestamp, TrendyolConfigForm, how-to-find guide card (EXECUTIVE_READ)
- Created `/marketplace/trendyol` live dashboard (MARKETPLACE_LISTINGS_READ): not-configured state, API error state (red card), data state with 4 summary cards + orders table (20 rows) + returns table (10 rows), Turkish status maps (`STATUS_TR`, `RETURN_STATUS_TR`), `StatusBadge` component, `fmtDate()` and `fmtCurrency()` helpers
- Added "Trendyol API" sidebar entry (EXECUTIVE_READ) and "Trendyol Paneli" sidebar entry (MARKETPLACE_LISTINGS_READ)
- Fixed Trendyol API base URL: migrated from deprecated `api.trendyol.com/sapigw/suppliers` to `apigw.trendyol.com/integration/order/sellers`
- Fixed `TrendyolReturn` interface to match live getClaims API: added `TrendyolClaimItem`, `TrendyolClaimItemStatus`, `TrendyolClaimItemReason`, `TrendyolClaimOrderLine`, `TrendyolClaimLineItem` interfaces; `items[]` replaces `lines[]`; `claimDate` replaces `createdDate`; status derived from `items[0].claimItems[0].claimItemStatus.name`
- Fixed returns table rendering: `ret.claimDate` for date, `ret.items[].orderLine.productName` for products, `ret.items[0].claimItems[0].customerClaimItemReason.name` for return reason
- Extended `RETURN_STATUS_TR` map: Accepted, InAnalysis, Resolved, Cancelled, Created entries added
- Added defensive null-safety in `fetchDashboardData`: `Array.isArray()` checks for `content` field before rendering
- Live-verified with Satıcı ID 209161: 437 orders, 155 returns, connection test "Bağlantı başarılı." ✓

### Phase 15 — Marketplace Profit Dashboard
- No new DB schema — all profitability computed from existing Product pricing fields via `calculateProfitability()`
- Created `/marketplace/profit` page: 4 summary cards (total listings, profitable, losing, missing-data count)
- Platform breakdown grid: per-platform listing counts with active/losing/missing-data subcounts
- Winners table: top 20 ACTIVE listings ranked by marketplace margin % DESC, with product SKU and profitability metrics
- Losers table: all ACTIVE listings with net marketplace profit < 0, with edit links for correction
- Missing-data alert: listings where `unitCostTry` or `marketplacePriceTry` is null — product edit link provided
- High-stock/low-demand signal: products with stockQuantity > 5 and onlineSalesPotential === 0
- Added `toNum()` helper for Prisma.Decimal → number conversion
- Added "Pazar Kârlılığı" sidebar entry (MARKETPLACE_LISTINGS_READ permission)
- Added "📊 Kârlılık" button to `/marketplace` page header

### Phase 16 — Marketplace Operations Expansion
- Added `Product.unitCostUsd DECIMAL` column (nullable, USD unit cost for import-priced products)
- Created `MarketplaceProductMapping` table: many platform identities (barcode/SKU/listingId) → one internal Product; 5 composite indexes; FK → Product (CASCADE), FK → User (SET NULL)
- Created `MarketplaceQuestionActionLog` table: audit trail for all Q&A answers sent to Trendyol; indexes on questionId, platform, userId, createdAt
- Created `MarketplaceReturnActionLog` table: audit trail for all claim approve/reject/issue actions; indexes on claimId, platform, userId, createdAt
- Created `MonthlyExchangeRate` table: historical USD/TRY rates, unique(year, month), for per-order import cost conversion
- Applied Prisma migration `20260517020000_phase16_marketplace_ops` to production Supabase
- Added 6 new permissions: `marketplaceQuestions.read`, `marketplaceQuestions.answer`, `marketplaceReturns.action`, `marketplaceMappings.read`, `marketplaceMappings.write`, `exchangeRates.manage`
- MARKETPLACE_OPERATOR role defaults: added `marketplaceQuestions.read`, `marketplaceQuestions.answer`, `marketplaceReturns.action`, `marketplaceMappings.read`
- Extended `lib/trendyol-api.ts` with: QNA gateway (`https://apigw.trendyol.com/integration/qna/sellers/{id}/`), `trendyolPost`/`trendyolPut` write helpers, `TrendyolQuestion`/`TrendyolQuestionsResponse` types, `fetchTrendyolQuestions()`, `answerTrendyolQuestion()`, `fetchClaimIssueReasons()`, `approveTrendyolClaim()`, `createTrendyolClaimIssue()`
- Created `lib/actions/trendyol-question-actions.ts`: `answerTrendyolQuestionAction` — validates, sends to Trendyol, writes audit log on success and failure
- Created `lib/actions/trendyol-return-actions.ts`: `approveTrendyolClaimAction` + `createTrendyolClaimIssueAction` — both write `MarketplaceReturnActionLog` entries
- Created `lib/actions/marketplace-mapping-actions.ts`: `createMarketplaceMappingAction`, `updateMarketplaceMappingAction`, `deleteMarketplaceMappingAction`
- Created `lib/actions/exchange-rate-actions.ts`: `upsertExchangeRateAction`, `deleteExchangeRateAction`, `getExchangeRateForDate(epochMs)` utility
- Created `/marketplace/trendyol/questions` page: live Q&A list from Trendyol, status filter tabs (WAITING_FOR_ANSWER/ANSWERED/REJECTED/REPORTED), inline answer form, existing answer display, permission: `marketplaceQuestions.read`
- Created `/marketplace/trendyol/returns` page: Return Action Center, splits actionable vs. completed claims, fetches live claim issue reasons, `ClaimActionPanel` for approve + reject/issue workflow, permission: `marketplaceReturns.read`
- Created `/admin/exchange-rates` page: monthly USD/TRY rate table with add/update form, usage info card, permission: `exchangeRates.manage`
- Created `/admin/marketplace-mappings` page: mapping registry with platform filter, product links, delete with confirmation, add form, permission: `marketplaceMappings.read`
- Created `components/trendyol/answer-question-form.tsx`: inline expandable answer textarea (10–2000 chars, char counter, pending state)
- Created `components/trendyol/claim-action-panel.tsx`: claim line item selector, approve mode + reject/issue mode with reason dropdown and description field
- Created `components/marketplace/exchange-rate-form.tsx`: year/month/rate/note form with reload-on-save
- Created `components/marketplace/mapping-form.tsx`: platform/product/barcode/SKU/listingId/title form + delete button with confirm gate
- Extended `Button` component with `size` prop (sm/md/lg) — no breaking changes to existing usage
- Added 4 sidebar entries: `Müşteri Soruları`, `İade Merkezi`, `Döviz Kurları`, `Ürün Eşleştirme`
- Updated sidebar Phase note: "Faz 16 aktif"
- tsc --noEmit clean, npm run build clean

### Phase 12 — Marketplace Listing Registry
- Created `MarketplacePlatform` enum: TRENDYOL, HEPSIBURADA, N11, PTTAVM, KOCTAS, TEKNOSA, TEMU, CUSTOM
- Created `ListingStatus` enum: ACTIVE, INACTIVE, SUSPENDED, UNKNOWN
- Created `MarketplaceListing` table: productId (FK → Product CASCADE), platform, platformListingId, listingUrl, listingBarcode, listingSku, listingTitle, status, notes, responsibleId (FK → User SET NULL), lastCheckedAt
- Applied migration to production Supabase PostgreSQL
- Created `lib/actions/marketplace-listing-actions.ts`: createListingAction, updateListingAction, deleteListingAction (Zod-validated, permission-guarded)
- Created `/marketplace` listing registry page: platform summary cards + full listings table
- Created `/marketplace/new` create listing page with optional `?productId=` pre-fill
- Created `/marketplace/[id]` listing detail page
- Created `/marketplace/[id]/edit` edit + delete form
- Created `components/marketplace/listing-form.tsx`: platform/status dropdowns, create/edit/delete modes
- Added "Pazar Yerleri" link to sidebar (MARKETPLACE_LISTINGS_READ permission)
- Added `marketplaceListings[]` relation to Product and User Prisma models

### Phase 28 — Product Governance and Private Intelligence
- Migration `20260517120000_phase28_private_note`: adds `privateNote TEXT` to `Product` table — nullable, additive, non-destructive; applied to production Supabase
- Created `lib/actions/product-actions.ts` → `updatePrivateNoteAction`: requires EXECUTIVE_READ + PRODUCTS_UPDATE; saves `product.privateNote` with `trim() || null`; revalidates edit + detail paths; intentionally separate from `updateProductAction` so non-owners cannot accidentally overwrite private intelligence
- Created `components/products/private-note-editor.tsx`: standalone client component using `useTransition`; amber-accented with `🔒 Sadece sahip görebilir` badge; textarea (5000 char limit with live counter); "Notu kaydet" button with pending/saved(3s)/error feedback
- Updated `app/(app)/products/[id]/edit/page.tsx`: added `checkPermission(user, PERMISSIONS.EXECUTIVE_READ)` to parallel data fetch → `canViewPrivate`; added amber-bordered "Faz 28 — Özel Zeka" card with `PrivateNoteEditor` (only renders when `canViewPrivate=true`)
- Updated `app/(app)/products/[id]/page.tsx`: added `checkPermission(user, PERMISSIONS.EXECUTIVE_READ)` + `supplierProduct.findMany` to parallel fetch; "Tedarikçi Kaynağı" card — renders when `supplierLinks.length > 0`, shows ★ Tercihli badge for `isPreferred`, unit cost/lead days/MOQ inline; "🔒 Özel Not" read-only card — renders only when `canViewPrivate && product.privateNote`; both at bottom of detail page
- Updated `lib/validations/product.ts`: `description` max raised from 2000 → 10000 (Tiptap HTML output regularly exceeds 2000 chars with formatted content)
- `normalizeProductData` in product-actions.ts explicitly omits `privateNote` with inline comment — XML import and normal product updates can never overwrite owner intelligence
- tsc --noEmit clean, Vercel deploy READY (commit ceac815)
- Browser-verified 2026-05-17: edit page loads after migration ✓; amber private note card visible with 🔒 badge ✓; note saved to DB via action ("Browser test notu: UV-82 için Çin'den ithalat planı — 2026-05-17 Phase 28 doğrulama.") confirmed via Supabase SQL ✓; detail page shows saved note under "🔒 Özel Not" ✓; "Tedarikçi Kaynağı" supplier card visible ✓

### Phase 29 — Order Ledger and Return Claims Sync (commit 3e615fd)
- Migration `20260517130000_phase29_return_records`: new `TrendyolReturnRecord` table — claimId, orderLineId (unique together), productId (nullable FK → Product SET NULL), orderNumber, orderDate, claimDate, status, reasonName, reasonCode, productName, barcode, merchantSku, unitPriceTry, syncedAt; 4 indexes; applied to production Supabase
- Created `lib/actions/returns-sync-actions.ts`: `syncTrendyolReturnsAction` — EXECUTIVE_READ-gated; sweeps 4 × 90-day windows (365 days total); barcode-first then SKU product matching; upserts TrendyolReturnRecord per (claimId, orderLineId); surfaces page-0 error to UI
- Created `components/orders/orders-sync-button.tsx`: combined sync client component — triggers both `syncTrendyolSalesAction` + `syncTrendyolReturnsAction` in parallel; reports orders and returns line counts + new record counts
- Created `app/(app)/orders/page.tsx`: local order ledger page — 5 tabs (Tümü/Teslim Edildi/İptal Beklemede/İadeler/Eşleşmemiş) with live counts; 100-row pages sorted newest-first; product column links matched rows, shows "Eşleşmemiş" amber badge for unmatched; unmatched tab shows amber hint with link to /admin/marketplace-mappings; İadeler tab renders TrendyolReturnRecord rows with reason column; pagination links
- Updated `app/(app)/layout.tsx`: added "Siparişler" nav item (EXECUTIVE_READ) before "Satış Performansı"
- Updated `components/dashboard/sidebar.tsx`: info card updated to "Faz 29 aktif"
- tsc --noEmit clean, Vercel deploy READY (commit 3e615fd)
- Browser-verified 2026-05-17: /orders loads (1.105 sipariş, sayfa 1/12) ✓; "Siparişler" sidebar link active ✓; all 5 tabs render with correct counts ✓; matched product row links to /products/[id] ✓; unmatched rows show amber "Eşleşmemiş" badge ✓; Eşleşmemiş tab amber hint + Ürün Eşleştirme link ✓; İadeler tab shows correct empty state (no returns synced yet) ✓; Teslim Edildi count 952 ✓

### Phase 25–28 Closure Fixes (commit 4bf6bd4)

**Issue 1 — Owner-only privateNote gating (stricter than Phase 28 original)**
- Changed `updatePrivateNoteAction` gate from `checkPermission(EXECUTIVE_READ)` to `isOwner(user)` — only the ADMIN_EMAIL account can write private notes; other ADMIN-role users are excluded
- Added `isOwner()` helper to `lib/auth.ts`: `user.email.toLowerCase() === getAdminEmail().toLowerCase()`
- Updated `app/(app)/products/[id]/page.tsx` and `edit/page.tsx`: `canViewPrivate` now uses `Promise.resolve(isOwner(user))` (was `checkPermission(EXECUTIVE_READ)`)
- Text correction: "Sadece yetkili kullanıcılar görebilir" → "Sadece sahip görebilir" (accurately reflects isOwner semantics)

**Issue 2 — Performance-based sorts on /products**
- Added 3 new sort options to `components/products/product-filters.tsx`: `sales_30d_qty` (30G Satış Adedi ↓), `sales_30d_rev` (30G Ciro ↓), `sales_all_rev` (Toplam Ciro ↓)
- Added `SALES_SORTS` set and in-memory aggregation block to `services/product-service.ts`: fetches `TrendyolSalesRecord` for visible products only, excludes cancelled orders ("iptal"/"cancel"), aggregates qty30d/rev30d/revAll per productId, sorts in JS
- Total sort options: 10 (was 7)

**Issue 3 — Rich-text description rendering on detail page**
- `app/(app)/products/[id]/page.tsx`: added `trimStart().startsWith("<")` heuristic to detect Tiptap HTML output; renders via `dangerouslySetInnerHTML` with Tailwind 4 arbitrary-variant prose styles (`[&_h2]:`, `[&_ul]:`, `[&_strong]:`, etc.) — no `@tailwindcss/typography` dependency needed
- Plain-text descriptions continue to render as before

**Issue 4 — XML overwrite policy documentation**
- Added explicit `// XML Overwrite Policy` comment block to `lib/actions/xml-sync-actions.ts` documenting SOURCE-MANAGED (stock, imageUrl fallback-fill), CURATED (name/brand/description/prices/privateNote — never overwritten), XML-ONLY STORAGE (XmlProductData), and NEW-product bootstrap behaviour
- Added inline comments at the existing-product update step

- tsc --noEmit clean, ESLint clean, Vercel deploy READY (commit 4bf6bd4)
- Browser-verified 2026-05-17: /products loads (651 ürün) ✓; all 10 sort options render ✓; sales_30d_qty sort changes product order (no crash) ✓; HTML description renders H2/bold/bullet-list on BAOFENG UV-82 detail page ✓; owner private note visible with "Sadece sahip görebilir" text ✓; edit page loads correctly ✓

### Phase 27 — Product Media and Content Studio
- Installed Tiptap (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-link`) for rich text description authoring
- Created `components/products/rich-text-editor.tsx`: Tiptap-based WYSIWYG editor; SSR-safe with `mounted` guard (renders placeholder before hydration); toolbar with H2, H3, Bold, Italic, Bullet list, Ordered list; outputs HTML to react-hook-form via `onChange`; syncs external value changes (e.g. "XML'den al") via `lastPushedValue` ref to prevent infinite update loops
- Created `lib/actions/product-image-actions.ts`: `addProductImageByUrlAction` (URL validation, sortOrder = existing count), `deleteProductImageAction` (compact sortOrders after delete), `setPrimaryImageAction` (moves target to sortOrder 0, shifts others), `uploadProductImageAction` (Supabase Storage REST API — no SDK; validates MIME type and 5 MB limit; creates ProductImage row)
- Created `components/products/product-image-manager.tsx`: client component — multi-image grid sorted by sortOrder; "Birincil" ring on primary image; source badges (MANUEL emerald / XML blue); URL input with Enter-to-add and "Ekle" button (input clears on success); optimistic UI updates; file upload via `<input type="file">` forwarded to upload action; `canUpload` boolean prop controls whether upload UI or amber config-missing notice renders
- Updated `components/products/product-form.tsx`: description `<Textarea>` replaced with `<RichTextEditor>` (controlled via `form.watch` + `form.setValue`); `imageUrl` field label updated to "Görsel URL (birincil)" with hint about Medya Stüdyosu; optional `xmlDescription` prop — renders blue card with XML source text (line-clamp-4) and "Editöre taşı" button that calls `form.setValue("description", xmlDescription)`
- Updated `app/(app)/products/[id]/edit/page.tsx`: added `ProductImageManager` card (Faz 27 — Medya Stüdyosu) between main form and supplier card; `xmlDescription` wired from `product.xmlData?.xmlDescription`; `canUpload` evaluated server-side (`!!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)`)
- Updated `.env.example`: added `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` with instructions for creating `product-images` public bucket in Supabase Storage
- XML sync governance: existing `xml-sync-actions.ts` already never overwrites `Product.description` on existing products — no code change needed
- No new DB schema — uses existing `ProductImage` model (Phase 11A)
- tsc --noEmit clean, Vercel deploy READY (commit ab1a8ef)
- Browser-verified 2026-05-17: Medya Stüdyosu card renders ✓; URL-add flow: image card appeared, input cleared, "✓ Görsel eklendi" ✓; page reload: image persisted in DB ✓; RichTextEditor toolbar (H2/H3/Kalın/İtalik/Listeler) ✓; editor loaded existing description ✓; XML description card correctly hidden when xmlDescription null ✓

### Phase 26 — Product Performance Ranking
- Migration `20260517070000_phase26_sales_records`: new `TrendyolSalesRecord` model — `orderId`, `lineId` (unique together), `productId` (nullable FK → Product SET NULL), `orderDate`, `status`, `merchantSku`, `barcode`, `productName`, `quantity`, `unitPriceTry`, `totalPriceTry`, `syncedAt`; 4 additional indexes (productId, orderDate, merchantSku, barcode); applied to production Supabase (27 migrations total)
- Created `lib/actions/sales-sync-actions.ts`: `syncTrendyolSalesAction` — EXECUTIVE_READ-gated; loads TrendyolConfig; builds barcode/SKU product lookup maps; sweeps 4 × 90-day windows (365 days total, Trendyol API limit); per-line barcode-first then SKU matching; upsert with explicit findUnique + create/update for newRecords count; page-0 error surfaced to UI
- Created `components/products/sales-sync-button.tsx`: client component — idle/loading/success/error states; displays "✓ X sipariş, Y satır senkronize edildi — Z ürün eşleşti, N yeni kayıt eklendi" on success
- Created `app/(app)/admin/product-performance/page.tsx` (EXECUTIVE_READ-gated): sync card (Trendyol Satış Senkronizasyonu) with record/matched counts and sync button; in-memory aggregation of sales records by productId; top-20 RankTable sub-component for 3 dimensions (30d qty, 30d revenue, all-time revenue); 3 performance signal cards — Yüksek Ciro/Sıfır Stok (red), Düşük Marj/Yüksek Satış (amber, margin <15% AND qty30d ≥5), Yüksek Stok/Zayıf Satış (slate, stock >10 AND qty30d=0); cancelled order filtering via isCancelled helper
- Extended `app/(app)/products/[id]/page.tsx`: "Trendyol Satış Performansı" card — 4 KPI tiles (son 30G satış adedi, son 30G ciro, toplam satış, gerçekleşen marj); color-coded margin Badge (emerald ≥25%, amber ≥10%, red <10%); empty state with link to /admin/product-performance
- Added "Satış Performansı" nav entry to `app/(app)/layout.tsx` (EXECUTIVE_READ, after İthalat Kararları)
- Updated sidebar info card: "Faz 26 aktif — Satış Performansı: Trendyol sipariş senkronizasyonu, ürün bazlı ciro ve marj sıralaması."
- tsc --noEmit clean, npm run build clean, Vercel deploy READY (commits 7cd451d + c774443 sync fix)
- Browser-verified 2026-05-17: /admin/product-performance loads; sync card renders with Toplam kayıt/Eşleşen counts; 3 ranking table sections visible; sync button triggers and returns order/line/match counts ✓

### Phase 25 — Product Operations UX
- No new DB schema — leverages existing Product, ProductImage, ProductCategory relations
- `services/product-service.ts`: added `sort` field to `ProductFilters` type; `buildOrderBy()` switch handles `stock_desc/asc`, `price_desc/asc`, `name_asc`, `margin_desc`; added case-insensitive OR search on SKU/name/brand/model/barcode (Prisma `mode: "insensitive"`); `has_stock` filter (`stockQuantity > 0`); `images` (take:1, sorted by sortOrder) and `productCategory` (id+name) included in `findMany`; margin sort done in JS post-fetch (computed field, not DB-sortable)
- `components/products/product-filters.tsx`: complete rewrite — live search with 300ms debounce (`useEffect` + `useRef<ReturnType<typeof setTimeout>>`), fires at ≥2 chars or on clear, no submit button; compact pill buttons for Durum (Tümü/Aktif/Pasif) and Stok (Tümü/Stokta var/Düşük stok); sort dropdown with 7 options; "Filtreyi temizle" when filters active; `total` prop renders product count
- `app/(app)/products/page.tsx`: complete rewrite — `getHealthCues()` function checks 5 conditions: Düşük stok (warning, stock ≤ minimumStock), Görsel yok (default, no imageUrl and no images), Maliyet yok (danger, no unitCostTry), Fiyat yok (default, no sellingPriceTry), XML bayat (default, xmlImported but not synced in 7+ days); 7-column table: thumbnail 48×48 lazy image (object-contain, rounded, bg-slate-50) or 📦 emoji fallback + Ürün (name/SKU monospace/brand·model) + Kategori (productCategory.name fallback to category string) + Fiyat (₺ toLocaleString tr-TR 2 decimal) + Stok (amber if low, /minimumStock caption if >0) + Sağlık (Badge per cue, ✓ emerald if clean) + Aksiyon (Düzenle + Detay links)
- tsc --noEmit clean, npm run build clean, Vercel deploy READY (commit d2ec454)
- Browser-verified 2026-05-17: /products loads 651 ürün; thumbnail column renders product images from XML-imported products; live search input present without submit button; Durum + Stok filter pills; sort dropdown "Son güncellenen" default; health cues (Maliyet yok, Fiyat yok, Düşük stok) visible per row; Düzenle + Detay links functional ✓

### Phase 11C — Import Decision System
- Migration `20260517060000_phase11c_import_decision`: `weightKg DECIMAL(10,3)`, `customsRatePct DECIMAL(5,2)`, `shippingMethodPref TEXT` added to Product — all nullable, applied to production Supabase
- Created `lib/import-decision.ts`: USD-first import economics engine replicating Top.ürünler workbook logic — air (8$/kg, 120-day cycle) and sea (2$/kg, 210-day cycle) scenarios, profit ratio, annual ROI compounding, sea wins if ROI ratio ≥ 1.1, ALWAYS_STOCK/BUY_SMALL/DO_NOT_BUY/MISSING_DATA decision, score for ranking
- Created `app/(app)/admin/import-decisions/page.tsx` (EXECUTIVE_READ-gated): decision cockpit with summary tiles (4 recommendation types, each a clickable filter), Hava yolu / Deniz yolu filter bar, product table (landed cost, profit ratio, monthly/annual profit, required capital, demand, stock), formula footnote card
- Extended product detail `app/(app)/products/[id]/page.tsx`: "İthalat Kararı" card with air vs sea panel comparison, recommendation badge, missing data list
- Extended product form `components/products/product-form.tsx`: "İTHALAT KARARI GİRDİLERİ" section — Ağırlık (kg), Gümrük Oranı (%), Tercih Edilen Kargo Yöntemi (AIR/SEA/system)
- Extended `types/products.ts`, `lib/validations/product.ts`, `lib/actions/product-actions.ts`, `app/(app)/products/[id]/edit/page.tsx` with 3 new fields
- Added "İthalat Kararları" nav entry to `app/(app)/layout.tsx` (EXECUTIVE_READ, after İthalat Hesaplayıcı)
- Updated sidebar info card: "Faz 11C aktif — İthalat Kararları: hava/deniz kargo ekonomisi, satın alma önerisi."
- tsc --noEmit clean, npm run build clean, Vercel deploy READY (commit d811f75)
- Browser-verified 2026-05-17: /admin/import-decisions loads, 651 VERİ EKSİK, kur ₺46.00, filter bar works; product detail card renders with missing field list; product edit form shows new section ✓

### Phase 24 — Production Safety Center
- No new DB schema — reads `_prisma_migrations` via `prisma.$queryRaw` with graceful error fallback
- Created `app/(app)/admin/safety/page.tsx` (EXECUTIVE_READ-gated): summary cards (applied/failed migration counts, last migration), 8-item pre-deployment checklist, 9-row dangerous operations table, full Migrasyon Geçmişi list
- `CheckItem` sub-component: green ✓ or amber ! based on runtime data (first item detects real failed migrations)
- `DangerRow` sub-component: CRITICAL/HIGH/MEDIUM risk pill + monospace operation + Turkish approval requirement
- Created `docs/MIGRATION-SAFETY.md`: pre-migration checklist, Supabase backup guide, rollback rules per operation type, seed/demo separation rules, production write approval protocol, 25-row migration history reference
- Added "Üretim Güvenliği" nav entry to `app/(app)/layout.tsx` (EXECUTIVE_READ permission, after Veri Hijyeni)
- Updated sidebar info card: "Faz 24 aktif — Üretim Güvenliği: migrasyon geçmişi ve tehlikeli işlem onay kuralları."
- tsc --noEmit clean, Vercel deploy READY (commit fe56d98)
- Browser-verified 2026-05-17: 15 applied migrations, 3 failed detected (amber "!"), all 9 danger rows render, Migrasyon Geçmişi shows real timestamps, sidebar Üretim Güvenliği active ✓

### Phase 23 — Data Hygiene Governance
- No new DB schema — single `prisma.product.findMany` on active products (12 select fields + supplierLinks relation)
- Created `app/(app)/admin/data-hygiene/page.tsx` (EXECUTIVE_READ-gated): 4 inline sub-components (IssueCount, Section, EmptyState, ProductTable)
- 8 data completeness checks computed in-memory: missingCost, missingRetailPrice, missingMarketplacePrice, stockWithNoCost (highest priority), xmlNoPrice, missingCategory, missingBarcode, missingSupplier
- `IssueCount` card: tone-aware colour (ok/warn/danger/default) for summary row — shows 4596 total issues and 47 maliyetsiz stoklu in production
- `Section` wrapper: title + subtitle + issue count pill (emerald "✓ Temiz" / red "N sorun")
- `ProductTable`: SKU (monospace) / Ürün Adı / optional extra column / Düzenle → link to `/products/[id]/edit`
- `EmptyState`: emerald check message when a section has zero issues
- Green all-clear banner shown only when `totalIssues === 0`
- Added "Veri Hijyeni" nav entry to `app/(app)/layout.tsx` (EXECUTIVE_READ permission)
- Updated sidebar info card: "Faz 23 aktif — Veri Hijyeni: eksik maliyet, fiyat ve barkod raporları."
- tsc --noEmit clean, Vercel deploy READY (commit 6fb3ec4)
- Browser-verified 2026-05-17: 651 aktif ürün, 0 tam dolu, 4596 toplam sorun, 47 maliyetsiz stoklu; Section 1 renders 650-row product table with real SKU/Düzenle data ✓

### Phase 22 — Executive KPI Dashboard
- No new DB schema — reads from Product, CapitalConfig, MonthlyExchangeRate, MarketplaceListing via 4 parallel `Promise.all` queries
- Created `app/(app)/admin/executive/page.tsx` (EXECUTIVE_READ-gated): 472-line server component, no client components
  - `KpiCard` sub-component: label, value, sub caption, tone (default/success/danger/warning) with color-coded border
  - `UrgencyPill` sub-component: label, count, tone — renders procurement urgency distribution as pill row
- **Row 1 KPIs**: Toplam Stok Değeri (TRY) = Σ unitCostTry × stockQuantity for products with cost; Sıfır Stoklu Ürünler; Minimum Altı Stok (stock < minStockLevel where minStockLevel > 0); Aktif Pazar Yeri Listesi (status=ACTIVE count)
- **Row 2 KPIs**: USD/TRY Kuru from latest MonthlyExchangeRate with year/month label; Toplam Sermaye from CapitalConfig.totalCapitalTry; Tahmini Serbest Sermaye = totalCapital − stockValue − reserveAmount (reservePct × totalCapital, default 20%)
- **Tedarik Aciliyeti section**: runs `calculateProcurement()` per active product; KRİTİK/YÜKSEK/ORTA/DÜŞÜK/YETERLİ/VERİ YOK pill row; "Toplam Önerilen Alım Maliyeti" for CRITICAL+HIGH only; "Tedarik Asistanı →" link
- **Kârlılık section**: runs `calculateProfitability()` per product; sorts by marketplace margin % DESC; shows top-5 table with product name/SKU, pazar yeri marjı %, perakende marjı %; losing product count shown in Badge (tone="danger"); color-coded margin cells; "Pazar Kârlılığı →" link
- Footer quick-links: Sermaye Dağılımı →, Tedarik Asistanı →, İthalat Hesaplayıcısı →, Pazar Kârlılığı →, Döviz Kurları →
- Added "Yönetici Paneli" nav entry to `app/(app)/layout.tsx` (EXECUTIVE_READ permission, before "Sermaye")
- Updated sidebar info card in `components/dashboard/sidebar.tsx`: "Faz 22 aktif — Yönetici Paneli: stok değeri, kârlılık, tedarik aciliyeti."
- tsc --noEmit clean, Vercel deploy READY (commit ef5b8a3)
- Browser-verified 2026-05-17: all KPI sections render with real data; top-5 BAOFENG UV-82 %16.0 pazar yeri, %38.3 perakende; VERİ YOK 651 procurement; serbest sermaye ₺3.999.100 ✓

### Phase 21 — Import Cost Calculator
- Created `app/(app)/admin/import-calculator/page.tsx` (EXECUTIVE_READ-gated): fetches active suppliers (id/name), products (id/name/sku/sellingPriceTry/marketplacePriceTry/wholesalePriceTry), all SupplierProduct rows (supplierId/productId/unitCostUsd/moq/leadDays), latest MonthlyExchangeRate (usdTryRate); converts all Decimal fields to number before passing props
- Created `components/suppliers/import-calculator-form.tsx`: fully client-side, no new DB schema
  - SupplierOption, ProductOption, SupplierProductOption, CalcResult interfaces
  - 7 controlled inputs: Tedarikçi select (optional), Ürün select (optional), Sipariş Adedi, Birim Maliyet USD, Toplam Nakliye USD, Gümrük Vergisi %, USD/TRY Kuru
  - Auto-fills unitCostUsd from matching SupplierProduct on supplier+product change; pre-fills rate from latestRate prop
  - `calculate()`: productTotalUsd = qty×unitCostUsd; customsUsd = productTotal×(customs/100); totalLandedUsd = productTotal+freight+customs; unitLandedTry = (totalLanded/qty)×rate; breakEvenTry = unitLandedTry×1.2
  - Maliyet Dökümü output: 7 rows (ürün, nakliye, gümrük, toplam USD bold, birim USD, birim TRY bold, başa baş amber)
  - Kanal Bazlı Marj Analizi: Perakende/Pazar Yeri/Toptan with MarginRow sub-component; color-coded (emerald ≥25%, amber ≥10%, red <10%); "Fiyat girilmemiş" when prices absent
  - Amber advisory banner
- "Hesaplama Mantığı" info card on page with 4 formula cells
- Added "İthalat Hesaplayıcı" sidebar nav entry (EXECUTIVE_READ permission) to `app/(app)/layout.tsx`
- tsc --noEmit clean, Vercel deploy READY (commit 1117ed7)
- Browser-verified 2026-05-17: qty=10, cost=$14.50, freight=$50, customs=5%, rate=46 → total $202.25, unit TRY ₺930,35, break-even ₺1.116,42 — all correct ✓

### Phase 20 — Supplier Intelligence
- Created `Supplier` model: id, name, contactName, phone, email, countryOfOrigin, paymentTerms, defaultLeadDays, notes, isActive, timestamps; indexes on name, isActive
- Created `SupplierProduct` join model: id, supplierId (FK → Supplier CASCADE), productId (FK → Product CASCADE), unitCostUsd (Decimal?), moq (Int?), leadDays (Int?), isPreferred (Boolean), notes; @@unique([supplierId, productId])
- Applied Prisma migration `20260517040000_phase20_supplier_intelligence` to production Supabase
- Created `lib/actions/supplier-actions.ts`: `saveSupplierAction` (create/update, SUPPLIERS_WRITE), `deleteSupplierAction` (SUPPLIERS_WRITE), `upsertSupplierProductAction` (upsert by unique supplierId_productId, SUPPLIERS_WRITE), `deleteSupplierProductAction` (SUPPLIERS_WRITE)
- Created `app/(app)/admin/suppliers/page.tsx` (SUPPLIERS_READ-gated): "Tedarikçi Ekle" card with SupplierForm, "Kayıtlı Tedarikçiler" list with SupplierListClient; shows product count, lead time, country per row
- Created `components/suppliers/supplier-form.tsx`: full create/edit form — name, contactName, phone, email, countryOfOrigin, paymentTerms, defaultLeadDays, notes, isActive checkbox; Güncelle + Sil actions when editing
- Created `components/suppliers/supplier-list-client.tsx`: expand-row inline edit — click row to expand SupplierForm, collapse on success/page-reload
- Created `components/suppliers/supplier-product-section.tsx`: product edit page supplier section — existing links table (Tedarikçi, Birim Maliyet USD, Min. Sipariş, Tedarik Süresi, Tercihli, Not, Kaldır), "Tedarikçi Bağla" form with supplier dropdown (filtered to unlinked only) + unitCostUsd/moq/leadDays/isPreferred/notes
- Extended `app/(app)/products/[id]/edit/page.tsx`: added SupplierProductSection card below main product form; fetches allSuppliers + supplierLinks (with supplier name) + canWriteSuppliers in parallel
- Added "Tedarikçiler" sidebar nav entry (SUPPLIERS_READ permission), positioned after "Tedarik Asistanı"
- Updated sidebar info card: "Faz 20 aktif — Tedarikçi Zekası: tedarikçi yönetimi, ürün bağlantıları."
- permissions.ts and seed.ts already had suppliers.read / suppliers.write
- tsc --noEmit clean, Vercel deploy READY (commit 6dde711)

### Phase 19 — Procurement Intelligence Engine
- Created `lib/procurement.ts`: pure calculation module, no new DB schema
  - `ReorderUrgency` enum: CRITICAL / HIGH / MEDIUM / LOW / OK / UNKNOWN
  - `calculateProcurement()`: daysRemaining, urgencyRank, suggestedOrderQty, suggestedCost, projectedMonthlyProfit
  - Urgency thresholds: stock=0→CRITICAL, ≤leadTime×1.5→HIGH, ≤leadTime×3→MEDIUM, ≤leadTime×6→LOW, else OK
  - `suggestedOrderQty` covers `targetCoverageMo` (default 3 months) after transit consumption
  - Turkish labels, tone classes, `urgencyRank()` sort helper
- Created `app/(app)/admin/procurement/page.tsx` (EXECUTIVE_READ-gated):
  - Fetches all active products with 20 pricing/demand/stock/lead-time fields
  - Summary cards: CRITICAL / YÜKSEK / ORTA / DÜŞÜK / VERİ YOK urgency counts
  - Financial summary: total suggested cost, projected monthly profit (CRITICAL+HIGH only)
  - Ranked purchase table: SKU, name, stock, urgency badge, days left, suggested qty, cost, projected profit
  - Graceful empty state when no urgent products
  - Amber advisory banner ("Bu liste öneridir — satın alma kararı veriniz")
- Browser-verified: page loads, summary cards render, graceful empty state for UNKNOWN products

### Phase 18 — Quote Professionalization 2.0
- Created `QuoteTemplate` table: id, name, description, paymentTerms, deliveryTerms, warrantyTerms, notes, currencyMode (enum), isActive, createdById (FK → User), timestamps
- Created `QuoteTemplateItem` table: id, templateId (FK CASCADE), productId (optional FK → Product), description, quantity, unitPrice, currency, discount, tax, sortOrder
- Added `quoteTemplates QuoteTemplate[]` relation to `User` model (named `TemplatesCreated`)
- Added `quoteTemplateItems QuoteTemplateItem[]` relation to `Product` model (named `TemplateItems`)
- Applied Prisma migration to production Supabase PostgreSQL
- Added 2 new permissions: `quoteTemplates.read`, `quoteTemplates.write` — seeded to SALES role defaults
- Created `services/quote-template-service.ts`: `listQuoteTemplates()` (includes items + product + createdBy), `getQuoteTemplateById()`
- Created `lib/actions/quote-template-actions.ts`: `createQuoteTemplateAction`, `updateQuoteTemplateAction` (atomic `$transaction` delete+recreate items), `deleteQuoteTemplateAction` — all Zod-validated, permission-guarded
- Created `/quotes/templates` management page: "Şablon Oluştur" form card + "Kayıtlı Şablonlar" list with per-item line display and delete buttons
- Created `components/quotes/quote-template-form.tsx`: `QuoteTemplateForm` (local-state, items array with add/remove), `DeleteTemplateButton` (with window.confirm gate)
- Extended `components/quotes/quote-form.tsx`: "Şablondan Yükle" dropdown + button in items card header (only rendered when templates prop is non-empty); `loadTemplate()` fills paymentTerms/deliveryTerms/warrantyTerms/notes and replaces items array via RHF `setValue`
- Quote form product select: auto-fills description (if blank) and unitPrice+currency from `sellingPriceTry` on product change — implemented via split register pattern (`const { onChange: rhfOnChange, ...restReg } = form.register(...)`) plus custom `onChange` calling `form.setValue()`
- Updated `listCustomerInterestProducts()` to include `sellingPriceTry` in select projection
- Updated customer detail page `[id]/page.tsx`: fetches `listQuoteTemplates()` in `Promise.all`, passes templates + enriched products to QuoteForm
- Updated quote edit page `[id]/edit/page.tsx`: same pattern as customer detail
- Added "Teklif Şablonları" sidebar entry (QUOTE_TEMPLATES_READ permission)

### Phase 30 — Marketplace Margin Policy Normalization
- Created `MarketplacePlatformPolicy` table: platform (PK), standardShippingTry, standardCommissionPct, paymentFeePct, returnReservePct, vatPct — all Decimal optional; applied migration `20260517100000_phase30_marketplace_policies` to production Supabase
- Created `lib/marketplace-policy.ts`: `resolveMarginPolicy()` three-tier resolver (product override > product value > platform standard > system default); `PolicySource` type enum; `policySourceLabel()` / `policySourceColor()` helpers; `ProductPolicyInput` / `PlatformPolicyInput` interfaces
- Created `lib/actions/marketplace-policy-actions.ts`: `upsertPlatformPolicyAction` (MARKETPLACE_POLICIES_MANAGE gated, upsert per platform key); `getPlatformPoliciesAction`
- Created `app/(app)/admin/marketplace-policies/page.tsx` (MARKETPLACE_POLICIES_MANAGE-gated): 8 platform cards with inline save, Yapılandırıldı/Varsayılan badge, resolution order explanation card, policy coverage notice
- Updated `/marketplace/profit` page: uses `resolveMarginPolicy()` for shipping/commission per listing; winners/losers tables show Kargo + Komisyon columns with `PolicyBadge` source labels (Ürün Geçersiz Kılma/Ürün Değeri/Platform Standardı/Sistem Varsayılanı)
- Added `MARKETPLACE_POLICIES_MANAGE` permission; added "Pazar Marj Politikaları" sidebar link
- tsc clean, Vercel deploy READY (commit 4517916)
- Browser-verified 2026-05-17 ✓

### Phase 31 — Import Economics Normalization (RMB-First Formula)
- Corrected `SEA_FREIGHT_PER_KG` constant: 2 → 1 USD/kg (workbook-correct value)
- Added `rmbUsdRate Decimal(12,4)` optional column to `MonthlyExchangeRate` table
- Added `sourceCostRmb Decimal(15,2)` + `importPaymentFeePct Decimal(5,2)` optional columns to `Product` table
- Applied migration `20260517150000_phase31_import_economics_rmb` to production Supabase
- Updated `lib/import-decision.ts`: RMB-first formula `(sourceCostRmb / rmbUsdRate) * (1 + paymentFeePct/100) + freight * weightKg) * (1 + customsRatePct/100)` — falls back to `sourcePriceUsd` when RMB fields absent; `getLatestRmbUsdRate()` utility added to exchange rate actions
- Updated exchange rate admin form: 5-column grid with RMB/USD input field; exchange rates page table gains RMB/USD column
- Updated product form: amber "RMB kaynaklı ithalat" section with `sourceCostRmb` + `importPaymentFeePct` inputs + formula hint
- Updated import-decisions cockpit + product detail İthalat Kararı card to fetch and pass RMB fields to engine
- tsc clean, Vercel deploy READY (commit b049218)
- Browser-verified 2026-05-17 ✓

### Phase 32 — Holding-Grade Import Governance
- Added optional Decimal fields to `Supplier`: `defaultAirFreightUsdPerKg`, `defaultSeaFreightUsdPerKg`, `defaultPaymentFeePct`
- Created `ImportDecisionSnapshot` model: productId FK, snapshotDate, notes, all import engine inputs (weightKg, customsRatePct, sourcePriceUsd, sourceCostRmb, rmbUsdRate, usdTryRate, airFreightPerKg, seaFreightPerKg, paymentFeePct), all computed outputs (airLandedCostTry, seaLandedCostTry, profitRatioAir, profitRatioSea, recommendedMethod, decision, score), createdById FK
- Applied migration `20260517160000_phase32_import_governance` to production Supabase
- Exported `effectiveFreightPerKg()` helper from `lib/import-decision.ts`: product override → supplier default → global constant (AIR=8, SEA=1 USD/kg)
- Created `lib/actions/import-snapshot-actions.ts`: `createImportDecisionSnapshotAction` (EXECUTIVE_READ, resolves all inputs, calls engine, saves snapshot); `getProductImportSnapshotsAction` (last 10 with createdBy + supplier names)
- Created `components/products/import-snapshot-button.tsx`: emerald client component with useTransition, "Kararı Kaydet" button, 3-second success flash
- Updated Import Decisions cockpit: "Kaydet" column with snapshot button per row
- Updated product detail page: snapshot button in İthalat Kararı card header + "Karar Geçmişi" history table (Tarih/Karar/Skor/Yöntem/İniş USD/Kâr Oranı/Kur/Kaydeden)
- Updated supplier form + list: import defaults section (air/sea freight USD/kg, payment fee %)
- tsc clean, Vercel deploy READY (commit 92bb255)
- Browser-verified 2026-05-17: "Kararı Kaydet" button triggers, "Karar kaydedildi." success shown, Karar Geçmişi table row appears on reload ✓

### Phase 33 — Marketplace Pricing Normalization (Canonical Engine)
- Created `lib/marketplace-pricing.ts`: canonical per-marketplace pricing engine (pure computation, no DB)
  - `calcMarketplacePricingRow()`: resolves effectivePriceTry, shippingTry, commissionTry, paymentFeeTry, returnReserveTry, netRevenueTry, netMarginPct per platform
  - `calcShippingFromPriceTiers()`: roadmap price-tier defaults (<5 USD→1.2, 5–7.5→2.0, >7.5→3.3 USD × usdTryRate)
  - Price resolution: manual override (marketplacePriceTry) > XML price (per-platform) > none
  - Shipping resolution: product/platform policy override > price-tier default
  - `priceSourceLabel/priceSourceColor`, `shippingSourceLabel` badge helpers
- Updated product detail `app/(app)/products/[id]/page.tsx`: "Pazar Yeri Fiyatlandırması" card using canonical engine
  - 5 platforms: Trendyol, Hepsiburada, Amazon, Pazarama, Idefix
  - Per-row: XML Fiyat | Etkin Fiyat | Kaynak badge | Kargo ₺ + source badge | Komisyon % + source badge | Net Kalan ₺ | Net Marj %
  - Footer: shipping tier reference at current usdTryRate
  - Fetches MarketplacePlatformPolicy from DB for override resolution
- tsc clean, Vercel deploy READY (commit 0819706)
- Browser-verified 2026-05-17: Manuel source badge, Fiyat Dilimi shipping, Sistem Varsayılanı commission, net remaining + margin all render ✓

### Phase 41 — Bulk Mapping Backfill Engine
- Updated `lib/actions/marketplace-mapping-actions.ts`:
  - `backfillMappingProductId()` now returns `{ sales: number; returns: number }` counts instead of `void`
  - `createMarketplaceMappingAction`: surfaces backfill count in success message (e.g. "Kaydedildi. 45 sipariş, 3 iade bağlandı.")
  - `updateMarketplaceMappingAction`: same surfacing ("Güncellendi. N sipariş, M iade bağlandı.")
  - `bulkBackfillAllMappingsAction()`: new exported action — MARKETPLACE_MAPPINGS_WRITE gated; iterates all MarketplaceProductMapping entries; runs `backfillMappingProductId` for each; returns aggregate counts
- Created `components/marketplace/bulk-backfill-button.tsx`: client component with "Tüm Eşleştirmeleri Uygula" button; shows pending state; success message with counts; auto-reloads page after 1.5s to refresh unmatched inbox
- Updated `components/marketplace/mapping-form.tsx`: success message now shows `result.message ?? "Kaydedildi."` (no longer hardcoded)
- Updated `app/(app)/admin/marketplace-mappings/page.tsx`: `BulkBackfillButton` added to header alongside ← Admin Panel button
- No schema change — reads existing MarketplaceProductMapping, writes TrendyolSalesRecord + TrendyolReturnRecord productId
- tsc clean, Vercel deploy READY (commit 546b0a7)
- Browser-verified 2026-05-17: "Tüm Eşleştirmeleri Uygula" butonu header'da görünüyor, unmatched barcodes inbox ve Eşleştir butonları render ✓

### Phase 40 — Capital Allocation + Real Sales Velocity
- Updated `app/(app)/admin/capital/page.tsx`:
  - Fetches `TrendyolSalesRecord` (last 30 days, non-cancelled, matched) in parallel with product list and CapitalConfig
  - Builds `actualSales30d Map<productId, qty>` using `isCancelledStatus()` filter (same pattern as Phase 39)
  - `effectiveOnlinePotential`: `actualQty` overrides manual `onlineSalesPotential` when available
  - `velocitySource` tracked per product: `"actual"` (Trendyol data) / `"estimated"` (manual)
  - Passes `effectiveOnlinePotential` to `calculateSalesPotential()` for investment score computation
  - New **"Hız"** column in purchase suggestions table: **Gerçek** (emerald) / **Tahmin** (slate) badge per row
  - Header description: shows `N üründe gerçek Trendyol satış hızı kullanılıyor.` (emerald) when data present
  - **Gerçek Satış Verisi Aktif** emerald banner with explanation text when actual data available
  - Fixed tfoot `colSpan` 6 → 7 for new Hız column
  - Removed unused `calculateProfitability` import
  - No schema change — reads existing Phase 26 `TrendyolSalesRecord` table
- tsc clean, Vercel deploy READY (commit 9c45e28)
- Browser-verified 2026-05-17: "6 üründe gerçek Trendyol satış hızı kullanılıyor." in header ✓, Gerçek Satış Verisi Aktif banner ✓, "Hız" column with Tahmin badge in BAOFENG UV-82 row ✓, all capital summary cards and config form intact ✓

### Phase 39 — Procurement Intelligence + Real Sales Velocity
- Updated `app/(app)/admin/procurement/page.tsx`:
  - Fetches `TrendyolSalesRecord` (last 30 days, non-cancelled, matched) in parallel with product list
  - Builds `actualSales30d Map<productId, qty>` from non-cancelled matched records (same `isCancelledStatus()` helper)
  - `velocitySource` per row: `"actual"` (real Trendyol data) / `"estimated"` (manual `onlineSalesPotential`) / `"none"`
  - When `actualQty` exists for a product, overrides `onlineSalesPotential` in `calculateProcurement()` call
  - New "Hız Kaynağı" column: **Gerçek** (emerald) / **Tahmin** (slate) / **Veri Yok** (amber) badge per row
  - New "T30G Satış" column: actual Trendyol 30-day qty when available, else —
  - Header description: shows `N üründe gerçek Trendyol satış hızı kullanılıyor.` (emerald) when actual data present
  - **Gerçek Satış Verisi Aktif** emerald banner: N products with real data, M remaining with manual/none
  - OK (adequately stocked) product rows: `Gerçek (N T30G)` emerald badge when actual data available
  - No schema change — reads existing Phase 26 `TrendyolSalesRecord` table
- tsc clean, Vercel deploy READY (commit 29c56e7)
- Browser-verified 2026-05-17: 6 üründe gerçek Trendyol satış hızı, 645 ürün manuel/yok, 1 ürün aciliyet listesinde, tüm kolonlar render ✓

### Phase 38 — Return Rate Analysis
- Created `app/(app)/marketplace/return-analysis/page.tsx` (MARKETPLACE_RETURNS_READ gated, `force-dynamic`)
  - Fetches matched `TrendyolReturnRecord` (productId not null), matched `TrendyolSalesRecord` (productId not null), and unmatched return count in parallel
  - Aggregates sold qty per product from non-cancelled sales records (`isCancelledStatus()` filter)
  - Aggregates return claim count per product; `returnRate = claimCount / soldQty × 100` (null when soldQty = 0)
  - `highRiskRows`: returnRate ≥ 5% (red border section "Yüksek İade Riski")
  - `normalRows`: returnRate < 5% (neutral section "Düşük İade Oranı")
  - `noSalesRows`: returnRate null — has returns but no matched sales records (amber note)
  - Summary KPI cards: Eşleşen İade Talebi, İadesi Olan Ürün, Yüksek İade Riski (≥%5), Eşleşmemiş İade Talebi
  - Top 10 return reasons table with count + % of total
  - Back-links: ← Gerçekleşen Marj, İade Merkezi →
  - Empty state when totalMatchedClaims === 0 (with link to İade Merkezi to sync)
  - No schema change — reads existing Phase 26 (TrendyolSalesRecord) + Phase 29 (TrendyolReturnRecord) tables
- Added "İade Analizi" nav entry to `app/(app)/layout.tsx` (MARKETPLACE_RETURNS_READ)
- tsc clean, Vercel deploy READY (commit bc9f219)
- Browser-verified 2026-05-17: page renders cleanly, all KPI cards visible, İade Analizi sidebar nav active, empty state correct (no return records matched yet) ✓

### Phase 37 — Unmatched Barcodes Inbox on Mapping Page
- Updated `app/(app)/admin/marketplace-mappings/page.tsx`:
  - Now accepts `searchParams: Promise<{ barcode?: string; title?: string }>` for URL-based form pre-fill
  - Fetches all `TrendyolSalesRecord` where `productId IS NULL`, groups by barcode in memory
  - Top 30 barcodes sorted by total revenue shown above add-mapping form
  - Card header: total unmatched count + total ciro missing from profitability analysis
  - "(İlk 30 barkod gösteriliyor.)" note when > 30 unique unmatched barcodes
  - Table columns: Platform Barkod, Trendyol Ürün Adı, SKU, Kayıt count, Toplam Ciro
  - "Eşleştir →" amber button links to `?barcode=XXX&title=YYY#add-form`
  - Active row highlighted with amber ring when its barcode matches current `?barcode` param
  - `#add-form` anchor on wrapping div for scroll-on-click
  - Pre-fill hint shown in form header when `defaultBarcode` is set
- Updated `components/marketplace/mapping-form.tsx`:
  - `MappingForm` now accepts `defaultBarcode?: string` and `defaultPlatformTitle?: string`
  - Props used as `useState` initial values for `platformBarcode` and `platformTitle`
- tsc clean, Vercel deploy READY (commit 0b70508)
- Browser-verified 2026-05-17: 112 barkod, ₺852.073 missing ciro, top 30 table renders, Eşleştir buttons visible ✓

### Phase 36 — Executive Dashboard Marketplace Revenue Integration
- Updated `app/(app)/admin/executive/page.tsx`: added "Trendyol / Son 90 Gün — Gerçekleşen Satış Özeti" card
  - `since90` window: `new Date()` minus 90 days; fetches `TrendyolSalesRecord` (no schema change)
  - `isCancelledStatus()` filter applied in memory (status contains "iptal" or "cancel", case-insensitive)
  - Three KPI tiles: Toplam Ciro (90G), Eşleşen Ürün Çeşidi, Eşleşmemiş Kayıt
  - Top 5 products by 90-day revenue table (matched `productId` records only, product name + SKU)
  - Empty state renders if no 90-day data, prompts sync from Satış Performansı
  - "Gerçekleşen Marj →" link in card header + footer quick-links section
- Card positioned between Section 2 (Exchange Rate + Capital) and Section 4 (Procurement Urgency)
- tsc clean, Vercel deploy READY (commit 572829a)
- Browser-verified 2026-05-17: ₺506.874 ciro (565 satır), 14 eşleşen ürün, 535 eşleşmemiş, top 5 with real product names ✓

### Phase 35 — Realized Margin Analysis
- Created `app/(app)/marketplace/realized-margin/page.tsx` (EXECUTIVE_READ gated, `force-dynamic`)
  - Aggregates last 90 days `TrendyolSalesRecord` (non-cancelled) per product
  - Computes `avgRealizedPriceTry`, `totalQty`, `totalRevenueTry` per product
  - `calcMarketplacePricingRow()` fed actual realized price as manual override → realistic deductions (commission, shipping, paymentFee, returnReserve)
  - `realizedMarginPct = (realized − commission − shipping − paymentFee − returnReserve − unitCost) / realized × 100`
  - `deltaPct = realizedMarginPct − expectedMarginPct` (negative = worse than expected)
  - Sections: Zarar Eden (margin < 0) / Beklenenden Düşük Marj (delta < −5%) / Kârlı Satışlar / Maliyet Verisi Eksik
  - Summary cards: Satılan Ürün Çeşidi, Toplam Ciro (90G), Ort. Gerçekleşen Marj, Beklenenden Kötü count
  - Hesaplama Notu footer with full formula transparency
  - Trendyol platform policy resolved and applied; `usdTryRate` from latest `MonthlyExchangeRate`
- Added "Gerçekleşen Marj" nav entry to `app/(app)/layout.tsx` (EXECUTIVE_READ, after Pazar Kârlılığı)
- tsc clean, Vercel deploy READY (commit 4e015eb)
- Browser-verified 2026-05-17: ₺117.222,79 ciro, %32.5 avg margin, Beklenenden Düşük (1 ürün), Kârlı section, Maliyet Eksik (13 ürün) all render ✓

### Phase 34 — Marketplace Profit Page XML Price Integration
- Updated `app/(app)/marketplace/profit/page.tsx` to use `calcMarketplacePricingRow()` per listing
  - `PLATFORM_XML_FIELD` map: TRENDYOL→xmlTrendyolPrice, HEPSIBURADA→xmlHbPrice, AMAZON→xmlAmazonPrice, PAZARAMA→xmlPazaramaPrice, IDEFIX→xmlIdefixPrice
  - Effective price = manual override (marketplacePriceTry) > per-platform XML price > none
  - `usdTryRate` fetched from latest `MonthlyExchangeRate`
  - `PriceBadge` component (Manuel/XML/Veri yok) shown alongside price in winners/losers tables
  - `PolicyBadge` extended to handle "price_tier" shipping source
  - Column renamed "Fiyat" → "Etkin Fiyat"
  - Consistent with product detail Pazar Yeri Fiyatlandırması card
- tsc clean, Vercel deploy READY (commit f975093)
- Browser-verified 2026-05-17: profit page renders correctly, per-platform XML prices feed effective price ✓

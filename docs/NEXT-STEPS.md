# NEXT STEPS

## Mission

This file defines execution priority from current state.

It answers one operational question:

What should be built next, in what order?

`ROADMAP.md` defines the target architecture.

`PROGRESS.md` defines the factual implementation state.

`NEXT-STEPS.md` defines the immediate execution stack between those two documents.

---

## Architecture Constraints (Immutable)

These constraints define what this system IS and IS NOT. Do not build against them.

**Stock source of truth: Entegra (via XML sync)**
- Entegra is the ERP. Stok hareketleri Entegra'da gerçekleşiyor.
- XML sync (`/api/cron/xml-sync`, `/admin/xml-sync`) Entegra'dan günlük stok güncellemesi çekiyor.
- Uygulamanın stok sayılarını kendi başına düşmesi / artırması YAPILMAZ.
- `StockAdjustmentLog` ve "Stoktan Düş" özellikleri artık kullanılmıyor (Entegra bunu yapıyor).

**Trendyol: Sadece READ-ONLY veri kaynağı**
- Trendyol API'den: sipariş, iade, soru, katalog verisi çekiliyor.
- Trendyol API'ye: hiçbir şey yazılmıyor (stok push, fiyat push YAPILMAZ).
- Phase 45 (`/admin/trendyol-stock-sync`) hatalı yönde oluşturuldu — bu sayfanın push işlevi kullanılmaz.

**Ana hedef: İthalatta doğru ürünü bulmak**
- Trendyol satış fiyatları + gerçek satış hacmi + ithal maliyet hesabı → hangi ürünü ithal et
- Kar analizi, iade oranı, satış hızı: ithalat kararı için veri sağlar
- Yeni pazaryeri yazma mimarisi bu projede YOK

---

## Current Reality

Current reality:
- CRM foundation exists
- quote workflow v1 exists
- relationship engine exists
- task and outreach foundations exist
- Turkish location layer exists
- RBAC is production-active
- inventory, profitability, XML import (Entegra), Trendyol read intelligence, supplier intelligence, import calculator, executive dashboard, and import decision engine all exist in some form

This means the product is already useful for:
- internal CRM operations
- quote workflows
- XML-driven inventory intake from Entegra
- Trendyol read-side operations (orders, returns, Q&A, catalog)
- pre-purchase import evaluation
- owner-grade executive review
- import buy/skip decisions replacing the old workbook

Not yet complete:
- product finance field sprawl still exists across import cost, TRY cost, marketplace price, shipping, commission, and override inputs
- operator-facing product finance truth is still too crowded for safe daily use
- XML sync'te stok değişim loglaması (hangi ürünün stoğu ne kadar değişti per sync)
- Trendyol sipariş verilerinde eşleşme oranı hâlâ düşük (188 eşleşmemiş ürün)
- İthalat kar analizi Trendyol gerçek satış fiyatlarıyla tam entegre değil
- Ürün bazında "bu ithalat karlı mı?" sorusunu tek sayfada yanıtlayan bir cockpit yok

## Role Coverage Gaps (identified 2026-05-17)

These are structural gaps in the current system, not single-feature bugs:

1. ~~**WAREHOUSE rolü yok**~~ — ✓ **ÇÖZÜLDÜ (Phase 55, 2026-05-17)**: WAREHOUSE enum, /warehouse, /warehouse/count, WarehouseWorkspace, createInventoryCountAction tamamlandı.
2. **Ürün formu rol körü** — `products.update` iznine sahip herkes (şu an: OPERATIONS) tüm finansal/ithalat alanlarını görür. Sahaya özel alan görünürlüğü uygulanmadı.
3. **Rol bazlı dashboard yok** — Tüm roller aynı /dashboard sayfasını görüyor. SALES ve WAREHOUSE için anlamsız kartlar gösteriliyor.
4. **Satış fırsat motoru yok** — "Bu ürünü hangi müşteriye satarım?" sorusunu yanıtlayan bir akış yok. Veri modeli (ProductInterest, CategoryInterest) hazır, UI yok.
5. **Operasyon koordinasyon yok** — `tasks.assign` permission var ama UI yok. Operations koordinatörü ekibine görev atayamıyor ve görev panosunu göremez.
6. **executive.read çok geniş** — İthalat zekası, sermaye, finans, XML sync, yönetici paneli hepsi tek permission altında. İleride `import.read` / `productFinance.read` gibi alt izinlere ayrılması gerekecek.

---

## Immediate Priority Stack

### Priority 0 - Safety and Data Governance Baseline

Why:
Schema-heavy phases should not proceed without minimum migration and data-governance safety rules.

Includes:
- migration safety checklist
- backup/rollback discipline
- duplicate SKU/barcode awareness
- missing cost/category/link reports as future checks
- no destructive production operations without explicit approval

Clarification:
- this does not mean fully redoing Phase 23 and Phase 24
- it means keeping those rules active while the next product-heavy phases are built

### ✓ Priority 0A — Product Finance Field Consolidation (Phase 52, 2026-05-17)

Neden:
Ürün düzeyinde çok sayıda üst üste binen alan vardı: ithalat maliyeti (RMB + USD), pazar yeri satış fiyatı
(genel `marketplacePriceTry` vs. platform bazlı XML fiyatları), kargo/komisyon (ürün geçersiz kılması vs. platform
politikası). Bu ambiguity çözülmezse sonraki fazlar belirsiz truth kaynaklarına yeni mantık katmanları ekler.

Delivered (Phase 52 — product-form.tsx UI refactor, no schema change):
- `importUnitCostUsd` "İthalat ve envanter" bölümünden alınıp "İthalat kararı girdileri" bölümüne taşındı
- Kaynak maliyet bölümü Birincil (RMB, emerald) / Yedek (USD, slate) görsel hiyerarşisiyle yeniden düzenlendi
- `marketplacePriceTry` etiketi "Pazar yeri fiyatı — genel fallback (₺)" olarak değiştirildi (artık canonical değil)
- Footer notu: "Platform bazlı gerçek fiyatlar XML beslemesinden gelir; fallback yalnızca XML yoksa devreye girer"
- Override bölümü başlığı "Tier 1" eki + 4-katmanlı çözümleme açıklaması (ürün → platform → sistem) ile güncellendi
- Tüm 4 override field placeholder'ı netleştirildi
- tsc clean, Vercel READY (dpl_AofZouL4KKtPLPsejAsWXV5ZWR7Q), browser-verified 2026-05-17 ✓

### ✓ Priority 1 — Marketplace Data Reliability Closure (Phase 29, 2026-05-17)

Delivered:
- TrendyolReturnRecord model + migration (applied to production)
- syncTrendyolReturnsAction: 365-day sweep, barcode/SKU matching, upsert dedup
- /orders page: 5-tab local order ledger (Tümü/Teslim/İptal/İadeler/Eşleşmemiş), newest-first, 1.105 order lines, pagination, matched product links
- Unmatched inbox with amber hint + link to /admin/marketplace-mappings
- Siparişler sidebar link (EXECUTIVE_READ)
- Browser-verified 2026-05-17 ✓

Remaining open items (not required for Priority 1 completion):
- Historical backfill when a new mapping is approved (retroactively update TrendyolSalesRecord.productId)
- This is low-priority; the matching inbox + manual mapping page covers the workflow

### ✓ Priority 2 — Marketplace Margin Policy Normalization (Phase 30, 2026-05-17)

Delivered:
- MarketplacePlatformPolicy model + migration (applied to production)
- Per-platform: standard shipping (TRY), commission %, payment fee %, return reserve %, VAT %
- upsertPlatformPolicyAction: MARKETPLACE_POLICIES_MANAGE gated, upsert per platform
- /admin/marketplace-policies: all 8 platforms, inline save per card, Yapılandırıldı/Varsayılan badge
- Resolution order explanation card in admin UI
- lib/marketplace-policy.ts: resolveMarginPolicy() — product override > product value > platform standard > system default
- policySourceLabel/policySourceColor: Turkish labels and badge colors per source
- /marketplace/profit rewritten: uses resolveMarginPolicy(), winners/losers tables show Kargo + Komisyon columns with PolicyBadge source labels
- Policy coverage notice on profit page when no platforms configured
- MARKETPLACE_POLICIES_MANAGE permission + sidebar link added
- Browser-verified 2026-05-17 ✓

### ✓ Priority 3 — Import Economics Normalization (Phase 31, 2026-05-17)

Delivered:
- SEA_FREIGHT_PER_KG corrected: 2 → 1 USD/kg (workbook-correct value)
- MonthlyExchangeRate: rmbUsdRate Decimal(12,4) optional column added
- Product: sourceCostRmb Decimal(15,2) + importPaymentFeePct Decimal(5,2) optional columns added
- Migration: 20260517150000_phase31_import_economics_rmb applied to production
- RMB-first canonical formula: `(sourceCostRmb / rmbUsdRate) * (1 + paymentFeePct/100) + freight * weightKg) * (1 + customsRatePct/100)`
  falls back to sourcePriceUsd when RMB fields absent
- Exchange rate form: RMB/USD input field (5-column grid)
- Exchange rates page: RMB/USD column in table, updated heading and help text
- Exchange rate actions: rmbUsdRate in upsert schema; getLatestRmbUsdRate() utility
- Product form: amber "RMB kaynaklı ithalat" section with sourceCostRmb + importPaymentFeePct + formula hint
- product-actions: maps new fields to DB
- import-decisions cockpit: fetches + passes RMB fields to calculateImportDecision
- product detail page: RMB fields wired to calculateImportDecision
- Browser-verified 2026-05-17 ✓

Remaining (not blocking Priority 4):
- shared landed-cost truth not yet propagated to procurement/capital/executive views (deferred to Priority 4)
- route/profile freight override hierarchy (deferred)

### ✓ Priority 4 — Holding-Grade Import Governance (Phase 32, 2026-05-17)

Delivered:
- Supplier model: defaultAirFreightUsdPerKg, defaultSeaFreightUsdPerKg, defaultPaymentFeePct optional Decimal fields
- ImportDecisionSnapshot model: freezes all decision inputs + computed outputs at approval time
- Migration: 20260517160000_phase32_import_governance applied to production
- Three-tier freight resolution: product-level override → supplier default → global constant (AIR=8, SEA=1 USD/kg)
- effectiveFreightPerKg() exported helper from lib/import-decision.ts
- createImportDecisionSnapshotAction: EXECUTIVE_READ-gated, resolves all inputs, calls calculateImportDecision, saves full snapshot
- getProductImportSnapshotsAction: last 10 snapshots with createdBy + supplier names
- ImportSnapshotButton client component (emerald, useTransition, "Kararı Kaydet")
- Import Decisions cockpit: new "Kaydet" column with snapshot button per row
- Product detail page: "Kararı Kaydet" button in İthalat Kararı card header + "Karar Geçmişi" history table
- Supplier form/list: import defaults section (air freight, sea freight, payment fee)
- Browser-verified 2026-05-17 ✓

### ✓ Priority 21 — XML Stok Değişim Logu (Phase 49, 2026-05-17)

Delivered:
- `XmlStockChangeLog` model: productId, syncLogId, sourceId, previousQty, newQty, delta, syncedAt
- Migration: `20260517490000_phase49_xml_stock_change_log` applied to production
- `runSync` updated: fetches `stockQuantity` for existing products; compares previousQty vs newQty; batch-inserts `XmlStockChangeLog` for products whose stock actually changed (MANUAL-source and no-change products excluded)
- Sync result message reports count of changed products
- `/admin/xml-sync`: "Son Senkronizasyon Değişimleri" section — groups latest 100 changes by syncLogId, shows product links, ↑ emerald / ↓ red delta badges, empty state for no-change syncs
- Browser-verified 2026-05-17 ✓

### ✓ Priority 24 — USD Kademeli Kargo + Cockpit Politika Düzeltmeleri (Phase 51, 2026-05-17)

Neden:
Phase 50 cockpit'i Trendyol gerçek verisiyle çalışır hale getirdi ama komisyon ve kargo için hardcoded `0` bıraktı — bu tüm marj hesaplamalarını yanlış yapıyordu. Ayrıca Trendyol kargo maliyeti tek sabit değil, ürün fiyatına göre kademeli (düşük fiyatlı ürünlerde az kargo, yüksekte daha fazla). XML'den çekilen Trendyol fiyatları da cockpit'e bağlı değildi; eşleşmemiş ürünler için değerli bir kaynak olarak kullanılabilirdi.

Delivered:
- `MarketplacePlatformPolicy.shippingTiersJson String?` — JSON kargo kademesi sütunu (additive, `db push` ile uygulandı)
- `lib/marketplace-policy.ts`: `ShippingTier` tipi, `parseShippingTiers()`, `resolveTieredShipping()` yardımcıları
- `resolveMarginPolicy()` — yeni `context: { sellingPriceUsd?, usdTryRate? }` parametresi; ürün değeri sonrası USD kademeli kargo deneniyor, ardından platform sabit kargo, ardından sistem varsayılanı
- `DEFAULT_TRENDYOL_TIERS` sabiti: `<$5 → $1.2`, `$5–$7.5 → $2.0`, `>$7.5 → $3.3` (USD)
- `marketplace-policy-actions.ts`: `shippingTiersJson` upsert + server-side JSON doğrulaması (son kademe catch-all zorunluluğu)
- `platform-policy-form.tsx`: kademeli kargo tablosu UI (satır ekle/kaldır, son satır sonsuz), "Trendyol Varsayılanlarını Yükle" butonu
- `marketplace-policies/page.tsx`: `shippingTiersJson` forma iletiliyor
- `import-cockpit/page.tsx`:
  - Trendyol `MarketplacePlatformPolicy` paralel çekiliyor
  - `xmlData.xmlTrendyolPrice` ürün seçimine eklendi
  - Fiyat önceliği: Trendyol gerçekleşen → XML Trendyol → Manuel
  - Komisyon ve kargo: `resolveMarginPolicy()` ile çözümleniyor (artık `0` fallback yok)
  - "XML Fiyat" badge (mavi) kaynak etiketleri arasına eklendi
  - Formül açıklama kartı güncellendi
- tsc clean, Vercel READY (dpl_86pYyepfQR5grZuaDzaerAfqnHQz), browser-verified 2026-05-17 ✓

### ✓ Priority 22 — İthalat Karar Cockpiti v2 (Phase 50, 2026-05-17)

Delivered:
- `/admin/import-cockpit`: new page, no schema change
- Trendyol 90-day avg sale price (Delivered only) via `groupBy` on TrendyolSalesRecord
- Trendyol 30-day velocity via `groupBy` on TrendyolSalesRecord
- Return rate: TrendyolReturnRecord count / (sales90d + returns) per product
- Import landed cost (TRY) via existing `calculateImportDecision` engine × exchange rate
- Net profit/unit (TRY) = netRevenueTry − landedCostTry
- Margin % = netProfitTry / resolvedPriceTry × 100
- Effective monthly units = 30d velocity × (1 − returnRate); falls back to manual estimates
- Monthly profit estimate = netProfitTry × effectiveMonthlyUnits
- Signal: AL (marj ≥ %25) / BEKLE (marj ≥ %15) / ALMA / Veri Eksik
- Unmatched warning banner: N products with no Trendyol data → link to marketplace mappings
- Price source badge: Trendyol (orange) / Manuel (slate) / Fiyat yok (red)
- Tab bar: Tümü | AL | BEKLE | ALMA | Veri Eksik with counts
- "v1 Görünüm →" link to existing /admin/import-decisions
- Sidebar: "İthalat Cockpiti v2" added; v1 renamed "İthalat Kararları v1"
- tsc clean, Vercel READY (dpl_71WA3rEYVH6XPiQaeEdBgC3vHsSt), browser-verified 2026-05-17 ✓

### ✓ Priority 23 — Gereksiz Sayfaların Temizlenmesi (2026-05-17)

Delivered:
- Sidebar: "Trendyol Stok Senkronu" linki kaldırıldı
- `/admin/trendyol-stock-sync`: push sayfası devre dışı bırakıldı — amber uyarı kartıyla kilitleniyor
- `pushTrendyolStockAction()`: hemen hata döndürüyor (DB/API çağrısı yok)
- `/orders`: TrendyolStockDeductionButton ve getPendingDeductionCount kaldırıldı
- Schema değişikliği yok; TrendyolSalesRecord.stockDeducted korundu
- tsc clean, build ✓, browser-verified 2026-05-17 ✓

### ✓ Priority 20 — Trendyol Daily Sync Cron (Phase 48, 2026-05-17)

Delivered:
- `app/api/cron/trendyol-sync/route.ts`: Vercel cron, daily 06:00 UTC, CRON_SECRET Bearer auth
- 14-day sliding window covers recent orders + status changes without hitting Vercel 5-min limit
- `syncOrders`: paginated TrendyolSalesRecord upsert (barcode/SKU match, discountedPrice fallback)
- `syncReturns`: paginated TrendyolReturnRecord upsert (claimItemStatus, reason code/name)
- Parallel execution via `Promise.allSettled` — one side failing doesn't block the other
- `vercel.json` updated with `0 6 * * *` cron schedule for trendyol-sync
- No schema change
- Deployment READY, tsc clean; cron endpoint verified (deployment live + tsc pass) ✓

### ✓ Priority 19 — Operational Intelligence Dashboard (Phase 47, 2026-05-17)

Delivered:
- `getOperationalAlerts()` in dashboard-service: criticalStockCount / pendingDeductionCount / unmatchedOrdersCount / recentOrderQty7d / trendyolRevenue30d (all DB-only, no live API calls)
- `/dashboard` "Trendyol & Stok" section with 5 clickable stat tiles deep-linking into operational pages
- `LinkedStatCard` component: Card + Link wrapper with hover shadow
- Dashboard hero badge updated to "Faz 47"
- No schema change
- Browser-verified 2026-05-17: section renders, 5 tiles with correct links, Faz 47 badge ✓

### ✓ Priority 18 — Trendyol Catalog View (Phase 46, 2026-05-17)

Delivered:
- `fetchTrendyolCatalog()` in trendyol-api.ts: GET products endpoint, page/size/approved params, TrendyolCatalogProduct + TrendyolCatalogResponse types
- `/admin/trendyol-catalog` server page: fetches up to 4 pages (200 products), cross-refs with internal Product.barcode + MarketplaceProductMapping barcodes/SKUs
- KPI cards: Trendyol'da / Aşım Riski / Senkron / Eşleşmemiş
- Matched table: delta badge (red=oversell risk, amber=internal surplus, green=in sync), sorted by |delta| desc
- Unmatched table: "Eşleştir →" deep-link pre-filling marketplace-mappings form
- Oversell risk warning banner + surplus stock push suggestion banner
- Graceful error display for API failures
- "Trendyol Katalog" nav link added (EXECUTIVE_READ)
- Browser-verified 2026-05-17: 200/6176 ürün, 12 eşleşmiş, 188 eşleşmemiş, oversell uyarısı gösteriliyor ✓

### ✓ Priority 17 — Trendyol Stock Sync (Phase 45, 2026-05-17)

Delivered:
- `updateTrendyolInventory()` in trendyol-api.ts: PUT price-and-inventory endpoint, PRODUCT_BASE_URL, batches of 100
- `getTrendyolStockPushPreviewAction()`: read-only preview — all TRENDYOL mappings with platformBarcode + sellingPriceTry joined with product data
- `pushTrendyolStockAction()`: EXECUTIVE_READ gated, groups into batches of 100, returns batchIds array
- `TrendyolStockPushButton`: client component with transition states + batchId display
- `/admin/trendyol-stock-sync`: preview page, KPI cards, push action card, product table
- "Trendyol Stok Senkronu" nav link added
- Browser-verified 2026-05-17: 2 matched products, push button renders, KPI cards show correctly ✓

### ✓ Priority 16 — Stock Health Dashboard (Phase 44, 2026-05-17)

Delivered:
- `/admin/stock-health` (EXECUTIVE_READ gated), no schema change
- Parallel fetch: all products (id/name/sku/stockQuantity), 30-day TrendyolSalesRecord, last 15 StockAdjustmentLog
- Three-tier product classification: Critical (qty ≤ 0), Low (coverage < 30 days), Healthy
- Coverage formula: `Math.floor(stockQuantity / (sales30d / 30))`, cancelled orders filtered
- KPI cards: Kritik (red), Düşük (amber), Sağlıklı (emerald)
- Critical table: product link, SKU, qty (red bold), 30d Trendyol sales
- Low table sorted by coverage ascending: product link, SKU, qty, 30d sales, coverage badge (≤7g red / ≤14g amber / <30g yellow)
- Recent adjustments table: product link, ADJ_LABEL type badge (ADJ_COLOR), ±delta, newQty, notes, Turkish date
- "Stok Sağlığı" sidebar link added (EXECUTIVE_READ)
- Browser-verified 2026-05-17: KPI cards render (606 Kritik), nav link active, recent adjustments table ✓

### ✓ Priority 15 — Trendyol Stock Auto-Deduction (Phase 43, 2026-05-17)

Delivered:
- TrendyolSalesRecord.stockDeducted Boolean flag + migration applied to production
- getPendingDeductionCount(): fast count of unprocessed matched non-cancelled lines
- applyTrendyolStockDeductionAction(): PRODUCTS_UPDATE gated, groups by productId, Prisma $transaction per product (stockQuantity update + StockAdjustmentLog SALE + mark deducted=true)
- TrendyolStockDeductionButton: amber pending badge, "Stoktan Düş" button, success message + auto-reload
- Orders page: amber card shows when pending > 0, hidden after processing
- Browser-verified 2026-05-17: 183 order lines → 21 products deducted atomically, 21 StockAdjustmentLog SALE entries ✓

### ✓ Priority 14 — Stock Adjustment Log (Phase 42, 2026-05-17)

Delivered:
- StockAdjustmentType enum (RESTOCK/CORRECTION/DAMAGE/RETURN/SALE/OTHER) + StockAdjustmentLog model
- Migration: 20260517420000_phase42_stock_adjustment_log applied to production
- createStockAdjustmentAction: PRODUCTS_UPDATE gated, Prisma $transaction (atomic stockQuantity update + log write), negative stock prevention
- getProductStockAdjustments: last 20 entries, createdBy name
- StockAdjustmentCard client component: type select, ±direction toggle, qty input, notes; history table with colored badges, ±delta, prev/next qty, timestamp
- Optimistic UI: row prepends immediately on success, "Güncel: N adet" badge updates
- Product detail page: StockAdjustmentCard at bottom, parallel-fetched
- Browser-verified 2026-05-17: form → save → row appears (100→105), success message ✓

### ✓ Priority 13 — Bulk Mapping Backfill Engine (Phase 41, 2026-05-17)

Delivered:
- bulkBackfillAllMappingsAction(): iterates all MarketplaceProductMapping entries, runs backfill for each, returns aggregate sales+returns count
- backfillMappingProductId() now returns { sales, returns } counts
- Per-mapping create/update now surfaces backfill count in success message
- BulkBackfillButton client component: "Tüm Eşleştirmeleri Uygula" with count display + auto-reload
- MappingForm: shows dynamic success message from server action
- No schema change — writes TrendyolSalesRecord + TrendyolReturnRecord productId
- Browser-verified 2026-05-17: button renders in header, page loads correctly ✓

### ✓ Priority 12 — Capital Allocation + Real Sales Velocity (Phase 40, 2026-05-17)

Delivered:
- /admin/capital investment scores now driven by actual 30-day Trendyol sales velocity when available
- Fetches TrendyolSalesRecord (last 30 days, non-cancelled, matched) in parallel with CapitalConfig + products
- actualSales30d Map<productId, qty> built using isCancelledStatus() filter
- effectiveOnlinePotential: actualQty overrides manual onlineSalesPotential when present
- velocitySource tracked per product: "actual" / "estimated"
- New "Hız" column in suggestions table: Gerçek (emerald) / Tahmin (slate) badge
- "Gerçek Satış Verisi Aktif" emerald banner with explanation text
- Header notice: "N üründe gerçek Trendyol satış hızı kullanılıyor."
- No schema change — reads existing Phase 26 TrendyolSalesRecord table
- Browser-verified 2026-05-17: 6 üründe gerçek hız, Gerçek Satış Verisi Aktif banner, Hız column, all summary cards and tfoot intact ✓

### ✓ Priority 11 — Procurement Intelligence + Real Sales Velocity (Phase 39, 2026-05-17)

Delivered:
- /admin/procurement: 30-day TrendyolSalesRecord actual sales qty now drives demand calculation when available
- velocitySource per row: "actual" (Trendyol data) / "estimated" (manual) / "none"
- Gerçek/Tahmin/Veri Yok badge column (Hız Kaynağı) + T30G Satış column
- Gerçek Satış Verisi Aktif emerald banner when actual data present
- No schema change — reads existing Phase 26 TrendyolSalesRecord table
- Browser-verified 2026-05-17: 6 üründe gerçek Trendyol hızı, 645 manuel/yok, aciliyet listesi + kolonlar render ✓

### ✓ Priority 10 — Return Rate Analysis (Phase 38, 2026-05-17)

Delivered:
- /marketplace/return-analysis: per-product return rate from TrendyolReturnRecord vs TrendyolSalesRecord
- returnRate = claimCount / soldQty × 100 (null when soldQty = 0 — "Satış kaydı yok")
- Sections: Yüksek İade Riski (≥%5, red border), Düşük İade Oranı (<5%), Satış Verisi Eksik
- Summary KPI cards: Eşleşen İade Talebi, İadesi Olan Ürün, Yüksek İade Riski count, Eşleşmemiş İade Talebi
- Top 10 return reasons table with count + % of all matched returns
- Back-links to Gerçekleşen Marj and İade Merkezi
- "İade Analizi" sidebar nav entry (MARKETPLACE_RETURNS_READ)
- No schema change — reads existing Phase 26 + Phase 29 tables
- Browser-verified 2026-05-17: page renders cleanly, KPI cards visible, İade Analizi sidebar nav active, empty state correct (return records not yet synced to products) ✓

### ✓ Priority 9 — Unmatched Barcodes Inbox on Mapping Page (Phase 37, 2026-05-17)

Delivered:
- /admin/marketplace-mappings: new "Eşleşmemiş Barkodlar" inbox card (above add form)
- Queries TrendyolSalesRecord where productId IS NULL, groups by barcode in memory (no schema change)
- Shows top 30 unmatched barcodes by total revenue; header shows total count (112) + total missing ciro (₺852K)
- Table: platform barcode, Trendyol product name, merchantSku, record count, total revenue
- "Eşleştir →" amber button navigates to ?barcode=XXX&title=YYY#add-form
- URL search params pre-fill MappingForm.defaultBarcode + defaultPlatformTitle props
- Active row highlighted with amber ring when barcode matches current param
- MappingForm updated: defaultBarcode + defaultPlatformTitle optional props (useState init)
- Browser-verified 2026-05-17: 112 barkod, ₺852.073 missing ciro, top 30 table renders ✓

### ✓ Priority 8 — Executive Dashboard Marketplace Revenue Integration (Phase 36, 2026-05-17)

Delivered:
- /admin/executive updated: new "Trendyol / Son 90 Gün — Gerçekleşen Satış Özeti" card
- Fetches 90-day TrendyolSalesRecord (no schema change, existing table)
- isCancelledStatus() filter (iptal/cancel case-insensitive) applied in memory
- KPI tiles: Toplam Ciro (₺506.874), Eşleşen Ürün Çeşidi (14), Eşleşmemiş Kayıt (535)
- Top 5 products by 90-day revenue table (matched records only)
- Empty state when no data — prompts sync from Satış Performansı
- "Gerçekleşen Marj →" link in card header + footer
- Browser-verified 2026-05-17 ✓

### ✓ Priority 7 — Realized Margin Analysis (Phase 35, 2026-05-17)

Delivered:
- /marketplace/realized-margin: compares actual Trendyol order margins vs expected (last 90 days)
- Aggregates TrendyolSalesRecord per product (non-cancelled), avgRealizedPriceTry, total qty + revenue
- calcMarketplacePricingRow() fed actual realized price as manual override → realistic commission/shipping deductions
- realizedMarginPct = (avgRealizedPrice − commission − shipping − paymentFee − returnReserve − unitCost) / avgRealizedPrice × 100
- deltaPct = realizedMarginPct − expectedMarginPct (negative = worse than expected)
- Sections: Zarar Eden / Beklenenden Düşük Marj (delta < −5%) / Kârlı Satışlar / Maliyet Verisi Eksik
- Summary cards: Satılan Ürün Çeşidi, Toplam Ciro (90G), Ort. Gerçekleşen Marj, Beklenenden Kötü count
- Hesaplama Notu footer: formula transparency
- Trendyol platform policy applied; usdTryRate from MonthlyExchangeRate
- EXECUTIVE_READ permission gated; "Gerçekleşen Marj" sidebar link added
- Browser-verified 2026-05-17: ₺117.222,79 ciro, %32.5 avg margin, sections all render ✓

### ✓ Priority 6 — Marketplace Profit Page XML Price Integration (Phase 34, 2026-05-17)

Delivered:
- /marketplace/profit updated to use calcMarketplacePricingRow() per listing
- Per-platform XML price fields: xmlTrendyolPrice/xmlHbPrice/xmlAmazonPrice/xmlPazaramaPrice/xmlIdefixPrice
- Effective price resolution: manual override > XML price > none (consistent with product detail card)
- PriceBadge (Manuel/XML/Veri yok) shown alongside price in winners/losers tables
- PolicyBadge extended to handle "price_tier" shipping source
- usdTryRate fetched from latest MonthlyExchangeRate
- PLATFORM_XML_FIELD map for clean platform → XML field routing
- Browser-verified 2026-05-17 ✓

### ✓ Priority 5 — Marketplace Pricing Normalization (Phase 33, 2026-05-17)

Delivered:
- lib/marketplace-pricing.ts: canonical per-marketplace pricing engine (pure computation, no DB)
- calcMarketplacePricingRow(): resolves effectivePriceTry, shippingTry, commissionTry, paymentFeeTry, returnReserveTry, netRevenueTry, netMarginPct
- calcShippingFromPriceTiers(): roadmap price tiers (<5 USD→1.2, 5–7.5→2.0, >7.5→3.3 USD × usdTryRate)
- Price resolution: manual override (marketplacePriceTry) > XML price > none
- Shipping resolution: product/platform policy override > price-tier default
- priceSourceLabel/priceSourceColor, shippingSourceLabel helpers
- Product detail page: "Pazar Yeri Fiyatlandırması" card — 5 platforms (Trendyol/Hepsiburada/Amazon/Pazarama/Idefix)
- Per-row: XML Fiyat | Etkin Fiyat | Kaynak badge | Kargo ₺ + source badge | Komisyon % + source badge | Net Kalan ₺ (color-coded) | Net Marj %
- Footer: shipping tier reference at current USD/TRY rate
- Fetches MarketplacePlatformPolicy from DB for override resolution
- Browser-verified 2026-05-17: Manuel source badge, Fiyat Dilimi shipping, Sistem Varsayılanı commission, net remaining + margin all render ✓

### ✓ Phase 25: Product Operations UX — DONE (2026-05-17)

Delivered:
- thumbnail column 48×48 with lazy loading and 📦 fallback
- live search debounced 300ms, fires at ≥2 chars, no submit button, case-insensitive on SKU/name/brand/model/barcode
- compact filter pills: Durum (Tümü/Aktif/Pasif) + Stok (Tümü/Stokta var/Düşük stok)
- sort dropdown: son güncellenen, stok ↓↑, fiyat ↓↑, marj ↓, isim A–Z
- health cues per row: Düşük stok, Görsel yok, Maliyet yok, Fiyat yok, XML bayat
- product count shown, "Filtreyi temizle" when filters active
- browser-verified 2026-05-17: 651 ürün, all features confirmed ✓

### ✓ DONE - Phase 26: Product Performance Ranking
Delivered 2026-05-17:
- TrendyolSalesRecord model + migration (orderId/lineId unique, FK to Product SET NULL)
- syncTrendyolSalesAction: 4×90-day windows, barcode/SKU matching, upsert dedup, page-0 error surfacing
- /admin/product-performance: sync card, top-20 tables (30d qty, 30d revenue, all-time revenue), 3 signal cards
- Per-product KPI card on /products/[id]: 4 tiles + color-coded realized margin badge
- Cancelled order filtering (isCancelled helper)
- Browser-verified ✓

### ✓ DONE - Phase 27: Product Media and Content Studio
Delivered 2026-05-17:
- ProductImageManager: multi-image grid, URL-add (Enter clears input), delete, set-primary (sortOrder 0)
- RichTextEditor (Tiptap): H2/H3, Bold, Italic, Bullet/Ordered lists, SSR-safe, HTML output
- XML description governance: XML source card with "Editöre taşı" opt-in button; XML sync never overwrites existing description
- Supabase Storage upload action (REST API, no SDK) — ready when SUPABASE_URL/KEY env vars are added
- Browser-verified: URL add → DB persist → reload confirmed ✓

### ✓ DONE - Phase 29: Order Ledger and Return Claims Sync
Delivered 2026-05-17:
- TrendyolReturnRecord model + migration (claimId+orderLineId unique, nullable productId FK)
- syncTrendyolReturnsAction: 365-day sweep, barcode/SKU product matching, upsert TrendyolReturnRecord
- OrdersSyncButton: combined client component triggering both orders + returns sync in parallel
- /orders page: 5-tab local order ledger — Tümü(1.105)/Teslim(952)/İptal/İadeler/Eşleşmemiş(1.032)
- Newest-first sort, 100-row pages, matched product links, unmatched amber badges
- Unmatched tab: amber hint + link to /admin/marketplace-mappings
- Siparişler sidebar link (EXECUTIVE_READ)
- Browser-verified ✓

### ✓ DONE - Phase 28: Product Governance and Private Intelligence
Delivered 2026-05-17:
- Product.privateNote (TEXT, nullable) — safe additive migration applied to production
- updatePrivateNoteAction: EXECUTIVE_READ + PRODUCTS_UPDATE gated; separate from main form so non-owners cannot overwrite it
- PrivateNoteEditor: amber-accented standalone client component with char counter, save feedback, "🔒 Sadece sahip görebilir" badge
- Product edit page: EXECUTIVE_READ check → canViewPrivate → amber card renders only for owners
- Product detail page: "Tedarikçi Kaynağı" supplier summary card (★ Tercihli, cost/lead/MOQ); "🔒 Özel Not" read-only card gated by EXECUTIVE_READ
- description validation max raised 2000 → 10000 for Tiptap HTML
- normalizeProductData explicitly omits privateNote — XML sync cannot overwrite owner intelligence
- Browser-verified ✓

---

## Blockers

Phase dependencies:

- Marketplace Data Reliability Closure depends on stable Trendyol pagination, durable persistence, and trustworthy order/return identifiers.
- Marketplace Margin Policy Normalization depends on trusted order data plus a clear effective shipping/commission rule.
- Import Economics Normalization depends on a canonical formula, RMB/USD rate support, and shared finance ownership across modules.
- Holding-Grade Import Governance depends on Import Economics Normalization first.
- Marketplace Pricing Normalization depends on both Marketplace Margin Policy Normalization and Import Economics Normalization.
- Phase 25 depends on stable product list/query performance and trusted primary-image behavior.
- Phase 26 depends on a sales snapshot / aggregation layer; product ranking should not fake 30-day revenue logic from incomplete data.
- Phase 27 depends on a safe media/storage strategy and an editor choice that does not break current product forms.
- Phase 28 depends on Phase 5 RBAC foundations plus clear XML field-governance rules.
- Phase 17 remains deferred even if product UX improves; write-side marketplace control still requires separate architecture review.

---

## Role-Based UX Priority Stack (2026-05-17)

Analiz tamamlandı. Aşağıdaki sıra dependency-first execution planına göre sıralanmıştır.

---

### ✓ DONE - Priority 57 — Ürün Formu Rol Görünürlüğü (Phase 57)
Teslim edildi 2026-05-17:
- `showFinancialFields` prop ProductForm'a eklendi (varsayılan true — admin backward-compat)
- EXECUTIVE_READ olmayan kullanıcılar için 4 section render edilmez: "Fiyatlandırma ve kârlılık", "Pazar yeri maliyet geçersiz kılmaları", "Satış potansiyeli", "İthalat kararı girdileri"
- `updateProductAction`: EXECUTIVE_READ kontrolü → `normalizeProductDataNonFinancial()` — finansal field'lar Prisma update'e dahil edilmez
- edit/page.tsx ve new/page.tsx: `checkPermission(EXECUTIVE_READ)` → `showFinancialFields` → ProductForm
- Tamper koruması: sunucu tarafı zorunluluk, UI gizleme ikincil güvence
- Vercel READY: dpl_3ge5Xx4gFjBy6fnUQVAUjMYjCb17, browser-verified 2026-05-17

---

### ✓ DONE — Priority 55 — Warehouse Mode + WAREHOUSE Rolü (Phase 55, 2026-05-17)

Teslim edildi:
- `UserRole` enum'a `WAREHOUSE` eklendi; `prisma db push` production'a uygulandı
- Seed: WAREHOUSE rolü 9 izinle (inventory.read, inventory.write, inventory.count, products.read, categories.read, attributes.read, tasks.read, tasks.update, search.read)
- `lib/actions/inventory-count-actions.ts`: `createInventoryCountAction` — mutlak adet → delta → `StockAdjustmentLog.CORRECTION`; `INVENTORY_COUNT` izni zorunlu
- `/warehouse`: barkod/SKU/ad araması (min 2 karakter), ürün kartları (stok renk kodlu, maliyet YOK)
- `/warehouse/count`: URL params'tan productId/productName/sku, büyük sayı inputu, başarı → 1.8s sonra /warehouse
- `WarehouseWorkspace`: `OperationsDashboardData` yeniden kullanır, Depo badge, stok+görev KPIs, hızlı aksiyon kartları
- `/dashboard` Faz E: `user.role === "WAREHOUSE"` → WarehouseWorkspace
- Sidebar: `/warehouse` (INVENTORY_READ) + `/warehouse/count` (INVENTORY_COUNT)
- Form→save→redirect round-trip verified ✓
- Vercel READY: dpl_FZUREkAgckL52vByKEobiDVMJFc8, browser-verified 2026-05-17

---

### Priority 54 — Rol Bazlı Dashboard (Phase 54)

**Neden:**
/dashboard şu an tüm roller için aynı içeriği gösteriyor. SALES için ithalat kartları anlamsız, WAREHOUSE için sipariş analizi anlamsız.

**Bağımlılık:** Priority 55 (WAREHOUSE rolü var olmalı)

**Mimari karar:** Tek URL `/dashboard` — rol-branch server-side rendering. Ayrı URL yok, redirect flash yok, client-side check yok.

**Kabul kriteri:**
SALES kullanıcısı dashboard'ı açtığında ithalat / sermaye / kâr kartı görmez; kendi pipeline'ını görür.

#### ✓ Faz A — Temel Refactor (schema değişikliği YOK) — DONE 2026-05-17

**Ne yapılacak:**
- `StatCard` ve `LinkedStatCard` inline tanımından → `app/(app)/dashboard/_components/shared/stat-card.tsx` dosyasına taşı
- `AdminWorkspace` wrapper component oluştur: `app/(app)/dashboard/_components/admin-workspace.tsx`
- `page.tsx` rol router'a dönüştür (~40 satır): `currentUser.role` switch → workspace component
- Service katmanı dokunulmaz

**Dosya yapısı:**
```
app/(app)/dashboard/
  page.tsx                          ← rol router, ~40 satır
  _components/
    admin-workspace.tsx             ← mevcut dashboard içeriği
    operations-workspace.tsx        ← (Faz C'de doldurulur)
    sales-workspace.tsx             ← (Faz B'de doldurulur)
    warehouse-workspace.tsx         ← (Faz E'de doldurulur — schema gerekir)
    marketplace-workspace.tsx       ← (Faz F'de doldurulur)
    shared/
      stat-card.tsx
      linked-stat-card.tsx
      task-list.tsx
      stock-alert-banner.tsx
      quick-actions.tsx
```

**Kabul kriteri (Faz A):** `tsc --noEmit` geçer, mevcut admin görünümü değişmez, rol router çalışır. ✓ Vercel READY dpl_J8uZkPdGjr7pspwHGH1UeUxgeKxv, browser-verified 2026-05-17

#### ✓ Faz B — Sales Workspace (schema değişikliği YOK) — DONE 2026-05-17

**Ne yapılacak:**
- `services/dashboard-service.ts` → `getSalesPipelineData(userId)` fonksiyonu ekle
  - Sorgu: aktif ProductInterest sayısı, bugün takip edilecekler (sadece `assignedToId = userId`), son 7 günde açılan müşteriler
  - **HİÇBİR finansal alan döndürme:** trendyolRevenue, cost, margin → yok
- `SalesWorkspace` component: Pipeline özeti, takip listesi, müşteri aktivitesi
- Güvenlik kuralı: getSalesPipelineData() hiçbir zaman maliyet verisi döndürmez — render'da gizlemek yetmez, sorguda olmamalı

**Kabul kriteri (Faz B):** SALES rolü dashboard'ı açtığında: trendyol revenue, ithalat, sermaye kartı DOM'da bulunmaz; kendi pipeline'ı görünür. ✓ Vercel READY dpl_AiLn79jzds4B1oJauke3LuM4jQB9

#### ✓ Faz C — Operations Workspace (schema değişikliği YOK) — DONE 2026-05-17

**Ne yapılacak:**
- `getOperationsDashboardData()` servis fonksiyonu: açık görev sayısı, kritik stok uyarıları, bugün geciken görevler, bekleyen eşleşmemiş siparişler
- `OperationsWorkspace` component: görev özeti, stok uyarıları, ekip görev listesi (atanmış kullanıcıya göre gruplu)
- **Finansal veri yok:** trendyolRevenue, cost → operasyon datasında yer almaz

**Kabul kriteri (Faz C):** OPERATIONS rolü: stok uyarılarını ve açık görevleri görür, maliyet/kâr kartı görmez. ✓ Vercel READY dpl_ESQS1sQTWPXrs4iCPhUeEG7QtpCY

#### ✓ Faz D — Admin Enhancement (schema değişikliği YOK) — DONE 2026-05-17

**Ne yapılacak:**
- Admin workspace'e ek import intelligence sinyalleri ekle (RMB kuru, son ithalat kararı, bekleyen procurement önerileri)
- Ekip performans kartları: SALES pipeline velocity, OPERATIONS görev tamamlama oranı
- Mevcut tiles korunur

**Kabul kriteri (Faz D):** Admin dashboard mevcut içeriğini kaybetmez, ek import/ekip kartları eklenir. ✓ Vercel READY dpl_8Vm7CYfK9aWkN9KA6L9xXusiqbFw

#### ✓ Faz E — Warehouse Workspace — DONE 2026-05-17

`OperationsDashboardData` yeniden kullanıldı (DRY); `WarehouseWorkspace` bileşeni oluşturuldu; `user.role === "WAREHOUSE"` → `WarehouseWorkspace` dalı eklendi. WAREHOUSE rolü: stok uyarıları + görev KPIs + hızlı aksiyon kartları, finansal alan DOM'da yok. ✓ Vercel READY dpl_FZUREkAgckL52vByKEobiDVMJFc8

#### ✓ Faz F — Marketplace Workspace — DONE 2026-05-17

`getMarketplaceDashboardData()` oluşturuldu: aktif listeler (`status=ACTIVE`), eşleşmemiş sipariş uyarısı, son 7 gün iade sayısı, son 7 gün non-cancelled sipariş adedi, açık görev. `MarketplaceWorkspace` bileşeni: "Pazar Yeri" badge başlığı, 5 KPI tile (aktif listeleme, 7d sipariş, eşleşmemiş [warning tone], 7d iade [warning tone], açık görev), 4 hızlı aksiyon kartı (Müşteri Soruları, İade Merkezi, Trendyol Paneli, Ürün Eşleştirme). `user.role === "MARKETPLACE_OPERATOR"` → `MarketplaceWorkspace` dalı eklendi. Finansal alan DOM'da yok. ✓ Vercel READY dpl_6j2QbVahxSmYdVz6FUDwqkWYSHXX

---

### ✓ DONE — Priority 56 — Satış Fırsat Motoru (Phase 56, 2026-05-17)

**Neden:**
Yeni ürün ithalat edildiğinde satış temsilcisi "bunu kime satarım?" sorusunu sisteme soramıyor. Veri modeli hazır (ProductInterest, CategoryInterest, CustomerAttributeInterest) ama sunan UI yok.

**Bağımlılık:** Priority 54 (Sales dashboard), Priority 57 (ürün detay sayfası role-aware)

Tamamlananlar:
- `services/category-service.ts`: `getProductIntelligence()` `interests` select'i `stage`, `status`, `priority`, `lastContactedAt`, `followUpAt`, `assignedTo` ile zenginleştirildi
- `services/dashboard-service.ts`: `getSalesPipelineData()` — `topOpportunities` eklendi (HIGH/URGENT öncelikli, ekip geneli, atanan temsilci dahil)
- `app/(app)/dashboard/_components/sales-workspace.tsx`: `STAGE_LABELS`/`STAGE_COLORS` maps eklendi; aktif fırsatlar listesi — öncelik emoji, aşama badge, son temas tarihi; "Önerilen Fırsatlar" bölümü (top 5 HIGH/URGENT fırsat kartı)
- `app/(app)/products/[id]/page.tsx`: "Doğrudan ilgili" kartları — aşama badge (renkli), öncelik göstergesi (🔴/🟠), son temas tarihi, atanan temsilci adı
- Schema değişikliği: YOK (mevcut ProductInterest alanları kullanıldı)
- tsc --noEmit temiz ✓; READY: dpl_EnxAtoQH3aqnWqWyCXhHRaKaskrA

---

### ✓ DONE — Priority 58 — Operasyon Koordinasyon Katmanı (Phase 58, 2026-05-17)

**Neden:**
`tasks.assign` permission var ama UI yok. Operations koordinatörü ekibine görev atayamıyor, görev durumunu ekip bazında göremez.

**Bağımlılık:** Priority 54 (Operations dashboard), Priority 55 (WAREHOUSE rol mevcut — göreve atanabilir)

Tamamlananlar:
- `lib/validations/customer-crm.ts`: `customerTaskSchema` — `assignedToId?: string` eklendi
- `lib/actions/customer-crm-actions.ts`: `createCustomerTaskAction` — `tasks.assign` permission gate (başkasına atama için); `assignedToId` DB'ye kaydedilir
- `components/customers/customer-task-form.tsx`: `canAssign` ve `users` props eklendi; `canAssign=true` iken aynı satırda "Ata" dropdown gösterir (Atanmamış + aktif kullanıcılar)
- `app/(app)/customers/[id]/page.tsx`: `requirePermission` sonucu `currentUser` alındı; `checkPermission(TASKS_ASSIGN)` ile `canAssign`; `canAssign=true` ise `listUsersWithTasks()` çağrılır
- `services/task-service.ts`: `userId` filtresi `createdById` → `assignedToId` (ekip koordinasyonu için doğru filtre)
- `app/(app)/tasks/page.tsx`: Task kartları `assignedTo.name` gösterir (`→ {name}` format); filtre etiketi "Tüm atananlar"
- `services/dashboard-service.ts`: `getOperationsDashboardData()` — `teamTaskBreakdown` eklendi (açık görevler assignedToId'ye göre gruplanır, open+overdue count per kullanıcı)
- `app/(app)/dashboard/_components/operations-workspace.tsx`: "Ekip Görev Dağılımı" bölümü — her kullanıcı için açık+gecikmiş görev sayısı + `/tasks?userId=` deeplink
- Schema değişikliği: YOK (assignedToId zaten mevcut)
- Round-trip verified: görev oluştur (fatih aydın'a ata) → customer detail'de görünür → /tasks'da `→ fatih aydın` gösterir ✓
- READY: dpl_3A5DU9KfNffMJZEFUa465TdMr4kQ

---

### ✓ DONE — Priority 59 — Trendyol Satış Hızı (Phase 59, 2026-05-17)

**Neden:**
Import Decisions cockpit'te satın alma kararı verirken ürünün Trendyol'daki gerçek satış hızını görmek gerekiyordu. "Talep/ay" alanı sadece manuel girilen potansiyeli yansıtıyordu; gerçek satış geçmişi tabloda yoktu.

**Bağımlılık:** TrendyolSalesRecord (Phase 29), productId ilişkisi (Phase 29 marketplace matching), import-decisions cockpit (Phase 11C)

Tamamlananlar:
- `app/(app)/admin/import-decisions/page.tsx`:
  - 90 günlük pencere (`ninetyDaysAgo`) hesabı eklendi
  - `prisma.trendyolSalesRecord.findMany` — son 90 gün, iptal olmayanlar (`status: { not: "Cancelled" }`), `productId` eşleşenler — mevcut `Promise.all` içinde paralel
  - `velocityByProduct` map: `productId → { qty90d, monthlyVelocity }` (monthlyVelocity = Math.round(qty90d / 3))
  - İptal filtresi ikili: `status: { not: "Cancelled" }` DB-level + "cancel"/"iptal" string içeren status'lar app-level
  - "Trendyol 90g" tablo başlığı eklendi (Gerekli Sermaye — Talep/ay arasına)
  - Eşleşen ürün hücresi: emerald yeşil `{qty90d} adet` + `~{monthlyVelocity}/ay` ikili satır
  - Eşleşmeyen ürün hücresi: `—` slate-300
- Schema değişikliği: YOK
- tsc --noEmit temiz ✓
- Browser-verified: "Trendyol 90g" kolon başlığı görünür, eşleşen ürün için "2 adet / ~1/ay" gösterildi ✓
- READY: dpl_9t2yUijYB6a3946XhXFvbnAsq72y

---

### ✓ DONE — Priority 60 — Trendyol Velocity → Import Decision Input (Phase 60, 2026-05-17)

**Neden:**
Phase 59 Trendyol satış hızını yalnızca display ekledi. Gerçek Trendyol order geçmişi olan ama manual satış tahmini girilmemiş ürünler hâlâ MISSING_DATA gösteriyordu. `calculateImportDecision()` yalnızca manual tahmin alıyordu.

**Bağımlılık:** Phase 59 (velocityByProduct map zaten mevcut), Phase 11C (import engine)

Tamamlananlar:
- `app/(app)/admin/import-decisions/page.tsx`:
  - `manualMonthlyUnits` (online+wholesale+installer sum) ve `trendyolMonthly` (velocityByProduct) ayrıştırıldı
  - `effectiveMonthlyUnits = Math.max(manualMonthlyUnits, trendyolMonthly) || null`
  - `monthlyUnitsSource: "trendyol" | "manual" | "combined" | "none"` kaynağı izler
  - `calculateImportDecision()` artık `effectiveMonthlyUnits` kullanıyor
  - "Talep/ay" hücresi: kaynak badge (emerald=Trendyol / blue=İkisi de / slate=Manuel / "—"=none)
- Schema değişikliği: YOK
- tsc --noEmit temiz ✓
- Browser-verified: Trendyol emerald badge + İkisi de mavi badge görünür; ALWAYS_STOCK + BUY_SMALL kararlar aktif ✓
- READY: dpl_8zd2WpGzqG6QVdrWPhi2mvEqgR3R

---

### ⏳ PENDING DEPLOY — Priority 69 — Siparişler Sayfası Arama (Phase 69, 2026-05-17)

**Neden:**
/orders sayfasında belirli bir ürünün siparişlerini bulmak için tüm listeye göz atmak gerekiyordu. Arama çubuğu bu problemi çözüyor.

Tamamlananlar:
- `app/(app)/orders/page.tsx`: q param; searchFilter (productName/barcode/merchantSku/orderId OR); tab counts search-aware; returns tab productName filter; salesWhere AND [searchFilter, tabFilter]; tabHref q koruyor; arama formu UI
- tsc clean ✓; commit 6986a2e ✓; PENDING DEPLOY (günlük limit)

---

### ⏳ PENDING DEPLOY — Priority 68 — Ürün XML Stok Değişim Geçmişi (Phase 68, 2026-05-17)

**Neden:**
/admin/xml-sync global stok değişim logunu gösteriyordu ama ürün bazlı bakış yoktu. Ürün detay sayfasına kendi XML geçmişi eklendi.

Tamamlananlar:
- `app/(app)/products/[id]/page.tsx`: xmlStockChangeLogs Promise.all; "XML Stok Değişim Geçmişi" kartı; StockAdjustmentCard öncesi; no schema change
- tsc clean ✓; commit 24fb968 ✓; PENDING DEPLOY (günlük limit)

---

### ✓ DONE — Priority 67 — Admin Dashboard Trendyol MoM Karşılaştırma (Phase 67, 2026-05-17)

**Neden:**
Admin dashboard'ında Trendyol'un bu ayki ve geçen ayki performansı karşılaştırmalı gösterilmiyordu. Delta arrow'larla "bu ay daha iyi mi?" sorusu tek bakışta yanıtlanabilmeli.

Tamamlananlar:
- `services/dashboard-service.ts`: `getAdminEnhancedData()` — `trendyolThisMonth` + `trendyolLastMonth` paralel sorgular; `cancelledFilter`; `aggregateTrendyol()`; `trendyolMoM` return değeri
- `app/(app)/dashboard/_components/admin-workspace.tsx`: "Trendyol Aylık Karşılaştırma" bölümü — 3 kart (Sipariş / Ciro / Eşleşme %); inline `DeltaBadge` (↑ emerald / ↓ red / → slate)
- Schema değişikliği: YOK
- tsc clean ✓; commit 8ed85e7 ✓; READY dpl_3gPeDmEfFq6DcbYaE1eWohps9SWi

---

### ✓ DONE — Priority 66 — Cockpit Stok Kapsamı Kolonu (Phase 66, 2026-05-17)

**Neden:**
Import cockpit stok adedi gösteriyordu ama "bu stok kaç gün yeter?" sorusu cevaplanmıyordu. Kapsama kolonu acil sipariş vermesi gereken ürünleri kırmızıyla hemen belirginleştirir.

Tamamlananlar:
- `app/(app)/admin/import-cockpit/page.tsx`: daysOfCoverage hesabı + Kapsama kolonu; no schema change; no new DB query
- tsc clean ✓; commit 1be7075 ✓; READY dpl_3gPeDmEfFq6DcbYaE1eWohps9SWi

---

### ✓ DONE — Priority 65 — Ürün Listesi T30G Satış Hızı (Phase 65, 2026-05-17)

**Neden:**
Admin ürün listesinde hangi ürünün satıldığını görmek için her ürünün detay sayfasına girmek gerekiyordu. T30G kolonu bu sinyali liste ekranında sunarak hızlı tarama sağlar.

Tamamlananlar:
- `app/(app)/products/page.tsx`: parallel fetch TrendyolSalesRecord 30g; velocity30d map; T30G kolonu (emerald/amber/slate/dash); colSpan 7→8; no schema change
- tsc clean ✓; commit bbb39b1 ✓; READY dpl_3gPeDmEfFq6DcbYaE1eWohps9SWi

---

### ✓ DONE — Priority 64 — Trendyol Aylık Satış Trendi Kartı (Phase 64, 2026-05-17)

**Neden:**
Ürün detay sayfası 4 KPI tile (Son 30G Satış/Ciro, Toplam Satış, Gerçekleşen Marj) gösteriyordu ama aylık trend yoktu. Hangi ürünün büyüyüp büyümediği tek bakışta anlaşılmıyordu.

Tamamlananlar:
- `app/(app)/products/[id]/page.tsx`: 6 aylık JS-side aggregation; trend badge (↑/↓/→); Ay/Adet(delta)/Ciro/Ort.Fiyat tablosu; totals footer; no schema change
- tsc --noEmit temiz ✓; commit 7fdc124 ✓; READY dpl_3gPeDmEfFq6DcbYaE1eWohps9SWi

---

### ✓ DONE — Priority 63 — Trendyol Aylık Satış Raporu (Phase 63, 2026-05-17)

**Neden:**
Yönetim takımı Trendyol satış performansını aylık granülaritede izleyemiyordu. Sipariş + iade verileri vardı ama yönetici ekrana özetleyen bir rapor sayfası yoktu.

**Bağımlılık:** Phase 29 (TrendyolSalesRecord + TrendyolReturnRecord), Phase 63 için schema değişikliği yok

Tamamlananlar:
- `app/(app)/admin/trendyol-report/page.tsx` (YENİ): EXECUTIVE_READ gated; parallel fetch son 12 ay; JS-side monthly aggregation; 12-ay aylık tablo (İade Oranı + Eşleşme % renk kodlu); totals footer; 6 KPI kartı (son 30 gün); top-10 eşleşmiş ürün tablosu; boş durum fallback
- `app/(app)/layout.tsx`: "Trendyol Raporu" sidebar linki eklendi (İthalat & Analiz, EXECUTIVE_READ)
- Schema değişikliği: YOK
- tsc --noEmit temiz ✓
- Browser-verified: KPI kartlar (659 sipariş, ₺612.218 brüt ciro), 3-aylık tablo, top-10 ürünler ✓
- READY: dpl_5DHWKsJJ6L5N61Ti8iNZopndpriH

---

### ✓ DONE — Priority 62 — TrendyolReturnRecord Normalized Re-Match (Phase 62, 2026-05-17)

**Neden:**
Phase 61 normalizeKey() mantığını yalnızca TrendyolSalesRecord'a uyguladı. TrendyolReturnRecord da aynı null-productId sorununa sahipti; iade kayıtları kâr analizine ve eşleşme istatistiklerine dahil edilemiyordu.

Tamamlananlar:
- `lib/actions/marketplace-mapping-actions.ts`: `resolveMatch()` DRY yardımcısı; `trendyolReturnRecord.findMany({ where: { productId: null } })` paralel çekildi; iade kayıtları normalize eşleştirmeden geçirildi; 100'lük batch bulk-update; başarı mesajı X sipariş + Y iade rapor eder
- Schema değişikliği: YOK; Yeni UI: YOK
- tsc --noEmit temiz ✓
- Browser-verified: sayfa yükleniyor, buton görünür ✓
- READY: dpl_FF8MmKYk3BhQMgqaAnhbioSCYgc8

---

### ✓ DONE — Priority 61 — Normalized Barcode Re-Match (Phase 61, 2026-05-17)

**Neden:**
Trendyol barkod formatı (tire, boşluk, büyük harf) ile iç ürün barkodları arasındaki format uyuşmazlığı yüzünden 131 barkod / ₺936k ciro eşleşmeden kalıyordu. Tam string karşılaştırması başarısız olduğunda normalize edilmiş fallback gerekiyordu.

**Bağımlılık:** Phase 29 (TrendyolSalesRecord + productId), Phase 41 (backfill engine), Phase 16 (MarketplaceProductMapping)

Tamamlananlar:
- `app/api/cron/trendyol-sync/route.ts`: `normalizeKey()` helper, `resolveProductId()` helper (exact then normalized fallback), `normalizedBarcodeMap` + `normalizedSkuMap`; `syncOrders()` ve `syncReturns()` yeni map'leri kullanır
- `lib/actions/marketplace-mapping-actions.ts`: `rematchNormalizedBarcodesAction()` — tüm null-productId TrendyolSalesRecord satırlarını tarar, normalize match, 100'lük batch bulk-update
- `components/marketplace/rematch-normalized-button.tsx`: Yeni client component — "Barkodları Normalize Et & Eşleştir" butonu
- `app/(app)/admin/marketplace-mappings/page.tsx`: `RematchNormalizedButton` header'a eklendi
- Schema değişikliği: YOK
- tsc --noEmit temiz ✓
- Browser-verified: "Barkodları Normalize Et & Eşleştir" butonu görünür, unmatched inbox 131 barkod / ₺936.283 gösteriyor ✓
- READY: dpl_FM1WF6drTKPn96N8kupT8Gr6tmVU

---

## Anti-Scope Rules

DO NOT start:
- marketplace write sync
- ERP complexity
- public auth
- SaaS multi-tenant ideas
- capital automation without admin approval
- profitability features before cost structure is trustworthy
- procurement intelligence before inventory and profitability foundations are ready
- revenue-based product ranking before sales snapshots are trustworthy
- rich media workflow without a clear storage/delete strategy
- XML overwriting curated product content after the owner has edited it manually
- pretending live API windows are a complete historical order source
- trusting weak barcode/SKU guesses when an explicit marketplace mapping should exist
- treating marketplace margin as trustworthy before the effective shipping/commission policy is normalized

---

## Working Rule

When execution priority changes:
- update `PROGRESS.md` if reality changed
- update `ROADMAP.md` if target architecture changed
- update `NEXT-STEPS.md` if immediate build order changed

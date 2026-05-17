# NEXT STEPS

## Mission

This file defines execution priority from current state.

It answers one operational question:

What should be built next, in what order?

`ROADMAP.md` defines the target architecture.

`PROGRESS.md` defines the factual implementation state.

`NEXT-STEPS.md` defines the immediate execution stack between those two documents.

---

## Current Reality

Current reality:
- CRM foundation exists
- quote workflow v1 exists
- relationship engine exists
- task and outreach foundations exist
- Turkish location layer exists
- RBAC is production-active
- inventory, profitability, XML import, marketplace read intelligence, supplier intelligence, import calculator, executive dashboard, and import decision engine all exist in some form

This means the product is already useful for:
- internal CRM operations
- quote workflows
- XML-driven inventory intake
- Trendyol read-side operations
- pre-purchase import evaluation
- owner-grade executive review
- import buy/skip decisions replacing the old workbook

Not yet ready for:
- marketplace sync/write architecture
- trustworthy marketplace order/return history that can replace manual Trendyol checking
- canonical mapping governance for unmatched marketplace records
- workbook-validated marketplace margin policy

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

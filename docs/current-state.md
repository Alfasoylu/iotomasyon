# Current State

## Product Identity

IOTOMASYON is evolving from an internal CRM into an internal business operating system for Soylu Elektronik.

It is not yet that full operating system.

Today, it is best described as:
- an internal CRM foundation
- a quote and sales workflow foundation
- a relationship-aware operational panel

It is not yet:
- a marketplace operating system (write-side sync deferred)
- a procurement intelligence system (Phases 19–21)
- a full owner-intelligence dashboard (Phase 22 KPI dashboard missing)

---

## Tech Stack

- Next.js
- App Router
- TypeScript
- Prisma
- Supabase PostgreSQL
- Vercel
- Tailwind

---

## Current Implemented Modules

Implemented modules:
- authentication (single internal auth)
- protected app shell
- RBAC — complete (Phase 5): 5 roles, 62 permissions, per-user overrides, dangerous permission gate
- admin user management
- product management
- category management
- attribute system
- customer CRM — Phase 6 complete: customerType enum, monthlySalesPotential, platformNotes
- inventory intelligence — Phase 7 complete: barcode, imageUrl, supplier, stockSource/Confidence, lastStockSyncAt, lastStockCountBy, reorderLeadTime, shippingCost, marketplaceCommission
- profitability engine — Phase 8 complete: per-channel (retail/wholesale/marketplace) net profit, margin %, ROI %, losing product detection
- sales potential engine — Phase 9 complete: per-channel demand estimates, projected monthly revenue/profit, investment score 0–100, BUY/WAIT/DO_NOT_BUY signal
- capital allocation engine — Phase 10 complete: admin-only /admin/capital, ranked purchase suggestions, reserve safety, persistent config
- XML inventory sync — Phase 11 complete: /admin/xml-sync, XmlSyncSource/XmlSyncLog, manual trigger, daily Vercel cron, xmlLocked override protection
- XML product foundation — Phase 11A complete: 649 Entegra products auto-imported, ProductImage (2534 images), XmlProductData (649 rows with all 21 USD price fields), multi-image gallery + XML data card on product detail, batched sync in 24s (Promise.all, maxDuration=300), flat Entegra format auto-detected
- marketplace listing registry — Phase 12 complete: /marketplace, MarketplaceListing table, 8 platforms, 4 statuses, create/edit/delete, product + responsible links
- marketplace monitoring dashboard — Phase 13 complete: /marketplace/monitoring, gap/problem/stale alert sections, auto task creation
- Trendyol API integration — Phase 14 complete: /admin/trendyol config page, /marketplace/trendyol live orders+returns dashboard, singleton config with save+test actions (live-verified: 437 orders, 155 returns, "Bağlantı başarılı." ✓)
- marketplace profit dashboard — Phase 15 complete: /marketplace/profit, winners/losers/missing-data/high-stock signal, platform breakdown grid
- marketplace operations expansion — Phase 16 complete: /marketplace/trendyol/questions (Q&A + inline answer), /marketplace/trendyol/returns (approve/reject claims), /admin/exchange-rates, /admin/marketplace-mappings; 4 new DB tables, 6 new permissions, full audit trail
- quote professionalization 2.0 — Phase 18 complete: reusable quote templates (QuoteTemplate + QuoteTemplateItem), template management page, template loading into quote form, product auto price-fill from sellingPriceTry, 2 new permissions
- procurement intelligence — Phase 19 complete: /admin/procurement, reorder urgency engine (CRITICAL/HIGH/MEDIUM/LOW/OK/UNKNOWN), ranked purchase table, financial summary (suggested cost + projected profit), graceful empty state
- supplier intelligence — Phase 20 complete: /admin/suppliers CRUD, Supplier + SupplierProduct models, product edit supplier link section (unitCostUsd, moq, leadDays, isPreferred)
- import cost calculator — Phase 21 complete: /admin/import-calculator, landed cost formula (product+freight+customs), per-unit TRY cost, break-even, channel margin analysis
- executive KPI dashboard — Phase 22 complete: /admin/executive, stock value TRY, capital health, procurement urgency pills, top-5 profitability table, quick-links to all intelligence tools
- data hygiene governance — Phase 23 complete: /admin/data-hygiene, 8 completeness checks (cost, retail price, marketplace price, stock-with-no-cost, xml-no-price, category, barcode, supplier), real-time issue counts, Düzenle links
- production safety center — Phase 24 complete: /admin/safety, migration history from _prisma_migrations, 8-item safety checklist, dangerous operation registry (9 rows, CRITICAL/HIGH/MEDIUM), docs/MIGRATION-SAFETY.md
- import decision system — Phase 11C partial: /admin/import-decisions, air/sea freight economics engine (landed cost, profit ratio, annual ROI, ALWAYS_STOCK/BUY_SMALL/DO_NOT_BUY/MISSING_DATA), product detail import card, product form import inputs (weightKg/customsRatePct/shippingMethodPref)
- import-economics reference model documented in `docs/import-economics-model.md`
- product operations UX — Phase 25 complete: live search (debounce, ≥2 chars, no submit button), compact filter pills (Durum/Stok), sort by stock/price/margin/name, thumbnail column, health cues per row (Düşük stok/Görsel yok/Maliyet yok/Fiyat yok/XML bayat)
- product performance ranking — Phase 26 complete: TrendyolSalesRecord schema + migration, 90-day windowed Trendyol order sync (barcode/SKU matching), /admin/product-performance with top-20 ranking tables and performance signal cards, per-product KPI card on product detail page
- product media and content studio — Phase 27 complete: ProductImageManager (multi-image grid, URL-add, delete, set-primary), RichTextEditor (Tiptap H2/H3/bold/italic/lists), Supabase Storage upload action, XML description governance (opt-in copy, never overwrite)
- product governance and private intelligence — Phase 28 complete: Product.privateNote (isOwner()-gated, ADMIN_EMAIL only), PrivateNoteEditor with amber UI, supplier summary card on detail page, description max 10000, normalizeProductData explicitly omits privateNote
- order ledger and return claims — Phase 29 complete: TrendyolReturnRecord schema + migration, syncTrendyolReturnsAction (365-day sweep), /orders page with 5 tabs (Tümü/Teslim/İptal/İadeler/Eşleşmemiş), newest-first, unmatched inbox, Siparişler sidebar link
- marketplace margin policy normalization — Phase 30 complete: MarketplacePlatformPolicy table, per-platform standard shipping/commission/VAT/fees, resolveMarginPolicy() three-tier resolver, /admin/marketplace-policies admin UI with per-platform inline edit, /marketplace/profit updated with source labels (Ürün Geçersiz Kılma/Ürün Değeri/Platform Standardı/Sistem Varsayılanı)
- import economics normalization — Phase 31 complete: SEA_FREIGHT_PER_KG fixed (2→1), rmbUsdRate on MonthlyExchangeRate, sourceCostRmb + importPaymentFeePct on Product, RMB-first formula in import decision engine, exchange rate form updated with RMB/USD field, product form amber RMB section
- import governance — Phase 32 complete: ImportDecisionSnapshot model (freeze all inputs+outputs at decision time), Supplier import defaults (air/sea freight USD/kg, payment fee %), three-tier freight resolution, ImportSnapshotButton, Karar Geçmişi history table on product detail, "Kaydet" column on import decisions cockpit
- marketplace pricing normalization — Phase 33 complete: lib/marketplace-pricing.ts canonical engine, calcMarketplacePricingRow() (effectivePrice/shipping/commission/paymentFee/returnReserve/netRevenue), calcShippingFromPriceTiers() roadmap tiers, price resolution (manual>XML>none), shipping resolution (policy>tier), Pazar Yeri Fiyatlandirmasi card on product detail (5 platforms with XML/effective/source/shipping/commission/netKalan/netMarj), source badges, footer formula note
- marketplace profit page XML price integration — Phase 34 complete: /marketplace/profit uses calcMarketplacePricingRow() per listing, per-platform XML prices (Trendyol/HB/Amazon/Pazarama/Idefix), PriceBadge source badge on effective price column, consistent with product detail Pazar Yeri Fiyatlandirmasi card, usdTryRate from MonthlyExchangeRate
- unmatched barcodes inbox — Phase 37 complete: /admin/marketplace-mappings adds Eşleşmemiş Barkodlar card (112 barcodes, ₺852K missing ciro), top 30 by revenue, Eşleştir → button pre-fills MappingForm via ?barcode= URL param, no schema change
- executive dashboard marketplace revenue — Phase 36 complete: /admin/executive adds Trendyol 90-day Gerçekleşen Satış Özeti card (ciro, eşleşen ürün, eşleşmemiş kayıt tiles + top 5 revenue table), no schema change, isCancelledStatus() filter, Gerçekleşen Marj link
- product finance field consolidation — Priority 0A complete (UI-only): product-form "PAZAR YERİ MALİYET GEÇERSİZ KILMALARI" section with blue policy info box, consolidated override fields (shippingCostOverride/marketplaceCommissionOverride/paymentFeeRate/returnReserveRate) with "Boş = platform politikasını kullan" placeholders, legacy DB fields preserved as hidden inputs, marketplacePriceTry relabeled with role explanation, stok section Entegra ERP amber note; no schema change, browser round-trip 2026-05-17 ✓
- USD tiered shipping + cockpit fixes — Phase 51 complete: shippingTiersJson on MarketplacePlatformPolicy (USD-based tier table, editable via platform policy form with "load Trendyol defaults" button); resolveMarginPolicy() extended with sellingPriceUsd context for tier resolution; import-cockpit now uses resolveMarginPolicy() for commission + shipping (no more hardcoded 0); xmlTrendyolPrice wired as price fallback (Trendyol realized → XML → manual); "XML Fiyat" badge added
- import cockpit v2 — Phase 50 complete: /admin/import-cockpit, Trendyol 90-day realized avg price + 30-day velocity + return rate → net profit/unit + margin% + monthly profit estimate → AL/BEKLE/ALMA signal; unmatched products fall back to manual estimates with warning banner; price source badges; tab filter bar with live counts
- xml stock change log — Phase 49 complete: XmlStockChangeLog model + migration, runSync captures previousQty vs newQty and batch-inserts change records; /admin/xml-sync "Son Değişimler" section with delta badges
- trendyol daily sync cron — Phase 48 complete: /api/cron/trendyol-sync Vercel cron (daily 06:00 UTC), CRON_SECRET Bearer auth, 14-day sliding window, syncOrders (paginates fetchTrendyolOrders, upserts TrendyolSalesRecord with barcode/SKU match + discountedPrice fallback) + syncReturns (paginates fetchTrendyolReturns, upserts TrendyolReturnRecord with claimItemStatus + reason code/name) run in parallel via Promise.allSettled, vercel.json updated, no schema change
- operational intelligence dashboard — Phase 47 complete: /dashboard enhanced with "Trendyol & Stok" section showing criticalStockCount, 7-day order qty, unmatched orders count, 30-day Trendyol revenue; all tiles clickable deep-links; LinkedStatCard component; DB-only (no live API), no schema change
- trendyol catalog view — Phase 46 complete: /admin/trendyol-catalog fetches up to 200 Trendyol catalog products (live API), cross-references with internal Product.barcode + MarketplaceProductMapping barcodes/SKUs, shows delta (internal qty vs Trendyol qty), oversell risk warning, surplus push suggestion, unmatched products with Eşleştir deep-links, Trendyol Katalog nav link
- trendyol stock sync — Phase 45 complete: /admin/trendyol-stock-sync pushes internal stockQuantity + sellingPriceTry to Trendyol via PUT price-and-inventory for all TRENDYOL-mapped products with barcodes; batches of 100; batchId tracking; skips no-barcode and no-price products
- stock health dashboard — Phase 44 complete: /admin/stock-health classifies all products into Critical (zero stock) / Low (<30 days coverage) / Healthy based on 30-day Trendyol velocity; KPI cards; coverage-day badges; recent adjustments table; no schema change
- trendyol stock auto-deduction — Phase 43 complete: TrendyolSalesRecord.stockDeducted flag tracks which delivered matched order lines have been deducted, applyTrendyolStockDeductionAction groups pending records by product and runs per-product $transaction (update stockQuantity + create StockAdjustmentLog SALE + mark deducted=true), TrendyolStockDeductionButton amber card on /orders page disappears once all records processed
- stock adjustment log — Phase 42 complete: StockAdjustmentType enum (RESTOCK/CORRECTION/DAMAGE/RETURN/SALE/OTHER) + StockAdjustmentLog model with migration applied to production, createStockAdjustmentAction (PRODUCTS_UPDATE gated, Prisma $transaction atomic update + log write, negative stock prevention), StockAdjustmentCard client component (form + history table + optimistic UI, "Güncel: N adet" badge), product detail page integration
- bulk mapping backfill engine — Phase 41 complete: bulkBackfillAllMappingsAction iterates all mappings and retroactively links TrendyolSalesRecord + TrendyolReturnRecord, BulkBackfillButton in header, per-mapping save surfaces backfill count, no schema change
- capital allocation real velocity — Phase 40 complete: /admin/capital investment scores now use actual 30-day Trendyol sales velocity, effectiveOnlinePotential overrides manual value when real data available, velocitySource "actual"/"estimated" per product, Hız column (Gerçek/Tahmin badge), Gerçek Satış Verisi Aktif emerald banner, no schema change
- procurement intelligence real velocity — Phase 39 complete: /admin/procurement upgraded with 30-day TrendyolSalesRecord actual sales as demand override, velocitySource "actual"/"estimated"/"none" badge (Gerçek/Tahmin/Veri Yok), T30G Satış column, Gerçek Satış Verisi Aktif banner, no schema change
- return rate analysis — Phase 38 complete: /marketplace/return-analysis, per-product return rate (claimCount/soldQty×100) from TrendyolReturnRecord vs TrendyolSalesRecord, highRisk (≥5%)/normal (<5%)/noSales sections, top 10 reasons table, KPI summary cards (matched claims / products with returns / high-risk count / unmatched), MARKETPLACE_RETURNS_READ gated, İade Analizi sidebar link
- realized margin analysis — Phase 35 complete: /marketplace/realized-margin, 90-day TrendyolSalesRecord aggregation per product, calcMarketplacePricingRow() with actual realized price for realistic deductions, deltaPct = realized − expected, sections (Zarar Eden/Beklenenden Düşük/Kârlı/Maliyet Eksik), summary cards (ciro/marj/kötü count), EXECUTIVE_READ gated
- product/customer interest engine
- category/customer relationship engine
- quote workflow v1
- PDF quote generation
- WhatsApp quote sharing
- task management
- outreach/campaign module
- search
- activity timeline
- Turkish location layer

Important constraint:
- implemented does not mean roadmap-complete
- implemented means code exists and supports operational use

Clarification:
- current activity timeline is operational activity visibility
- it is NOT audit-grade event history

---

## Authentication State

Current auth state:
- single internal auth
- internal login/logout flow exists
- RBAC complete and production-active (Phase 5)
- protected routes exist and are permission-enforced server-side
- app shell protection exists with permission-aware sidebar
- per-user permission overrides supported

RBAC capabilities:
- 5 roles: ADMIN, SALES, OPERATIONS, MARKETPLACE_OPERATOR, CUSTOM
- 62 permissions across 12 categories
- 6-step permission resolution: dangerous gate → ADMIN bypass → explicit deny → explicit grant → role default → deny
- dangerous permissions (migrations.approve, destructiveActions.approve) require explicit per-user grant
- zero-access users are redirected to /no-access

---

## Product/Data State

Current data/product state:
- product CRUD exists
- category CRUD exists
- attribute system exists
- customer CRUD exists
- product/customer interests exist
- category/customer relationships exist
- task and note structures exist

What this means:
- the system already supports operational CRM relationships between products, categories, and customers
- the system can already hold import, XML, marketplace, and supplier context around products

What it does not mean:
- advanced product list sorting/ranking by recent sales and revenue is not implemented yet
- owner-only product private notes are not implemented yet
- rich product description authoring is not implemented yet
- product media workflow is not yet a full multi-image studio
- XML imports should not yet be assumed to govern curated product truth beyond approved sync fields
- governance-grade product data quality exists (Phase 23)

---

## Quote State

Current quote state:
- quote workflow v1 exists
- quote creation exists
- quote editing exists
- quote listing exists
- quote detail page exists
- PDF export exists
- WhatsApp sharing exists

Phase 18 additions:
- reusable quote templates: create and manage named templates with line items, payment/delivery/warranty terms
- template loading into quote form (fills all fields from saved template)
- product auto price-fill: selecting a product auto-fills unitPrice from sellingPriceTry + auto-fills description if blank

Current quote limitations:
- no quote workflow v2 speed system
- no advanced pricing-rule engine
- no owner-grade commercial intelligence layer

---

## Marketplace State

PARTIAL

Current meaning:
- marketplace listing registry — DONE (Phase 12): /marketplace, create/edit/delete listings, 8 platforms, 4 statuses, product + responsible links
- marketplace monitoring — DONE (Phase 13): gap/problem/stale alerts, auto task creation
- Trendyol read dashboard — DONE (Phase 14): /admin/trendyol config, /marketplace/trendyol live orders+returns, save+test actions — live-verified with real credentials (437 orders, 155 returns) ✓
- marketplace profit dashboard — DONE (Phase 15): /marketplace/profit, winners/losers/missing-data/high-stock alerts
- marketplace operations expansion — DONE (Phase 16): Q&A module, Return Action Center, Product Mapping registry, Exchange Rate management, full Trendyol write-side actions with audit trail
- marketplace sync architecture — NOT IMPLEMENTED (Phase 17, DEFERRED)

Current marketplace gaps:
- Trendyol eşleşme oranı hâlâ düşük: ~188 eşleşmemiş barcode → XML ve sipariş verileri bu ürünler için kullanılamıyor
- marketplace margin policy'de USD kademeli kargo vardı, ancak Trendyol platformu için varsayılan kademeler henüz kaydedilmedi (admin'den manuel girilmesi gerekiyor)
- per-marketplace XML/manual/effective fiyat hiyerarşisi ürün detay sayfasında normalize edildi (Phase 33) ama tüm cockpit sayfaları bunu tutarlı kullanmıyor henüz

---

## Procurement State

PARTIAL

Current meaning:
- procurement engine — DONE (Phase 19): /admin/procurement, reorder urgency engine, ranked purchase table, financial summary
- supplier intelligence — DONE (Phase 20): /admin/suppliers, Supplier + SupplierProduct, product edit supplier link section
- import cost calculator — DONE (Phase 21): /admin/import-calculator, landed cost (product+freight+customs), per-unit TRY, break-even, channel margin analysis
- import economics normalization — NOT COMPLETE: RMB-first input, payment commission, route/profile freight defaults, and shared landed-cost governance are still missing

Note:
- capital allocation engine EXISTS (Phase 10) — admin-only ranked purchase suggestions based on investment score
- Phase 19 shows all products as UNKNOWN urgency because lead-time/demand fields are not yet populated; Phase 20 supplier data will feed into urgency calculations once products are linked

---

## Intelligence State

PARTIAL

Current meaning:
- profitability engine — DONE (Phase 8): per-channel net profit, margin %, ROI %, losing product identification
- sales potential engine — DONE (Phase 9): investment score, BUY/WAIT/DO_NOT_BUY signal
- capital allocation engine — DONE (Phase 10): admin-only ranked purchase suggestions, reserve safety
- marketplace profit dashboard — DONE (Phase 15): platform-level winner/loser/missing-data visibility
- executive KPI dashboard — DONE (Phase 22): /admin/executive, single-page owner intelligence overview
- recommendation-grade owner intelligence system — DONE (Phase 22 complete, all procurement layers in place)
- import decision intelligence exists, but it is not yet holding-grade or fully governance-safe

---

## Known Technical Debt

- product finance field sprawl remains unresolved across import cost, TRY cost, marketplace price, shipping, commission, and override inputs
- no image pipeline
- no audit-grade event history
- no audit-grade event history for financial, permission, stock, marketplace, or quote changes
- no production-ready product sales snapshot layer for 30-day revenue ranking
- no owner-only private product intelligence layer
- no fully governed XML-versus-curated product field overwrite policy in active UI
- RMB-first import finance model — implemented (Phase 31) ✓
- RMB/USD exchange-rate layer — implemented (Phase 31) ✓
- payment commission layer in import decision engine — implemented (Phase 31) ✓
- no route/profile-aware freight default hierarchy
- no import decision snapshot governance
- procurement engine now implemented (Phases 19–22)

---

## Role Coverage Gaps (identified 2026-05-17)

Analysis performed 2026-05-17. No code changes made — documentation only.

### What is implemented (role-wise)

- 5 roles: ADMIN, SALES, OPERATIONS, MARKETPLACE_OPERATOR, CUSTOM — live in production
- 62 permissions — seeded and enforced server-side
- Sidebar navigation grouped by section with role-based filtering (Phase 53) ✓
- ADMIN: full financial/import intelligence via EXECUTIVE_READ gate ✓
- SALES: CRM, quotes, tasks, product search — no financial access ✓
- OPERATIONS: inventory read/write/count, tasks, product update — but sees all form fields
- MARKETPLACE_OPERATOR: listings, orders, returns, Q&A — no financial access ✓

### What is NOT yet implemented

1. **WAREHOUSE role** — does not exist in UserRole enum.
   Depo çalışanları şu an OPERATIONS rolü kullanmak zorunda.
   Bu geçici çözüm: OPERATIONS'ın görmemesi gereken şeyleri görüyor.
   → Phase 55

2. **Product form field-level role visibility** — product-form.tsx shows ALL fields
   (unitCostTry, sourceCostRmb, import sections) to anyone with products.update permission.
   Server-side route protection exists but DOM-level field hiding does not.
   → Phase 57

3. **Role-specific dashboards** — /dashboard is a single page for all roles.
   SALES sees import/procurement tiles that mean nothing to them.
   WAREHOUSE sees operational intelligence they can't act on.
   → Phase 54

4. **Sales Opportunity Engine** — data model ready (ProductInterest, CategoryInterest),
   but no screen shows "which customers should I pitch this new product to?"
   → Phase 56

5. **Operations task coordination** — tasks.assign permission exists in code,
   but no UI for cross-user task assignment or team task board.
   → Phase 58

6. **executive.read is too broad** — all import intelligence, capital, financial data,
   XML tools, admin panels share a single permission key. Future work should split into
   import.read / productFinance.read / admin.tools for finer delegation control.
   → Planned for Phase 57 groundwork

---

## Production Readiness

### Operational Readiness

Operationally usable today:
- internal auth
- protected app shell
- product operations
- category operations
- customer CRM basics
- quote workflow v1
- task workflow basics
- outreach/campaign basics
- search
- activity timeline
- location-enabled customer forms

### Strategic Readiness

Strategically usable today:
- internal CRM workflow
- basic sales/quote workflow
- relationship-aware product/customer tracking

Strategically mature now:
- procurement decisions (Phases 19–21: supplier model, reorder signals, import cost calculator)
- executive KPI overview (Phase 22: single-page owner intelligence dashboard)

### Owner Intelligence Readiness

Partially owner-intelligence ready.

Implemented:
- profitability engine (Phase 8) ✓
- sales potential engine / investment scoring (Phase 9) ✓
- capital allocation engine (Phase 10) ✓
- marketplace performance visibility (Phase 15) ✓

Owner-intelligence fully implemented through Phase 22:
- profitability engine (Phase 8) ✓
- sales potential engine / investment scoring (Phase 9) ✓
- capital allocation engine (Phase 10) ✓
- marketplace performance visibility (Phase 15) ✓
- procurement intelligence (Phases 19–21) ✓
- executive KPI dashboard (Phase 22) ✓

Note: procurement urgency shows VERİ YOK for most products because lead-time/demand fields are not yet populated.

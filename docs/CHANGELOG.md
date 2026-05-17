# CHANGELOG

## Changelog Rules

- Only completed and verified work should be listed.
- Do not add future planned work.
- If a change is inferred from documentation but not independently verified in code, avoid wording it as fully implemented.
- ROADMAP items must not appear here unless implemented.

## 2026-05

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

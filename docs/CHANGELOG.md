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

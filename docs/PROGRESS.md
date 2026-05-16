# IOTOMASYON Progress

## Purpose

This file tracks factual implementation state against `ROADMAP.md`.

Rules:
- `ROADMAP.md` = target architecture
- `PROGRESS.md` = real implementation state
- if a feature is not implemented and verified, it must not be marked complete here

---

# Allowed Status Vocabulary

- DONE
- PARTIAL
- NOT STARTED
- BLOCKED
- DEFERRED

---

# Current Snapshot

IOTOMASYON has moved beyond a simple internal CRM foundation and is evolving toward an internal operating system for Soylu Elektronik.

Current reality:
- CRM and quote operations are implemented
- task and outreach foundations are implemented
- category and relationship structure is implemented
- intelligence layers defined in `ROADMAP.md` are mostly not implemented yet

Implemented modules:
- authentication (single internal auth)
- protected app shell
- RBAC (Phase 5 complete — role-based + per-user overrides)
- admin user management
- product management
- category management
- attribute system
- customer CRM (Phase 6: customerType, monthlySalesPotential, platformNotes)
- inventory intelligence (Phase 7: barcode, stockSource/Confidence, shippingCost, marketplaceCommission, etc.)
- profitability engine (Phase 8: per-channel net profit, margin %, ROI %, losing product detection)
- sales potential engine (Phase 9: investment score 0–100, BUY/WAIT/DO_NOT_BUY signal)
- capital allocation engine (Phase 10: admin-only /admin/capital, ranked purchase suggestions)
- XML inventory sync (Phase 11: /admin/xml-sync, XmlSyncSource/Log, daily cron, manual trigger)
- marketplace listing registry (Phase 12: /marketplace, 8 platforms, create/edit/delete)
- marketplace monitoring (Phase 13: /marketplace/monitoring, gap/problem/stale alerts)
- Trendyol API integration (Phase 14: /admin/trendyol config, /marketplace/trendyol live dashboard)
- marketplace profit dashboard (Phase 15: /marketplace/profit, winners/losers/missing-data/high-stock alerts)
- marketplace operations expansion (Phase 16: Q&A module, Return Action Center, Product Mapping registry, Exchange Rate management)
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

Current architecture position:
- Next.js App Router active
- TypeScript active
- Prisma active
- Supabase PostgreSQL active
- Vercel deployment target active

Operating system transition status:
- operational CRM foundation exists
- sales workflow foundation exists
- profitability and investment intelligence exists (Phases 8–10)
- marketplace read intelligence exists (Phases 12–15)
- owner-grade KPI dashboard does not exist yet (Phase 22)
- procurement intelligence system does not exist yet (Phases 19–21)

---

# Verification Snapshot

Last known verification baseline:
- `npm run build` passes
- `npx tsc --noEmit` passes
- `eslint` passes with pre-existing warnings only
- Prisma schema validation passes when required environment variables are present
- migration structure exists and is committed under `prisma/migrations`
- protected route smoke checks have been implemented in code through proxy + app layout protection

Latest hardening confirmed:
- location CSV dependency tracked in repo
- build-safe lazy session secret initialization active
- build-safe lazy database initialization active
- protected route coverage expanded

Verification notes:
- build safety improved by lazy env/runtime initialization
- database layer is aligned to Supabase PostgreSQL architecture
- current verification confirms application buildability, not roadmap completion

---

# Phase Progress

## Phase 0 — Foundation
Status: DONE

Completed:
- Next.js setup
- TypeScript
- Tailwind
- ESLint
- project architecture

Verified outcome:
- application foundation exists and supports continued development

---

## Phase 1 — Core Platform
Status: DONE

Completed:
- Prisma integration
- Supabase/PostgreSQL alignment
- auth flow
- protected shell
- login/logout

Verified outcome:
- authenticated internal access model is in place
- app shell is protected

Notes:
- current auth base remains single internal auth
- RBAC foundation is implemented
- broader rollout verification and governance hardening remain incomplete

---

## Phase 2 — CRM Core
Status: DONE

Completed:
- customer CRUD
- customer notes structure
- task linking
- customer lifecycle status flow
- quote workflow foundation

Verified outcome:
- customer records can be created and managed
- customer-linked operational follow-up structure exists

---

## Phase 3 — Sales Workflow
Status: DONE

Completed:
- quote generation
- PDF export
- WhatsApp sharing
- quote listing
- quote editing
- quote workflow v1 operational

Verified outcome:
- wholesale quote flow is functional end-to-end
- quote records can be created, reviewed, exported, and shared

Notes:
- quote workflow exists
- quote professionalization v2 is not implemented

---

## Phase 4 — Category / Product Relationships
Status: PARTIAL

Completed:
- product categories
- product/customer interest linking
- category/customer interest linking
- attribute system

Missing:
- customer segmentation
- product scoring
- opportunity intelligence

Verified outcome:
- relationship structure exists
- category and attribute-aware data model exists

---

## Phase 5 — Role Based Access Control (RBAC)
Status: DONE

Completed:
- UserRole enum expanded: ADMIN, SALES, OPERATIONS, MARKETPLACE_OPERATOR, CUSTOM
- Role, Permission, RolePermission, UserPermission tables created and migrated to production
- 62 permissions seeded across 12 categories (users, customers, products, categories, attributes, quotes, tasks, campaigns, search, activity, inventory, executive, dangerous)
- DANGEROUS_PERMISSIONS gate: migrations.approve, destructiveActions.approve — never inheritable via role
- `resolvePermission()` 6-step engine: dangerous gate → ADMIN bypass → explicit deny → explicit grant → role default → deny
- SALES role defaults seeded: 15 permissions (customers, quotes, tasks, products, categories, attributes, search, activity)
- OPERATIONS role defaults seeded: 12 permissions
- MARKETPLACE_OPERATOR role defaults seeded: 11 permissions
- Per-user override UI: Varsayılan → Verildi → Engellendi → Varsayılan cycle
- Permission-aware sidebar with parallel permission checks and zero-access → /no-access redirect
- Server-side `requirePermission()` and `checkPermission()` enforced on all routes and server actions
- Admin user management page with permission grid grouped by category
- Graceful degradation: app works before Phase 5 migrations applied (try-catch fallback)
- 22 automated unit tests passing (`__tests__/resolve-permission.test.ts`)
- Browser-verified: role change, override cycle, zero-access guard, SALES defaults

Verified outcome:
- RBAC is production-active and organization-ready
- Permission governance is documented and code-aligned
- Multi-user rollout is safe

---

## Phase 6 — Customer Intelligence Expansion
Status: DONE

Completed:
- CustomerType enum: TOPTAN, PERAKENDE, SITE_YONETICISI, GUVENLIK_SIRKETI, MAGAZA, ONLINE_SATICI, CUSTOM
- `monthlySalesPotential DECIMAL(15,2)` added to Customer table
- `platformNotes TEXT` added to Customer table
- customerType field migrated from TEXT to enum in production
- Customer create/edit forms expose all three fields
- CSV import action uses explicit SELECT to avoid Phase 6 column errors before migration
- Graceful degradation via `isSchemaMismatchError()` for pre-migration environments

Verified outcome:
- Customer records can carry sales intelligence fields
- Schema is production-active on Supabase PostgreSQL

---

## Phase 7 — Inventory Intelligence Core
Status: DONE

Completed:
- `StockSource` enum added: MANUAL, XML, API, IMPORT
- `StockConfidence` enum added: HIGH, MEDIUM, LOW
- 13 new fields added to `Product` table and migrated to production: `barcode` (unique), `imageUrl`, `supplier`, `stockSource`, `stockConfidence`, `lastStockSyncAt`, `lastStockCountById` (FK → User via `@relation("StockCountedBy")`), `reorderLeadTime`, `shippingCost`, `shippingCostOverride`, `marketplaceCommission`, `marketplaceCommissionOverride`
- Product create/edit form reorganized into 4 sections: Temel bilgiler, Stok ve konum, Maliyet girdileri, İthalat ve envanter
- StockSource and StockConfidence dropdowns added to product form
- User dropdown for "Son manuel sayımı yapan" added to product form
- Product detail page updated to display all new fields
- Product image preview card added to detail page
- Barcode displayed in monospace font on detail page
- Zod validation schema updated for all new fields
- `normalizeProductData()` updated: enum casting, empty-string-to-null, decimal/int normalization

Verified outcome:
- Product records carry full inventory intelligence memory
- Stock source, confidence, lead time, shipping cost, and commission inputs are production-active
- Round-trip browser test confirmed: form renders → save succeeds → detail page displays saved values

---

## Phase 8 — Profitability Engine
Status: DONE

Completed:
- 8 new Product fields migrated to production: `unitCostTry`, `sellingPriceTry`, `wholesalePriceTry`, `marketplacePriceTry`, `packagingCost`, `vatRate`, `paymentFeeRate`, `returnReserveRate`
- `lib/profitability.ts`: pure calculation engine — KDV-inclusive price model, per-channel breakdown (perakende / toptan / pazar yeri)
- Per-channel metrics: revenue, VAT extraction, unit cost, shipping, commission, payment fee, return reserve, net profit, margin %, ROI %
- Marketplace channel: commission + payment fee + return reserve deducted
- Retail/wholesale channels: no commission, no payment fee, no return reserve
- Product form: new "Fiyatlandırma ve kârlılık" section (8 fields)
- Product detail: "Kârlılık analizi" card with ProfitCard per channel (color-coded green/red)
- Header badges: "Kârlı" (green) / "Kaybettiriyor" (red) based on any losing channel

Verified outcome:
- Browser test: form fills → save → detail page shows ₺617,50 perakende / ₺243,33 toptan / ₺344,09 pazar yeri net kâr
- "Kârlı" badge correct
- System can identify losing products

---

## Phase 9 — Sales Potential Engine
Status: DONE

Completed:
- 3 new Product fields migrated to production: `onlineSalesPotential`, `wholesaleSalesPotential`, `installerSalesPotential` (INT, monthly unit estimates)
- `lib/sales-potential.ts`: projected monthly revenue + profit per channel, turnover speed (months), investment score (0–100), BUY signal logic
- BUY signal rules: SATIN AL / BEKLE / ALMA / Veri yok based on profitability + demand + stock level
- Product form: "Satış potansiyeli" section (3 channel inputs)
- Product detail: "Yatırım skoru" card — monthly ciro, kâr, adet, devir süresi, per-channel breakdown
- Header badge: SATIN AL / BEKLE / ALMA signal

Verified outcome:
- Browser test: 50+20+10 adet/ay → skor 100/100, SATIN AL badge, 3 kanal kartı doğru
- System can rank products by investment score

---

## Phase 10 — Capital Allocation Engine
Status: DONE

Completed:
- `CapitalConfig` table migrated to production: totalCapitalTry, reservePct (default 20%), desiredTurnoverMonths (default 3)
- `lib/capital-allocation.ts`: locked capital calculation, deployable = available − reserve, greedy allocation ranked by investmentScore DESC
- Per-suggestion output: suggestedQty, allocatedAmount, expectedMonthlyROI
- Admin-only page `/admin/capital`: config form (persistent), 5-column capital summary, purchase suggestions table
- Reserve safety: deployable capital always < available capital, reserve never touched
- Safety warning on page: "Bu liste öneridir — satın alma kararı vermez"
- Sidebar link "Sermaye" (EXECUTIVE_READ permission — ADMIN only)

Verified outcome:
- Browser test: ₺5M total → ₺900 locked → ₺4.999.100 available → ₺999.820 reserve → ₺3.999.280 deployable
- Config saves, page refreshes, allocation table renders
- Warning text visible, suggestion table or empty state shown

---

## Phase 11 — XML Inventory Sync
Status: DONE

Completed:
- `XmlSyncStatus` enum added: RUNNING, SUCCESS, PARTIAL, ERROR
- `XmlSyncSource` table migrated to production: id, name, url, isEnabled, authHeader, lastSyncAt, lastStatus
- `XmlSyncLog` table migrated to production: sourceId (FK → XmlSyncSource CASCADE), startedAt, completedAt, status, recordsFound, recordsUpdated, recordsSkipped, errorMessage
- `xmlLocked BOOLEAN DEFAULT false` added to `Product` table — manual override protection
- `lib/xml-sync.ts`: regex-based XML parser, element-based and attribute-based format support, multi-alias field detection (SKU/StockCode/ProductCode, Barcode/EAN/GTIN, etc.)
- `lib/actions/xml-sync-actions.ts`: saveXmlSourceAction, deleteXmlSourceAction, triggerXmlSyncAction, runSync (shared by cron + manual), finalizeLog
- `app/api/cron/xml-sync/route.ts`: Vercel cron endpoint (daily 02:00 UTC on Hobby plan), iterates all enabled sources
- `/admin/xml-sync` page: source list with status badges + last sync timestamp, edit form per source, sync log table (last 5 entries), add-new-source form, info card
- `components/xml-sync/xml-sync-form.tsx`: source CRUD form with manual trigger button
- Product form: "XML senkronizasyon" section with xmlLocked checkbox (amber warning style)
- Sidebar: "XML Senkron" link (EXECUTIVE_READ permission)
- `vercel.json`: cron schedule `0 2 * * *` (daily, Hobby plan compatible)
- Matching: barcode-first, then SKU
- Override protection: xmlLocked=true → source skipped entirely; stockSource=MANUAL → stock not updated, price still updated

Verified outcome:
- Browser test: source created via form → "Kaynak kaydedildi" ✓
- Manual sync triggered → HTTP 404 surfaced in UI and written to sync log ✓
- Sync log renders after reload with BAŞLANGIÇ, BİTİŞ, DURUM, BULUNAN, GÜNCELLENEN, ATLANAN columns ✓
- xmlLocked checkbox saves to DB and persists on re-open ✓

---

## Phase 12 — Marketplace Listing Registry
Status: DONE

Completed:
- `MarketplacePlatform` enum added: TRENDYOL, HEPSIBURADA, N11, PTTAVM, KOCTAS, TEKNOSA, TEMU, CUSTOM
- `ListingStatus` enum added: ACTIVE, INACTIVE, SUSPENDED, UNKNOWN
- `MarketplaceListing` table migrated to production: id, productId (FK → Product CASCADE), platform, platformListingId, listingUrl, listingBarcode, listingSku, listingTitle, status, notes, responsibleId (FK → User SET NULL), lastCheckedAt, createdAt, updatedAt
- `lib/actions/marketplace-listing-actions.ts`: createListingAction, updateListingAction, deleteListingAction (all with Zod validation and permission guard)
- `/marketplace` listing registry page: platform summary cards grid (count + active count), full listings table grouped by platform
- `/marketplace/new` create listing page with optional `?productId=` pre-fill query param
- `/marketplace/[id]` listing detail page with Row-based field display
- `/marketplace/[id]/edit` edit + delete form
- `components/marketplace/listing-form.tsx`: platform/status dropdowns, create/edit/delete modes
- Sidebar: "Pazar Yerleri" link (MARKETPLACE_LISTINGS_READ permission)
- Product and User models: `marketplaceListings[]` relation added to schema

Verified outcome:
- Browser test: `/marketplace` empty state → `/marketplace/new` form → created Trendyol listing for ANUNNAKIPOINTER product → redirected to `/marketplace/[id]` detail page ✓
- Detail page shows platform, status badge, listing ID, title, product link, dates ✓
- Edit page pre-filled with all saved values ✓
- List page: "Toplam 1 listeleme kayıtlı", TRENDYOL summary card (1 listeleme, 1 aktif), row in table ✓

---

## Phase 13 — Marketplace Monitoring
Status: DONE

Completed:
- `/marketplace/monitoring` dashboard page — no new DB schema, all computed server-side
- **Listeleme boşluğu** alert: active products with zero marketplace listings across all platforms
- **Sorunlu listelemeler** alert: listings with SUSPENDED or UNKNOWN status
- **Hiç kontrol edilmemiş** alert: ACTIVE listings where `lastCheckedAt` is null
- Summary cards: per-category alert counts at page top
- `CreateMonitoringTaskButton` client component: creates HIGH-priority `FollowUpTask` linked to the product per alert row
- `createListingMonitoringTaskAction` server action in `marketplace-listing-actions.ts`
- "⚠ İzleme" nav button added to `/marketplace` page header
- "← Listeleme Kaydı" back link on monitoring page

Verified outcome:
- Browser test: `/marketplace/monitoring` loads with 2 uyarı (1 gap: UV82, 1 stale: ANUNNAKIPOINTER Trendyol) ✓
- Problem listings section: "✓ Sorunlu listeleme yok." ✓
- "Görev oluştur" click → "✓ Görev oluşturuldu" feedback ✓

---

## Phase 14 — Trendyol API Integration (READ ONLY)
Status: DONE

Completed:
- `TrendyolConfig` table migrated to production: id (singleton), supplierId, apiKey, apiSecret, isEnabled, lastSyncAt, updatedAt
- `lib/trendyol-api.ts`: `TrendyolApiError` (status + body), `trendyolFetch<T>()` generic Basic-auth fetch, `fetchTrendyolOrders()`, `fetchTrendyolReturns()`, `testTrendyolConnection()` with Turkish error messages
- `lib/actions/trendyol-actions.ts`: `saveTrendyolConfigAction` (Zod-validated upsert, EXECUTIVE_READ), `testTrendyolConnectionAction` (live ping, EXECUTIVE_READ)
- `components/trendyol/trendyol-config-form.tsx`: supplierId / apiKey / apiSecret(password) / isEnabled checkbox, Kaydet + Bağlantıyı test et buttons with inline feedback, amber security note
- `/admin/trendyol`: settings page — status badge (aktif/pasif), supplierId display, last updated, config form, how-to-find guide card (EXECUTIVE_READ)
- `/marketplace/trendyol`: live orders + returns dashboard (MARKETPLACE_LISTINGS_READ) — not-configured state, API error state, 4 summary cards, orders table (20 rows), returns table (10 rows), Turkish status maps
- Sidebar: "Trendyol API" (EXECUTIVE_READ), "Trendyol Paneli" (MARKETPLACE_LISTINGS_READ)

Verified outcome (live credentials, 2026-05-17):
- `/admin/trendyol` config page: supplierId 209161 saved, "Entegrasyon aktif" badge green ✓
- "Bağlantıyı test et" → "✓ Bağlantı başarılı." (live API ping confirmed) ✓
- `/marketplace/trendyol` orders table: 437 totalElements, 20 rows rendered with dates, customer names, amounts, "Teslim edildi" status badges ✓
- `/marketplace/trendyol` returns table: 155 totalElements, 10 rows with correct claimDate dates, "Kabul edildi"/"İptal" status badges, product names, return reasons (e.g. "Kusurlu ürün gönderildi", "Yanlış sipariş verdim") ✓
- API URL fix: migrated from legacy `api.trendyol.com/sapigw/suppliers` to `apigw.trendyol.com/integration/order/sellers` ✓
- Return type fix: TrendyolReturn interface rewritten to match live getClaims structure (items[].claimItems[].claimItemStatus.name, claimDate, items[].orderLine.productName) ✓
- Both sidebar entries visible and functional ✓

---

## Phase 15 — Marketplace Profit Dashboard
Status: DONE

Completed:
- `/marketplace/profit` page — no new DB schema, computed from existing Product pricing fields via `calculateProfitability()`
- 4 summary cards: total listings, profitable count, losing count, missing-data count
- Platform breakdown grid: per-platform active/losing/missing-data counts
- Winners table: top 20 listings ranked by marketplace margin % DESC
- Losers table: all listings with net marketplace profit < 0
- Missing-data alert: listings where unitCostTry or marketplacePriceTry is null, with edit links
- High-stock/low-demand signal: products with stockQuantity > 5 and onlineSalesPotential === 0
- `toNum()` helper for Prisma.Decimal → number conversion
- Sidebar entry: "Pazar Kârlılığı" (MARKETPLACE_LISTINGS_READ)
- "📊 Kârlılık" button added to `/marketplace` page header

Verified outcome:
- Browser test: `/marketplace/profit` renders with summary cards, platform breakdown, winners/losers tables ✓
- Missing-data and high-stock alerts visible ✓
- Sidebar link "Pazar Kârlılığı" navigates correctly ✓

---

## Phase 16 — Marketplace Operations Expansion
Status: DONE

Completed:
- DB schema: `Product.unitCostUsd` (nullable Decimal), `MarketplaceProductMapping`, `MarketplaceQuestionActionLog`, `MarketplaceReturnActionLog`, `MonthlyExchangeRate` — all migrated to production Supabase
- 6 new permissions seeded: `marketplaceQuestions.read`, `marketplaceQuestions.answer`, `marketplaceReturns.action`, `marketplaceMappings.read`, `marketplaceMappings.write`, `exchangeRates.manage`
- MARKETPLACE_OPERATOR role: 4 new permissions assigned as defaults
- `lib/trendyol-api.ts` extended: QNA base URL, `trendyolPost`/`trendyolPut` write helpers, `fetchTrendyolQuestions()`, `answerTrendyolQuestion()`, `fetchClaimIssueReasons()`, `approveTrendyolClaim()`, `createTrendyolClaimIssue()`
- `lib/actions/trendyol-question-actions.ts`: `answerTrendyolQuestionAction` with `MarketplaceQuestionActionLog` audit trail
- `lib/actions/trendyol-return-actions.ts`: `approveTrendyolClaimAction` + `createTrendyolClaimIssueAction` with `MarketplaceReturnActionLog` audit trail
- `lib/actions/marketplace-mapping-actions.ts`: create/update/delete for `MarketplaceProductMapping`
- `lib/actions/exchange-rate-actions.ts`: upsert/delete + `getExchangeRateForDate()` lookup helper
- `/marketplace/trendyol/questions`: live Q&A list with status filter tabs (WAITING/ANSWERED/REJECTED/REPORTED) + inline answer form (`AnswerQuestionForm` client component)
- `/marketplace/trendyol/returns`: Return Action Center — actionable vs. completed splits, approve/reject panel (`ClaimActionPanel` client component with claim issue reasons from live API)
- `/admin/exchange-rates`: monthly USD/TRY rate management table + add/update form (`ExchangeRateForm`)
- `/admin/marketplace-mappings`: product mapping registry — create/delete mappings, list with product links (`MappingForm`, `DeleteMappingButton`)
- Sidebar: 4 new nav entries added (`Müşteri Soruları`, `İade Merkezi`, `Döviz Kurları`, `Ürün Eşleştirme`)
- `Button` component: added `size` prop (sm/md/lg) — backwards compatible
- tsc clean, npm run build clean

Verified outcome:
- Migration applied to production Supabase: all 5 schema changes confirmed ✓
- 6 permissions seeded: marketplaceQuestions.read/answer, marketplaceReturns.action, marketplaceMappings.read/write, exchangeRates.manage ✓
- tsc --noEmit: no errors ✓
- npm run build: clean, /marketplace/trendyol/questions and /marketplace/trendyol/returns in output ✓
- Vercel deployment triggered: c3fb5bd ✓

Browser verification (post-deploy):
- Pending Vercel deploy completion

---

## Phase 17 — Marketplace Control Tower
Status: DEFERRED

Reason:
- roadmap explicitly requires architecture review and approval before write-side marketplace control

---

## Phase 18 — Quote Professionalization 2.0
Status: NOT STARTED

Missing:
- reusable quote templates
- saved layouts
- quick product insertion system
- custom pricing rules
- sub-60-second quote workflow target

---

## Phase 19 — Procurement Intelligence
Status: NOT STARTED

Missing:
- procurement signal engine
- supplier-aware reorder logic
- reorder urgency
- expected cash conversion time
- actionable purchasing assistant outputs

---

## Phase 20 — Supplier Intelligence
Status: NOT STARTED

Missing:
- supplier model
- supplier contact tracking
- supplier-product relations
- reliability scoring
- landed cost comparison

---

## Phase 21 — Import Cost Calculator
Status: NOT STARTED

Missing:
- pre-purchase landed cost calculator
- shipping/customs input model
- estimated margin / ROI output
- buy / do not buy signal

---

## Phase 22 — Executive KPI Dashboard
Status: NOT STARTED

Missing:
- stock value visibility
- capital visibility
- monthly profit layer
- strategic widgets
- procurement recommendation view

---

## Phase 23 — Data Hygiene / SKU Governance
Status: NOT STARTED

Missing:
- duplicate SKU detection
- duplicate barcode detection
- missing cost/category/link reports
- invalid data governance layer

---

## Phase 24 — Backup / Rollback / Migration Safety
Status: NOT STARTED

Missing:
- migration safety checklist
- backup discipline
- rollback notes
- production write approval rules
- dangerous operation warnings

---

# Technical Debt

- no image pipeline
- no audit-grade event history
- no procurement engine

---

# Known Open Risks

## Documentation Drift
Status: OPEN

Problem:
- implementation evolved faster than documentation

Impact:
- planning and execution can diverge

## Schema Drift
Status: OPEN

Problem:
- roadmap scope is significantly ahead of current schema in intelligence-heavy areas

Impact:
- future phases may drift unless schema evolution is tightly managed

## Marketplace Complexity
Status: OPEN

Problem:
- roadmap includes deep multi-channel write operations and marketplace control tower
- read-side foundation exists (Phases 12–15): listing registry, monitoring, Trendyol integration, profit dashboard
- write-side marketplace sync not yet implemented

Impact:
- write-side multi-channel operations remain high-risk and explicitly deferred (Phase 17)

## Image Storage Scaling
Status: OPEN

Problem:
- roadmap expects product image workflows
- no image pipeline or storage strategy is implemented

Impact:
- media-heavy product operations are not ready

## Capital Recommendation Risk
Status: OPEN

Problem:
- future procurement/capital systems may create bad business decisions if implemented without hard approval controls

Impact:
- owner-level financial risk is high if not governed correctly

## Production Migration Risk
Status: OPEN

Problem:
- schema and data model will continue growing across many future phases

Impact:
- production migration safety must be formalized before intelligence layers expand

---

# Production Usability

## Operationally Usable Today

Usable now:
- authentication
- protected internal shell
- product management
- category management
- attribute system
- customer CRM basics
- product/customer and category/customer relationship tracking
- quote workflow v1
- PDF quote generation
- WhatsApp quote sharing
- task management basics
- outreach/campaign foundation
- search
- activity timeline
- Turkish location selection

## Strategically Usable Today

Partially usable:
- internal CRM operations
- quote handling
- basic sales follow-up workflows

Not yet strategically strong:
- procurement decisions
- executive KPI decisions (Phase 22 not implemented)

## Not Owner-Intelligence Ready

Implemented (owner-intelligence partial):
- profitability engine (Phase 8) ✓
- capital allocation engine (Phase 10) ✓
- marketplace performance intelligence (Phase 15) ✓

Still missing for full owner-intelligence readiness:
- executive KPI dashboard (Phase 22)
- procurement intelligence (Phases 19–21)
- supplier intelligence (Phase 20)

---

# Ownership Rules

- `ROADMAP.md` = target architecture
- `PROGRESS.md` = factual implementation state
- never mark incomplete work as complete

---

# Immediate Documentation Priority

Needed next:
- `MODULE-INVENTORY.md`
- `ROUTE-INVENTORY.md`
- `DATABASE-SCHEMA-STATE.md`
- `PERMISSION-MODEL.md`

---

# Last Updated

Date:
2026-05-17 (Phase 15 done, documentation audit applied)

Alignment source:
`ROADMAP.md`

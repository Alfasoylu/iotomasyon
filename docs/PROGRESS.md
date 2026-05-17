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
- advanced product operations UX requested by the owner is not implemented yet
- sales-ranked product list behavior is not implemented yet
- owner-only product notes are implemented (Phase 28 — EXECUTIVE_READ gated privateNote)
- Trendyol live visibility exists, but marketplace order/return history governance is not complete yet
- Warehouse Mode (Phase 55, 2026-05-17): WAREHOUSE role added to UserRole enum (prisma db push); seed: 9 permissions including inventory.count; /warehouse mobile-first search page (barcode/SKU/name, no financial data); /warehouse/count stock count entry (absolute qty → CORRECTION StockAdjustmentLog delta); createInventoryCountAction server action (INVENTORY_COUNT gated); WarehouseWorkspace dashboard component reusing OperationsDashboardData; sidebar nav INVENTORY_READ + INVENTORY_COUNT gated; form→save→redirect round-trip verified READY dpl_FZUREkAgckL52vByKEobiDVMJFc8
- dashboard role-based workspaces (Phase 54 Faz A+B+C+D+E+F, 2026-05-17): single /dashboard URL branches on user.role server-side; AdminWorkspace extracted + enhanced (Faz D: exchange rate, import intelligence, pipeline summary, reorder signal); SalesWorkspace (pipeline, today tasks, recent activity — no financial data); OperationsWorkspace (open/overdue/today tasks, critical/low stock, unmatched orders, 7d Trendyol qty — no financial data); WarehouseWorkspace (Faz E: same operational signals, no financial data); MarketplaceWorkspace (Faz F: active listings, 7d orders/returns, unmatched orders, open tasks — no financial data); READY dpl_6j2QbVahxSmYdVz6FUDwqkWYSHXX
- satış fırsat motoru (Phase 56, 2026-05-17): getProductIntelligence() stage/priority/lastContactedAt/assignedTo ile zenginleştirildi; getSalesPipelineData() topOpportunities (HIGH/URGENT ekip geneli) eklendi; sales-workspace.tsx "Önerilen Fırsatlar" bölümü + aktif fırsatlar aşama/öncelik badge'leri; ürün detay "Doğrudan ilgili" kartları aşama+öncelik+temsilci gösteriyor; schema değişikliği yok; READY dpl_EnxAtoQH3aqnWqWyCXhHRaKaskrA
- trendyol rapor ay drill-down (Phase 70, 2026-05-18): /admin/trendyol-report aylık tablo satırları tıklanabilir link (→?month=YYYY-MM); seçili ay koyu arka planla vurgulanan; top-10 ürünler seçili aya göre filtreleniyor; "← Son 30 güne dön" link; searchParams eklendi; drillLabel "Son 30 Gün" → "Nis 2026" gibi değişiyor; no schema change; tsc clean; commit 34b83e2; READY dpl_7ZWTqV8XZG43kfxH9M363sX9KtQu; browser-verified 2026-05-18 ✓
- siparişler sayfası arama (Phase 69, 2026-05-18): /orders sayfasına ürün adı/barkod/SKU/sipariş no arama eklendi; q param; searchFilter Prisma OR; tab counts arama ile güncelleniyor; iade sekmesinde productName filtresi; tabHref q'yu koruyor; Temizle butonu; no schema change; tsc clean; commit 6986a2e; READY dpl_7ZWTqV8XZG43kfxH9M363sX9KtQu; browser-verified 2026-05-18 ✓
- xml stok hareketi geçmişi ürün detay (Phase 68, 2026-05-18): /products/[id] sayfasına "XML Stok Değişim Geçmişi" kartı eklendi; XmlStockChangeLog son 30 kayıt; tarih/önceki/yeni/delta tablo; emerald artış / red azalış; StockAdjustmentCard'ın üzerinde; kart yalnızca kayıt varsa render edilir; no schema change; tsc clean; commit 24fb968; READY dpl_7ZWTqV8XZG43kfxH9M363sX9KtQu; browser-verified 2026-05-18 ✓
- admin dashboard MoM trendyol karşılaştırma (Phase 67, 2026-05-17): getAdminEnhancedData() bu ay / geçen ay Trendyol metrikleri eklendi (orders, revenue, matchRate); cancelledFilter shared; aggregateTrendyol() yardımcı fonksiyon; AdminWorkspace "Trendyol Aylık Karşılaştırma" bölümü 3 kart (sipariş, ciro, eşleşme %) delta arrow ile; no schema change; tsc clean; commit 8ed85e7; READY dpl_3gPeDmEfFq6DcbYaE1eWohps9SWi
- cockpit stok kapsamı kolonu (Phase 66, 2026-05-17): import-cockpit'e "Kapsama" kolonu eklendi; daysOfCoverage = stockQty / (effectiveMonthlyUnits / 30); red≤30g / amber 31-90g / slate>90g; "Ng" formatı; Row tipine daysOfCoverage eklendi; no schema change; tsc clean; commit 1be7075; READY dpl_3gPeDmEfFq6DcbYaE1eWohps9SWi
- trendyol t30g satış hızı kolonu ürün listesi (Phase 65, 2026-05-17): /products listesine T30G kolonu eklendi; parallel fetch TrendyolSalesRecord son 30 gün (matched, non-cancelled); velocity30d Map<productId,qty> build edildi; emerald≥10 / amber≥3 / slate<3 / "—" yok; colSpan 7→8; no schema change; tsc clean; commit bbb39b1; READY dpl_3gPeDmEfFq6DcbYaE1eWohps9SWi
- trendyol aylık satış trendi ürün kartı (Phase 64, 2026-05-17): /products/[id] sayfasına "Trendyol Aylık Satış Trendi" kartı eklendi; mevcut TrendyolSalesRecord verisi JS-side monthly aggregation ile 6 aya özetlendi; tablo: Ay / Adet (delta vs önceki ay) / Ciro / Ort. Fiyat; ↑ Artış / ↓ Düşüş / → Sabit trend badge; totals footer; no schema change; tsc clean; commit 7fdc124; READY dpl_3gPeDmEfFq6DcbYaE1eWohps9SWi
- trendyol aylık satış raporu (Phase 63, 2026-05-17): /admin/trendyol-report page (EXECUTIVE_READ gated); parallel fetch TrendyolSalesRecord + TrendyolReturnRecord last 12 months; JS-side monthly aggregation (toMonthKey, isCancelled filter); 12-month breakdown table: Ay/Sipariş/Adet/Brüt Ciro/İade/İade Oranı (red>15% amber>8% emerald)/Net Ciro/Eşleşme % (emerald≥70% amber≥40% red<40%); totals footer; 6 KPI cards last 30 days; top-10 matched products by revenue with product links; "Trendyol Raporu" sidebar link under İthalat & Analiz; no schema change; browser-verified: KPI cards render (659 orders ₺612k), 3-month table, top-10 products; READY dpl_5DHWKsJJ6L5N61Ti8iNZopndpriH
- normalized return record re-match (Phase 62, 2026-05-17): rematchNormalizedBarcodesAction() extended to also process null-productId TrendyolReturnRecord rows; resolveMatch() helper deduplicates barcode+SKU resolution logic; parallel fetch of sales+returns; success message reports "X sipariş, Y iade eşleştirildi"; no schema change; browser-verified: page loads, button functional; READY dpl_FF8MmKYk3BhQMgqaAnhbioSCYgc8
- normalized barcode re-match (Phase 61, 2026-05-17): normalizeKey() helper (strip non-alphanumeric, lowercase) added to cron sync + rematch action; trendyol-sync cron builds normalizedBarcodeMap + normalizedSkuMap alongside exact maps; resolveProductId() tries exact then normalized fallback; rematchNormalizedBarcodesAction() scans all null-productId TrendyolSalesRecord rows and batch-updates matches; RematchNormalizedButton UI on /admin/marketplace-mappings; no schema change; browser-verified: "Barkodları Normalize Et & Eşleştir" button visible, 131 unmatched barcodes / ₺936k shown; READY dpl_FM1WF6drTKPn96N8kupT8Gr6tmVU
- trendyol velocity → import decision input (Phase 60, 2026-05-17): effectiveMonthlyUnits = max(manualEstimate, trendyolVelocity) passed to calculateImportDecision(); Talep/ay sütunu kaynak badge'i gösteriyor (Trendyol=emerald, İkisi de=blue, Manuel=slate); Trendyol verisi olan ama manual estimate sıfır olan ürünler artık MISSING_DATA yerine gerçek skor alıyor; browser-verified: Trendyol + İkisi de badge'ler görünür, ALWAYS_STOCK/BUY_SMALL kararlar aktif; READY dpl_8zd2WpGzqG6QVdrWPhi2mvEqgR3R
- trendyol satış hızı (Phase 59, 2026-05-17): import-decisions cockpit'e "Trendyol 90g" kolonu eklendi; TrendyolSalesRecord son 90 gün (iptal olmayanlar, productId eşleşenler) paralel sorgu; velocityByProduct map (qty90d, monthlyVelocity=qty90d/3); emerald yeşil ile qty/ay gösterimi; eşleşmeyen ürünler için "—"; display-only, import logic değişmedi; schema değişikliği yok; browser-verified (2 adet / ~1/ay göründü); READY dpl_9t2yUijYB6a3946XhXFvbnAsq72y
- operasyon koordinasyon katmanı (Phase 58, 2026-05-17): customerTaskSchema assignedToId alanı eklendi; createCustomerTaskAction tasks.assign permission gate (başkasına atama için); CustomerTaskForm canAssign+users props ile assignee dropdown; customer detail page listUsersWithTasks() + checkPermission(TASKS_ASSIGN) ile form beslemesi; task list → assignedTo gösterir + filtre createdById→assignedToId; OperationsWorkspace "Ekip Görev Dağılımı" bölümü (açık/gecikmiş görev sayısı per kullanıcı, /tasks?userId deeplink); schema değişikliği yok; round-trip browser-verified; READY dpl_3A5DU9KfNffMJZEFUa465TdMr4kQ
- product form role visibility (Phase 57, 2026-05-17): showFinancialFields prop added to ProductForm — EXECUTIVE_READ gates "Fiyatlandırma", "Pazar yeri maliyet", "Satış potansiyeli", "İthalat kararı girdileri" sections; normalizeProductDataNonFinancial() in updateProductAction strips financial fields server-side for non-admin users; admin form visually verified READY dpl_3ge5Xx4gFjBy6fnUQVAUjMYjCb17
- role-based system analysis + roadmap update (2026-05-17, documentation only): WAREHOUSE role gap, product form field visibility gap, role-specific dashboard gap, sales opportunity engine gap, operations coordination gap — all documented in PERMISSION-MODEL.md, ROADMAP.md, phase-plan.md, NEXT-STEPS.md, current-state.md; no code/schema change
- sidebar grouped navigation + role-based section visibility (Phase 53): flat 49-item list → 5 sections (CRM, Ürünler & Stok, Pazar Yeri, İthalat & Analiz, Yönetim); collapsible chevron sections; active section auto-open; İthalat & Analiz fully gated by EXECUTIVE_READ — SALES/OPERATIONS roles see zero import/financial entries; sidebar width 256px
- product finance field consolidation complete (Priority 0A / Phase 52): importUnitCostUsd moved to import decision section with Birincil (RMB) / Yedek (USD) hierarchy; marketplacePriceTry relabeled as "genel fallback"; override section renamed with 4-tier resolution explanation; all acceptance criteria met — primary truth fields obvious, fallback fields clearly labeled
- marketplace margin policy USD kademeli kargo (Phase 51): shippingTiersJson per platform — satış fiyatının USD karşılığına göre kargo maliyeti otomatik belirleniyor; resolveMarginPolicy() context.sellingPriceUsd ile kademeleri çözümlüyor. Amaç: Trendyol kargo maliyeti fiyata göre değişiyor (ucuz ürün az kargo, pahalı ürün fazla kargo) — sabit TRY kargo değeri bu gerçekliği yansıtmıyordu.
- import cockpit politika entegrasyonu (Phase 51): komisyon ve kargo artık resolveMarginPolicy() ile çözümleniyor (hardcoded 0 kaldırıldı); xmlTrendyolPrice fiyat hiyerarşisine bağlandı (Trendyol gerçekleşen → XML → Manuel). Amaç: cockpit hesaplamaları platform politikasını yok saydığı için kâr/marj rakamları gerçekçi değildi.

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
- procurement intelligence (Phase 19: /admin/procurement, reorder urgency engine, ranked purchase table, financial summary)
- supplier intelligence (Phase 20: /admin/suppliers, Supplier + SupplierProduct models, product edit supplier links)
- import cost calculator (Phase 21: /admin/import-calculator, landed cost formula, channel margin analysis)
- executive KPI dashboard (Phase 22: /admin/executive, stock value, capital health, procurement urgency, top-5 profitability)
- data hygiene governance (Phase 23: /admin/data-hygiene, 8 completeness checks, real-time product issue counts)
- production safety center (Phase 24: /admin/safety, migration history from _prisma_migrations, dangerous operation registry, safety checklist)
- product operations UX (Phase 25: live search, thumbnails, compact filter pills, sort by stock/price/margin, health cues per row)
- product performance ranking (Phase 26: Trendyol order sync, 90-day windowed fetch, barcode/SKU matching, 30d sales/revenue ranking, realized margin, performance signal cards, per-product KPI tile)
- product media and content studio (Phase 27: multi-image manager, Tiptap rich text editor, Supabase Storage upload, XML description governance)
- product governance and private intelligence (Phase 28: isOwner()-gated privateNote [ADMIN_EMAIL only], PrivateNoteEditor, supplier summary on detail page, description max 10000)
- phase 25–28 closure fixes: performance-based sorts (30d qty/rev, all-time rev) on /products, HTML description rendering on detail page, XML overwrite policy documentation, owner-only text correction
- order ledger and return claims (Phase 29: TrendyolReturnRecord, syncTrendyolReturnsAction, /orders page with 5 tabs [Tümü/Teslim/İptal/İadeler/Eşleşmemiş], newest-first, local archive, unmatched inbox with mapping link)
- historical backfill on marketplace mapping (Phase 1 closure: createMarketplaceMappingAction + updateMarketplaceMappingAction call backfillMappingProductId() to retroactively link TrendyolSalesRecord/TrendyolReturnRecord rows when a barcode/SKU mapping is approved)
- marketplace margin policy normalization (Phase 30: MarketplacePlatformPolicy table, upsertPlatformPolicyAction, /admin/marketplace-policies per-platform config, resolveMarginPolicy() three-tier resolver [product override > product value > platform standard > system default], /marketplace/profit updated with source badges [Ürün Geçersiz Kılma/Ürün Değeri/Platform Standardı/Sistem Varsayılanı], MARKETPLACE_POLICIES_MANAGE permission)
- import economics normalization (Phase 31: SEA_FREIGHT_PER_KG 2→1, rmbUsdRate on MonthlyExchangeRate, sourceCostRmb + importPaymentFeePct on Product, RMB-first landed-cost formula, exchange rate + product form updated, import decisions engine updated)
- holding-grade import governance (Phase 32: ImportDecisionSnapshot model + migration, Supplier import defaults, effectiveFreightPerKg() three-tier helper, createImportDecisionSnapshotAction, ImportSnapshotButton, Karar Geçmişi history table on product detail, Kaydet column on import decisions cockpit)
- marketplace pricing normalization (Phase 33: lib/marketplace-pricing.ts canonical engine, calcMarketplacePricingRow(), calcShippingFromPriceTiers() price-tier defaults, price/shipping resolution hierarchy, Pazar Yeri Fiyatlandirması card on product detail [5 platforms, source badges, net remaining, net margin])
- marketplace profit page XML price integration (Phase 34: /marketplace/profit uses calcMarketplacePricingRow() per listing, PLATFORM_XML_FIELD map, PriceBadge on effective price column, PolicyBadge extended for price_tier, usdTryRate from MonthlyExchangeRate)
- unmatched barcodes inbox (Phase 37: /admin/marketplace-mappings top-30 unmatched barcodes by revenue, Eslestir button pre-fills form via ?barcode= param, MappingForm defaultBarcode/defaultPlatformTitle props, no schema change)
- executive dashboard marketplace revenue (Phase 36: /admin/executive new Trendyol 90-day sales section, isCancelledStatus() filter, ciro/eşleşen ürün/eşleşmemiş tiles, top 5 revenue table, Gerçekleşen Marj link, no schema change)
- product finance field consolidation — Phase 52 / Priority 0A (final): importUnitCostUsd moved to "İthalat kararı girdileri" section with Birincil/Yedek visual hierarchy; marketplacePriceTry labeled "genel fallback (₺)"; override section renamed "Tier 1" with 4-tier resolution description; footer notes explain XML-first price chain; no schema change, tsc clean, Vercel READY dpl_AofZouL4KKtPLPsejAsWXV5ZWR7Q, browser-verified 2026-05-17)
- wrong-direction cleanup (Priority 23: Trendyol Stok Senkronu sidebar link removed, trendyol-stock-sync page locked with amber warning, pushTrendyolStockAction disabled, TrendyolStockDeductionButton + getPendingDeductionCount removed from orders page, no schema change)
- import cockpit v2 (Phase 50: /admin/import-cockpit, Trendyol 90d avg price + 30d velocity + return rate per product, import landed cost via existing engine × kur, net profit/unit + margin% + monthly profit, AL/BEKLE/ALMA signals, unmatched warning banner, price source badge, tab bar with counts, sidebar link added, no schema change, browser-verified 2026-05-17)
- xml stock change log (Phase 49: XmlStockChangeLog model + migration applied, runSync captures previousQty vs newQty per product, batch-inserts change logs for changed products, /admin/xml-sync "Son Değişimler" section with delta badges, sync message includes changed count)
- trendyol daily sync cron (Phase 48: app/api/cron/trendyol-sync route, Vercel cron 06:00 UTC, CRON_SECRET auth, 14-day sliding window, parallel syncOrders [TrendyolSalesRecord upsert, barcode/SKU match, discountedPrice fallback] + syncReturns [TrendyolReturnRecord upsert, claimItemStatus, reason code/name], vercel.json updated, no schema change)
- operational intelligence dashboard (Phase 47: /dashboard enhanced with Trendyol & Stok section, getOperationalAlerts() DB-only query, 5 LinkedStatCard tiles [Kritik Stok/Bekleyen Stok Düşümü/Son 7 Gün Sipariş/Eşleşmemiş Sipariş/Trendyol Ciro 30 Gün], deep-links to relevant pages, badge Faz 47, no schema change)
- trendyol catalog view (Phase 46: /admin/trendyol-catalog EXECUTIVE_READ, fetchTrendyolCatalog() GET products endpoint up to 200 products, cross-reference with internal Product.barcode + MarketplaceProductMapping, delta comparison, matched/unmatched sections, oversell risk + surplus banners, Eşleştir deep-links, Trendyol Katalog nav link, no schema change)
- trendyol stock sync (Phase 45: /admin/trendyol-stock-sync EXECUTIVE_READ, updateTrendyolInventory() PUT price-and-inventory in batches of 100, getTrendyolStockPushPreviewAction + pushTrendyolStockAction, TrendyolStockPushButton with batchId display, Trendyol Stok Senkronu nav link, no schema change)
- stock health dashboard (Phase 44: /admin/stock-health EXECUTIVE_READ, Critical/Low/Healthy classification, 30-day velocity coverage formula, KPI cards, critical table, low table with coverage-day badges, recent adjustments table, Stok Sağlığı sidebar link, no schema change)
- trendyol stock auto-deduction (Phase 43: TrendyolSalesRecord.stockDeducted flag + migration, applyTrendyolStockDeductionAction [PRODUCTS_UPDATE gated, per-product $transaction: stockQuantity update + StockAdjustmentLog SALE + mark deducted], TrendyolStockDeductionButton amber card on /orders, amber card hidden after all records processed)
- stock adjustment log (Phase 42: StockAdjustmentType enum + StockAdjustmentLog model + migration applied, createStockAdjustmentAction [PRODUCTS_UPDATE gated, Prisma $transaction, negative stock prevention], StockAdjustmentCard [form + history table, optimistic UI], product detail page integration)
- bulk mapping backfill engine (Phase 41: bulkBackfillAllMappingsAction, BulkBackfillButton in header, per-mapping backfill count in success message, no schema change)
- capital allocation real velocity (Phase 40: /admin/capital investment scores now use actual 30-day TrendyolSalesRecord velocity, velocitySource per suggestion, Gerçek/Tahmin Hız badge column, Gerçek Satış Verisi Aktif banner, no schema change)
- procurement real velocity (Phase 39: /admin/procurement actual 30-day TrendyolSalesRecord demand override, velocitySource badge per row, T30G Satış column, no schema change)
- return rate analysis (Phase 38: /marketplace/return-analysis, per-product returnRate = claimCount/soldQty×100, highRisk ≥5%/normal/noSales sections, top 10 reasons table, MARKETPLACE_RETURNS_READ gated, no schema change)
- realized margin analysis (Phase 35: /marketplace/realized-margin, 90-day TrendyolSalesRecord aggregation, calcMarketplacePricingRow() with realized price for deduction estimates, deltaPct = realized − expected, Zarar Eden/Beklenenden Düşük/Kârlı/Maliyet Eksik sections, summary cards, EXECUTIVE_READ gated)
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
- owner-grade KPI dashboard exists (Phase 22 complete)
- procurement intelligence system exists (Phases 19–21 complete)
- marketplace read-side visibility exists, but order ledger / return ledger / mapping governance are still incomplete

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

## Phase 11A — XML Product Foundation
Status: DONE

Completed:
- `ProductKind` enum added: MAIN_STOCK / LISTING_PACKAGE
- `Product` table: `xmlImported BOOLEAN DEFAULT false`, `productKind`, `mainProductId` (self-referential FK)
- `ProductImage` model: id, productId (FK CASCADE), url, sortOrder (0=primary), source (XML|MANUAL), altText
- `XmlProductData` model: productId @unique, sourceId, all 21 Entegra XML fields (xmlSku, xmlName, xmlBrand, xmlPrice4, xmlTrendyolPrice, xmlHbPrice, xmlAmazonPrice, xmlPazaramaPrice, xmlIdefixPrice, xmlBayiPrice, xmlKoctasPrice, xmlTeknosaPrice, xmlTemuPrice, xmlCurrencyType, xmlKdv, xmlUrunTipi, xmlDateChange, xmlDateAdd, xmlAnaUrunKodu, xmlDescription, xmlImage1–5, lastSeenAt, missingFromLatestFeed)
- `XmlSyncLog.recordsCreated Int @default(0)` added
- Migration applied to production Supabase: `20260517030000_phase11a_xml_product_foundation`
- `lib/xml-sync.ts` rewritten: auto-detects Format A (wrapped `<Urun>`) vs Format B (flat Entegra, delimited by `<urun_kodu>`); `parseProductBlock()` shared helper; CDATA-aware `getTag()`, `parsePositiveDecimal`, `parseNonNegInt` helpers; `sanitizeAnaUrunKodu` strips `[parent_product_code]` literal
- `lib/actions/xml-sync-actions.ts` rewritten for Phase 11A behaviour:
  - Fix stuck RUNNING logs from previous timeouts at start of each `runSync()`
  - `findMany` all existing products by SKU list (1 query, not 660 individual)
  - `createManyAndReturn` for new products (1 query, not 660 individual)
  - `Promise.all` in batches of 20 for XmlProductData upserts (parallel, no transaction timeout)
  - `Promise.all` in batches of 20 for stock/imageUrl updates on existing products
  - `deleteMany` + `createMany` for ProductImage (2 queries total)
  - Creates new `Product` rows with `xmlImported=true` for unmatched SKUs
  - Respects `xmlLocked` (skips product field updates, still upserts XML snapshot + images)
  - Respects `stockSource=MANUAL` (skips stock update)
  - Marks `missingFromLatestFeed=true` for products absent from current feed
- `app/(app)/admin/xml-sync/page.tsx`: added `maxDuration = 300` (Vercel Pro Server Action timeout); added "Oluşturulan" column to sync log table
- `app/(app)/products/[id]/page.tsx`: multi-image gallery (primary 64×64 + thumbnail strip), "XML Kaynak Verisi" card (all 21 fields + USD price grid + missingFromLatestFeed badge), "XML İthalatı" classification badge, parent product link section
- `services/product-service.ts`: `getProductById` includes `images`, `xmlData`, `mainProduct`

Verified outcome:
- Migration applied: ✓
- XML parser local test: 660 products from `iotomasyon.xml` flat-format feed ✓
- Browser sync triggered → SUCCESS: 649 recordsFound, 649 recordsUpdated, 0 errors, 24 seconds ✓
- DB state: 651 total products (649 xmlImported), 649 XmlProductData rows, 2534 ProductImage rows ✓
- Product detail page `AH-TDA7492P`: "XML İthalatı" badge, "XML Kaynak Verisi" card with USD prices, stockSource "XML senkronizasyon", lastSyncAt 17 May 2026 01:03 ✓
- tsc --noEmit: clean ✓
- Vercel deploy: READY (commit aa2dc8f) ✓

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

Browser verification (post-deploy, 2026-05-17):
- /marketplace/trendyol/questions: live Q&A list renders with status filter tabs ✓
- Inline answer form submits and logs to MarketplaceQuestionActionLog ✓
- /marketplace/trendyol/returns: Return Action Center loads actionable/completed split ✓
- ClaimActionPanel: claim issue reasons fetched from live Trendyol API ✓
- /admin/exchange-rates: monthly rate upsert (₺38.75 for May 2026) → "Mayıs 2026 · 38.7500" in list ✓
- /admin/marketplace-mappings: create/list mappings form loads ✓

---

## Phase 17 — Marketplace Control Tower
Status: DEFERRED

Reason:
- roadmap explicitly requires architecture review and approval before write-side marketplace control

---

## Phase 18 — Quote Professionalization 2.0
Status: DONE

Completed:
- `QuoteTemplate` model migrated to production: id, name, description, paymentTerms, deliveryTerms, warrantyTerms, notes, currencyMode, isActive, createdById, createdAt, updatedAt
- `QuoteTemplateItem` model migrated to production: id, templateId, productId (optional FK → Product), description, quantity, unitPrice, currency, discount, tax, sortOrder
- 2 new permissions seeded: `quoteTemplates.read`, `quoteTemplates.write` — added to SALES role defaults
- `services/quote-template-service.ts`: `listQuoteTemplates()`, `getQuoteTemplateById()` with items + product + createdBy includes
- `lib/actions/quote-template-actions.ts`: `createQuoteTemplateAction`, `updateQuoteTemplateAction` (transaction-based item replace), `deleteQuoteTemplateAction` — all Zod-validated + permission-guarded
- `/quotes/templates` management page: "Şablon Oluştur" form + "Kayıtlı Şablonlar" list with item detail display and delete button
- `components/quotes/quote-template-form.tsx`: `QuoteTemplateForm` (full local-state form with items array), `DeleteTemplateButton`
- `components/quotes/quote-form.tsx` extended: "Şablondan Yükle" dropdown + button (only when templates exist), `loadTemplate()` fills paymentTerms/deliveryTerms/warrantyTerms/notes + replaces items
- Quote form product select: auto-fill description (if blank) + auto-fill unitPrice/currency from `sellingPriceTry` on product change (split register pattern for RHF + custom onChange)
- `listCustomerInterestProducts()` updated to include `sellingPriceTry` in select
- Customer detail + quote edit pages: fetch templates in parallel, pass to QuoteForm
- Sidebar: "Teklif Şablonları" nav entry (QUOTE_TEMPLATES_READ permission)

Verified outcome (browser test 2026-05-17):
- /quotes/templates: form → create "Test Şablonu" with 1 item (₺250) → appeared in "Kayıtlı Şablonlar" with "· 1× Test Kalemi Açıklaması 250,00 TRY" ✓
- Customer Teklifler tab: "Şablondan Yükle" dropdown shows "Test Şablonu" → load fills item + totals (₺300 = ₺250 + %20 KDV) ✓
- Product auto-fill: selecting BAOFENG UV-82 TELSİZ auto-filled unitPrice to 1299, totals updated to ₺1,558.80 ✓
- tsc --noEmit: clean ✓
- Vercel deploy: READY (commit 1f8c1e9) ✓

---

## Phase 19 — Procurement Intelligence
Status: DONE

Completed:
- `lib/procurement.ts`: pure calculation module — `ReorderUrgency` enum (CRITICAL/HIGH/MEDIUM/LOW/OK/UNKNOWN), `calculateProcurement()` returns daysRemaining, urgencyRank, suggestedOrderQty, suggestedCost, projectedMonthlyProfit; thresholds: stock=0→CRITICAL, ≤lead×1.5→HIGH, ≤lead×3→MEDIUM, ≤lead×6→LOW, else OK; `URGENCY_LABELS` (TR), `URGENCY_TONES`, `urgencyRank()` helpers
- `app/(app)/admin/procurement/page.tsx` (EXECUTIVE_READ-gated):
  - Fetches all active products with 20 pricing/demand/stock/lead-time fields
  - Runs `calculateProcurement()` per product, sorts by urgency rank ASC → investment score DESC
  - Summary cards: CRITICAL / YÜKSEK / ORTA / DÜŞÜK / VERİ YOK counts
  - Financial summary: total suggested cost + projected monthly profit (CRITICAL+HIGH)
  - Ranked table with 10 columns (SKU, name, stock, urgency, days left, suggested qty, cost, projected profit)
  - OK section below fold; amber warning banner "Bu liste öneridir — satın alma kararı veriniz"
  - "← Sermaye" back button to capital allocation page

Verified outcome:
- Page loads at `/admin/procurement` ✓
- Summary cards render correctly: KRİTİK 0, YÜKSEK 0, ORTA 0, DÜŞÜK 0, VERİ YOK 651 ✓
- Empty ranked table shows "Şu anda acil tedarik gerektiren ürün yok." graceful state ✓
- All 651 products in UNKNOWN because lead-time/demand fields not yet populated — expected ✓
- tsc --noEmit: clean ✓
- Vercel deploy: READY (commit a94c106) ✓

---

## Phase 20 — Supplier Intelligence
Status: DONE

Completed:
- `Supplier` model migrated to production: id, name, contactName, phone, email, countryOfOrigin, paymentTerms, defaultLeadDays, notes, isActive, createdAt, updatedAt; indexed on name, isActive
- `SupplierProduct` join table migrated to production: id, supplierId (FK → Supplier CASCADE), productId (FK → Product CASCADE), unitCostUsd (Decimal?), moq (Int?), leadDays (Int?), isPreferred (Boolean), notes; @@unique([supplierId, productId]); indexed on supplierId, productId, isPreferred
- `lib/actions/supplier-actions.ts`: `saveSupplierAction` (create/update), `deleteSupplierAction`, `upsertSupplierProductAction` (upsert by unique key), `deleteSupplierProductAction` — all SUPPLIERS_WRITE permission-guarded
- `app/(app)/admin/suppliers/page.tsx`: SUPPLIERS_READ-gated admin page — "Yeni Tedarikçi" card + "Tedarikçi Ekle" form, "Kayıtlı Tedarikçiler" list with product count, lead time, country columns
- `components/suppliers/supplier-form.tsx`: full create/edit form with name, contactName, phone, email, countryOfOrigin, paymentTerms, defaultLeadDays, notes, isActive
- `components/suppliers/supplier-list-client.tsx`: expand-row inline edit — click row to expand edit form, collapse on save/delete
- `components/suppliers/supplier-product-section.tsx`: product edit page supplier section — existing links table + "Tedarikçi Bağla" form with supplier dropdown, unitCostUsd, moq, leadDays, isPreferred, notes + "Kaldır" per row
- `app/(app)/products/[id]/edit/page.tsx`: added SupplierProductSection card below main product form; fetches allSuppliers + supplierLinks + canWriteSuppliers in parallel
- `app/(app)/layout.tsx`: added "Tedarikçiler" nav entry (SUPPLIERS_READ permission) after "Tedarik Asistanı"
- `components/dashboard/sidebar.tsx`: updated info card to "Faz 20 aktif — Tedarikçi Zekası"
- permissions.ts already had SUPPLIERS_READ / SUPPLIERS_WRITE; seed.ts already had suppliers.read / suppliers.write

Verified outcome (browser test 2026-05-17):
- /admin/suppliers: page loads with add-supplier form and empty list ✓
- Create "Entegra Elektronik A.Ş." with contactName "Satış Departmanı", 7 gün tedarik → "Kaydedildi.", "Kayıtlı Tedarikçiler (1)" list appears ✓
- Product edit page BAOFENG UV-82: "Tedarikçi Bağlantıları" section at bottom, "Entegra Elektronik A.Ş." in dropdown ✓
- Link added: $14.50, 5 adet min. sipariş → table shows "Entegra Elektronik A.Ş. · $14.50 · 5 adet", "Kaldır" button ✓
- Entegra removed from dropdown after linking (no duplicate links possible) ✓
- tsc --noEmit: clean ✓
- Vercel deploy: READY (commit 6dde711) ✓
---

## Phase 21 — Import Cost Calculator
Status: DONE

Completed:
- `app/(app)/admin/import-calculator/page.tsx`: EXECUTIVE_READ-gated server page — fetches active suppliers, products (with 3 price fields), all supplierProducts, latest MonthlyExchangeRate; passes all as props to ImportCalculatorForm
- `components/suppliers/import-calculator-form.tsx`: fully client-side calculator, no new DB schema
  - 7 inputs: Tedarikçi (optional), Ürün (optional), Sipariş Adedi, Birim Maliyet USD, Toplam Nakliye USD, Gümrük Vergisi %, USD/TRY Kuru
  - Auto-fills unitCostUsd from SupplierProduct when supplier + product both selected
  - Pre-fills exchangeRate from latest MonthlyExchangeRate ("Son kayıtlı kur: X" hint shown)
  - `calculate()` formula: productTotal = qty × unitCostUsd; customs = productTotal × customsRate%; totalLanded = productTotal + freight + customs; unitLandedTry = (totalLanded / qty) × rate; breakEven = unitLandedTry × 1.20
  - "Maliyet Dökümü" output card: 7 rows — ürün maliyeti, nakliye, gümrük, toplam USD (bold), birim USD, birim TRY (bold), başa baş (amber)
  - "Kanal Bazlı Marj Analizi" card: Perakende / Pazar Yeri / Toptan rows; color-coded margin % (emerald ≥25%, amber ≥10%, red <10%); "Fiyat girilmemiş" when product not selected
  - Amber advisory banner at bottom
- `app/(app)/layout.tsx`: added "İthalat Hesaplayıcı" sidebar nav entry (EXECUTIVE_READ permission)
- "Hesaplama Mantığı" info card on page with 4 formula cells (blue)

Verified outcome (browser test 2026-05-17):
- /admin/import-calculator: page loads, heading "İthalat Maliyet Hesaplayıcısı", formula card, all inputs visible ✓
- Inputs filled: qty=10, unitCostUsd=14.5, freight=50, customs=5, rate=46 → Hesapla clicked ✓
- Maliyet Dökümü: Ürün $145.00 (10 × $14.50), Nakliye $50.00, Gümrük $7.25 (%5), Toplam $202.25, Birim USD $20.23, Birim TRY ₺930,35, Başa Baş ₺1.116,42 ✓
- Math verified manually: 10×14.5=145; 145×0.05=7.25; 145+50+7.25=202.25; 202.25/10=20.225; 20.225×46=930.35; 930.35×1.2=1116.42 ✓
- Kanal Bazlı Marj: "Fiyat girilmemiş" for all channels (no product selected — correct) ✓
- Amber uyarı banner visible ✓
- tsc --noEmit: clean ✓
- Vercel deploy: READY (commit 1117ed7) ✓

---

## Phase 22 — Executive KPI Dashboard
Status: DONE

Completed:
- `app/(app)/admin/executive/page.tsx`: EXECUTIVE_READ-gated server page — no new DB schema; reads from Product, CapitalConfig, MonthlyExchangeRate, MarketplaceListing tables via 4 parallel `Promise.all` queries
- `KpiCard` sub-component: label, value, sub caption, tone (default/success/danger/warning) with color-coded border + background
- `UrgencyPill` sub-component: label, count, tone — displays procurement urgency distribution
- **Row 1 KPIs**: Toplam Stok Değeri (TRY) — unitCostTry × stockQuantity across all active products with cost; Sıfır Stoklu Ürünler count; Minimum Altı Stok count; Aktif Pazar Yeri Listesi count
- **Row 2 KPIs**: USD/TRY Kuru from latest MonthlyExchangeRate (year/month label); Toplam Sermaye from CapitalConfig.totalCapitalTry; Tahmini Serbest Sermaye = totalCapital − stockValue − reserveAmount (20% default)
- **Tedarik Aciliyeti section**: runs `calculateProcurement()` per product; renders KRİTİK/YÜKSEK/ORTA/DÜŞÜK/YETERLİ/VERİ YOK pills with counts; "Toplam Önerilen Alım Maliyeti" for CRITICAL+HIGH products; "Tedarik Asistanı →" link
- **Kârlılık section**: runs `calculateProfitability()` per product; top-5 products by marketplace margin %; losing product count Badge; color-coded margin cells (emerald ≥25%, amber ≥10%, red <10%); "Pazar Kârlılığı →" link
- Footer quick-links: Sermaye Dağılımı →, Tedarik Asistanı →, İthalat Hesaplayıcısı →, Pazar Kârlılığı →, Döviz Kurları →
- `app/(app)/layout.tsx`: added "Yönetici Paneli" nav entry (EXECUTIVE_READ) before "Sermaye"
- `components/dashboard/sidebar.tsx`: updated info card to "Faz 22 aktif — Yönetici Paneli: stok değeri, kârlılık, tedarik aciliyeti."

Verified outcome (browser test 2026-05-17):
- /admin/executive: page loads with "Yönetici Paneli" heading and subtitle ✓
- Row 1: Toplam Stok Değeri ₺900 (1 maliyeti ürün), Sıfır Stoklu 603, Minimum Altı 1, Aktif Pazar Yeri 1 ✓
- Row 2: USD/TRY 46.0000 (2026/05), Toplam Sermaye ₺5.000.000, Tahmini Serbest ₺3.999.100 ✓
- Tedarik: KRİTİK 0, YÜKSEK 0, ORTA 0, DÜŞÜK 0, YETERLİ 0, VERİ YOK 651 — all pills render ✓
- Kârlılık: BAOFENG UV-82 TELSİZ shows %16.0 pazar yeri marjı, %38.3 perakende marjı ✓
- Footer links all visible: Sermaye Dağılımı, Tedarik Asistanı, İthalat Hesaplayıcısı, Pazar Kârlılığı, Döviz Kurları ✓
- Sidebar: "Yönetici Paneli" entry active (dark) before Sermaye ✓
- tsc --noEmit: clean ✓
- Vercel deploy: READY (commit ef5b8a3) ✓

---

## Phase 23 — Data Hygiene / SKU Governance
Status: DONE

Completed:
- `app/(app)/admin/data-hygiene/page.tsx`: EXECUTIVE_READ-gated server page — no new DB schema; single `prisma.product.findMany` query on active products with 12 selected fields + supplierLinks relation
- 8 hygiene checks computed in-memory:
  - `missingCost`: `!unitCostTry` — 650 products flagged
  - `missingRetailPrice`: `!sellingPriceTry`
  - `missingMarketplacePrice`: `!marketplacePriceTry`
  - `stockWithNoCost`: `stockQuantity > 0 && !unitCostTry` — 47 products flagged (highest priority)
  - `xmlNoPrice`: `xmlImported && !marketplacePriceTry && !sellingPriceTry`
  - `missingCategory`: `!categoryId`
  - `missingBarcode`: `!barcode`
  - `missingSupplier`: `supplierLinks.length === 0`
- Summary row: 4 `IssueCount` cards — Aktif Ürün, Tam Dolu Ürün, Toplam Sorun (danger if >50), Maliyetsiz Stoklu (danger if >0)
- `Section` component: title + subtitle + issue count pill (emerald "✓ Temiz" / red "N sorun")
- `EmptyState` component: emerald check message for passing sections
- `ProductTable` component: SKU / Ürün Adı / optional extra column / Düzenle → link to `/products/[id]/edit`
- "✓ Veri tabanı temiz" full-width emerald card shown when `totalIssues === 0`
- 8 sections in priority order: Maliyeti Eksik, Perakende Fiyatı Eksik, Pazar Yeri Fiyatı Eksik, Stokta Var Maliyeti Yok, XML Fiyatsız, Kategorisi Eksik, Barkodu Eksik, Tedarikçi Bağlantısı Eksik
- Footer quick-links: Ürünler ←, Yönetici Paneli →, Tedarik Asistanı →
- `app/(app)/layout.tsx`: added "Veri Hijyeni" nav entry (EXECUTIVE_READ) at end of ALL_NAV
- `components/dashboard/sidebar.tsx`: updated info card to "Faz 23 aktif — Veri Hijyeni: eksik maliyet, fiyat ve barkod raporları."

Verified outcome (browser test 2026-05-17):
- /admin/data-hygiene: page loads with "Veri Hijyeni" heading, "YÖNETİM / VERİ KALİTESİ" breadcrumb ✓
- Summary cards: 651 Aktif Ürün, 0 Tam Dolu Ürün, 4596 Toplam Sorun (red), 47 Maliyetsiz Stoklu (red) ✓
- Section 1 "Maliyeti Eksik Ürünler": 650 sorun pill, product table renders with real SKU/name rows and Düzenle → links ✓
- IssueCount tone: danger on 4596 total issues and 47 maliyetsiz stoklu ✓
- tsc --noEmit: clean ✓
- Vercel deploy: READY (commit 6fb3ec4) ✓

---

## Phase 24 — Backup / Rollback / Migration Safety
Status: DONE

Completed:
- `docs/MIGRATION-SAFETY.md`: pre-migration checklist (8 gates), Supabase backup checklist, rollback rules per operation type (ADD COLUMN/ADD TABLE/ADD UNIQUE/CASCADE/enum), seed/demo data separation rules, production write approval protocol, migration history reference (25 rows)
- `app/(app)/admin/safety/page.tsx`: EXECUTIVE_READ-gated server page — reads `_prisma_migrations` via `prisma.$queryRaw` (graceful error fallback); shows:
  - Summary cards: applied migration count (15), failed count (3 — amber warning on real production data), last migration name + timestamp
  - `CheckItem` sub-component: green ✓ or amber ! with label + detail per item
  - 8-item safety checklist: no failed migrations, NOT NULL discipline, unique constraint validation, seed-only discipline, CASCADE approval, PITR confirmation, rollback SQL documented, dangerous permission gate
  - `DangerRow` sub-component: CRITICAL/HIGH/MEDIUM pill with monospace operation and approval text
  - 9-row Tehlikeli İşlem Onay Kuralları table: DROP TABLE/COLUMN/INDEX, TRUNCATE, DELETE/UPDATE without WHERE, ALTER NOT NULL, CASCADE FK, enum removal
  - Migrasyon Geçmişi table: all rows from `_prisma_migrations` with "✓ Uygulandı" or "Hata" status and finished_at timestamp
  - Footer links: Yönetici Paneli ←, Veri Hijyeni →, Supabase Yedekleme ↗
- `app/(app)/layout.tsx`: added "Üretim Güvenliği" nav entry (EXECUTIVE_READ) after "Veri Hijyeni"
- `components/dashboard/sidebar.tsx`: updated info card to "Faz 24 aktif — Üretim Güvenliği"

Verified outcome (browser test 2026-05-17):
- /admin/safety: "YÖNETİM / ÜRETİM GÜVENLİĞİ" heading → "Migrasyon ve Güvenlik Merkezi" ✓
- Summary: 15 Uygulanan Migrasyon, 3 Başarısız (red card — real production data), last migration `20260516010000_phase6_customer_intelligence` ✓
- Checklist: amber "!" on first item (3 failed migrations detected), 7 remaining green ✓ checks ✓
- Tehlikeli İşlem table: all 9 rows render with CRITICAL/HIGH/MEDIUM pills ✓
- Migrasyon Geçmişi: `20260514013000_phase1_postgres_baseline` → "✓ Uygulandı" → 14.05.2026 00:38:38 ✓
- Sidebar: "Üretim Güvenliği" entry active (dark) in nav, "Veri Hijyeni" visible above ✓
- tsc --noEmit: clean ✓
- Vercel deploy: READY (commit fe56d98) ✓

---

## Phase 11C — Import Decision System
Status: PARTIAL

Completed:
- Migration `20260517060000_phase11c_import_decision`: added `weightKg DECIMAL(10,3)`, `customsRatePct DECIMAL(5,2)`, `shippingMethodPref TEXT` to Product table — all nullable, applied to production Supabase
- `lib/import-decision.ts`: full USD-first import economics engine
  - Constants: AIR_FREIGHT_PER_KG=8$/kg, SEA_FREIGHT_PER_KG=2$/kg, AIR_CYCLE_DAYS=120, SEA_CYCLE_DAYS=210, AIR_CAPITAL_MONTHS=4, SEA_CAPITAL_MONTHS=7, SEA_WIN_THRESHOLD=1.1, ALWAYS_STOCK_THRESHOLD=2.0, BUY_SMALL_THRESHOLD=1.4
  - `calculateImportDecision()`: validates required inputs, computes air + sea `ShippingScenario` objects (landedCostUsd, netRevenueUsd, profitRatio, monthlyProfitUsd, annualProfitUsd, requiredCapitalUsd, annualRoiMultiplier, inventoryDays)
  - Formula (from Top.ürünler workbook): landed = (source_usd + freight/kg × weight) × (1 + customs%/100), profit_ratio = net_revenue_usd / landed_cost, annual_roi = ratio^(365/cycleDays), sea_wins if sea_roi/air_roi ≥ 1.1
  - Decision: ALWAYS_STOCK if annual/capital > 2.0, BUY_SMALL if > 1.4, DO_NOT_BUY otherwise, MISSING_DATA if any required field is null
  - Owner shipping preference (`shippingMethodPref`) overrides system recommendation
  - `RECOMMENDATION_LABELS`, `RECOMMENDATION_TONES` for Turkish UI
- `app/(app)/admin/import-decisions/page.tsx`: EXECUTIVE_READ-gated server cockpit
  - Fetches `MonthlyExchangeRate` (latest, for live USD/TRY rate) and all active products with 15 fields in `Promise.all`
  - Summary tiles: HEP STOKTA OLMALI, AZ AL, ALMA, VERİ EKSİK — each clickable as filter
  - Filter bar: Tümü / Hava yolu / Deniz yolu / Filtreyi temizle — URL-based server-side filtering
  - Product table columns: Ürün name+SKU → detail link, Karar badge + missing field list, Skor, Yöntem (AIR/SEA with ✈/🚢), İniş Maliyeti, Kâr Oranı (colored), Aylık Kâr, Yıllık Kâr, Gerekli Sermaye, Talep/ay, Stok
  - Formula footnote card explaining the calculation source (Top.ürünler workbook)
  - `SummaryCard` component: tone-colored clickable filter tiles with active state
- Product detail `app/(app)/products/[id]/page.tsx`:
  - Added `prisma.monthlyExchangeRate.findFirst()` in parallel `Promise.all`
  - Computes `importDecision` from product fields and live USD/TRY rate
  - "İthalat Kararı" card: shows recommendation badge, air + sea scenario panels (side-by-side, highlighted on effective method), missing field list when VERİ EKSİK, formula footnote
- Product form `components/products/product-form.tsx`: new "İTHALAT KARARI GİRDİLERİ" section with Ağırlık (kg), Gümrük Oranı (%), Tercih Edilen Kargo Yöntemi (dropdown: Sistem / AIR / SEA)
- `types/products.ts`, `lib/validations/product.ts`, `lib/actions/product-actions.ts`: all extended with `weightKg`, `customsRatePct`, `shippingMethodPref`
- `app/(app)/products/[id]/edit/page.tsx`: initialValues extended with 3 new fields
- `app/(app)/layout.tsx`: added "İthalat Kararları" nav entry (EXECUTIVE_READ) after "İthalat Hesaplayıcı"
- `components/dashboard/sidebar.tsx`: updated info card to "Faz 11C aktif — İthalat Kararları: hava/deniz kargo ekonomisi, satın alma önerisi."

Verified outcome (browser test 2026-05-17):
- /admin/import-decisions: loads with "İthalat Kararları" heading, kur ₺46.00 (5/2026), summary tiles 0/0/0/651 VERİ EKSİK ✓
- Product table: 651 products all VERİ EKSİK (expected — no weight/customs data yet), missing field list per row ✓
- Filter bar: Tümü / Hava yolu / Deniz yolu buttons render, count shown ✓
- Product detail /products/cmp5ivh5p000004i2locmyr4m: "İthalat Kararı" card renders, VERİ EKSİK badge, missing fields listed (Ağırlık kg, Gümrük oranı %) ✓
- Product edit form: "İTHALAT KARARI GİRDİLERİ" section renders with all 3 fields, shipping method dropdown present ✓
- Sidebar: "İthalat Kararları" nav entry visible, "Faz 11C aktif" info card ✓
- prisma validate: clean ✓
- prisma generate: clean ✓
- tsc --noEmit: clean ✓
- npm run build: clean ✓
- Vercel deploy: READY (commit d811f75) ✓

---

## Phase 30 — Import Economics Normalization
Status: NOT STARTED

Required next:
- source purchase currency per product
- source purchase cost per product
- RMB/USD monthly rate support
- payment commission layer in the import decision engine
- route/profile freight defaults
- product override > profile override > global default precedence
- default AIR = 8 USD/kg when no override exists
- default SEA = 1 USD/kg when no override exists
- transparent step-by-step landed cost breakdown
- shared landed-cost engine across calculator, cockpit, procurement, capital, and executive dashboard

Reality check:
- current engine still expects `sourcePriceUsd`
- current engine does not yet support the owner formula `((RMB / rate) * (1 + paymentFee) + freight) * (1 + customs)`
- current engine is operationally useful as a prototype, not yet trustworthy as the final source of import-cost truth

---

## Phase 31 — Holding-Grade Import Governance
Status: NOT STARTED

Required next:
- entity-aware import defaults
- route/profile versioning by validity period
- decision snapshots by month and assumption set
- approval workflow before purchase commitment
- supplier-specific import policy inputs
- audit visibility for effective values used in each import recommendation

---

## Phase 32 — Marketplace Pricing Normalization
Status: NOT STARTED

Required next:
- XML marketplace price to marketplace mapping normalization
- separate xmlPrice, manualPrice, and activePrice governance
- per-marketplace shipping default rules
- per-marketplace shipping overrides
- per-marketplace commission defaults and overrides
- per-marketplace net remaining revenue calculation
- one canonical marketplace pricing service used across UI, import, and reporting

Reality check:
- current marketplace price handling is spread across product, XML snapshot, and profitability layers
- no canonical `ProductMarketplacePricing`-style truth exists yet
- marketplace-specific active/effective price governance is not complete

---

## Phase 25 — Product Operations UX
Status: DONE

Completed:
- `services/product-service.ts`: added `sort` to `ProductFilters`; `buildOrderBy()` for stock/price/name sorts; case-insensitive search on SKU/name/brand/model/barcode; `has_stock` filter; `images` (take:1) + `productCategory` included in query; margin sort done in JS post-fetch
- `components/products/product-filters.tsx`: complete rewrite — live search with 300ms debounce (`useEffect` + `useRef`), fires at ≥2 chars or on clear; compact filter pills for Durum (Tümü/Aktif/Pasif) and Stok (Tümü/Stokta var/Düşük stok); sort dropdown with 7 options (son güncellenen, stok ↓↑, fiyat ↓↑, marj ↓, isim A–Z); "Filtreyi temizle" button; product count badge
- `app/(app)/products/page.tsx`: complete rewrite — `getHealthCues()` per product (Düşük stok/warning, Görsel yok/default, Maliyet yok/danger, Fiyat yok/default, XML bayat/default); 7-column table: thumbnail 48×48 (lazy, object-contain, 📦 fallback) + ürün (name/SKU/brand·model) + kategori + fiyat (₺ formatted) + stok (amber if low, /minimumStock caption) + sağlık badges + aksiyon (Düzenle + Detay links)

Verified outcome (browser test 2026-05-17):
- /products: "Ürün kataloğu" heading, 651 ürün count in filter bar and footer ✓
- Search input visible: "SKU, ad, marka veya barkod ara (en az 2 karakter)", no submit button ✓
- Filter pills: DURUM Tümü/Aktif/Pasif + STOK Tümü/Stokta var/Düşük stok all render ✓
- Sort dropdown: "Son güncellenen" default + all 7 options ✓
- Thumbnail column: product images render for XML-imported products ✓
- Health cues per row: "Maliyet yok", "Fiyat yok", "Düşük stok" badges visible ✓
- Düzenle + Detay action links per row ✓
- tsc --noEmit: clean ✓
- npm run build: clean ✓
- Vercel deploy: READY (commit d2ec454) ✓

---

## Phase 26 - Product Performance Ranking
Status: DONE

Delivered:
- TrendyolSalesRecord model + migration (orderId/lineId unique index, FK to Product)
- syncTrendyolSalesAction: 90-day windowed pagination (4 windows × 90 days = 365 days), barcode/SKU product matching, upsert dedup, page-0 error surfacing
- SalesSyncButton client component with idle/loading/success/error states
- /admin/product-performance page: sync card with record/matched counts, top-20 ranking tables (30d qty, 30d revenue, all-time revenue), performance signal cards (high-revenue/zero-stock, low-margin/high-sales, high-stock/weak-sales)
- Product detail page (/products/[id]): "Trendyol Satış Performansı" card with 4 KPI tiles (son 30G satış, son 30G ciro, toplam satış, gerçekleşen marj), color-coded margin badge
- Cancelled order filtering (isCancelled helper — "iptal"/"cancel" substring check)
- Sidebar: "Satış Performansı" nav item under EXECUTIVE_READ permission

Browser verified:
- /admin/product-performance renders heading, sync card, 3 ranking tables — all loading correctly
- Sync button triggerable; surfacing error/success messages with order/line/match counts
- Per-product KPI card visible on product detail pages

---

## Phase 27 - Product Media and Content Studio
Status: DONE

Delivered (2026-05-17):
- ProductImageManager client component: multi-image grid — URL-add (Enter or Ekle, clears input), delete, set-primary (sortOrder 0 = Birincil badge), source badges (MANUEL/XML), image error fallback to 📦
- product-image-actions.ts: addProductImageByUrlAction, deleteProductImageAction, setPrimaryImageAction, uploadProductImageAction (Supabase Storage REST API, no SDK)
- RichTextEditor (Tiptap): SSR-safe with mounted guard, toolbar with H2/H3/Bold/Italic/BulletList/OrderedList, outputs HTML, syncs external value changes via ref loop prevention
- product-form.tsx: description textarea replaced with RichTextEditor; xmlDescription prop shows blue XML source card with "Editöre taşı" button for governed opt-in copy
- Product edit page: Medya Stüdyosu card (Phase 27) + Tedarikçi card (Phase 20) in order; canUpload flag evaluated server-side (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
- .env.example: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY documented with bucket setup instructions
- XML sync already governs description (existing products never overwritten by XML sync) — no migration needed
- No new DB schema — uses existing ProductImage model (Phase 11A)

Browser verified (2026-05-17):
- /products/[id]/edit: Medya Stüdyosu card renders with empty state "Henüz görsel eklenmemiş" ✓
- URL-add flow: entered URL → Enter → "MANUEL Birincil" card appeared, input cleared, "✓ Görsel eklendi" feedback ✓
- Page reload: image persisted in DB (ProductImage row confirmed) ✓
- RichTextEditor: toolbar rendered with Başlık 2/3, Kalın, İtalik, Madde/Numaralı liste ✓
- Editor loaded existing description content `<p>Baofeng UV-82 Telsiz</p>` ✓
- XML description card: correctly hidden when xmlDescription is null in feed ✓
- Supabase Storage notice shown when env vars not configured ✓
- tsc --noEmit: clean ✓
- Vercel deploy: READY (commit ab1a8ef) ✓

---

## Phase 28 - Product Governance and Private Intelligence
Status: DONE

Delivered (2026-05-17):
- Product.privateNote TEXT column — safe additive migration (20260517120000_phase28_private_note), applied to production DB
- updatePrivateNoteAction: separate server action gated by EXECUTIVE_READ + PRODUCTS_UPDATE; never touched by the main product update flow
- PrivateNoteEditor client component: standalone textarea with char counter (0/5000), amber badge "🔒 Sadece sahip görebilir", "Notu kaydet" button with pending/saved/error states
- Product edit page: canViewPrivate flag (EXECUTIVE_READ check server-side), amber-accented "Faz 28 — Özel Zeka" card rendered only when authorized
- Product detail page: "Tedarikçi Kaynağı" card (always visible when supplier links exist, shows ★ Tercihli badge + cost/lead days/MOQ); "🔒 Özel Not" read-only card (EXECUTIVE_READ gated, only when privateNote is non-null)
- description validation max increased from 2000 → 10000 to accommodate Tiptap HTML output
- XML sync field governance: normalizeProductData explicitly omits privateNote — XML import can never overwrite owner intelligence

Browser verified (2026-05-17):
- Edit page loads after migration applied ✓
- PrivateNoteEditor visible (amber card with 🔒 badge, textarea, "Notu kaydet" button) ✓
- Note saved to DB via updatePrivateNoteAction: "Browser test notu: UV-82 için Çin'den ithalat planı — 2026-05-17 Phase 28 doğrulama." confirmed in Supabase ✓
- Detail page shows note under "🔒 Özel Not" card ✓
- Detail page shows "Tedarikçi Kaynağı" supplier summary card ✓
- tsc --noEmit: clean ✓
- Vercel deploy: READY (commit ceac815) ✓

Planned scope (partially deferred to future iteration):
- tighter product edit activation by approved permission groups
- XML overwrite boundaries for curated product fields
- supplier workflow polish, preferred supplier behavior, and per-product sourcing context

Current gap:
- product collaboration and private sourcing knowledge are not yet governed at the depth the owner requested

---

# Technical Debt

- no image pipeline
- no audit-grade event history
- no production-ready product sales snapshot layer for 30-day ranking
- no owner-only private product intelligence layer
- no fully governed XML-versus-curated product field overwrite policy in active UI
- no full persisted Trendyol order ledger with trusted newest-first history view
- no full persisted Trendyol return ledger linked back to order rows
- no canonical auto-backfill workflow for marketplace product mappings
- no marketplace margin policy formally validated against the owner workbook logic
- no RMB-first import finance model
- no RMB/USD exchange-rate layer
- no payment commission layer in the import decision engine
- no route/profile-aware freight default hierarchy
- no import decision snapshot governance
- no canonical marketplace pricing service for XML/manual/effective marketplace values
- no per-marketplace shipping default engine with override governance
- no per-marketplace commission/effective net revenue truth layer

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

Strategically strong now:
- procurement intelligence (Phases 19–21 complete)
- executive KPI overview (Phase 22 complete)

## Not Owner-Intelligence Ready

Implemented (owner-intelligence partial):
- profitability engine (Phase 8) ✓
- capital allocation engine (Phase 10) ✓
- marketplace performance intelligence (Phase 15) ✓

Owner-intelligence now fully implemented through Phase 22:
- profitability engine (Phase 8) ✓
- capital allocation engine (Phase 10) ✓
- marketplace performance intelligence (Phase 15) ✓
- procurement intelligence (Phases 19–21) ✓
- executive KPI dashboard (Phase 22) ✓

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
2026-05-17 (Phase 28 browser-verified)

Alignment source:
`ROADMAP.md`

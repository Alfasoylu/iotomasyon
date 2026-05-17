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

What it does not mean:
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

---

## Procurement State

PARTIAL

Current meaning:
- procurement engine — DONE (Phase 19): /admin/procurement, reorder urgency engine, ranked purchase table, financial summary
- supplier intelligence — DONE (Phase 20): /admin/suppliers, Supplier + SupplierProduct, product edit supplier link section
- pre-purchase import cost calculator — NOT IMPLEMENTED (Phase 21)

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
- executive KPI dashboard — NOT IMPLEMENTED (Phase 22)
- recommendation-grade owner intelligence system — NOT IMPLEMENTED (requires Phase 22 + procurement layers)

---

## Known Technical Debt

- no image pipeline
- no audit-grade event history
- no audit-grade event history for financial, permission, stock, marketplace, or quote changes
- no procurement engine

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

Not strategically mature:
- procurement decisions (no supplier model, no reorder signals)
- executive KPI dashboard (Phase 22 not implemented)

### Owner Intelligence Readiness

Partially owner-intelligence ready.

Implemented:
- profitability engine (Phase 8) ✓
- sales potential engine / investment scoring (Phase 9) ✓
- capital allocation engine (Phase 10) ✓
- marketplace performance visibility (Phase 15) ✓

Still missing for full owner-intelligence readiness:
- executive KPI dashboard (Phase 22)
- import cost calculator (Phase 21)
- supplier lead-time data populated into products (for non-UNKNOWN urgency in Phase 19)

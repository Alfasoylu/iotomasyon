# Current State

## Product Identity

IOTOMASYON is evolving from an internal CRM into an internal business operating system for Soylu Elektronik.

It is not yet that full operating system.

Today, it is best described as:
- an internal CRM foundation
- a quote and sales workflow foundation
- a relationship-aware operational panel

It is not yet:
- a marketplace operating system
- a procurement intelligence system
- an owner-intelligence dashboard
- a capital allocation engine

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

Current quote limitations:
- no reusable quote templates
- no quote workflow v2 speed system
- no advanced pricing-rule engine
- no owner-grade commercial intelligence layer

---

## Marketplace State

NOT IMPLEMENTED

Current meaning:
- no marketplace registry
- no marketplace monitoring
- no Trendyol read dashboard
- no marketplace profitability layer
- no marketplace sync architecture

---

## Procurement State

NOT IMPLEMENTED

Current meaning:
- no procurement engine
- no supplier intelligence
- no capital allocation engine
- no pre-purchase import cost calculator

---

## Intelligence State

PARTIAL

Current meaning:
- profitability engine — DONE (Phase 8): per-channel net profit, margin %, ROI %, losing product identification
- sales potential engine — DONE (Phase 9): investment score, BUY/WAIT/DO_NOT_BUY signal
- executive KPI dashboard — NOT IMPLEMENTED
- recommendation-grade owner intelligence system — NOT IMPLEMENTED

---

## Known Technical Debt

- product cost model incomplete (Phase 8 profitability engine not yet implemented)
- no marketplace schema
- no XML ingestion architecture
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
- pricing intelligence
- profitability intelligence
- procurement decisions
- marketplace decisions

### Owner Intelligence Readiness

Not owner-intelligence ready.

Missing:
- profitability engine
- executive KPI dashboard
- capital allocation engine
- procurement intelligence
- marketplace performance intelligence
- supplier intelligence

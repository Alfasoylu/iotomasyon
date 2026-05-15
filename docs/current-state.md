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
- RBAC foundation
- admin user management
- product management
- category management
- attribute system
- customer CRM
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
- RBAC foundation exists
- protected routes exist
- app shell protection exists

Current limitation:
- RBAC is not yet roadmap-complete

Meaning:
- server-side permission enforcement and permission-aware navigation exist
- broader restricted-user rollout still needs acceptance validation

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
- inventory intelligence exists
- profitability-ready product costing exists
- governance-grade product data quality exists

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

NOT IMPLEMENTED

Current meaning:
- no profitability engine
- no sales potential engine
- no executive KPI dashboard
- no recommendation-grade owner intelligence system

---

## Known Technical Debt

- RBAC foundation exists but is not yet rollout-complete
- product cost model incomplete
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

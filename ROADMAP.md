# IOTOMASYON Roadmap

## Product Vision

IOTOMASYON is NOT a generic CRM.

IOTOMASYON is the internal operating system for Soylu Elektronik.

Primary mission:
- grow sales faster
- control inventory precisely
- maximize capital efficiency
- identify profitable products
- eliminate stock blindness
- unify customer + product + sales + marketplace intelligence in one panel

Long-term mission:
Replace fragmented tools (Entegra + spreadsheets + manual marketplace checks + disconnected CRM workflows) with one centralized operational platform.

Core business model:
Importer + distributor + e-commerce + marketplace operator.

Primary user:
Admin (business owner)

Secondary users:
Sales staff
Operations staff
Marketplace staff

Language:
Turkish-only UI

Target scale (initial):
- 200 products
- 50 categories
- 500–5000 customers
- multiple sales channels

Infrastructure:
- Next.js App Router
- TypeScript
- Prisma
- Supabase PostgreSQL
- Vercel

---

# Current Status

Current modules:
- authentication
- product management
- category management
- customer CRM
- quote management
- task management
- outreach/campaigns
- Turkish location selection
- PDF quote generation
- search
- activity

Known missing core systems:
- RBAC / permissions
- inventory intelligence
- procurement planning
- capital allocation engine
- marketplace integration
- XML inventory sync
- product profitability engine
- return analytics
- listing coverage monitoring
- image pipeline
- product import intelligence

---

# Product Rules

## Rule 1
Admin sees everything.

## Rule 2
Staff only sees explicitly granted modules.

## Rule 3
Financial intelligence is admin-only.

This includes:
- cost price
- capital allocation
- margin
- profitability
- reorder suggestions
- investment scoring
- procurement intelligence

## Rule 4
No ERP bloat.

Only systems that directly increase:
- speed
- profit
- inventory accuracy
- sales output

---

# Completed Phases

## Phase 0 — Foundation
DONE

Completed:
- Next.js setup
- TypeScript
- Tailwind
- ESLint
- project architecture

Exit: DONE

---

## Phase 1 — Core Platform
DONE

Completed:
- Prisma
- Supabase
- auth
- protected shell
- login/logout

Exit: DONE

---

## Phase 2 — CRM Core
DONE

Completed:
- customer CRUD
- customer notes
- task linking
- customer lifecycle
- quote workflow

Exit: DONE

---

## Phase 3 — Sales Workflow
DONE

Completed:
- quote generation
- PDF export
- WhatsApp sharing
- quote listing
- quote editing
- quote workflow v1 operational

Exit: DONE

---

## Phase 4 — Category / Product Relationships
PARTIAL

Completed:
- product categories
- product/customer interest linking
- category/customer interest linking
- attribute system

Still missing:
- customer segmentation
- product scoring
- opportunity intelligence

Exit: PARTIAL

---

# ACTIVE ROADMAP

# Phase 5 — Role Based Access Control (RBAC)

Goal:
Multi-user internal company system.

Required:

User roles:
- Admin
- Sales
- Operations
- Marketplace Operator
- Custom Role

Admin capabilities:
- create user
- assign email/password
- enable/disable user
- assign module permissions
- assign page visibility
- reset passwords

No email verification required.

Permissions:
- products
- customers
- quotes
- tasks
- campaigns
- marketplace
- listings
- inventory
- reports
- profitability
- procurement

Financial permissions:
admin-only

Exit criteria:
- admin can create accounts
- restricted users cannot access blocked routes
- sidebar visibility permission-aware
- server-side permission enforcement active

---

# Phase 6 — Customer Intelligence Expansion

Goal:
Real sales segmentation.

Customer types:
- toptan
- perakende
- site yöneticisi
- güvenlik şirketi
- mağaza
- online satıcı
- custom

Required:
- customer type tagging
- filtering
- customer opportunity notes
- monthly sales potential field
- preferred products
- category interest
- platform notes

Views:
Product page should show:
- interested customers
- customer types
- sales opportunities

Category page should show:
- relevant customers

Exit criteria:
sales can identify who to pitch within seconds

---

# Phase 7 — Inventory Intelligence Core

Goal:
Real inventory memory.

Per product required fields:
- SKU
- barcode
- product image
- supplier
- import date
- imported quantity
- landed unit cost
- warehouse count date
- counted stock quantity
- standard shipping cost
- editable shipping override
- standard marketplace commission
- editable commission override

Image rules:
- upload OR URL
- auto compression
- auto resize
- Vercel-safe storage strategy

Exit criteria:
every product becomes financially traceable

---

# Phase 8 — Profitability Engine

Goal:
Know true product profitability.

Metrics:
- unit cost
- avg cost
- shipping
- commission
- selling price
- return cost
- net profit
- margin %
- ROI %

Views:
Per product:
- retail profitability
- wholesale profitability
- marketplace profitability

Rules:
default commission = 20%
editable manually

Exit criteria:
system identifies losing products

---

# Phase 9 — Sales Potential Engine

Goal:
Data-driven purchasing.

Per product:
- online monthly sales potential
- wholesale monthly sales potential
- security installer monthly potential
- custom demand channels

Derived:
- projected revenue
- projected profit
- turnover speed
- investment score

Decision output:
BUY / DO NOT BUY

Exit criteria:
product investment scoring operational

---

# Phase 10 — Capital Allocation Engine

ADMIN ONLY

Goal:
Maximize capital growth.

Inputs:
- total capital
- locked stock capital
- available capital
- min reorder thresholds
- desired turnover period

Logic:
system prioritizes TOP profitable products.

NOT equal distribution.

Example:
100,000 USD capital
60,000 USD locked
40,000 USD available

Engine outputs:
- recommended products
- suggested quantities
- capital allocation per SKU
- expected ROI

Exit criteria:
owner gets purchase suggestions

---

# Phase 11 — XML Inventory Sync

Goal:
Connect Entegra.

Requirements:
- XML fetch
- scheduled sync
- stock updates
- normal price
- dealer price

Rules:
manual override allowed

Exit criteria:
inventory updates automatically

---

# Phase 12 — Marketplace Listing Registry

Goal:
Know where products are live.

Platforms:
- Trendyol
- Hepsiburada
- n11
- PttAVM
- Koçtaş
- Teknosa
- Temu
- custom

Rules:
multiple marketplace listings can map to one SKU

Example:
1 SKU → 15 Trendyol listings

Per listing:
- platform
- listing URL
- listing barcode
- listing SKU
- listing title
- active/inactive

Exit criteria:
listing visibility complete

---

# Phase 13 — Marketplace Monitoring

Goal:
Detect listing gaps.

Alerts:
- product not listed
- broken listing
- stock mismatch
- zero stock but listing active
- high stock but not listed

Tasks:
auto task creation

Example:
"SKU X not listed on Trendyol"

Exit criteria:
coverage monitoring works

---

# Phase 14 — Trendyol API Integration (READ ONLY)

Goal:
Safe first marketplace integration.

Required:
- order sync
- return sync
- return reasons
- commission visibility
- order profitability
- listing matching

No write operations.

Exit criteria:
Trendyol intelligence dashboard active

---

# Phase 15 — Marketplace Profit Dashboard

Goal:
Channel profitability visibility.

Metrics:
- units sold
- revenue
- returns
- return reasons
- commissions
- shipping
- net margin

Views:
- per product
- per platform
- top winners
- top losers

Exit criteria:
owner sees best channels instantly

---

# Phase 16 — Marketplace Expansion

Platforms:
- Hepsiburada
- n11
- Temu
- IdeaSoft
- other APIs

Exit criteria:
multi-channel visibility

---

# Phase 17 — Marketplace Control Tower

Goal:
Single control panel.

Future:
- stock sync
- price sync
- listing updates
- bulk controls

This phase requires explicit approval.

Exit:
not before architecture review

---

# Phase 18 — Quote Professionalization 2.0

Goal:
Fast wholesale quoting.

Required:
- reusable quote templates
- premium branding
- saved layouts
- quick product insertion
- custom pricing rules
- quote workflow v2 speed optimization

Exit:
quote creation under 60 seconds

---

# Phase 19 — Procurement Intelligence

Goal:
Purchasing assistant.

Signals:
- stock velocity
- sales velocity
- margin
- ROI
- return risk
- available capital

Outputs:
- reorder now
- wait
- stop buying
- test small quantity

Exit:
procurement assistant operational

---

# Phase Exit Rules

A phase is complete only if:
- schema stable
- permissions correct
- build passes
- lint passes
- route protection works
- no critical regressions
- documentation updated
- production-safe migration plan approved

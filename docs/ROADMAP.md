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
- supplier intelligence
- import cost calculator
- SKU/barcode data hygiene
- audit log governance
- backup / rollback strategy
- executive KPI dashboard
- task automation rules

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

## Rule 5
Every important business action must be traceable.

This includes:
- product cost changes
- stock changes
- marketplace listing changes
- customer status changes
- quote changes
- permission changes

## Rule 6
Marketplace write operations are forbidden until read-only dashboards are stable.

## Rule 7
Procurement suggestions must never allocate all available capital automatically.
Admin approval is required.

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
- stock source
- stock confidence level
- last stock sync date
- last manual stock count user
- minimum stock threshold
- reorder lead time
- shelf/location code
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
- VAT impact
- packaging cost
- marketplace service fee
- payment fee
- defect/return reserve
- landed cost history

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

Safety rules:
- never allocate 100% of available capital
- keep reserve capital percentage
- admin approval required before purchase action
- rank products by ROI + velocity + risk

Exit criteria:
owner gets purchase suggestions

---

# Phase 11 — XML Inventory Sync

Goal:
Connect Entegra.

Requirements:
- XML fetch
- XML source configuration
- scheduled sync
- stock updates
- normal price
- dealer price
- sync logs
- failed sync alerts
- manual override protection
- price update preview before applying

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
- platform listing ID
- listing URL
- listing barcode
- listing SKU
- listing title
- active/inactive
- last checked date
- last known status
- linked/unlinked status
- responsible staff user
- notes

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

Monitoring rules:
- monitoring frequency
- broken URL detection
- listing missing task creation
- high stock but no listing alert
- zero stock but live listing alert
- stale listing check

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

READ ONLY means:
- no stock push
- no price push
- no listing update
- no order status update

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
- product-level return rate
- platform-level return rate
- net profit after returns
- top 50 winners
- top 50 losers
- products with sales but low margin
- products with high stock but low sales

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
- supplier lead time
- MOQ
- defect rate
- supplier reliability
- reorder urgency
- expected cash conversion time

Outputs:
- reorder now
- wait
- stop buying
- test small quantity

Exit:
procurement assistant operational

---

# Phase 20 — Supplier Intelligence

Goal:
Know which suppliers help the business grow profitably.

Required:
- supplier list
- supplier contact info
- supplier product relations
- MOQ
- lead time
- defect rate
- return/complaint history
- purchase history
- average landed cost
- reliability score

Exit:
admin can compare suppliers by profit, speed and reliability.

---

# Phase 21 — Import Cost Calculator

Goal:
Calculate true landed cost before buying.

Inputs:
- RMB product price
- USD product price
- exchange rates
- carton quantity
- carton weight
- shipping method
- shipping cost
- customs multiplier
- other expenses

Outputs:
- landed unit cost
- recommended selling price
- estimated margin
- estimated ROI
- buy / do not buy signal

Exit:
admin can evaluate imports before ordering.

---

# Phase 22 — Executive KPI Dashboard

Goal:
Give admin one screen to control the business.

Widgets:
- total stock value
- available capital
- monthly revenue
- monthly gross profit
- estimated net profit
- top 50 profitable products
- slow moving stock
- high return products
- missing marketplace listings
- low stock alerts
- procurement recommendations
- open sales tasks
- quote conversion rate

Exit:
admin can understand business health in under 60 seconds.

---

# Phase 23 — Data Hygiene / SKU Governance

Goal:
Prevent bad data from destroying reports.

Required:
- duplicate SKU detection
- duplicate barcode detection
- missing barcode report
- missing cost report
- missing category report
- missing marketplace link report
- invalid price report
- orphan marketplace listing report

Exit:
admin can clean bad product data before automation.

---

# Phase 24 — Backup / Rollback / Migration Safety

Goal:
Protect production data.

Required:
- pre-migration checklist
- Supabase backup checklist
- rollback notes for every migration
- seed/demo data separation
- production write approval rule
- dangerous operation warning

Exit:
production changes become safer.

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

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
- full paginated order backfill
- newest-first order visibility
- persistent order ledger
- return sync
- full paginated return/claim backfill
- persistent return ledger
- incremental sync without historical data loss
- order/return matching by stable identifiers
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

Order ledger rules:
- API data must be persisted locally
- API disappearance must not delete historical marketplace data
- if API sends updates later, existing records must be updated
- default order sorting must be latest first

Return linkage rules:
- returned or cancelled orders must be visible directly in the orders flow
- orders with linked claims should show return/cancel state clearly
- partial return state should be supported when possible

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
- effective commission
- effective shipping cost
- realized product margin from persisted order data
- top 50 winners
- top 50 losers
- products with sales but low margin
- products with high stock but low sales

Views:
- per product
- per platform
- top winners
- top losers

Margin policy:
- standard marketplace commission must exist
- commission override must remain possible
- standard shipping cost must exist
- shipping override must remain possible
- the effective value used in calculations must be obvious
- marketplace margin formula should be validated against the owner workbook logic before being treated as final truth

Ranking requirements:
- sort by last 30 days sales quantity
- sort by last 30 days revenue
- sort by total revenue
- sort by trusted realized margin

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

Registry and matching requirements:
- marketplace-to-product matching must be persistent
- once a barcode/SKU mapping is approved, future records should auto-match to the same product
- historical unmatched records should be backfilled when a new mapping is created
- unmatched marketplace items must be easy to review and resolve
- mapping safety must prefer explicit registry matches over weak guesswork

Operational views:
- unmatched marketplace items inbox
- mapping audit visibility
- order matching confidence visibility

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
- import decision snapshot quality
- shipping profile quality
- payment commission impact
- RMB-origin import economics

Outputs:
- reorder now
- wait
- stop buying
- test small quantity
- AIR / SEA rationale
- missing-data diagnosis
- capital-at-risk visibility

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
- supplier-specific purchase currency
- supplier-specific payment commission defaults
- supplier-specific freight profile defaults

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
- payment commission
- source purchase currency
- route/profile-specific freight defaults
- RMB/USD monthly rate
- USD/TRY monthly rate

Outputs:
- landed unit cost
- recommended selling price
- estimated margin
- estimated ROI
- buy / do not buy signal
- transparent step-by-step landed cost breakdown
- AIR vs SEA scenario comparison
- effective value trace:
  - default
  - profile override
  - product override

Cost formula requirements:
- RMB-based imports must support:
  - `(rmb_cost / rmb_usd_rate)`
  - `payment commission uplift`
  - `freight by kg and method`
  - `customs multiplier`
- default freight values when no override exists:
  - AIR = 8 USD/kg
  - SEA = 1 USD/kg
- defaults must remain overridable by product / route / profile

Governance requirements:
- one canonical landed cost engine must be shared across:
  - import calculator
  - import decision cockpit
  - procurement assistant
  - capital allocation
  - executive dashboard
- historical decision snapshots must preserve the month, rates, freight assumptions, and effective values used

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
- import method distribution
- landed cost trend visibility
- capital locked by import scenario
- missing import-data alerts

Exit:
admin can understand business health in under 60 seconds.

---

# Phase 30 — Import Economics Normalization

Goal:
Make import economics trustworthy enough for active daily use.

Required:
- source purchase currency per product
- source purchase cost per product
- RMB/USD monthly exchange rate support
- USD/TRY monthly exchange rate support
- payment commission input
- route/profile freight defaults
- product-level freight overrides
- AIR default = 8 USD/kg when no override exists
- SEA default = 1 USD/kg when no override exists
- transparent formula breakdown in UI
- one canonical landed cost engine shared across import-related modules

Exit:
the owner can trust the landed-cost math without checking external spreadsheets.

---

# Phase 31 — Holding-Grade Import Governance

Goal:
Turn the import decision system into a multi-entity, auditable financial control surface.

Required:
- company/entity-aware import defaults
- route profiles with validity periods
- scenario versioning by month
- decision snapshot history
- approval workflow before purchase commitment
- supplier-specific import policies
- audit visibility for effective values used in each decision
- shared import-economics truth across procurement, capital, and executive reporting

Exit:
import decisions remain explainable, auditable, and governable at holding level.

---

# Phase 32 — Marketplace Pricing Normalization

Goal:
Normalize marketplace-specific price, shipping, commission, and net remaining revenue logic.

Required:
- XML marketplace prices must map cleanly to the correct marketplace
- XML price and manual price must remain separate truths
- active/effective price must be derived from XML + override rules
- per-marketplace shipping defaults must be calculated automatically
- per-marketplace shipping override must be supported
- per-marketplace commission defaults must be supported
- per-marketplace commission override must be supported
- per-marketplace net remaining revenue must be visible
- one canonical marketplace pricing engine must be shared across UI, import, and reporting

Shipping defaults:
- if active marketplace price < 5 USD: shipping fee = 1.2 USD
- if active marketplace price is between 5 and 7.5 USD: shipping fee = 2 USD
- if active marketplace price > 7.5 USD: shipping fee = 3.3 USD
- if weight < 2 kg and active marketplace price < 5 USD: shipping remains 1.2 USD

Commission defaults:
- default commission rate = 20%
- commission amount = active marketplace price × commission rate

Net remaining revenue:
- net remaining revenue = active marketplace price - shipping fee - commission amount

Product detail requirements:
- marketplace name
- XML price
- active/effective price
- shipping fee
- commission rate
- commission amount
- net remaining revenue
- manual override visibility

Governance rules:
- manual marketplace overrides must not be overwritten by XML sync
- XML is source data, not final product truth
- marketplace pricing logic must not be duplicated across multiple services/files

Exit:
marketplace-specific net revenue is explainable, overridable, and trustworthy without spreadsheet fallback.

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

# Phase 25 - Product Operations UX

Goal:
Turn the product list into a fast daily operations surface.

Required:
- product list thumbnails
- dynamic contains-search that starts after the second character
- no submit-button dependency for product filtering
- stock-only filter
- compact sort/filter drawer so many sort modes do not clutter the page
- sorting by:
  - last updated
  - stock quantity
  - selling price
  - profit margin when margin data is trustworthy
- low-stock and data-missing visual signals
- stable list UX without layout breakage

Exit:
owner and staff can find, scan, and triage products quickly without relying on manual page refresh patterns.

---

# Phase 26 - Product Performance Ranking

Goal:
Rank products by real commercial performance, not only static catalog fields.

Required:
- last 30 days sales quantity ranking
- last 30 days revenue ranking
- total revenue ranking
- realized margin visibility on product detail
- margin-based product sorting
- sales snapshot / aggregation layer that makes these rankings trustworthy
- product performance filters that distinguish low-stock, high-revenue, and low-margin items

Exit:
the product list can be used as a commercial leaderboard, not just a catalog table.

---

# Phase 27 - Product Media and Content Studio

Goal:
Make product content editable inside IOTOMASYON without external workarounds.

Required:
- multi-image product management
- delete existing images
- add image by URL with enter-to-append workflow
- repeatable URL entry without page refresh friction
- local computer upload support
- primary image visibility in list and detail views
- e-commerce style rich text description editor
- XML description vs manual description separation
- formatting controls suitable for marketplace/product content authoring

Exit:
the owner can manage product images and descriptions fully inside IOTOMASYON.

---

# Phase 28 - Product Governance and Private Intelligence

Goal:
Protect curated product knowledge while supporting controlled collaboration.

Required:
- owner-only product private notes
- supplier contact / source notes per product
- website link notes that are hidden from other users
- product edit activation limited by approved user groups / permissions
- XML import rules that only overwrite allowed fields such as stock and price
- multiple supplier workflow polish
- preferred supplier selection
- supplier-specific commercial inputs such as MOQ, lead time, and cost context
- clear source governance between XML data and manually curated product truth

Exit:
product knowledge becomes private where needed, collaborative where allowed, and protected from unwanted source overwrites.

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

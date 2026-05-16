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
- owner-grade intelligence system does not exist yet
- marketplace intelligence system does not exist yet
- procurement intelligence system does not exist yet

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
- CustomerType enum: RETAILER, WHOLESALER, DISTRIBUTOR, CONTRACTOR, END_USER, OTHER
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
Status: NOT STARTED

Missing:
- inventory memory fields from roadmap
- stock source tracking
- stock confidence level
- lead time intelligence
- financially traceable stock layer

---

## Phase 8 — Profitability Engine
Status: NOT STARTED

Missing:
- cost intelligence
- profitability metrics
- marketplace profitability logic
- landed cost history
- return reserve logic

---

## Phase 9 — Sales Potential Engine
Status: NOT STARTED

Missing:
- demand channel potential
- projected revenue
- projected profit
- investment score
- BUY / DO NOT BUY decision output

---

## Phase 10 — Capital Allocation Engine
Status: NOT STARTED

Missing:
- capital input model
- reserve rules
- allocation logic
- ROI + velocity + risk ranking
- admin approval gate for purchase suggestions

---

## Phase 11 — XML Inventory Sync
Status: NOT STARTED

Missing:
- XML source configuration
- scheduled sync architecture
- sync logs
- failed sync alerts
- preview-before-apply workflow

---

## Phase 12 — Marketplace Listing Registry
Status: NOT STARTED

Missing:
- marketplace listing schema
- listing relation model
- listing ownership fields
- listing status registry
- listing notes and audit support

---

## Phase 13 — Marketplace Monitoring
Status: NOT STARTED

Missing:
- listing monitoring frequency
- broken URL detection
- stale listing logic
- listing gap alerts
- auto task generation for listing issues

---

## Phase 14 — Trendyol API Integration (READ ONLY)
Status: NOT STARTED

Missing:
- Trendyol API ingestion
- order sync
- return sync
- commission visibility
- read-only dashboard contract

---

## Phase 15 — Marketplace Profit Dashboard
Status: NOT STARTED

Missing:
- per-platform profitability layer
- return-rate metrics
- winner/loser rankings
- low-margin alerts
- high-stock low-sales visibility

---

## Phase 16 — Marketplace Expansion
Status: NOT STARTED

Missing:
- non-Trendyol marketplace connectors
- multi-channel visibility layer

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

- product cost model incomplete (Phase 7+)
- product cost model incomplete
- no marketplace schema
- no XML ingestion architecture
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
- roadmap includes deep multi-channel operations
- current implementation has no marketplace foundation yet

Impact:
- future implementation risk is high

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
- profitability decisions
- procurement decisions
- marketplace decisions
- capital allocation decisions

## Not Owner-Intelligence Ready

Missing for owner-intelligence readiness:
- profitability engine
- executive KPI dashboard
- capital allocation engine
- procurement intelligence
- marketplace performance intelligence
- supplier intelligence

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
2026-05-16

Alignment source:
`ROADMAP.md`

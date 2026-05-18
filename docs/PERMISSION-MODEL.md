# PERMISSION MODEL

## Purpose

This document defines the authorization model for IOTOMASYON.

Phase 5 Status: **COMPLETE and PRODUCTION-ACTIVE** (deployed 2026-05-16)

What is live:
- 6 roles seeded: ADMIN, SALES, OPERATIONS, WAREHOUSE, MARKETPLACE_OPERATOR, CUSTOM
- 62 permissions seeded across 12 categories
- `resolvePermission()` 6-step engine enforced server-side on all routes and actions
- Per-user override UI with Varsayılan → Verildi → Engellendi cycle
- Zero-access redirect to /no-access
- 22 automated unit tests passing

Modules now active (permission-guarded routes exist):
- inventory.* — product inventory fields active since Phase 7
- xml.* — /admin/xml-sync active since Phase 11 (EXECUTIVE_READ gate)
- marketplaceListings.* — /marketplace and /marketplace/monitoring active since Phase 12–13
- marketplaceAnalytics.read, marketplaceOrders.read, marketplaceReturns.read — /marketplace/trendyol and /marketplace/profit active since Phase 14–15
- executive.read — /admin/capital, /admin/xml-sync, /admin/trendyol gated since Phase 10

Still deferred (no routes implemented yet):
- procurement.*, suppliers.* — Phases 19–21
- profitability.read, profitability.configure — profitability display currently uses executive.read gate; dedicated permission not yet wired
- marketplace write controls (marketplace.stockPush, marketplace.pricePush, marketplace.listingUpdate) — Phase 17 DEFERRED

---

# Permission Resolution Engine

## `resolvePermission()` — 6-Step Algorithm

Step 1 — DANGEROUS gate:
- If the permission is in DANGEROUS_PERMISSIONS (`migrations.approve`, `destructiveActions.approve`):
  - Check for explicit deny override → return false
  - Check for explicit grant override → return true
  - Otherwise → return false (no role or ADMIN bypass applies)

Step 2 — ADMIN bypass:
- If `user.role === "ADMIN"` → return true (all non-dangerous permissions)

Step 3 — Explicit deny:
- If user has a UserPermission with `granted = false` → return false

Step 4 — Explicit grant:
- If user has a UserPermission with `granted = true` → return true

Step 5 — Role default:
- If the permission key is in the role's RolePermission set → return true

Step 6 — Deny by default:
- return false

---

# Authorization Principles

## Rule 1 — Admin owns everything

Admin has unrestricted access.

Includes:
- all modules
- all records
- all financial intelligence
- all configuration
- all user management
- all automation controls
- all marketplace controls

---

## Rule 2 — Deny by default

New users get no permissions unless explicitly granted.

---

## Rule 3 — Financial data is restricted

Financial intelligence is admin-only unless explicitly delegated.

Restricted examples:
- unit cost
- landed cost
- profit
- margin
- ROI
- capital allocation
- procurement recommendations
- supplier profitability
- marketplace profitability

---

## Rule 4 — Server-side enforcement required

UI hiding is not security.

Every permission must be enforced server-side.

---

## Rule 5 — Module access and action access are separate

Example:

A user may:
- view products

But may NOT:
- edit products

---

# Role Model

## Admin

Purpose:
Business owner / superuser.

Permissions:
Full access.

Can:
- create users
- disable users
- reset passwords
- assign permissions
- view financial intelligence
- approve procurement decisions
- approve dangerous operations

---

## Sales

Purpose:
Sales representatives.

Default access (15 permissions — seeded):
- customers.read
- customers.create
- customers.update
- quotes.read
- quotes.create
- quotes.update
- quotes.send
- tasks.read
- tasks.create
- tasks.update
- products.read
- categories.read
- attributes.read
- search.read
- activity.read

Cannot access by default:
- profitability
- procurement
- capital allocation
- supplier intelligence
- marketplace admin
- user management

---

## Operations

Purpose:
Inventory / warehouse / operations team.

Default access:
- products.read
- products.update
- inventory.read
- inventory.write
- inventory.count
- tasks.read
- tasks.create
- tasks.update
- marketplaceListings.read

Cannot access by default:
- financial intelligence
- user management
- procurement approvals

---

## Marketplace Operator

Purpose:
Marketplace maintenance staff.

Default access:
- marketplaceListings.read
- marketplaceListings.write
- marketplaceListings.monitor
- marketplaceAnalytics.read
- marketplaceOrders.read
- marketplaceReturns.read
- products.read
- tasks.read
- tasks.create
- tasks.update

Cannot access by default:
- profitability
- procurement
- capital allocation
- user management

Important:

Until marketplace write operations are globally approved:
these remain blocked:
- marketplace.stockPush
- marketplace.pricePush
- marketplace.listingUpdate

---

## Warehouse

Purpose:
Warehouse staff — visual product finding, stock counting, order picking.
Mobile-first. No financial intelligence.

Default access (Phase 55, implemented — seeded in `prisma/seed.ts`):
- products.read (name, image, barcode, SKU, location, stock qty only)
- inventory.read
- inventory.write
- inventory.count
- categories.read
- attributes.read
- tasks.read
- tasks.update
- search.read

Cannot access by default:
- ANY financial field (cost, margin, ROI, profit, landed cost)
- Customer data
- Quotes
- Import intelligence
- Marketplace analytics
- User management

Note:
WAREHOUSE enum value exists in `prisma/schema.prisma` (since Phase 55) and is
seeded with 9 permissions. As of Codex audit P0 (2026-05-18), `lib/user-roles.ts`
TS type + `ALL_USER_ROLES` array + admin user-management UI label/tone/color
maps were also updated so WAREHOUSE can be assigned via `updateUserRoleAction`
without "Geçersiz rol" rejection. Earlier docs noting "WAREHOUSE role does NOT
exist" are obsolete.

Important distinction from OPERATIONS:
- OPERATIONS: coordinator role — task assignment, stock visibility, sipariş/iade coordination, can see operational metrics
- WAREHOUSE: executor role — picking, counting, image-guided product finding, mobile-first

---

## Custom Role

Purpose:
Granular mixed access.

Admin manually assigns permissions.

---

# Permission Matrix

## User Management
- users.read
- users.create
- users.update
- users.disable
- users.resetPassword
- permissions.manage

---

## Customers
- customers.read
- customers.create
- customers.update
- customers.delete
- customers.export

---

## Products
- products.read
- products.create
- products.update
- products.delete
- products.import
- products.export

---

## Categories
- categories.read
- categories.create
- categories.update
- categories.delete

---

## Attributes
- attributes.read
- attributes.create
- attributes.update
- attributes.delete

---

## Quotes
- quotes.read
- quotes.create
- quotes.update
- quotes.delete
- quotes.export
- quotes.send

---

## Tasks
- tasks.read
- tasks.create
- tasks.update
- tasks.delete
- tasks.assign

---

## Campaigns
- campaigns.read
- campaigns.create
- campaigns.update
- campaigns.delete
- campaigns.send

---

## Search / Activity
- search.read
- activity.read

---

## Inventory
- inventory.read
- inventory.write
- inventory.count
- inventory.sync

---

## XML Sync
- xml.read
- xml.configure
- xml.sync

---

## Marketplace Listings
- marketplaceListings.read
- marketplaceListings.write
- marketplaceListings.monitor

---

## Marketplace Read Intelligence
- marketplaceAnalytics.read
- marketplaceOrders.read
- marketplaceReturns.read

---

## Marketplace Write Controls (Future Only)
- marketplace.stockPush
- marketplace.pricePush
- marketplace.listingUpdate

---

## Profitability
- profitability.read
- profitability.configure

---

## Procurement
- procurement.read
- procurement.recommend
- procurement.approve

---

## Supplier Intelligence
- suppliers.read
- suppliers.write

---

## Executive Dashboard
- executive.read

---

## Warehouse Operations (Future — Phase 55)
Status: NOT YET IMPLEMENTED. Keys documented here for planning purposes only.
These keys do not exist in `lib/permissions.ts` or the DB seed yet.

- warehouse.read      — view warehouse-relevant product fields (image, barcode, location, stock qty)
- warehouse.pick      — access order picking/preparation workflow
- warehouse.locate    — view shelf/location codes
- warehouse.adjust    — create stock adjustment records (currently covered by products.update)

---

## Import Intelligence (Future — Phase 57)
Status: NOT YET IMPLEMENTED. Currently ALL import intelligence is bundled under executive.read.
These keys document the intended future split for finer-grained access control.

- import.read         — view import decision cockpit, import calculator, import snapshots
- import.manage       — create/approve/save import decision snapshots

---

## Product Finance Visibility (Future — Phase 57)
Status: NOT YET IMPLEMENTED. Currently product form shows all fields to anyone with products.update.
These keys document intended future field-level access control.

- productFinance.read — view cost/pricing/ROI fields on product form and detail page
                        (unitCostTry, sourceCostRmb, importUnitCostUsd, profitability breakdowns)

---

## Sales Opportunity Engine (Future — Phase 56)
Status: NOT YET IMPLEMENTED.

- salesOpportunities.read  — view sales opportunity suggestions (new product → interested customers)
- salesOpportunities.write — create/manage sales opportunity actions and outreach triggers

---

## Dangerous Operations
- migrations.approve
- destructiveActions.approve

---

# Financial Visibility Policy

Admin-only by default:
- profitability.read
- executive.read
- procurement.read
- procurement.approve
- suppliers.read

Optional delegated access only with explicit admin decision.

---

# Authentication Policy

Initial implementation:
- email + password only
- no email verification
- no public signup
- internal users only

Future optional:
- password reset workflow
- forced password rotation
- audit sign-in history

---

# Route Protection Rules

Every protected route must check permissions.

Examples:

/admin/users
requires:
- users.read

/admin/users/create
requires:
- users.create

/products
requires:
- products.read

/products/edit
requires:
- products.update

/customers
requires:
- customers.read

/quotes
requires:
- quotes.read

/tasks
requires:
- tasks.read

/marketplaces
requires:
- marketplaceListings.read

/marketplace-monitoring
requires:
- marketplaceListings.monitor

/profitability
requires:
- profitability.read

/procurement
requires:
- procurement.read

/executive
requires:
- executive.read

---

# Implementation Constraints

Phase 5 delivered (production-verified):
- No UI-only permissions — all enforced server-side via `requirePermission()` / `checkPermission()`
- No client-side role check trust — session resolved on every request
- No hidden API exposure — server actions check permissions before any DB operation
- User.role participates in RBAC but is not sufficient alone — Role/Permission tables are the authority
- Granular permissions: 62 seeded across 12 categories
- Custom role: CUSTOM — admin assigns permissions per-user
- Admin overrides: ADMIN bypasses all non-dangerous permissions
- Migration-safe: graceful degradation if Phase 5 tables absent

---

# Source of Truth Rule

If implementation differs from this document:

Either:
- update this document intentionally

OR:
- fix implementation

Do not allow silent drift.

---

# Import Intelligence Secrecy Rule (HARD RULE)

This rule is IMMUTABLE. It defines what is considered owner-private strategic intelligence.

## Fields and pages visible ONLY to ADMIN / OWNER:

Financial fields on product record:
- unitCostTry (birim maliyet)
- sourceCostRmb (kaynak maliyet RMB)
- importUnitCostUsd (ithalat birim maliyeti USD)
- importPaymentFeePct (ödeme komisyonu %)
- wholesalePriceTry (toptan fiyat — contains margin signal)
- packagingCost, vatRate, paymentFeeRate, returnReserveRate
- privateNote (ADMIN_EMAIL gated via isOwner() — already implemented Phase 28)

Import intelligence pages:
- /admin/import-cockpit
- /admin/import-decisions
- /admin/import-calculator
- /admin/procurement
- /admin/capital
- /admin/executive

Derived metrics admin-only:
- Net profit per unit / margin % / ROI %
- Landed cost
- Capital allocation suggestions
- Supplier costs and commercial terms
- Import decision snapshots

## What non-admin users CAN see on product:
- name, sku, barcode, imageUrl, description, brand, model, category
- stockQuantity (OPERATIONS, WAREHOUSE)
- location (OPERATIONS, WAREHOUSE)
- sellingPriceTry (SALES — for quoting only)
- minimumStock (OPERATIONS)

## Current implementation gap:
The product edit form (`components/products/product-form.tsx`) currently renders ALL financial
and import fields to any user with `products.update` permission. Field-level visibility
by role is NOT YET IMPLEMENTED in the UI layer.

Server-side actions DO check permissions on routes, but form fields themselves are not
conditionally hidden based on role. This is a UI-layer gap documented for Phase 57.

Until Phase 57 is implemented, only users trusted with `products.update` (ADMIN, OPERATIONS)
can access the product edit form. SALES and WAREHOUSE roles do not have `products.update`
by default, which provides partial protection today.

## Stock source-of-truth & physical count (Phase 89 — 2026-05-19)

Mimari kural: `Product.stockQuantity` Entegra (XML sync) tarafından tek başına
mutate edilir. Warehouse sayım ve manuel stok hareketleri ayrı bir
`Product.physicalCountQuantity` alanına yazılır.

İlgili izinler:
- `inventory.count` — `createInventoryCountAction` (warehouse sayım girişi) ve
  `createStockAdjustmentAction` (RESTOCK / CORRECTION / DAMAGE / RETURN / SALE /
  OTHER hareketleri) için gerekli. **Phase 89 değişikliği**:
  `createStockAdjustmentAction` daha önce `products.update` gerektiriyordu;
  şimdi `inventory.count`. Bu WAREHOUSE rolüne stok hareketi giriş yetkisi açar.
- `inventory.read` — `/warehouse` ve sayım listelerini görüntüleme.
- `inventory.sync` — XML sync trigger (admin-only).

`StockAdjustmentCard` (UI) `/products/[id]` sayfasında `inventory.count`
izni ile koşullu render edilir. Variance derived (kalıcı alan değil):
`stockQuantity - physicalCountQuantity`. `StockAdjustmentLog` audit trail
değişmedi (her sayım/adjustment hala kayıt atar).

## Implemented finance visibility gate (Codex audit P0 — 2026-05-18)

The product **list** and **detail** pages, the **marketplace profit** dashboard,
and the warehouse → product detail navigation chain enforce `executive.read`
for restricted financial / import data. This is enforced server-side via
`lib/finance-visibility.ts` (`resolveFinanceGate(user) → { canViewFinance }`).

For `/products/[id]`, non-finance viewers get a redacted product object —
finance fields (`unitCostTry`, `sourceCostRmb`, `importUnitCostUsd`,
`wholesalePriceTry`, `marketplacePriceTry`, `weightKg`, `customsRatePct`,
`shippingMethodPref`, `marketplaceCommission*`, `shippingCost*`, `vatRate`,
`paymentFeeRate`, `returnReserveRate`, `packagingCost`, `*SalesPotential`,
`importDate`, `importQuantity`, `privateNote`) and `xmlData` + `marketplacePrices`
relations are stripped before any rendering. `salesRecords`, `supplierLinks`,
`importSnapshots`, and `platformPolicies` are not fetched at all when the
viewer lacks `executive.read`.

`/marketplace/profit` permission was upgraded from `marketplaceListings.read`
to `executive.read`. The sidebar entry and the "📊 Kârlılık" call-to-action
on `/marketplace` are gated the same way. `MARKETPLACE_OPERATOR` users no
longer see profit / margin / ROI per listing.

---

# Role Coverage Analysis (2026-05-17)

## Gap Summary

| Gap | Impact | Phase to Fix |
|-----|--------|-------------|
| No WAREHOUSE role in UserRole enum | Warehouse staff uses OPERATIONS, sees things they shouldn't | Phase 55 |
| Product form shows ALL fields to anyone with products.update | Financial fields visible to OPERATIONS | Phase 57 |
| No role-specific dashboards | All roles see same /dashboard | Phase 54 |
| No Sales Opportunity Engine | Sales reps can't find customers to pitch new products | Phase 56 |
| No Operations coordination tools | Can't assign/track tasks across SALES+WAREHOUSE | Phase 58 |
| executive.read is too broad | One permission gates all of import/capital/finance | Phase 57 |
| No mobile warehouse interface | Warehouse must use desktop-oriented screens | Phase 55 |
| tasks.assign permission exists in code but no assignment UI | Ops can't delegate to individuals | Phase 58 |

## Role Compliance Score (today)

| Role | Core workflow supported | Financial data gated | Role-specific UX | Score |
|------|------------------------|---------------------|-----------------|-------|
| ADMIN | ✅ Full | ✅ Yes (EXECUTIVE_READ) | ⚠️ Shared dashboard | 90% |
| OPERATIONS | ✅ Inventory/tasks | ⚠️ Partial (sees form fields) | ❌ No dedicated screen | 60% |
| WAREHOUSE | ❌ No role exists | ❌ Uses OPERATIONS | ❌ No visual-first screen | 20% |
| SALES | ✅ CRM/quotes | ✅ No cost access | ❌ No opportunity engine | 65% |
| MARKETPLACE_OPERATOR | ✅ Listings/orders/returns | ✅ No financial access | ⚠️ Shared nav | 75% |

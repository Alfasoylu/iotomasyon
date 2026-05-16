# PERMISSION MODEL

## Purpose

This document defines the authorization model for IOTOMASYON.

Phase 5 Status: **COMPLETE and PRODUCTION-ACTIVE** (deployed 2026-05-16)

What is live:
- 5 roles seeded: ADMIN, SALES, OPERATIONS, MARKETPLACE_OPERATOR, CUSTOM
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

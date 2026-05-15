# PERMISSION MODEL

## Purpose

This document defines the authorization model for IOTOMASYON.

It exists to prevent ad-hoc permission decisions during RBAC implementation.

This document defines the target permission architecture and the intended direction of the current Phase 5 foundation.

Important:
- Current production auth is single internal auth.
- RBAC foundation is implemented.
- This document still defines the broader intended model and remaining direction.

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

Default access:
- customers.read
- customers.create
- customers.update
- quotes.read
- quotes.create
- quotes.update
- tasks.read
- tasks.create
- tasks.update
- products.read
- categories.read
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

Phase 5 must NOT:
- implement fake UI-only permissions
- trust client-side role checks alone
- expose hidden APIs to unauthorized users
- assume User.role enum is sufficient

Phase 5 must:
- support granular permissions
- support custom roles
- support admin overrides
- be migration-safe

---

# Source of Truth Rule

If implementation differs from this document:

Either:
- update this document intentionally

OR:
- fix implementation

Do not allow silent drift.

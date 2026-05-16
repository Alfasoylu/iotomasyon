# CHANGELOG

## Changelog Rules

- Only completed and verified work should be listed.
- Do not add future planned work.
- If a change is inferred from documentation but not independently verified in code, avoid wording it as fully implemented.
- ROADMAP items must not appear here unless implemented.

## 2026-05

### Foundation
- Established Next.js App Router application structure
- Added TypeScript, Tailwind, and ESLint baseline
- Created scalable project architecture for app, components, services, types, and Prisma
- Aligned runtime architecture to Prisma + Supabase PostgreSQL + Vercel
- Added fail-fast environment validation

### CRM
- Implemented single internal authentication flow
- Added protected application shell
- Added RBAC foundation with role and permission schema support
- Added admin user management routes
- Added permission-aware navigation filtering
- Added server-side permission resolution foundation
- Implemented customer CRUD
- Added customer lifecycle status flow
- Added customer note and task linkage foundations
- Added Turkish location selection layer for customer records

### Quote System
- Implemented quote workflow v1
- Added quote creation
- Added quote listing
- Added quote editing
- Added quote detail page
- Added PDF quote generation
- Added WhatsApp quote sharing
- Added quote currency mode and exchange-rate aware display behavior
- Improved legacy quote compatibility in tax display logic

### Relationship Engine
- Added category management
- Added product/category relationship structure
- Added attribute system
- Added product/customer interest linking
- Added category/customer relationship linking

### Tasking and Outreach
- Added task management foundations
- Added follow-up task structures and views
- Added outreach/campaign module foundation
- Added campaign listing and campaign detail flow

### Search and Activity
- Added search module
- Added activity timeline/module support

### Technical Hardening
- Removed SQLite runtime architecture
- Standardized on PostgreSQL-compatible Prisma runtime
- Added Prisma migration structure
- Fixed build safety issues caused by eager session secret loading
- Fixed build safety issues caused by eager database loading
- Expanded protected route coverage
- Tracked required location CSV files in repository

### Documentation Governance
- Created `docs/ROADMAP.md` as target architecture reference
- Created `docs/PROGRESS.md` as factual implementation reference
- Created `docs/NEXT-STEPS.md` as execution priority reference
- Created `docs/CHANGELOG.md` as factual history reference
- Created `docs/current-state.md`
- Created `docs/phase-plan.md`

### Phase 5 — RBAC (Role Based Access Control)
- Expanded `UserRole` enum: ADMIN, SALES, OPERATIONS, MARKETPLACE_OPERATOR, CUSTOM
- Created `Role`, `Permission`, `RolePermission`, `UserPermission` tables and applied migration to production
- Seeded 5 system roles, 62 permissions across 12 categories
- Implemented `resolvePermission()` 6-step engine: dangerous gate → ADMIN bypass → explicit deny → explicit grant → role default → deny
- Implemented `DANGEROUS_PERMISSIONS` gate for `migrations.approve` and `destructiveActions.approve`
- Seeded SALES role with 15 default permissions, OPERATIONS with 12, MARKETPLACE_OPERATOR with 11
- Implemented per-user permission override UI with Varsayılan → Verildi → Engellendi → Varsayılan cycle
- Added permission-aware sidebar with parallel `checkPermission` calls and zero-access `/no-access` redirect
- Enforced `requirePermission()` on all protected routes and `checkPermission()` in all server actions
- Added graceful degradation throughout — app remains operational if Phase 5 tables are absent
- Added 22 automated unit tests for permission engine (`__tests__/resolve-permission.test.ts`)
- Added `isSchemaMismatchError()` helper for pre-migration environment handling

### Phase 6 — Customer Intelligence Expansion
- Added `CustomerType` enum: RETAILER, WHOLESALER, DISTRIBUTOR, CONTRACTOR, END_USER, OTHER
- Added `monthlySalesPotential DECIMAL(15,2)` column to `Customer` table
- Added `platformNotes TEXT` column to `Customer` table
- Migrated `customerType` column from untyped TEXT to `CustomerType` enum in production
- Exposed `customerType`, `monthlySalesPotential`, and `platformNotes` in customer create/edit forms
- Updated CSV import action to use explicit `SELECT` avoiding Phase 6 columns before migration

### Phase 7 — Inventory Intelligence Core
- Added `StockSource` enum: MANUAL, XML, API, IMPORT
- Added `StockConfidence` enum: HIGH, MEDIUM, LOW
- Added `barcode TEXT UNIQUE` column to `Product` table
- Added `imageUrl TEXT` column to `Product` table
- Added `supplier TEXT` column to `Product` table
- Added `stockSource StockSource` column to `Product` table
- Added `stockConfidence StockConfidence` column to `Product` table
- Added `lastStockSyncAt TIMESTAMP` column to `Product` table
- Added `lastStockCountById TEXT` FK column to `Product` table (→ `User` via named relation `StockCountedBy`)
- Added `reorderLeadTime INTEGER` column to `Product` table
- Added `shippingCost DECIMAL` column to `Product` table
- Added `shippingCostOverride DECIMAL` column to `Product` table
- Added `marketplaceCommission DECIMAL` column to `Product` table
- Added `marketplaceCommissionOverride DECIMAL` column to `Product` table
- Applied migration to production Supabase PostgreSQL
- Reorganized product create/edit form into 4 sections: Temel bilgiler, Stok ve konum, Maliyet girdileri, İthalat ve envanter
- Added StockSource and StockConfidence dropdowns to product form
- Added user dropdown for last manual stock count user
- Updated product detail page to display all new inventory intelligence fields
- Added product image preview card to detail page
- Updated Zod validation schema and `normalizeProductData()` for all new fields

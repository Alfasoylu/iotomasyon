# Migration Safety — IOTOMASYON

## Purpose

This document governs production schema changes, backup discipline, rollback procedures, and dangerous operation approval rules for the IOTOMASYON internal operating system.

**Production database:** Supabase PostgreSQL (project: frbxpodiostxuwlrubkt)
**ORM:** Prisma (migration history in `prisma/migrations/`)

---

## Pre-Migration Checklist

Before applying any `prisma migrate deploy` to production, confirm each item:

- [ ] Migration reviewed for destructive operations (`DROP`, `ALTER COLUMN ... DROP DEFAULT`, `NOT NULL` without default)
- [ ] All new NOT NULL columns have a default value or backfill plan
- [ ] `@unique` constraints do not conflict with existing data (check for duplicates first)
- [ ] No `CASCADE DELETE` without explicit approval from admin
- [ ] Migration tested on a staging branch (Supabase branch) before production apply
- [ ] Supabase point-in-time backup confirmed active in dashboard
- [ ] Rollback SQL written and reviewed (see Rollback section)
- [ ] At least one team member reviewed the migration SQL

---

## Supabase Backup Checklist

Run before every production deploy that includes schema changes:

1. Open Supabase dashboard → project frbxpodiostxuwlrubkt → Settings → Backups
2. Confirm "Point in Time Recovery" is enabled
3. Note the current timestamp — this is the rollback point
4. Take a manual snapshot if PITR is not available on current plan
5. Store backup confirmation in commit message or PR description

---

## Rollback Rules

For each migration type, the rollback procedure differs:

### Add column (nullable or with default)
- Safe rollback: `ALTER TABLE "TableName" DROP COLUMN "columnName";`
- Risk: none — column drop is reversible if no data depends on it

### Add column (NOT NULL, no default)
- Requires backfill before migrate
- Rollback: drop column, verify no application code references it

### Add table
- Rollback: `DROP TABLE IF EXISTS "TableName";`
- Risk: low if table is new and unpopulated

### Add enum value
- PostgreSQL enum rollback is complex — enum values cannot be removed without recreating the type
- Mitigation: always add enum values at end; never remove enum values in production

### Add unique index / unique constraint
- Rollback: `DROP INDEX IF EXISTS "IndexName";`
- Risk: check for duplicate data before adding the constraint

### Foreign key (CASCADE DELETE)
- Requires explicit admin approval before applying
- Rollback: `ALTER TABLE "TableName" DROP CONSTRAINT "ConstraintName";`

---

## Dangerous Operations — Approval Required

The following operations require explicit approval from the ADMIN user before execution:

| Operation | Risk Level | Approval Required |
|-----------|-----------|-------------------|
| `DROP TABLE` | CRITICAL | Admin + backup confirmed |
| `DROP COLUMN` | HIGH | Admin + data impact assessed |
| `ALTER COLUMN ... NOT NULL` without default | HIGH | Admin + backfill confirmed |
| `TRUNCATE TABLE` | CRITICAL | Admin + backup confirmed |
| `DELETE FROM` without WHERE | CRITICAL | Admin |
| `UPDATE` without WHERE | HIGH | Admin |
| `DROP INDEX` on production | MEDIUM | Admin |
| Removing enum value | HIGH | Admin + recreation plan |

---

## Seed / Demo Data Separation Rules

- `prisma/seed.ts` contains ONLY permission definitions (Role, Permission, RolePermission)
- Seed must be idempotent — safe to run multiple times (upsert-only operations)
- No product, customer, supplier, or quote demo data in seed
- Demo data for testing must be created manually or via a separate `scripts/demo-seed.ts` that is never run in production
- All seed operations use `upsert` with explicit `where` + `create` + `update` — never `create` alone

---

## Production Write Approval Rule

For all production writes outside normal application CRUD:

1. All migrations must be peer-reviewed before `prisma migrate deploy`
2. Emergency hotfixes must be documented in `CHANGELOG.md` within 24 hours
3. Direct SQL execution via Supabase SQL editor must be logged as a comment in the nearest relevant file
4. `destructiveActions.approve` permission required for any admin action that permanently deletes data
5. No `--force` flags on Prisma CLI without explicit admin approval and backup confirmation

---

## Migration History Reference

| Migration Timestamp | Name |
|--------------------|------------------------------------|
| 20260514013000 | phase1_postgres_baseline |
| 20260514024000 | phase2_customer_crm |
| 20260514033000 | phase3_sales_pipeline |
| 20260514120000 | phase4_quote_lifecycle |
| 20260514160000 | phase5_categories |
| 20260514160001 | phase5_data_migration |
| 20260514170000 | phase6_outreach |
| 20260514180000 | phase7_campaign_conversion |
| 20260514210000 | phase7_patch |
| 20260514220000 | crm_extension |
| 20260514230000 | product_attributes |
| 20260515000000 | phase8_product_import_quote_currency |
| 20260515100000 | quote_custom_terms |
| 20260516000000 | phase5_rbac_schema |
| 20260516010000 | phase6_customer_intelligence |
| 20260516020000 | phase7_inventory_intelligence |
| 20260516030000 | phase8_profitability |
| 20260516040000 | phase9_sales_potential |
| 20260516050000 | phase10_capital_allocation |
| 20260516060000 | phase11_xml_sync |
| 20260517000000 | phase12_marketplace_listing |
| 20260517010000 | phase14_trendyol_config |
| 20260517020000 | phase16_marketplace_ops |
| 20260517030000 | phase11a_xml_product_foundation |
| 20260517040000 | phase20_supplier_intelligence |

Total applied migrations: 25

---

## Emergency Contacts

- Database: Supabase dashboard → project frbxpodiostxuwlrubkt
- Deployment: Vercel → alfasoylus-projects/iotomasyon
- Repository: github.com/Alfasoylu/iotomasyon

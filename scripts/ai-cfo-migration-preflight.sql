-- Manual operator check in Supabase SQL Editor, before any migration.
-- Metadata only: no DDL/DML, no business rows, no migration logs/credentials.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';

SELECT current_database() AS database_name, current_user AS checked_by,
       current_setting('transaction_read_only') AS read_only, current_timestamp AS checked_at;

-- Compare this list/checksum with committed prisma/migrations; do not run
-- migrate deploy if unexpected pending/failed migrations remain.
SELECT migration_name, checksum, started_at, finished_at, rolled_back_at, applied_steps_count
FROM public._prisma_migrations
ORDER BY migration_name;

WITH targets(name) AS (VALUES ('cfo_snapshot'), ('cfo_run'), ('cfo_insight'), ('cfo_usage'))
SELECT t.name AS table_name, c.oid IS NOT NULL AS exists,
       c.relrowsecurity AS rls_enabled,
       CASE WHEN c.oid IS NOT NULL THEN EXISTS (
         SELECT 1 FROM pg_roles r WHERE r.rolname = 'anon'
         AND has_table_privilege(r.oid, c.oid, 'SELECT')
       ) END AS anon_can_select,
       CASE WHEN c.oid IS NOT NULL THEN EXISTS (
         SELECT 1 FROM pg_roles r WHERE r.rolname = 'authenticated'
         AND has_table_privilege(r.oid, c.oid, 'SELECT')
       ) END AS authenticated_can_select
FROM targets t
LEFT JOIN pg_class c ON c.relname = t.name
  AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  AND c.relkind IN ('r', 'p')
ORDER BY t.name;

COMMIT;

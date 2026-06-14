-- Defense-in-depth on top of RLS (see 20260613000000_enable_rls_all_public_tables).
-- The app never uses the Supabase Data API (PostgREST) — it is Prisma-only (postgres
-- role) plus Storage (service_role). Revoke the Data API roles from the public schema
-- so anon/authenticated hold zero privileges on any table: a second independent layer
-- beneath RLS. There are no default privileges granting anon/authenticated, so new
-- tables are not auto-exposed either.
--
-- Guarded with a role-existence check so this is a harmless no-op on non-Supabase
-- databases (e.g. local `prisma migrate dev`) where anon/authenticated do not exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
    REVOKE USAGE ON SCHEMA public FROM anon, authenticated;
  END IF;
END $$;

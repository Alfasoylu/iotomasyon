-- Security: enable Row Level Security (RLS) on every public table.
--
-- Why: the Supabase Data API (PostgREST) exposes public tables to the `anon`
-- and `authenticated` roles. With RLS disabled, anyone holding the project's
-- (public-by-design) anon key could SELECT/INSERT/UPDATE/DELETE every table —
-- including credential columns (TrendyolConfig.apiKey, HepsiburadaConfig.password,
-- CatalogShare.token). Enabling RLS with NO policies denies these roles by default.
--
-- App impact: NONE. The app connects via Prisma as the `postgres` role
-- (rolbypassrls = true), and Storage uses the service_role key (also bypassrls);
-- both bypass RLS entirely. This change only closes the PostgREST/anon surface,
-- which the app does not use (no @supabase/supabase-js, no anon key in the code).
--
-- Idempotent: ALTER TABLE ... ENABLE ROW LEVEL SECURITY is a no-op when already on.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.tablename);
  END LOOP;
END $$;

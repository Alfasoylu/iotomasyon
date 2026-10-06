-- Güvenlik defense-in-depth (baseline sonrası; docs/ANON-GRANTS-FUNCTIONS-AUDIT.md §5) — kullanıcı onayı: 2026-10-06.
-- Amaç: RLS yanlışlıkla kapatılsa / geniş bir policy eklense bile anon/authenticated (Supabase Data API) hiçbir public
-- tabloya/view'a/sequence'a/fonksiyona erişemesin. Uygulama Prisma ile `postgres`, Edge Function'lar service_role,
-- CFO ajanı cfo_acceptance_reader ile bağlanır → bu rollerin davranışı KORUNUR.
--  1) public tablo/view/matview/sequence: anon + authenticated için tüm yetkiler kaldırılır (repo'da Data API kullanımı yok).
--  2) public'te postgres'e ait, eklentiye ait OLMAYAN fonksiyonlar: PUBLIC/anon/authenticated EXECUTE kaldırılır;
--     service_role EXECUTE açıkça verilir; reader'ın önceden (PUBLIC dahil) çalıştırabildiği salt-okunur
--     (STABLE/IMMUTABLE, trigger olmayan) fonksiyonlar reader'a AÇIKÇA verilir → reader akışı değişmez.
--  3) cfo_google: reader EXECUTE kaldırılır (Google köprüsü yalnız postgres/service_role).
-- Veri değişmez. Idempotent. Roller yoksa (temiz DB) ilgili adım atlanır.
-- Geri alma: nesne başına GRANT … TO anon, authenticated (önerilmez).
DO $$
DECLARE
  rel record;
  fn record;
  r text;
  kind text;
  has_reader boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cfo_acceptance_reader');
  has_svc boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role');
  reader_had boolean;
BEGIN
  -- 1) relations
  FOR rel IN
    SELECT c.relkind, format('%I.%I', n.nspname, c.relname) AS q
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
  LOOP
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON %s %s FROM %I', CASE WHEN rel.relkind = 'S' THEN 'SEQUENCE' ELSE 'TABLE' END, rel.q, r);
      END IF;
    END LOOP;
  END LOOP;

  -- 2) functions/procedures owned by the migrating role (postgres), not part of an extension
  FOR fn IN
    SELECT p.oid, p.proname, p.provolatile, p.prokind, p.prorettype = 'trigger'::regtype AS is_trg,
           format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
      AND p.proowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
  LOOP
    kind := CASE WHEN fn.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END;
    reader_had := has_reader AND has_function_privilege('cfo_acceptance_reader', fn.oid, 'EXECUTE');
    EXECUTE format('REVOKE EXECUTE ON %s %s FROM PUBLIC', kind, fn.sig);
    FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE EXECUTE ON %s %s FROM %I', kind, fn.sig, r);
      END IF;
    END LOOP;
    IF has_svc THEN
      EXECUTE format('GRANT EXECUTE ON %s %s TO service_role', kind, fn.sig);
    END IF;
    IF has_reader THEN
      IF reader_had AND fn.proname <> 'cfo_google' AND NOT fn.is_trg AND fn.prokind = 'f' AND fn.provolatile IN ('s', 'i') THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO cfo_acceptance_reader', fn.sig);
      ELSE
        EXECUTE format('REVOKE EXECUTE ON %s %s FROM cfo_acceptance_reader', kind, fn.sig);
      END IF;
    END IF;
  END LOOP;
END
$$;

-- AI CFO adım 8: 20261005190000_ai_cfo_v1 uygulamadan ÖNCE ve SONRA çalıştırılan salt-okunur katalog kontrolü.
-- Yalnız metadata: DDL/DML yok, iş verisi/kimlik bilgisi/migration logu okunmaz. Test: __tests__/ai-cfo-migration-security.test.ts.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '10s';

-- 1) Uygulayan rol `postgres` olmalı: public'te postgres'in varsayılan ACL'i anon/authenticated'a yetki VERMEZ.
--    (supabase_admin'in varsayılanı verir → o rolle uygulanırsa tablolar anon'a açık doğar.)
SELECT current_user AS checked_by, current_user = 'postgres' AS role_ok,
       current_setting('transaction_read_only') AS read_only;
SELECT pg_get_userbyid(d.defaclrole) AS owner, d.defaclobjtype AS objtype, d.defaclacl::text AS acl,
       d.defaclacl::text !~ '(anon|authenticated)=' AS anon_free
FROM pg_default_acl d
WHERE d.defaclnamespace = 'public'::regnamespace AND pg_get_userbyid(d.defaclrole) = current_user;

-- 2) Migration kaydı: önce yok, sonra checksum = sha256(prisma/migrations/20261005190000_ai_cfo_v1/migration.sql).
SELECT migration_name, checksum, finished_at, rolled_back_at
FROM public._prisma_migrations WHERE migration_name = '20261005190000_ai_cfo_v1';

-- 3) Tablolar: önce 3 satır exists=false; sonra hepsi exists, RLS açık, politika 0, anon/authenticated/reader yetkisi yok.
WITH t(name) AS (VALUES ('cfo_run'), ('cfo_insight'), ('cfo_usage'))
SELECT t.name, c.oid IS NOT NULL AS exists, c.relrowsecurity AS rls_enabled,
       (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies,
       -- ACL'de PUBLIC (grantee 0), anon, authenticated veya reader için herhangi bir yetki
       CASE WHEN c.oid IS NOT NULL THEN EXISTS (
         SELECT 1 FROM aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
         WHERE a.grantee = 0 OR pg_get_userbyid(a.grantee) IN ('anon', 'authenticated', 'cfo_acceptance_reader')
       ) END AS exposed,
       CASE WHEN c.oid IS NOT NULL THEN has_table_privilege('service_role', c.oid, 'SELECT,INSERT,UPDATE') END AS service_role_ok
FROM t LEFT JOIN pg_class c ON c.relname = t.name AND c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p')
ORDER BY t.name;

COMMIT;

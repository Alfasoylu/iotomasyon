-- Manual Supabase SQL Editor setup; not a Prisma migration.
-- Only the dedicated reader receives SELECT policies on already granted
-- CFO business sources. No password, business row or existing policy changes.
BEGIN;
DO $cfo_reader_rls$
DECLARE
  reader oid;
  source record;
  existing record;
BEGIN
  SELECT oid INTO reader FROM pg_roles
  WHERE rolname = 'cfo_acceptance_reader' AND rolcanlogin
    AND NOT (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls OR rolinherit);
  IF reader IS NULL THEN
    RAISE EXCEPTION 'Guvenli cfo_acceptance_reader hesabi bulunamadi; degisiklik yapilmadi.';
  END IF;

  FOR source IN
    SELECT c.oid, c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relrowsecurity
      AND (left(c.relname, 4) = 'cfo_' OR c.relname = ANY (ARRAY[
        'Product', 'MarketplaceSalesRecord', 'TrendyolSalesRecord',
        'HepsiburadaSalesRecord', 'XmlStockChangeLog', 'PurchaseOrder', 'PurchaseOrderItem'
      ]))
      AND c.relname <> ALL (ARRAY['cfo_run', 'cfo_insight', 'cfo_usage'])
      AND has_table_privilege(reader, c.oid, 'SELECT')
  LOOP
    IF has_table_privilege(reader, source.oid, 'INSERT')
      OR has_table_privilege(reader, source.oid, 'UPDATE')
      OR has_table_privilege(reader, source.oid, 'DELETE')
      OR has_table_privilege(reader, source.oid, 'TRUNCATE') THEN
      RAISE EXCEPTION 'Reader yazma yetkisi tasiyor; degisiklik yapilmadi.';
    END IF;
    SELECT p.polcmd, p.polroles, p.polpermissive,
      pg_get_expr(p.polqual, p.polrelid) AS predicate,
      p.polwithcheck IS NULL AS no_write_check INTO existing
    FROM pg_policy p
    WHERE p.polrelid = source.oid AND p.polname = 'cfo_acceptance_reader_select';
    IF FOUND THEN
      IF existing.polcmd <> 'r' OR existing.polroles <> ARRAY[reader]
        OR NOT existing.polpermissive OR existing.predicate IS DISTINCT FROM 'true'
        OR NOT existing.no_write_check THEN
        RAISE EXCEPTION 'Ayni adli farkli politika var; mevcut politika degistirilmedi.';
      END IF;
    ELSE
      EXECUTE format('CREATE POLICY cfo_acceptance_reader_select ON public.%I FOR SELECT TO cfo_acceptance_reader USING (true)', source.relname);
    END IF;
  END LOOP;
END
$cfo_reader_rls$;
COMMIT;

-- Policy metadata only. Actual row visibility is rechecked through GitHub CI.
SELECT tablename AS tablo, roles AS roller, cmd AS islem
FROM pg_policies WHERE schemaname = 'public'
  AND policyname = 'cfo_acceptance_reader_select'
ORDER BY tablename;

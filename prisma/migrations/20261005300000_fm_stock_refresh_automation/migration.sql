-- Financial Memory — XML senkronu başarıyla bittiğinde stok hafızasının deterministik yenilenmesi + tazelik gözlemi.
--
-- fm_stock_refresh_after_sync(sync_log_id): XmlSyncLog satırını DOĞRULAR; yalnız status='SUCCESS' (tamamlanmış) ise fm_stock_refresh() çalıştırır.
--   • SUCCESS değil (PARTIAL / ERROR / RUNNING) → yenileme ÇALIŞMAZ; fm_ingest_run'a 'failed' satırı (neden: sync_not_success) yazılır — başarı görünmez.
--   • Idempotent: aynı sync_log_id için başarılı yenileme varsa tekrar çalışmaz ('already_refreshed').
--   • Eşzamanlılık: pg_advisory_xact_lock; hata: 'failed' + hata metni (senkron akışını bozmaz — çağıran taraf yakalar).
--   • Başarıda mutabakat özeti (fm_stock_reconciliation durumları) lineage'a yazılır → yenileme ve mutabakat aynı kayıtta.
-- fm_stock_freshness: XML'deki son log ↔ hafıza ↔ son başarılı yenileme; FRESH/STALE + açıklanamayan ürün sayısı.
-- Yalnız additive; ham tablolara dokunmaz. Geri alma: DROP VIEW fm_stock_freshness; DROP FUNCTION fm_stock_refresh_after_sync(text);

CREATE OR REPLACE FUNCTION public.fm_stock_refresh_after_sync(p_sync_log_id text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  s record;
  run_id uuid;
  r record;
  recon jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('fm_stock_refresh'));
  SELECT l.id, l.status::text AS status, l."completedAt" AS completed_at INTO s FROM public."XmlSyncLog" l WHERE l.id = p_sync_log_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('refreshed', false, 'reason', 'sync_log_not_found');
  END IF;
  IF EXISTS (SELECT 1 FROM public.fm_ingest_run WHERE kind = 'stock_refresh' AND status = 'succeeded' AND lineage ->> 'sync_log_id' = p_sync_log_id) THEN
    RETURN jsonb_build_object('refreshed', false, 'reason', 'already_refreshed', 'sync_log_id', p_sync_log_id);
  END IF;
  IF s.status <> 'SUCCESS' OR s.completed_at IS NULL THEN
    INSERT INTO public.fm_ingest_run (kind, status, finished_at, lineage)
    VALUES ('stock_refresh', 'failed', now(), jsonb_build_object('sync_log_id', p_sync_log_id, 'reason', 'sync_not_success', 'sync_status', s.status));
    RETURN jsonb_build_object('refreshed', false, 'reason', 'sync_not_success', 'sync_status', s.status);
  END IF;

  INSERT INTO public.fm_ingest_run (kind, status, lineage)
  VALUES ('stock_refresh', 'running', jsonb_build_object('sync_log_id', p_sync_log_id, 'sync_status', s.status))
  RETURNING id INTO run_id;
  BEGIN
    SELECT * INTO r FROM public.fm_stock_refresh();
    SELECT coalesce(jsonb_object_agg(x.status, x.n), '{}'::jsonb) INTO recon
      FROM (SELECT status, count(*) AS n FROM public.fm_stock_reconciliation GROUP BY status) x;
    UPDATE public.fm_ingest_run
       SET status = 'succeeded', finished_at = now(), rows_written = r.sku_day_rows + r.company_day_rows,
           range_from = (SELECT min(economic_date) FROM public.fm_stock_company_day), range_to = (SELECT max(economic_date) FROM public.fm_stock_company_day),
           lineage = lineage || jsonb_build_object('sku_day_rows', r.sku_day_rows, 'company_day_rows', r.company_day_rows, 'reconciliation', recon)
     WHERE id = run_id;
    RETURN jsonb_build_object('refreshed', true, 'run_id', run_id, 'sync_log_id', p_sync_log_id, 'sku_day_rows', r.sku_day_rows,
                              'company_day_rows', r.company_day_rows, 'reconciliation', recon);
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.fm_ingest_run SET status = 'failed', finished_at = now(), lineage = lineage || jsonb_build_object('reason', 'refresh_error', 'error', SQLERRM) WHERE id = run_id;
    RETURN jsonb_build_object('refreshed', false, 'reason', 'refresh_error', 'error', SQLERRM);
  END;
END
$$;

CREATE OR REPLACE VIEW public.fm_stock_freshness WITH (security_invoker = true) AS
SELECT (SELECT max("syncedAt") FROM public."XmlStockChangeLog") AS latest_xml_log_at,
       (SELECT max(known_at_max) FROM public.fm_stock_sku_day) AS memory_known_at,
       (SELECT max(finished_at) FROM public.fm_ingest_run WHERE kind = 'stock_refresh' AND status = 'succeeded') AS last_successful_refresh_at,
       (SELECT max("completedAt") FROM public."XmlSyncLog" WHERE status = 'SUCCESS') AS last_successful_sync_at,
       (SELECT count(*) FROM public.fm_stock_reconciliation WHERE status = 'UNEXPLAINED') AS unexplained_products,
       CASE WHEN coalesce((SELECT max(known_at_max) FROM public.fm_stock_sku_day), 'epoch'::timestamp)
                 >= coalesce((SELECT max("syncedAt") FROM public."XmlStockChangeLog"), 'epoch'::timestamp) THEN 'FRESH' ELSE 'STALE' END AS status;

DO $$
DECLARE r text;
BEGIN
  REVOKE EXECUTE ON FUNCTION public.fm_stock_refresh_after_sync(text) FROM PUBLIC;
  REVOKE ALL ON public.fm_stock_freshness FROM PUBLIC;
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.fm_stock_refresh_after_sync(text) FROM %I', r);
      EXECUTE format('REVOKE ALL ON public.fm_stock_freshness FROM %I', r);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cfo_acceptance_reader') THEN
    GRANT SELECT ON public.fm_stock_freshness TO cfo_acceptance_reader;
  END IF;
END
$$;

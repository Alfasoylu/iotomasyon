-- Financial Memory Step 1D — satış geçmişi backfill mekanizması (aylık parça, devam ettirilebilir, idempotent).
--
-- Akış: (1) fm_backfill_sales_snapshot: canonical görünümün anlık kopyası (MATERIALIZED VIEW; yenilenebilir, türetilmiş);
--       (2) fm_backfill_sales_run: ay ay fm_backfill_sales_month çağırır, tamamlanan parçaları atlar;
--       (3) fm_sales_memory_reconciliation_monthly: snapshot ↔ hafıza tabloları mutabakatı (fark 0 olmalı).
-- Ham tablolar değişmez. Yazılan yalnız fm_* hafıza tabloları; satır SİLİNMEZ: yeniden yazımda önceki satırlar
-- is_current=false işaretlenir, aynı anahtarlar upsert edilir (versiyon/lineage korunur).
-- Her ay parçası TEK transaction'dır ve yazım sonrası toplamlar snapshot ile doğrulanır; uyuşmazlıkta parça geri alınır.
-- Geri alma: fm_* fonksiyonlarını, fm_ingest_chunk'ı, snapshot'ı ve is_current kolonlarını kaldırmak yeterlidir (veri türetilmiştir).

-- Önceki sürümleri (1C) etkilemeden satır sürümü işareti.
ALTER TABLE public.fm_sales_company_day ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true;
ALTER TABLE public.fm_sales_channel_month ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true;
ALTER TABLE public.fm_sales_sku_month ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true;
ALTER TABLE public.fm_sales_sku_day ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true;

-- Hot-path view'ları yalnız güncel satırları gösterir (kolon listesi değişmez).
CREATE OR REPLACE VIEW public.fm_memory_sales_company_day WITH (security_invoker = true) AS
SELECT f.economic_date, f.revenue_incl_vat_try, f.revenue_ex_vat_try, f.vat_try, f.revenue_legacy_textile_try,
       f.revenue_incl_vat_try - f.revenue_legacy_textile_try AS revenue_alfas_incl_vat_try,
       f.units, f.orders, f.return_signal_orders, f.cancel_signal_orders,
       public.fm_grade('revenue_incl_vat_try', '*', f.economic_date) AS revenue_grade,
       public.fm_grade('revenue_ex_vat_try', '*', f.economic_date) AS revenue_ex_vat_grade,
       public.fm_grade('units', '*', f.economic_date) AS units_grade,
       public.fm_grade('orders', '*', f.economic_date) AS orders_grade,
       public.fm_grade('returns', '*', f.economic_date) AS returns_grade,
       f.known_at_min, f.known_at_max, f.flags, f.ingest_run_id
FROM public.fm_sales_company_day f WHERE f.is_current;

CREATE OR REPLACE VIEW public.fm_memory_sales_channel_month WITH (security_invoker = true) AS
SELECT f.month, f.channel, f.revenue_incl_vat_try, f.revenue_ex_vat_try, f.vat_try, f.revenue_legacy_textile_try,
       f.revenue_incl_vat_try - f.revenue_legacy_textile_try AS revenue_alfas_incl_vat_try,
       f.units, f.orders, f.return_signal_orders, f.cancel_signal_orders,
       public.fm_grade_month('revenue_incl_vat_try', f.channel, f.month) AS revenue_grade,
       public.fm_grade_month('units', f.channel, f.month) AS units_grade,
       public.fm_grade_month('orders', f.channel, f.month) AS orders_grade,
       public.fm_grade_month('returns', f.channel, f.month) AS returns_grade,
       f.known_at_min, f.known_at_max, f.flags, f.ingest_run_id
FROM public.fm_sales_channel_month f WHERE f.is_current;

CREATE OR REPLACE VIEW public.fm_memory_sales_sku_month WITH (security_invoker = true) AS
SELECT f.month, f.sku_key, f.product_id, f.sku_label, f.sku_mapped, f.legacy_business,
       f.revenue_incl_vat_try, f.revenue_ex_vat_try, f.units, f.orders,
       public.fm_grade_month('revenue_incl_vat_try', '*', f.month) AS revenue_grade,
       public.fm_grade_month('sku_identity', '*', f.month) AS sku_identity_grade,
       f.known_at_max, f.flags, f.ingest_run_id
FROM public.fm_sales_sku_month f WHERE f.is_current;

CREATE OR REPLACE VIEW public.fm_memory_sales_sku_day WITH (security_invoker = true) AS
SELECT f.economic_date, f.sku_key, f.product_id, f.sku_label, f.sku_mapped, f.legacy_business,
       f.revenue_incl_vat_try, f.units, f.orders,
       public.fm_grade('revenue_incl_vat_try', '*', f.economic_date) AS revenue_grade,
       public.fm_grade('sku_identity', '*', f.economic_date) AS sku_identity_grade,
       f.known_at_max, f.flags, f.ingest_run_id
FROM public.fm_sales_sku_day f WHERE f.is_current;

-- Canonical görünümün yenilenebilir kopyası (yalnız hafızanın ihtiyaç duyduğu kolonlar).
CREATE MATERIALIZED VIEW IF NOT EXISTS public.fm_sales_canonical_snapshot AS
SELECT sale_key, source_system, channel, order_key, economic_date, sku_raw, product_id, legacy_business,
       disposition, units_counted, revenue_incl_vat_try, amount_ex_vat_try, vat_try, known_at, quality_flags
FROM public.fm_sales_canonical;
CREATE UNIQUE INDEX IF NOT EXISTS fm_sales_canonical_snapshot_pk ON public.fm_sales_canonical_snapshot (sale_key);
CREATE INDEX IF NOT EXISTS fm_sales_canonical_snapshot_date_idx ON public.fm_sales_canonical_snapshot (economic_date);

CREATE TABLE IF NOT EXISTS public.fm_ingest_chunk (
  run_id uuid NOT NULL REFERENCES public.fm_ingest_run (id),
  chunk text NOT NULL,
  status text NOT NULL CHECK (status IN ('succeeded', 'failed', 'dry_run')),
  rows_written integer,
  revenue_incl_vat_try numeric,
  error text,
  done_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, chunk)
);

-- 1) Snapshot yenile + run lineage'ına kaydet.
CREATE OR REPLACE FUNCTION public.fm_backfill_sales_snapshot(p_run uuid)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  REFRESH MATERIALIZED VIEW public.fm_sales_canonical_snapshot;
  SELECT count(*) INTO n FROM public.fm_sales_canonical_snapshot;
  UPDATE public.fm_ingest_run
     SET lineage = lineage || jsonb_build_object('snapshot_rows', n, 'snapshot_refreshed_at', now())
   WHERE id = p_run;
  RETURN n;
END
$$;

-- 2) Bir ay: snapshot'tan hafıza tablolarına (veya dry-run: yalnız rapor).
CREATE OR REPLACE FUNCTION public.fm_backfill_sales_month(p_run uuid, p_month date, p_dry boolean DEFAULT false, p_today date DEFAULT current_date)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  m_end date := (p_month + interval '1 month')::date;
  sku_day_from date := p_today - 400;
  st_rev numeric; st_units numeric; st_rows bigint; st_orders bigint;
  w_company int := 0; w_channel int := 0; w_sku int := 0; w_skuday int := 0;
  chk_company numeric; chk_channel numeric; chk_sku numeric; chk_units numeric;
BEGIN
  IF p_month <> date_trunc('month', p_month)::date THEN RAISE EXCEPTION 'p_month ayın ilk günü olmalı: %', p_month; END IF;

  SELECT count(*), coalesce(sum(revenue_incl_vat_try) FILTER (WHERE disposition = 'COUNTED'), 0),
         coalesce(sum(units_counted) FILTER (WHERE disposition = 'COUNTED'), 0),
         count(DISTINCT channel || '|' || order_key) FILTER (WHERE disposition = 'COUNTED')
    INTO st_rows, st_rev, st_units, st_orders
  FROM public.fm_sales_canonical_snapshot WHERE economic_date >= p_month AND economic_date < m_end;

  IF p_dry THEN
    RETURN jsonb_build_object('month', p_month, 'dry_run', true, 'stage_rows', st_rows, 'revenue_incl_vat_try', st_rev,
                              'units', st_units, 'orders', st_orders);
  END IF;

  UPDATE public.fm_sales_company_day SET is_current = false WHERE economic_date >= p_month AND economic_date < m_end AND is_current;
  UPDATE public.fm_sales_channel_month SET is_current = false WHERE month = p_month AND is_current;
  UPDATE public.fm_sales_sku_month SET is_current = false WHERE month = p_month AND is_current;
  UPDATE public.fm_sales_sku_day SET is_current = false WHERE economic_date >= p_month AND economic_date < m_end AND is_current;

  WITH base AS (
    SELECT * FROM public.fm_sales_canonical_snapshot WHERE economic_date >= p_month AND economic_date < m_end
  ), flags AS (
    SELECT b.economic_date, array_agg(DISTINCT f ORDER BY f) AS flags
    FROM base b, unnest(b.quality_flags) f WHERE b.disposition = 'COUNTED' GROUP BY b.economic_date
  ), agg AS (
    SELECT economic_date,
      coalesce(sum(revenue_incl_vat_try) FILTER (WHERE disposition = 'COUNTED'), 0) AS revenue,
      CASE WHEN bool_and(amount_ex_vat_try IS NOT NULL) FILTER (WHERE disposition = 'COUNTED') THEN sum(amount_ex_vat_try) FILTER (WHERE disposition = 'COUNTED') END AS ex_vat,
      CASE WHEN bool_and(vat_try IS NOT NULL) FILTER (WHERE disposition = 'COUNTED') THEN sum(vat_try) FILTER (WHERE disposition = 'COUNTED') END AS vat,
      coalesce(bool_or(amount_ex_vat_try IS NOT NULL) FILTER (WHERE disposition = 'COUNTED') AND NOT bool_and(amount_ex_vat_try IS NOT NULL) FILTER (WHERE disposition = 'COUNTED'), false) AS ex_partial,
      coalesce(sum(revenue_incl_vat_try) FILTER (WHERE disposition = 'COUNTED' AND legacy_business IS NOT NULL), 0) AS legacy,
      coalesce(sum(units_counted) FILTER (WHERE disposition = 'COUNTED'), 0) AS units,
      count(DISTINCT channel || '|' || order_key) FILTER (WHERE disposition = 'COUNTED') AS orders,
      count(DISTINCT channel || '|' || order_key) FILTER (WHERE disposition = 'EXCLUDED_RETURN') AS ret,
      count(DISTINCT channel || '|' || order_key) FILTER (WHERE disposition = 'EXCLUDED_CANCELLED') AS canc,
      min(known_at) AS kmin, max(known_at) AS kmax
    FROM base GROUP BY economic_date
  )
  INSERT INTO public.fm_sales_company_day (economic_date, revenue_incl_vat_try, revenue_ex_vat_try, vat_try, revenue_legacy_textile_try, units, orders,
      return_signal_orders, cancel_signal_orders, known_at_min, known_at_max, flags, ingest_run_id)
  SELECT a.economic_date, a.revenue, a.ex_vat, a.vat, a.legacy, a.units, a.orders, a.ret, a.canc, a.kmin, a.kmax,
         CASE WHEN a.ex_partial THEN array_append(coalesce(f.flags, '{}'), 'ex_vat_partial') ELSE coalesce(f.flags, '{}') END, p_run
  FROM agg a LEFT JOIN flags f USING (economic_date)
  ON CONFLICT (economic_date) DO UPDATE SET revenue_incl_vat_try = EXCLUDED.revenue_incl_vat_try, revenue_ex_vat_try = EXCLUDED.revenue_ex_vat_try, vat_try = EXCLUDED.vat_try, revenue_legacy_textile_try = EXCLUDED.revenue_legacy_textile_try, units = EXCLUDED.units, orders = EXCLUDED.orders, return_signal_orders = EXCLUDED.return_signal_orders, cancel_signal_orders = EXCLUDED.cancel_signal_orders, known_at_min = EXCLUDED.known_at_min, known_at_max = EXCLUDED.known_at_max, flags = EXCLUDED.flags, ingest_run_id = EXCLUDED.ingest_run_id, is_current = true;
  GET DIAGNOSTICS w_company = ROW_COUNT;

  WITH base AS (
    SELECT * FROM public.fm_sales_canonical_snapshot WHERE economic_date >= p_month AND economic_date < m_end
  ), flags AS (
    SELECT b.channel, array_agg(DISTINCT f ORDER BY f) AS flags
    FROM base b, unnest(b.quality_flags) f WHERE b.disposition = 'COUNTED' GROUP BY b.channel
  ), agg AS (
    SELECT channel,
      coalesce(sum(revenue_incl_vat_try) FILTER (WHERE disposition = 'COUNTED'), 0) AS revenue,
      CASE WHEN bool_and(amount_ex_vat_try IS NOT NULL) FILTER (WHERE disposition = 'COUNTED') THEN sum(amount_ex_vat_try) FILTER (WHERE disposition = 'COUNTED') END AS ex_vat,
      CASE WHEN bool_and(vat_try IS NOT NULL) FILTER (WHERE disposition = 'COUNTED') THEN sum(vat_try) FILTER (WHERE disposition = 'COUNTED') END AS vat,
      coalesce(bool_or(amount_ex_vat_try IS NOT NULL) FILTER (WHERE disposition = 'COUNTED') AND NOT bool_and(amount_ex_vat_try IS NOT NULL) FILTER (WHERE disposition = 'COUNTED'), false) AS ex_partial,
      coalesce(sum(revenue_incl_vat_try) FILTER (WHERE disposition = 'COUNTED' AND legacy_business IS NOT NULL), 0) AS legacy,
      coalesce(sum(units_counted) FILTER (WHERE disposition = 'COUNTED'), 0) AS units,
      count(DISTINCT order_key) FILTER (WHERE disposition = 'COUNTED') AS orders,
      count(DISTINCT order_key) FILTER (WHERE disposition = 'EXCLUDED_RETURN') AS ret,
      count(DISTINCT order_key) FILTER (WHERE disposition = 'EXCLUDED_CANCELLED') AS canc,
      min(known_at) AS kmin, max(known_at) AS kmax
    FROM base GROUP BY channel
  )
  INSERT INTO public.fm_sales_channel_month (month, channel, revenue_incl_vat_try, revenue_ex_vat_try, vat_try, revenue_legacy_textile_try, units, orders,
      return_signal_orders, cancel_signal_orders, known_at_min, known_at_max, flags, ingest_run_id)
  SELECT p_month, a.channel, a.revenue, a.ex_vat, a.vat, a.legacy, a.units, a.orders, a.ret, a.canc, a.kmin, a.kmax,
         CASE WHEN a.ex_partial THEN array_append(coalesce(f.flags, '{}'), 'ex_vat_partial') ELSE coalesce(f.flags, '{}') END, p_run
  FROM agg a LEFT JOIN flags f USING (channel)
  ON CONFLICT (month, channel) DO UPDATE SET revenue_incl_vat_try = EXCLUDED.revenue_incl_vat_try, revenue_ex_vat_try = EXCLUDED.revenue_ex_vat_try, vat_try = EXCLUDED.vat_try, revenue_legacy_textile_try = EXCLUDED.revenue_legacy_textile_try, units = EXCLUDED.units, orders = EXCLUDED.orders, return_signal_orders = EXCLUDED.return_signal_orders, cancel_signal_orders = EXCLUDED.cancel_signal_orders, known_at_min = EXCLUDED.known_at_min, known_at_max = EXCLUDED.known_at_max, flags = EXCLUDED.flags, ingest_run_id = EXCLUDED.ingest_run_id, is_current = true;
  GET DIAGNOSTICS w_channel = ROW_COUNT;

  WITH base AS (
    SELECT s.*, CASE WHEN s.product_id IS NOT NULL THEN 'P:' || s.product_id
                     WHEN s.sku_raw IS NOT NULL THEN 'R:' || public.cfo_norm(s.sku_raw) ELSE 'R:(none)' END AS sku_key
    FROM public.fm_sales_canonical_snapshot s
    WHERE s.economic_date >= p_month AND s.economic_date < m_end AND s.disposition = 'COUNTED'
  ), flags AS (
    SELECT b.sku_key, array_agg(DISTINCT f ORDER BY f) AS flags FROM base b, unnest(b.quality_flags) f GROUP BY b.sku_key
  ), agg AS (
    SELECT sku_key, max(product_id) AS product_id, mode() WITHIN GROUP (ORDER BY sku_raw) AS label, bool_or(product_id IS NOT NULL) AS mapped,
      max(legacy_business) AS legacy_business, sum(revenue_incl_vat_try) AS revenue,
      CASE WHEN bool_and(amount_ex_vat_try IS NOT NULL) THEN sum(amount_ex_vat_try) END AS ex_vat,
      sum(units_counted) AS units, count(DISTINCT channel || '|' || order_key) AS orders, max(known_at) AS kmax
    FROM base GROUP BY sku_key
  )
  INSERT INTO public.fm_sales_sku_month (month, sku_key, product_id, sku_label, sku_mapped, legacy_business, revenue_incl_vat_try, revenue_ex_vat_try,
      units, orders, known_at_max, flags, ingest_run_id)
  SELECT p_month, a.sku_key, a.product_id, a.label, a.mapped, a.legacy_business, a.revenue, a.ex_vat, a.units, a.orders, a.kmax, coalesce(f.flags, '{}'), p_run
  FROM agg a LEFT JOIN flags f USING (sku_key)
  ON CONFLICT (month, sku_key) DO UPDATE SET product_id = EXCLUDED.product_id, sku_label = EXCLUDED.sku_label, sku_mapped = EXCLUDED.sku_mapped, legacy_business = EXCLUDED.legacy_business, revenue_incl_vat_try = EXCLUDED.revenue_incl_vat_try, revenue_ex_vat_try = EXCLUDED.revenue_ex_vat_try, units = EXCLUDED.units, orders = EXCLUDED.orders, known_at_max = EXCLUDED.known_at_max, flags = EXCLUDED.flags, ingest_run_id = EXCLUDED.ingest_run_id, is_current = true;
  GET DIAGNOSTICS w_sku = ROW_COUNT;

  IF m_end > sku_day_from THEN
    WITH base AS (
      SELECT s.*, CASE WHEN s.product_id IS NOT NULL THEN 'P:' || s.product_id
                       WHEN s.sku_raw IS NOT NULL THEN 'R:' || public.cfo_norm(s.sku_raw) ELSE 'R:(none)' END AS sku_key
      FROM public.fm_sales_canonical_snapshot s
      WHERE s.economic_date >= greatest(p_month, sku_day_from) AND s.economic_date < m_end AND s.disposition = 'COUNTED'
    ), flags AS (
      SELECT b.economic_date, b.sku_key, array_agg(DISTINCT f ORDER BY f) AS flags FROM base b, unnest(b.quality_flags) f GROUP BY b.economic_date, b.sku_key
    ), agg AS (
      SELECT economic_date, sku_key, max(product_id) AS product_id, mode() WITHIN GROUP (ORDER BY sku_raw) AS label, bool_or(product_id IS NOT NULL) AS mapped,
        max(legacy_business) AS legacy_business, sum(revenue_incl_vat_try) AS revenue, sum(units_counted) AS units,
        count(DISTINCT channel || '|' || order_key) AS orders, max(known_at) AS kmax
      FROM base GROUP BY economic_date, sku_key
    )
    INSERT INTO public.fm_sales_sku_day (economic_date, sku_key, product_id, sku_label, sku_mapped, legacy_business, revenue_incl_vat_try, units, orders,
        known_at_max, flags, ingest_run_id)
    SELECT a.economic_date, a.sku_key, a.product_id, a.label, a.mapped, a.legacy_business, a.revenue, a.units, a.orders, a.kmax, coalesce(f.flags, '{}'), p_run
    FROM agg a LEFT JOIN flags f USING (economic_date, sku_key)
  ON CONFLICT (economic_date, sku_key) DO UPDATE SET product_id = EXCLUDED.product_id, sku_label = EXCLUDED.sku_label, sku_mapped = EXCLUDED.sku_mapped, legacy_business = EXCLUDED.legacy_business, revenue_incl_vat_try = EXCLUDED.revenue_incl_vat_try, units = EXCLUDED.units, orders = EXCLUDED.orders, known_at_max = EXCLUDED.known_at_max, flags = EXCLUDED.flags, ingest_run_id = EXCLUDED.ingest_run_id, is_current = true;
    GET DIAGNOSTICS w_skuday = ROW_COUNT;
  END IF;

  SELECT coalesce(sum(revenue_incl_vat_try), 0), coalesce(sum(units), 0) INTO chk_company, chk_units
    FROM public.fm_sales_company_day WHERE economic_date >= p_month AND economic_date < m_end AND is_current;
  SELECT coalesce(sum(revenue_incl_vat_try), 0) INTO chk_channel FROM public.fm_sales_channel_month WHERE month = p_month AND is_current;
  SELECT coalesce(sum(revenue_incl_vat_try), 0) INTO chk_sku FROM public.fm_sales_sku_month WHERE month = p_month AND is_current;
  IF chk_company <> st_rev OR chk_channel <> st_rev OR chk_sku <> st_rev OR chk_units <> st_units THEN
    RAISE EXCEPTION 'fm backfill mutabakat hatası % : snapshot % / gün % / kanal % / sku % ; adet snapshot % / gün %',
      p_month, st_rev, chk_company, chk_channel, chk_sku, st_units, chk_units;
  END IF;

  RETURN jsonb_build_object('month', p_month, 'dry_run', false, 'stage_rows', st_rows, 'revenue_incl_vat_try', st_rev, 'units', st_units, 'orders', st_orders,
                            'company_day_rows', w_company, 'channel_month_rows', w_channel, 'sku_month_rows', w_sku, 'sku_day_rows', w_skuday);
END
$$;

-- 3) Aralık: ay ay işler, tamamlanan parçaları atlar (devam ettirilebilir), ilk hatada durur.
CREATE OR REPLACE FUNCTION public.fm_backfill_sales_run(p_run uuid, p_from date, p_to date, p_max_chunks integer DEFAULT 12,
                                                         p_dry boolean DEFAULT false, p_today date DEFAULT current_date)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  m date := date_trunc('month', p_from)::date;
  last_m date := date_trunc('month', p_to)::date;
  done_n int := 0; skipped int := 0; res jsonb; results jsonb := '[]'::jsonb; failed jsonb := NULL;
BEGIN
  WHILE m <= last_m AND done_n < p_max_chunks LOOP
    IF NOT p_dry AND EXISTS (SELECT 1 FROM public.fm_ingest_chunk WHERE run_id = p_run AND chunk = m::text AND status = 'succeeded') THEN
      skipped := skipped + 1;
    ELSE
      BEGIN
        res := public.fm_backfill_sales_month(p_run, m, p_dry, p_today);
        IF NOT p_dry THEN
          INSERT INTO public.fm_ingest_chunk (run_id, chunk, status, rows_written, revenue_incl_vat_try)
          VALUES (p_run, m::text, 'succeeded', coalesce((res->>'company_day_rows')::int, 0) + coalesce((res->>'channel_month_rows')::int, 0)
                  + coalesce((res->>'sku_month_rows')::int, 0) + coalesce((res->>'sku_day_rows')::int, 0), (res->>'revenue_incl_vat_try')::numeric)
          ON CONFLICT (run_id, chunk) DO UPDATE SET status = 'succeeded', rows_written = EXCLUDED.rows_written,
            revenue_incl_vat_try = EXCLUDED.revenue_incl_vat_try, error = NULL, done_at = now();
        END IF;
        results := results || jsonb_build_array(res);
        done_n := done_n + 1;
      EXCEPTION WHEN OTHERS THEN
        failed := jsonb_build_object('month', m, 'error', SQLERRM);
        INSERT INTO public.fm_ingest_chunk (run_id, chunk, status, error) VALUES (p_run, m::text, 'failed', SQLERRM)
          ON CONFLICT (run_id, chunk) DO UPDATE SET status = 'failed', error = EXCLUDED.error, done_at = now();
        EXIT;
      END;
    END IF;
    m := (m + interval '1 month')::date;
  END LOOP;
  RETURN jsonb_build_object('processed', done_n, 'skipped_done', skipped, 'next_month', CASE WHEN m <= last_m THEN m END,
                            'finished', failed IS NULL AND m > last_m, 'failed', failed, 'chunks', results);
END
$$;

-- 4) Mutabakat: snapshot ↔ GÜNCEL hafıza. Fark kolonları 0 olmalı; backfilled=false ay henüz yazılmamıştır.
CREATE OR REPLACE VIEW public.fm_sales_memory_reconciliation_monthly WITH (security_invoker = true) AS
WITH st AS (
  SELECT date_trunc('month', s.economic_date)::date AS month,
         sum(s.revenue_incl_vat_try) FILTER (WHERE s.disposition = 'COUNTED') AS snapshot_revenue,
         sum(s.units_counted) FILTER (WHERE s.disposition = 'COUNTED') AS snapshot_units
  FROM public.fm_sales_canonical_snapshot s GROUP BY 1
),
cd AS (SELECT date_trunc('month', economic_date)::date AS month, sum(revenue_incl_vat_try) AS rev, sum(units) AS units
       FROM public.fm_sales_company_day WHERE is_current GROUP BY 1),
cm AS (SELECT month, sum(revenue_incl_vat_try) AS rev FROM public.fm_sales_channel_month WHERE is_current GROUP BY 1),
sm AS (SELECT month, sum(revenue_incl_vat_try) AS rev FROM public.fm_sales_sku_month WHERE is_current GROUP BY 1)
SELECT st.month, coalesce(st.snapshot_revenue, 0) AS snapshot_revenue_incl_vat_try,
       (cd.month IS NOT NULL OR cm.month IS NOT NULL OR sm.month IS NOT NULL) AS backfilled,
       coalesce(cd.rev, 0) AS company_day_revenue, coalesce(cm.rev, 0) AS channel_month_revenue, coalesce(sm.rev, 0) AS sku_month_revenue,
       coalesce(st.snapshot_revenue, 0) - coalesce(cd.rev, 0) AS diff_company_day,
       coalesce(st.snapshot_revenue, 0) - coalesce(cm.rev, 0) AS diff_channel_month,
       coalesce(st.snapshot_revenue, 0) - coalesce(sm.rev, 0) AS diff_sku_month,
       coalesce(st.snapshot_units, 0) - coalesce(cd.units, 0) AS diff_units
FROM st LEFT JOIN cd USING (month) LEFT JOIN cm USING (month) LEFT JOIN sm USING (month);

-- ───────────── Güvenlik ─────────────
DO $$
DECLARE o text;
BEGIN
  FOREACH o IN ARRAY ARRAY['fm_sales_canonical_snapshot', 'fm_ingest_chunk', 'fm_sales_memory_reconciliation_monthly'] LOOP
    IF o = 'fm_ingest_chunk' THEN EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', o); END IF;
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', o);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON public.%I FROM anon', o); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', o); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cfo_acceptance_reader') THEN
      EXECUTE format('GRANT SELECT ON public.%I TO cfo_acceptance_reader', o);
      IF o = 'fm_ingest_chunk' AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = o AND policyname = 'cfo_acceptance_reader_select') THEN
        EXECUTE format('CREATE POLICY cfo_acceptance_reader_select ON public.%I FOR SELECT TO cfo_acceptance_reader USING (true)', o);
      END IF;
    END IF;
  END LOOP;
  -- Yazan fonksiyonlar yalnız sahibin/servis rolünün çalıştırması içindir: reader ve herkes için kapalı.
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.fm_backfill_sales_snapshot(uuid) FROM PUBLIC';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.fm_backfill_sales_month(uuid, date, boolean, date) FROM PUBLIC';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION public.fm_backfill_sales_run(uuid, date, date, integer, boolean, date) FROM PUBLIC';
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.fm_backfill_sales_snapshot(uuid) FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.fm_backfill_sales_month(uuid, date, boolean, date) FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.fm_backfill_sales_run(uuid, date, date, integer, boolean, date) FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.fm_backfill_sales_snapshot(uuid) FROM authenticated';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.fm_backfill_sales_month(uuid, date, boolean, date) FROM authenticated';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.fm_backfill_sales_run(uuid, date, date, integer, boolean, date) FROM authenticated';
  END IF;
END
$$;

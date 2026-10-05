-- Financial Memory Step 1E — stok adedi + bakiye hafızası.
-- Yalnız additive: yeni tablolar/fonksiyonlar/view'lar; ham tablolar (XmlStockChangeLog, cfo_snapshot, cfo_banka_hareket) DEĞİŞMEZ.
-- Stok: XmlStockChangeLog seviye zinciri (previousQty→newQty) gün sonu seviyesine indirgenir; zincir kopukluğu 0 doğrulandı.
--   fm_stock_sku_day  : yalnız değişiklik günleri (seyrek); gün sonu adet. Değişmeyen günler = önceki seviye (carry-forward).
--   fm_stock_company_day: zinciri başlamış ürünlerin toplam adedi (loglanmamış ürünler DIŞARIDA → stock_unlogged_products_excluded).
-- Bakiye: cfo_snapshot YALNIZ v2 tanımı (≥ 2026-09-11) alınır; v1 (net sermaye/borç/alacak) bu seriye KARIŞTIRILMAZ.
--   Snapshot'ı olmayan gün bilinmiyor (satır yok, carry-forward yok). Banka hareketinden nakit türetilmedi (docs/FINANCIAL-MEMORY.md).
-- Geri alma: DROP VIEW fm_memory_*; DROP FUNCTION fm_stock_refresh/fm_balance_refresh; DROP TABLE fm_stock_*, fm_balance_day;

CREATE TABLE IF NOT EXISTS public.fm_stock_sku_day (
  product_id text NOT NULL,
  economic_date date NOT NULL,
  sku text,
  units_eod integer NOT NULL CHECK (units_eod >= 0),
  units_open integer NOT NULL CHECK (units_open >= 0),
  change_count integer NOT NULL CHECK (change_count > 0),
  known_at_max timestamp NOT NULL,
  PRIMARY KEY (product_id, economic_date)
);
CREATE TABLE IF NOT EXISTS public.fm_stock_company_day (
  economic_date date PRIMARY KEY,
  units_total_logged bigint NOT NULL,
  products_logged integer NOT NULL,
  products_changed integer NOT NULL,
  flags text[] NOT NULL DEFAULT '{stock_unlogged_products_excluded}'
);
CREATE TABLE IF NOT EXISTS public.fm_balance_day (
  economic_date date NOT NULL,
  metric_key text NOT NULL REFERENCES public.fm_metric (metric_key),
  definition_version integer NOT NULL,
  value_try numeric(18, 2) NOT NULL,
  source text NOT NULL,
  known_at timestamp NOT NULL,
  PRIMARY KEY (economic_date, metric_key, definition_version)
);

INSERT INTO public.fm_quality_flag (flag, severity, description) VALUES
 ('stock_unlogged_products_excluded', 'warn', 'XML stok zinciri yalnız log yazılan ürünleri kapsar; hiç logu olmayan ürünler toplama dahil değil.'),
 ('balance_snapshot_gap_day',         'info', 'O gün cfo_snapshot yok; değer bilinmiyor (carry-forward yapılmadı).')
ON CONFLICT (flag) DO NOTHING;

-- Stok: seyrek gün sonu seviyeleri + günlük şirket toplamı. Upsert (silme yok); kaynak değişirse yeniden çalıştırılabilir.
CREATE OR REPLACE FUNCTION public.fm_stock_refresh() RETURNS TABLE (sku_day_rows bigint, company_day_rows bigint) LANGUAGE plpgsql AS $$
DECLARE a bigint; b bigint;
BEGIN
  INSERT INTO public.fm_stock_sku_day (product_id, economic_date, sku, units_eod, units_open, change_count, known_at_max)
  SELECT l."productId", l."syncedAt"::date, max(p.sku),
         (array_agg(l."newQty" ORDER BY l."syncedAt" DESC, l.id DESC))[1],
         (array_agg(l."previousQty" ORDER BY l."syncedAt" ASC, l.id ASC))[1],
         count(*)::int, max(l."syncedAt")
  FROM public."XmlStockChangeLog" l LEFT JOIN public."Product" p ON p.id = l."productId"
  GROUP BY l."productId", l."syncedAt"::date
  ON CONFLICT (product_id, economic_date) DO UPDATE SET sku = EXCLUDED.sku, units_eod = EXCLUDED.units_eod,
    units_open = EXCLUDED.units_open, change_count = EXCLUDED.change_count, known_at_max = EXCLUDED.known_at_max;
  GET DIAGNOSTICS a = ROW_COUNT;

  -- Ürün zinciri ilk logunun gününde başlar (açılış = previousQty); sonra carry-forward ile toplam.
  INSERT INTO public.fm_stock_company_day (economic_date, units_total_logged, products_logged, products_changed)
  SELECT d.day,
         sum(coalesce(last_eod.units_eod, first_open.units_open))::bigint,
         count(*)::int,
         count(chg.product_id)::int
  FROM (SELECT generate_series(min(economic_date), max(economic_date), interval '1 day')::date AS day FROM public.fm_stock_sku_day) d
  JOIN (SELECT product_id, min(economic_date) AS first_day FROM public.fm_stock_sku_day GROUP BY product_id) fp ON fp.first_day <= d.day
  LEFT JOIN LATERAL (SELECT units_eod FROM public.fm_stock_sku_day s WHERE s.product_id = fp.product_id AND s.economic_date <= d.day
                     ORDER BY s.economic_date DESC LIMIT 1) last_eod ON true
  LEFT JOIN LATERAL (SELECT units_open FROM public.fm_stock_sku_day s WHERE s.product_id = fp.product_id
                     ORDER BY s.economic_date ASC LIMIT 1) first_open ON true
  LEFT JOIN public.fm_stock_sku_day chg ON chg.product_id = fp.product_id AND chg.economic_date = d.day
  GROUP BY d.day
  ON CONFLICT (economic_date) DO UPDATE SET units_total_logged = EXCLUDED.units_total_logged,
    products_logged = EXCLUDED.products_logged, products_changed = EXCLUDED.products_changed;
  GET DIAGNOSTICS b = ROW_COUNT;
  RETURN QUERY SELECT a, b;
END
$$;

-- Bakiye: cfo_snapshot v2 (≥ p_v2_from) gün başına son snapshot; v1 satırları alınmaz.
CREATE OR REPLACE FUNCTION public.fm_balance_refresh(p_v2_from date DEFAULT DATE '2026-09-11') RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  INSERT INTO public.fm_balance_day (economic_date, metric_key, definition_version, value_try, source, known_at)
  SELECT s.d, m.metric_key, 2, m.v, 'cfo_snapshot', s.known_at
  FROM (SELECT DISTINCT ON ("takenAt"::date) "takenAt"::date AS d, "takenAt" AS known_at, "cashTry", "debtTry", "receivablesTry", "netWorthTry", "stockTry"
        FROM public.cfo_snapshot WHERE "takenAt"::date >= p_v2_from ORDER BY "takenAt"::date, "takenAt" DESC) s
  CROSS JOIN LATERAL (VALUES ('cash_try', s."cashTry"), ('debt_try', s."debtTry"), ('receivables_try', s."receivablesTry"),
                             ('net_capital_try', s."netWorthTry"), ('inventory_value_try', s."stockTry")) AS m(metric_key, v)
  WHERE m.v IS NOT NULL
  ON CONFLICT (economic_date, metric_key, definition_version) DO UPDATE SET value_try = EXCLUDED.value_try,
    source = EXCLUDED.source, known_at = EXCLUDED.known_at;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$$;

CREATE OR REPLACE VIEW public.fm_memory_stock_company_day AS
SELECT c.economic_date, c.units_total_logged, c.products_logged, c.products_changed, c.flags,
       public.fm_grade('inventory_units', '*', c.economic_date) AS inventory_units_grade
FROM public.fm_stock_company_day c;

CREATE OR REPLACE VIEW public.fm_memory_balance_day AS
SELECT b.economic_date, b.metric_key, b.definition_version, b.value_try, b.source, b.known_at,
       public.fm_grade(b.metric_key, '*', b.economic_date) AS grade
FROM public.fm_balance_day b;

DO $$
DECLARE o text;
BEGIN
  FOREACH o IN ARRAY ARRAY['fm_stock_sku_day','fm_stock_company_day','fm_balance_day'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', o);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', o);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON public.%I FROM anon', o); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', o); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cfo_acceptance_reader') THEN
      EXECUTE format('GRANT SELECT ON public.%I TO cfo_acceptance_reader', o);
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = o AND policyname = 'cfo_acceptance_reader_select') THEN
        EXECUTE format('CREATE POLICY cfo_acceptance_reader_select ON public.%I FOR SELECT TO cfo_acceptance_reader USING (true)', o);
      END IF;
    END IF;
  END LOOP;
  FOREACH o IN ARRAY ARRAY['fm_memory_stock_company_day','fm_memory_balance_day'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', o);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON public.%I FROM anon', o); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', o); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cfo_acceptance_reader') THEN EXECUTE format('GRANT SELECT ON public.%I TO cfo_acceptance_reader', o); END IF;
  END LOOP;
  REVOKE EXECUTE ON FUNCTION public.fm_stock_refresh() FROM PUBLIC;
  REVOKE EXECUTE ON FUNCTION public.fm_balance_refresh(date) FROM PUBLIC;
END
$$;

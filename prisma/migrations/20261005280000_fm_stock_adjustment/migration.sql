-- Financial Memory — belgelenmiş stok düzeltmeleri (fiziki sayım / manuel düzeltme) katmanı.
--
-- Sorun: XmlStockChangeLog zinciri yalnız XML senkronunun gördüğü değişimleri taşır. Fiziki sayımla `Product.stockQuantity`
-- güncellendiğinde zincir bunu görmez (AL-CAM03: zincir 1.497, sayım 11.09.2026 → 1.940, Product 12.09.2026'da güncellendi).
-- Çözüm: "gözlenen" (XML zinciri) ile "düzeltilmiş" (zincir + belgelenmiş düzeltmeler) gerçekliği AYRI tutmak.
--   fm_stock_company_day / fm_memory_stock_company_day  → DEĞİŞMEZ: yalnız XML'de gözlenen
--   fm_stock_adjustment                                  → belgelenmiş düzeltme + kaynak/kanıt (silinmez, geriye dönük uygulanmaz)
--   fm_memory_stock_adjusted_company_day                 → gözlenen + düzeltme (sayım gününden itibaren) + bayrak
--   fm_stock_reconciliation                              → ürün bazında zincir + düzeltme ↔ Product.stockQuantity; açıklanamayan fark = UNEXPLAINED
-- economic_date = sayımın yapıldığı gün (gerçeğin bilindiği an); applied_at = Product'ın güncellendiği an (sistemin bildiği an).
-- Sayımdan ÖNCEKİ günlere düzeltme uygulanmaz: farkın ne zaman doğduğu bilinmiyor.
-- Yalnız additive; ham tablolara dokunmaz. Geri alma: DROP VIEW fm_stock_reconciliation, fm_memory_stock_adjusted_company_day; DROP TABLE fm_stock_adjustment;

CREATE TABLE IF NOT EXISTS public.fm_stock_adjustment (
  adjustment_key text PRIMARY KEY,
  product_id text NOT NULL,
  sku text,
  economic_date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('PHYSICAL_COUNT', 'MANUAL_CORRECTION')),
  units_before integer NOT NULL CHECK (units_before >= 0),
  units_after integer NOT NULL CHECK (units_after >= 0),
  delta integer GENERATED ALWAYS AS (units_after - units_before) STORED,
  applied_at timestamp NOT NULL,
  xml_last_log_at timestamp,
  xml_last_qty integer,
  source text NOT NULL,
  source_ref text NOT NULL,
  counted_by text,
  resolution text NOT NULL CHECK (resolution IN ('EXPLAINED', 'OPEN')),
  note text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (applied_at::date >= economic_date)
);

INSERT INTO public.fm_quality_flag (flag, severity, description) VALUES
 ('manual_count_adjustment', 'info', 'Stok toplamı belgelenmiş fiziki sayım/manuel düzeltme içeriyor; XML hareketi değildir (fm_stock_adjustment).')
ON CONFLICT (flag) DO NOTHING;

-- AL-CAM03: 11.09.2026 fiziki sayım, 12.09.2026 Product düzeltmesi (cfo_change_log kaydı + Product.updatedAt kanıtı).
INSERT INTO public.fm_stock_adjustment (adjustment_key, product_id, sku, economic_date, kind, units_before, units_after, applied_at,
    xml_last_log_at, xml_last_qty, source, source_ref, counted_by, resolution, note)
SELECT 'AL-CAM03:2026-09-11:PHYSICAL_COUNT', p.id, p.sku, DATE '2026-09-11', 'PHYSICAL_COUNT', 1497, 1940, TIMESTAMP '2026-09-12 05:11:25.17',
       TIMESTAMP '2026-06-21 02:36:18.406', 1497, 'cfo_change_log',
       'area=stok changedAt=2026-09-12 05:12:07.462 item="AL-CAM03 fiziki sayim: defter 1.497 -> gercek 1.940"; Product.updatedAt=2026-09-12 05:11:25.17; stockSource=MANUAL',
       'Alperen', 'EXPLAINED',
       '443 adet farkı XML zincir hatası değil: XML''de tek log var (2026-06-21, 0→1.497); sayım düzeltmesi Product''a yazıldı, StockAdjustmentLog''a ve XML zincirine yazılmadı.'
FROM public."Product" p WHERE p.sku = 'AL-CAM03'
ON CONFLICT (adjustment_key) DO NOTHING;

CREATE OR REPLACE VIEW public.fm_memory_stock_adjusted_company_day WITH (security_invoker = true) AS
SELECT c.economic_date,
       c.units_total_logged AS units_observed_xml,
       coalesce(a.delta_cum, 0)::bigint AS units_adjustments_cum,
       (c.units_total_logged + coalesce(a.delta_cum, 0))::bigint AS units_adjusted,
       c.products_logged,
       CASE WHEN coalesce(a.delta_cum, 0) <> 0 THEN array_append(c.flags, 'manual_count_adjustment') ELSE c.flags END AS flags,
       public.fm_grade('inventory_units', '*', c.economic_date) AS inventory_units_grade
FROM public.fm_stock_company_day c
LEFT JOIN LATERAL (
  SELECT sum(x.delta)::bigint AS delta_cum FROM public.fm_stock_adjustment x
  WHERE x.economic_date <= c.economic_date
    AND EXISTS (SELECT 1 FROM public.fm_stock_sku_day s WHERE s.product_id = x.product_id AND s.economic_date <= c.economic_date)
) a ON true;

CREATE OR REPLACE VIEW public.fm_stock_reconciliation WITH (security_invoker = true) AS
WITH last_chain AS (
  SELECT DISTINCT ON (product_id) product_id, sku, units_eod AS chain_last_qty, economic_date AS chain_last_date
  FROM public.fm_stock_sku_day ORDER BY product_id, economic_date DESC
), adj AS (
  SELECT product_id, sum(delta)::integer AS adj_delta FROM public.fm_stock_adjustment GROUP BY product_id
)
SELECT l.product_id, l.sku, l.chain_last_date, l.chain_last_qty, coalesce(a.adj_delta, 0) AS adjustments_delta,
       l.chain_last_qty + coalesce(a.adj_delta, 0) AS expected_qty, p."stockQuantity" AS product_qty,
       p."stockQuantity" - (l.chain_last_qty + coalesce(a.adj_delta, 0)) AS unexplained_diff,
       CASE WHEN p."stockQuantity" <> l.chain_last_qty + coalesce(a.adj_delta, 0) THEN 'UNEXPLAINED'
            WHEN coalesce(a.adj_delta, 0) <> 0 THEN 'MATCH_AFTER_ADJUSTMENT' ELSE 'MATCH' END AS status
FROM last_chain l JOIN public."Product" p ON p.id = l.product_id LEFT JOIN adj a ON a.product_id = l.product_id;

DO $$
DECLARE o text; r text;
BEGIN
  ALTER TABLE public.fm_stock_adjustment ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.fm_stock_adjustment, public.fm_memory_stock_adjusted_company_day, public.fm_stock_reconciliation FROM PUBLIC;
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON public.fm_stock_adjustment, public.fm_memory_stock_adjusted_company_day, public.fm_stock_reconciliation FROM %I', r);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cfo_acceptance_reader') THEN
    GRANT SELECT ON public.fm_stock_adjustment, public.fm_memory_stock_adjusted_company_day, public.fm_stock_reconciliation TO cfo_acceptance_reader;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fm_stock_adjustment' AND policyname = 'cfo_acceptance_reader_select') THEN
      CREATE POLICY cfo_acceptance_reader_select ON public.fm_stock_adjustment FOR SELECT TO cfo_acceptance_reader USING (true);
    END IF;
  END IF;
END
$$;

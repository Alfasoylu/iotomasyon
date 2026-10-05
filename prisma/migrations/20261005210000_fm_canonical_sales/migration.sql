-- Financial Memory Step 1B — Canonical Sales Layer (YALNIZ VIEW; ham tablolar değişmez).
--
-- Tek canonical satış katmanı. Financial Memory (1C+) yalnız buradan beslenir.
-- Kurallar (Phase 0B kanıtlarıyla belirlendi; docs/FINANCIAL-MEMORY.md):
--   * Aynı ekonomik satış katmanda YALNIZ BİR KEZ bulunur (Trendyol: Marketplace ↔ TrendyolSalesRecord
--     sipariş anahtarıyla; Marketplace.orderNumber'ın ikinci parçası = Trendyol.orderId).
--   * Trendyol, 2026-05-04'ten önce Marketplace birincil; Trendyol API yalnız Marketplace'te OLMAYAN
--     siparişleri doldurur (Şubat 2026 Entegra deliği = gap-fill). 2026-05-04'ten itibaren Trendyol API
--     birincil; Marketplace yalnız Trendyol'da OLMAYAN siparişler için yedek.
--   * İptal edilen siparişler gelire girmez; Marketplace 'İade-İptal' durumu eşleşen Trendyol siparişine
--     işlenir (Trendyol 'Delivered' gösterse bile). İade/iptal tutarı 0 KABUL EDİLMEZ: disposition ile ayrı izlenir.
--   * Gelir = KDV dahil totalAmountTry (canonical başlık metriği). KDV hariç / KDV değeri yalnız
--     kaynakta varsa (Marketplace); yoksa NULL + 'ex_vat_unknown'.
--   * Set/paket adet düzeltmesi YALNIZ adedi etkiler (v1 cfo_satis_birim_duz mantığı); gelir değişmez.
--   * IDEASOFT dahildir (v1 view'ı dışlıyordu; 'ideasoft_v1_excluded' flag'i fark için taşınır).
--   * Legacy tekstil (Armine/AlinModest) 'legacy_business' ile etiketlenir, silinmez.
--
-- Güvenlik: security_invoker (taban tablo RLS/yetkileri çağıranın yetkisiyle); anon/authenticated/PUBLIC
-- yetkisi kaldırılır; yalnız cfo_acceptance_reader'a SELECT.
-- Geri alma: DROP VIEW fm_sales_reconciliation_monthly, fm_sales_canonical, fm_sales_dispositioned, fm_sales_source_rows;

DO $$
BEGIN
  IF to_regprocedure('public.cfo_norm(text)') IS NULL THEN
    EXECUTE $q$ CREATE FUNCTION public.cfo_norm(t text) RETURNS text LANGUAGE sql IMMUTABLE AS
      $body$ select upper(regexp_replace(coalesce(t,''), '[^0-9A-Za-zÇĞİÖŞÜçğıöşü]', '', 'g')) $body$ $q$;
  END IF;
END
$$;

-- 1) Ham kaynak satırları ortak şekle indirgenir (hiçbir değer değiştirilmez/toplanmaz).
CREATE OR REPLACE VIEW public.fm_sales_source_rows WITH (security_invoker = true) AS
SELECT
  'MARKETPLACE'::text AS source_system,
  r.id::text AS source_row_id,
  r.channel::text AS channel,
  CASE WHEN r.channel = 'TRENDYOL' AND r."orderNumber" ~ '^[0-9]+-[0-9]+$'
       THEN split_part(r."orderNumber", '-', 2) ELSE r."orderNumber" END AS order_key,
  coalesce(r."externalLineId", r.id)::text AS line_key,
  r."orderDate"::date AS economic_date,
  r.status::text AS status_raw,
  nullif(btrim(r."modelNumber"), '') AS sku_raw,
  r."productId"::text AS product_id,
  r."productName"::text AS product_name,
  r.quantity::numeric AS quantity_raw,
  r."totalAmountTry"::numeric AS amount_incl_vat_try,
  r."grossAmountTry"::numeric AS amount_ex_vat_try,
  r."vatAmountTry"::numeric AS vat_try,
  lower(btrim(coalesce(r."customerInvoiceName", ''))) AS customer_name_lc,
  r."importedAt"::timestamp AS known_at
FROM public."MarketplaceSalesRecord" r
UNION ALL
SELECT
  'TRENDYOL_API'::text,
  t.id::text,
  'TRENDYOL'::text,
  t."orderId"::text,
  t."lineId"::text,
  t."orderDate"::date,
  t.status::text,
  coalesce(nullif(btrim(p.sku), ''), nullif(btrim(t."merchantSku"), '')),
  t."productId"::text,
  t."productName"::text,
  t.quantity::numeric,
  t."totalPriceTry"::numeric,
  NULL::numeric,
  NULL::numeric,
  ''::text,
  t."syncedAt"::timestamp
FROM public."TrendyolSalesRecord" t
LEFT JOIN public."Product" p ON p.id = t."productId";

-- 2) Kaynak önceliği + dedupe + durum sınıfı. Her ham satır TAM BİR disposition alır.
CREATE OR REPLACE VIEW public.fm_sales_dispositioned WITH (security_invoker = true) AS
WITH cfg AS (SELECT DATE '2026-05-04' AS t_primary_from),
m_ty AS (SELECT * FROM public.fm_sales_source_rows WHERE source_system = 'MARKETPLACE' AND channel = 'TRENDYOL'),
m_keys AS (SELECT DISTINCT order_key FROM m_ty),
t_keys AS (SELECT DISTINCT order_key FROM public.fm_sales_source_rows WHERE source_system = 'TRENDYOL_API'),
m_returned AS (
  SELECT order_key FROM m_ty
  WHERE status_raw IN ('İade-İptal', 'İadesi Onaylanan')
  GROUP BY order_key
),
m_dup AS (
  SELECT DISTINCT economic_date AS d_date, sku_raw AS d_sku, quantity_raw AS d_qty, round(coalesce(amount_incl_vat_try, 0), 2) AS d_amt
  FROM m_ty WHERE sku_raw IS NOT NULL
),
ruled AS (
  SELECT s.*,
    CASE
      WHEN s.channel <> 'TRENDYOL' THEN 'SINGLE_SOURCE'
      WHEN s.source_system = 'MARKETPLACE' THEN
        CASE WHEN s.economic_date < cfg.t_primary_from THEN 'M_PRIMARY'
             WHEN s.order_key IN (SELECT order_key FROM t_keys) THEN 'DEDUP_DROPPED'
             ELSE 'M_FALLBACK' END
      ELSE
        CASE WHEN s.economic_date >= cfg.t_primary_from THEN 'T_PRIMARY'
             WHEN s.order_key IN (SELECT order_key FROM m_keys) THEN 'DEDUP_DROPPED'
             ELSE 'T_GAP_FILL' END
    END AS source_rule,
    (s.source_system = 'TRENDYOL_API' AND s.order_key IN (SELECT order_key FROM m_returned)) AS returned_by_marketplace
  FROM public.fm_sales_source_rows s CROSS JOIN cfg
),
classed AS (
  SELECT ruled.*,
    CASE
      WHEN source_system = 'MARKETPLACE' AND status_raw IN ('İade-İptal', 'İadesi Onaylanan') THEN 'RETURN_OR_CANCEL'
      WHEN source_system = 'MARKETPLACE' AND status_raw = 'Tedarik Edilemedi' THEN 'CANCELLED'
      WHEN source_system = 'TRENDYOL_API' AND status_raw = 'Cancelled' THEN 'CANCELLED'
      WHEN source_system = 'TRENDYOL_API' AND (status_raw IN ('UnDeliveredAndReturned', 'UnDelivered') OR returned_by_marketplace) THEN 'RETURN_OR_CANCEL'
      ELSE 'SALE'
    END AS status_class,
    (customer_name_lc = 'test' AND coalesce(amount_incl_vat_try, 0) <= 5) AS is_test_order,
    CASE WHEN sku_raw ~* '^(2[0-9](yt|kt|yd|k|y|yb)[0-9]|alinmodest|armine|21pnt|rimoli|gn.?(elbise|pijama)|acanta|copy45258)'
           OR product_name ~* '(armine|alinmodest|tesettür|tunik|pardesü|ferace|elbise|kadın (bluz|gömlek|pantolon|ceket|kaban|yelek|etek))'
         THEN 'TEXTILE_ARMINE' END AS legacy_business,
    (d.d_sku IS NOT NULL) AS marketplace_lookalike
  FROM ruled
  LEFT JOIN m_dup d ON d.d_date = ruled.economic_date AND d.d_sku = ruled.sku_raw
    AND d.d_qty = ruled.quantity_raw AND d.d_amt = round(coalesce(ruled.amount_incl_vat_try, 0), 2)
)
SELECT
  c.source_system, c.source_row_id, c.channel, c.order_key, c.line_key, c.economic_date, c.status_raw, c.sku_raw,
  c.product_id, c.product_name, c.quantity_raw, c.amount_incl_vat_try, c.amount_ex_vat_try, c.vat_try,
  c.customer_name_lc, c.known_at, c.source_rule, c.returned_by_marketplace, c.status_class, c.is_test_order,
  c.legacy_business,
  CASE
    WHEN c.source_rule = 'DEDUP_DROPPED' THEN 'DEDUP_DROPPED'
    WHEN c.is_test_order THEN 'EXCLUDED_TEST'
    WHEN c.status_class = 'CANCELLED' THEN 'EXCLUDED_CANCELLED'
    WHEN c.status_class = 'RETURN_OR_CANCEL' THEN 'EXCLUDED_RETURN'
    ELSE 'COUNTED'
  END AS disposition,
  array_remove(ARRAY[
    CASE WHEN c.source_rule = 'T_GAP_FILL' THEN 'gap_filled_secondary' END,
    CASE WHEN c.source_rule = 'M_FALLBACK' THEN 'fallback_marketplace_only' END,
    CASE WHEN c.source_system = 'MARKETPLACE' AND c.economic_date < DATE '2022-01-01' THEN 'status_snapshot_stale' END,
    CASE WHEN c.source_system = 'MARKETPLACE' AND c.known_at::date > c.economic_date + 30 THEN 'historical_bulk_import' END,
    CASE WHEN c.amount_ex_vat_try IS NULL THEN 'ex_vat_unknown' END,
    CASE WHEN c.status_class = 'SALE' AND NOT c.is_test_order AND coalesce(c.amount_incl_vat_try, 0) = 0 THEN 'zero_amount' END,
    CASE WHEN c.returned_by_marketplace THEN 'return_from_marketplace_status' END,
    CASE WHEN c.channel = 'IDEASOFT' THEN 'ideasoft_v1_excluded' END,
    CASE WHEN c.legacy_business IS NOT NULL THEN 'legacy_textile' END,
    CASE WHEN c.is_test_order THEN 'test_order' END,
    CASE WHEN c.source_system = 'TRENDYOL_API' AND c.order_key = '0' THEN 'invalid_order_id' END,
    CASE WHEN c.source_rule = 'T_GAP_FILL' AND c.marketplace_lookalike THEN 'possible_cross_source_duplicate' END
  ], NULL) AS quality_flags
FROM classed c;

-- 3) Canonical satış: dedupe edilenler çıkar; sayılan satırlarda set/paket adet düzeltmesi (yalnız adet).
CREATE OR REPLACE VIEW public.fm_sales_canonical WITH (security_invoker = true) AS
WITH counted AS (SELECT * FROM public.fm_sales_dispositioned WHERE disposition = 'COUNTED'),
tekli AS (
  SELECT public.cfo_norm(sku_raw) AS nsku, date_trunc('month', economic_date)::date AS ay, amount_incl_vat_try::float8 AS f
  FROM counted WHERE quantity_raw = 1 AND sku_raw IS NOT NULL AND amount_incl_vat_try > 0
),
aylik AS (SELECT nsku, ay, percentile_cont(0.5) WITHIN GROUP (ORDER BY f) AS med, count(*) AS n FROM tekli GROUP BY nsku, ay),
genel AS (SELECT nsku, percentile_cont(0.5) WITHIN GROUP (ORDER BY f) AS med, count(*) AS n FROM tekli GROUP BY nsku),
mark AS (
  SELECT nsku, ay, n,
    CASE WHEN n >= 3 THEN med END AS g,
    count(CASE WHEN n >= 3 THEN 1 END) OVER (PARTITION BY nsku ORDER BY ay) AS gf,
    count(CASE WHEN n >= 3 THEN 1 END) OVER (PARTITION BY nsku ORDER BY ay DESC) AS gb
  FROM aylik
),
fill AS (
  SELECT nsku, ay, n, COALESCE(max(g) OVER (PARTITION BY nsku, gf), max(g) OVER (PARTITION BY nsku, gb)) AS tipik_ay FROM mark
),
tip AS (SELECT f.nsku, f.ay, COALESCE(f.tipik_ay, g.med) AS tipik, (f.n + g.n) AS dayanak FROM fill f JOIN genel g USING (nsku)),
qty AS (
  SELECT c.source_system, c.source_row_id,
    t.tipik, coalesce(t.dayanak, 0) AS dayanak,
    CASE WHEN t.tipik > 0 AND c.quantity_raw > 0 THEN (c.amount_incl_vat_try::float8 / c.quantity_raw::float8) / t.tipik END AS oran
  FROM counted c
  LEFT JOIN tip t ON t.nsku = public.cfo_norm(c.sku_raw) AND t.ay = date_trunc('month', c.economic_date)::date
),
qty2 AS (
  SELECT d.*,
    CASE
      WHEN d.quantity_raw = 1 THEN d.quantity_raw
      WHEN q.tipik IS NULL OR q.dayanak < 3 THEN d.quantity_raw
      WHEN q.oran >= 0.85 AND q.oran <= 1.15 THEN d.quantity_raw
      WHEN q.oran > 1.15 THEN 1
      ELSE least(d.quantity_raw, greatest(1, floor(d.amount_incl_vat_try::float8 / q.tipik)::numeric))
    END AS quantity_canonical
  FROM public.fm_sales_dispositioned d
  LEFT JOIN qty q ON q.source_system = d.source_system AND q.source_row_id = d.source_row_id AND d.disposition = 'COUNTED'
  WHERE d.disposition <> 'DEDUP_DROPPED'
)
SELECT
  channel || '|' || order_key || '|' || line_key AS sale_key,
  source_system, source_row_id, source_rule, disposition, status_raw, status_class,
  channel, order_key, line_key, economic_date, sku_raw, product_id, product_name, legacy_business,
  quantity_raw,
  CASE WHEN disposition = 'COUNTED' THEN quantity_canonical ELSE 0 END AS units_counted,
  amount_incl_vat_try,
  amount_ex_vat_try,
  vat_try,
  CASE WHEN disposition = 'COUNTED' THEN coalesce(amount_incl_vat_try, 0) ELSE 0 END AS revenue_incl_vat_try,
  (disposition = 'COUNTED') AS counts_as_sale,
  known_at,
  CASE WHEN disposition = 'COUNTED' AND quantity_canonical <> quantity_raw
       THEN array_append(quality_flags, 'set_qty_corrected') ELSE quality_flags END AS quality_flags
FROM qty2;

-- 4) Mutabakat: ham tutar = Σ disposition (kimlik testi). Aylık × kanal × kaynak × disposition.
CREATE OR REPLACE VIEW public.fm_sales_reconciliation_monthly WITH (security_invoker = true) AS
SELECT date_trunc('month', economic_date)::date AS month, channel, source_system, source_rule, disposition,
       count(*) AS source_rows,
       coalesce(sum(amount_incl_vat_try), 0) AS raw_amount_incl_vat_try
FROM public.fm_sales_dispositioned
GROUP BY 1, 2, 3, 4, 5;

DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['fm_sales_source_rows','fm_sales_dispositioned','fm_sales_canonical','fm_sales_reconciliation_monthly'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', v);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN EXECUTE format('REVOKE ALL ON public.%I FROM anon', v); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', v); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cfo_acceptance_reader') THEN
      EXECUTE format('GRANT SELECT ON public.%I TO cfo_acceptance_reader', v);
    END IF;
  END LOOP;
END
$$;

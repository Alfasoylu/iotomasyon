-- KDV hariç ciro (RF-20261008-025 / CFO-008, 2026-10-09). 2026-05-04'ten beri Trendyol'un birincil kaynağı Trendyol API; API satırında KDV
-- hariç tutar yok → revenue_ex_vat_try her gün NULL (grade U), ciroyu 61% oranında kapsayan satırlar KDV dahil kalıyordu.
-- Kaynakta KDV hariç tutar yoksa türetilir (kaynak tutar varsa dokunulmaz):
--   1) SKU'nun pazaryeri (Entegra) satırlarındaki baskın KDV oranı — 2023-07-10 sonrası (KDV %18 → %20 değişimi), satırların ≥ %80'i
--      aynı oranda ise; bayrak ex_vat_derived_sku
--   2) yoksa şirket varsayılanı %20 (ölçülmüş pazaryeri cirosunun %99,7'si %20; Trendyol'da %10 ürün yok); bayrak ex_vat_default_rate
-- ex_vat_unknown bayrağı türetilen satırda kalkar, yerine kaynağını söyleyen bayrak gelir. Görünüm sütunları, türleri ve diğer mantığı
-- 20261005210000_fm_canonical_sales ile birebir aynı. Hafıza tabloları (fm_sales_company_day…) günlük tazelemede (önceki + bu ay) dolar;
-- 2026-05..08 için tek seferlik fm_backfill_sales_run gerekir (Cowork). Geri alma: 20261005210000'deki fm_sales_canonical tanımı +
-- fm_quality_policy satırının eski hali (U).
CREATE OR REPLACE VIEW public.fm_sales_canonical WITH (security_invoker = true) AS
WITH disp AS MATERIALIZED (SELECT * FROM public.fm_sales_dispositioned),
counted AS (SELECT * FROM disp WHERE disposition = 'COUNTED'),
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
  FROM disp d
  LEFT JOIN qty q ON q.source_system = d.source_system AND q.source_row_id = d.source_row_id AND d.disposition = 'COUNTED'
  WHERE d.disposition <> 'DEDUP_DROPPED'
),
-- SKU'nun baskın KDV oranı: kaynakta KDV hariç tutarı olan sayılan satırlar, 2023-07-10 sonrası; baskın oran satırların ≥ %80'i
kdv_sku AS (
  SELECT nsku, r FROM (
    SELECT nsku, r, n, sum(n) OVER (PARTITION BY nsku) AS tot, row_number() OVER (PARTITION BY nsku ORDER BY n DESC, r DESC) AS rn
    FROM (
      SELECT public.cfo_norm(sku_raw) AS nsku, round((amount_incl_vat_try / amount_ex_vat_try - 1) * 100) AS r, count(*) AS n
      FROM counted
      WHERE sku_raw IS NOT NULL AND amount_ex_vat_try > 0 AND amount_incl_vat_try > 0 AND economic_date >= DATE '2023-07-10'
      GROUP BY 1, 2
    ) o
  ) x WHERE rn = 1 AND n >= 0.8 * tot
),
kdv AS (
  SELECT q.*,
    (q.amount_ex_vat_try IS NULL AND q.amount_incl_vat_try IS NOT NULL) AS turet,
    k.r AS sku_oran
  FROM qty2 q
  LEFT JOIN kdv_sku k ON k.nsku = public.cfo_norm(q.sku_raw)
)
SELECT
  channel || '|' || order_key || '|' || line_key AS sale_key,
  source_system, source_row_id, source_rule, disposition, status_raw, status_class,
  channel, order_key, line_key, economic_date, sku_raw, product_id, product_name, legacy_business,
  quantity_raw,
  CASE WHEN disposition = 'COUNTED' THEN quantity_canonical ELSE 0 END AS units_counted,
  amount_incl_vat_try,
  CASE WHEN turet THEN round(amount_incl_vat_try / (1 + coalesce(sku_oran, 20) / 100.0), 2) ELSE amount_ex_vat_try END AS amount_ex_vat_try,
  CASE WHEN turet THEN amount_incl_vat_try - round(amount_incl_vat_try / (1 + coalesce(sku_oran, 20) / 100.0), 2) ELSE vat_try END AS vat_try,
  CASE WHEN disposition = 'COUNTED' THEN coalesce(amount_incl_vat_try, 0) ELSE 0 END AS revenue_incl_vat_try,
  (disposition = 'COUNTED') AS counts_as_sale,
  known_at,
  CASE WHEN disposition = 'COUNTED' AND quantity_canonical <> quantity_raw
       THEN array_append(kdv_flags, 'set_qty_corrected') ELSE kdv_flags END AS quality_flags
FROM (
  SELECT kdv.*,
    CASE WHEN turet THEN array_append(array_remove(quality_flags, 'ex_vat_unknown'),
                                      CASE WHEN sku_oran IS NOT NULL THEN 'ex_vat_derived_sku' ELSE 'ex_vat_default_rate' END)
         ELSE quality_flags END AS kdv_flags
  FROM kdv
) f;

INSERT INTO public.fm_quality_flag (flag, severity, description) VALUES
 ('ex_vat_derived_sku',  'info', 'KDV hariç tutar kaynakta yok; SKU''nun pazaryeri satırlarındaki baskın KDV oranıyla (2023-07-10 sonrası, ≥ %80) türetildi.'),
 ('ex_vat_default_rate', 'warn', 'KDV hariç tutar kaynakta yok ve SKU oranı öğrenilemedi; şirket varsayılanı %20 ile türetildi.')
ON CONFLICT (flag) DO NOTHING;

UPDATE public.fm_quality_policy
   SET grade = 'B',
       reason = 'Trendyol API satırlarında KDV hariç tutar türetilir: SKU''nun pazaryeri KDV oranı (2023-07-10 sonrası) → %20 varsayılan (bayraklı); diğer kanallar kaynak'
 WHERE metric_key = 'revenue_ex_vat_try' AND channel = '*' AND valid_from = DATE '2026-05-04' AND grade = 'U';

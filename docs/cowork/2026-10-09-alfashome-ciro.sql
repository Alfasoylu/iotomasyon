-- Cowork tek dosya — D-P05 Alfashome cirosu hedefe dahil (migration 20261009200000_fm_sales_alfashome)
-- Önceki toplu paketten (2026-10-09-toplu-uygulama.sql) BAĞIMSIZ; sırası önemli değil. Tek transaction, tekrar çalıştırılabilir.
-- Etki (üretim salt-okuma 2026-10-09): Ekim Alfashome siparişleri 4/5/6 (pending) = 14.865 TL ciroya girer; Haziran–Ağustos 3 arşivlenmiş
-- sipariş (5.912,50 TL) teyit edilene kadar dışarıda. IDEASOFT ile çakışma yok (IDEASOFT 29.09'da biter, Alfashome 01.10'da başlar).
-- Hafıza: günlük fm_memory_refresh_daily (önceki + bu ay) Ekim'i kendisi doldurur; hemen görmek için en alttaki satır.
-- migration checksum (sha256): d5625ee1bc963cdb9213a4cab827343980f3bd873f7da52714fa2bb64f92f045
BEGIN;
-- D-P05 (Alperen 2026-10-09): ciro hedefine Alfashome DAHİL. alfashome.com siparişleri (alfashome_order, Medusa paneli; günlük
-- trendyol-sync senkronu) Entegra'ya düşmez → satış katmanında yoktu. Bu migration onları ayrı ALFASHOME kaynağı/kanalı olarak ekler.
-- Mükerrerlik ölçümü (üretim, salt-okuma 2026-10-09): IDEASOFT (Entegra) siparişleri 29.09'da biter, Alfashome panel siparişleri
-- 01.10'da başlar; sipariş anahtarı, tarih ve tutar çakışması yok → aynı satış iki kez sayılmaz (site IdeaSoft → yeni panel geçişi).
-- Kurallar:
--   * Gelir = sipariş toplamı (KDV dahil); SKU/kalem yok → bayrak alfashome_order_level; KDV hariç tutar %20 varsayılanla türetilir
--     (20261009120000 kuralı, bayrak ex_vat_default_rate).
--   * Durum: canceled / draft → CANCELLED (gelire girmez). archived → EXCLUDED_TEST + alfashome_archived_unverified: Haziran–Ağustos
--     kurulum dönemindeki 3 sipariş (5.912,50 TL) arşivlenmiş; gerçek satış olduğu teyit edilirse bu kural kaldırılır (Alperen).
--   * pending / completed / requires_action sayılır: panel ödeme durumunu boş döndürüyor (payment_status hepsi NULL) → sipariş
--     durumu esas; kalite politikası ALFASHOME cirosu için B (tek kaynak, ödeme teyidi yok).
-- Görünüm sütunları ve diğer mantık 20261005210000_fm_canonical_sales ile birebir aynı (fm_sales_canonical 20261009120000 sürümü
-- değişmez). Sonrası: günlük fm_memory_refresh_daily (önceki + bu ay) Ekim'i doldurur; Haziran–Ağustos'ta sayılan satır yok.
-- Geri alma: 20261005210000'deki fm_sales_source_rows + fm_sales_dispositioned tanımları; eklenen bayrak/politika satırları silinir.

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
LEFT JOIN public."Product" p ON p.id = t."productId"
UNION ALL
-- ALFASHOME (D-P05): alfashome.com paneli siparişleri; sipariş toplamı bazlı (SKU/kalem yok), kişisel veri yok.
SELECT
  'ALFASHOME'::text,
  a.id::text,
  'ALFASHOME'::text,
  'AH-' || coalesce(a.order_no::text, a.id),
  a.id::text,
  (a.ordered_at AT TIME ZONE 'Europe/Istanbul')::date,
  a.status::text,
  NULL::text,
  NULL::text,
  NULL::text,
  a.item_qty::numeric,
  a.amount::numeric,
  NULL::numeric,
  NULL::numeric,
  ''::text,
  (a.first_seen_at AT TIME ZONE 'UTC')::timestamp
FROM public.alfashome_order a
WHERE a.ordered_at IS NOT NULL AND lower(coalesce(a.currency, 'try')) = 'try';


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
      WHEN source_system = 'ALFASHOME' AND status_raw IN ('canceled', 'draft') THEN 'CANCELLED'
      WHEN source_system = 'TRENDYOL_API' AND (status_raw IN ('UnDeliveredAndReturned', 'UnDelivered') OR returned_by_marketplace) THEN 'RETURN_OR_CANCEL'
      ELSE 'SALE'
    END AS status_class,
    ((customer_name_lc = 'test' AND coalesce(amount_incl_vat_try, 0) <= 5)
      OR (source_system = 'ALFASHOME' AND status_raw = 'archived')) AS is_test_order,
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
    CASE WHEN c.source_system = 'ALFASHOME' THEN 'alfashome_order_level' END,
    CASE WHEN c.source_system = 'ALFASHOME' AND c.status_raw = 'archived' THEN 'alfashome_archived_unverified' END,
    CASE WHEN c.source_rule = 'T_GAP_FILL' AND c.marketplace_lookalike THEN 'possible_cross_source_duplicate' END
  ], NULL) AS quality_flags
FROM classed c;


INSERT INTO public.fm_quality_flag (flag, severity, description) VALUES
 ('alfashome_order_level', 'info', 'Alfashome paneli siparişi: sipariş toplamı bazlı (SKU/kalem yok); ödeme durumu panelden gelmiyor, sipariş durumu esas.'),
 ('alfashome_archived_unverified', 'warn', 'Alfashome arşivlenmiş sipariş (kurulum dönemi); gerçek satış olduğu teyit edilene kadar ciroya girmez.')
ON CONFLICT (flag) DO NOTHING;

INSERT INTO public.fm_quality_policy (metric_key, channel, valid_from, valid_to, grade, reason) VALUES
 ('revenue_incl_vat_try', 'ALFASHOME', DATE '2026-06-01', NULL, 'B', 'Tek kaynak (alfashome.com paneli); ödeme teyidi yok, sipariş durumu esas')
ON CONFLICT (metric_key, channel, valid_from) DO NOTHING;

-- Görünümler security_invoker: salt-okuma denetim rolü diğer satış tablolarında olduğu gibi alfashome_order'ı da görmeli
-- (RLS açık, politika yoktu → canlı görünümde Alfashome satırları sessizce 0 olurdu). Tabloda kişisel veri yok.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cfo_acceptance_reader')
     AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'alfashome_order' AND policyname = 'cfo_acceptance_reader_select') THEN
    CREATE POLICY cfo_acceptance_reader_select ON public.alfashome_order FOR SELECT TO cfo_acceptance_reader USING (true);
    GRANT SELECT ON public.alfashome_order TO cfo_acceptance_reader;
  END IF;
END
$$;

INSERT INTO public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
SELECT gen_random_uuid()::text, 'd5625ee1bc963cdb9213a4cab827343980f3bd873f7da52714fa2bb64f92f045', now(), '20261009200000_fm_sales_alfashome', NULL, NULL, now(), 1
 WHERE NOT EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name = '20261009200000_fm_sales_alfashome');
COMMIT;

-- Doğrulama (salt-okuma)
SELECT order_key, economic_date, disposition, revenue_incl_vat_try FROM public.fm_sales_canonical WHERE source_system = 'ALFASHOME' ORDER BY economic_date;
-- beklenen: AH-1..3 EXCLUDED_TEST (arşiv), AH-4/5/6 COUNTED (341 + 6.355 + 8.169)

-- İsteğe bağlı: hafızayı hemen tazele (günlük işin aynısı)
-- SELECT public.fm_memory_refresh_daily();
-- SELECT goal_key, state, observed_value_try FROM public.fm_goal_observation WHERE goal_key LIKE 'revenue%' ORDER BY evaluated_at DESC LIMIT 1;

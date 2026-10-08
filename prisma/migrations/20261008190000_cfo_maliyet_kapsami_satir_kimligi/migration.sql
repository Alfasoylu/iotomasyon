-- cfo_maliyet_kapsami — mükerrer satır anahtarı düzeltmesi (Cowork CFO ölçümü 2026-10-08).
-- (kanal, sipariş, model) anahtarı aynı siparişte ayrı koliye giden adetleri (platformun AYRI satır kimliğiyle gelen satırlar)
-- "mükerrer" sayıyordu: tüm tabloda 419 satır (adet_duz > 0), satır kimliği (externalLineId) eklenince 0. Örnek: Hepsiburada
-- 4823011863 ANK-IPSET-VRYN, satır 155104 / 155582, farklı kargo takip no — 19.900 TL doğru ciro.
-- Değişen tek şey "güvenilir" tanımındaki kopya anahtarı: (kanal, sipariş, model, externalLineId). Kaynak tabloda
-- (kanal, sipariş, externalLineId) tekil olduğundan gerçek mükerrer yalnız satır kimliği boş satırlarda kalır.
-- Etki (canlı salt-okuma ölçümü): 19.900 TL güvenilmez → maliyetsiz kovasına geçer (ürün maliyeti girilmemiş); kapsam %87,5 aynı.
-- Fonksiyon imzası ve dönüş tipi aynı; görünüm (cfo_maliyet_kapsami) ve yetkiler değişmez (CREATE OR REPLACE yetkileri korur).
-- Geri alma: 20261008160000_cfo_maliyet_kapsami içindeki fonksiyon gövdesini yeniden çalıştır.
CREATE OR REPLACE FUNCTION public.cfo_maliyet_kapsami_at(asof timestamptz)
RETURNS TABLE (pencere_bas date, pencere_bit date, kapsam_pct numeric, ciro_try numeric, kapsanan_try numeric, guvenilmez_try numeric,
  eslesmeyen_try numeric, maliyetsiz_try numeric, satir int, kapsam_satir_pct numeric, sku int, kapsam_sku_pct numeric, eslesme_pct numeric,
  tanim text, olcum_zamani timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $fn$
WITH pencere AS (
  SELECT date_trunc('day', asof AT TIME ZONE 'Europe/Istanbul') - interval '30 days' AS bas,
         date_trunc('day', asof AT TIME ZONE 'Europe/Istanbul') AS bit
), satis AS (
  SELECT s.channel, s."orderNumber", s."modelNumber", s.guven, s.tutar_duz::numeric AS tutar,
         count(*) OVER (PARTITION BY s.channel, s."orderNumber", s."modelNumber", s."externalLineId") AS kopya
  FROM public.cfo_satis_birim_duz s, pencere w
  WHERE s.adet_duz > 0
    AND ((s."orderDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul') >= w.bas
    AND ((s."orderDate" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Istanbul') < w.bit
), setler AS (
  SELECT f.sku, CASE WHEN count(DISTINCT f.maliyet) = 1 AND min(f.maliyet) > 0 THEN min(f.maliyet) END AS maliyet
  FROM public.cfo_set_fiyat f GROUP BY f.sku
), satir AS (
  SELECT s.*, p.id IS NOT NULL OR st.sku IS NOT NULL AS eslesti,
    CASE WHEN st.sku IS NOT NULL OR p."productKind"::text = 'LISTING_PACKAGE' THEN st.maliyet ELSE NULLIF(p."unitCostTry", 0) END AS maliyet,
    s.guven IS NOT NULL AND s.guven::text NOT IN ('KARMA', 'BILINMIYOR') AND s.kopya = 1 AS guvenilir
  FROM satis s
  LEFT JOIN setler st ON st.sku = s."modelNumber"
  LEFT JOIN LATERAL (
    SELECT pr.id FROM public."Product" pr WHERE pr.sku = s."modelNumber"
    UNION ALL
    SELECT max(pr.id) FROM public."Product" pr
    WHERE public.cfo_norm(pr.sku) = public.cfo_norm(s."modelNumber")
      AND NOT EXISTS (SELECT 1 FROM public."Product" x WHERE x.sku = s."modelNumber")
    HAVING count(*) = 1
  ) e ON true
  LEFT JOIN public."Product" p ON p.id = e.id
), sinif AS (
  SELECT satir.*, CASE WHEN NOT guvenilir THEN 'guvenilmez' WHEN NOT eslesti THEN 'eslesmeyen'
    WHEN maliyet IS NULL OR maliyet <= 0 THEN 'maliyetsiz' ELSE 'kapsanan' END AS durum
  FROM satir
)
SELECT
  (SELECT bas::date FROM pencere) AS pencere_bas,
  (SELECT (bit - interval '1 day')::date FROM pencere) AS pencere_bit,
  round(100 * sum(tutar) FILTER (WHERE durum = 'kapsanan') / NULLIF(sum(tutar), 0), 1) AS kapsam_pct,
  round(sum(tutar), 2) AS ciro_try,
  round(COALESCE(sum(tutar) FILTER (WHERE durum = 'kapsanan'), 0), 2) AS kapsanan_try,
  round(COALESCE(sum(tutar) FILTER (WHERE durum = 'guvenilmez'), 0), 2) AS guvenilmez_try,
  round(COALESCE(sum(tutar) FILTER (WHERE durum = 'eslesmeyen'), 0), 2) AS eslesmeyen_try,
  round(COALESCE(sum(tutar) FILTER (WHERE durum = 'maliyetsiz'), 0), 2) AS maliyetsiz_try,
  count(*)::int AS satir,
  round(100.0 * count(*) FILTER (WHERE durum = 'kapsanan') / NULLIF(count(*), 0), 1) AS kapsam_satir_pct,
  count(DISTINCT "modelNumber")::int AS sku,
  round(100.0 * count(DISTINCT "modelNumber") FILTER (WHERE durum = 'kapsanan') / NULLIF(count(DISTINCT "modelNumber"), 0), 1) AS kapsam_sku_pct,
  round(100.0 * count(*) FILTER (WHERE eslesti) / NULLIF(count(*), 0), 1) AS eslesme_pct,
  'Birincil: son 30 tam gün (İstanbul) satış cirosunun güvenilir + eşleşmiş + maliyetli satırlara düşen payı. Diğer yüzdeler açıklama içindir.'::text AS tanim,
  asof AS olcum_zamani
FROM sinif;
$fn$;

COMMENT ON FUNCTION public.cfo_maliyet_kapsami_at(timestamptz) IS 'Maliyet kapsamının tek tanımı; asof anına göre son 30 tam gün (İstanbul). Mükerrer anahtarı platform satır kimliğini içerir (2026-10-08).';

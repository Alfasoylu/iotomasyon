-- cfo_maliyet_kapsami — satır düzeyi (2026-10-08). Kapsamın TEK tanımı korunur: satır sınıflaması yeni
-- cfo_maliyet_kapsami_satir(asof) fonksiyonuna taşınır, cfo_maliyet_kapsami_at(asof) toplamı ONDAN alır. Böylece "%95'e çıkmak için
-- hangi SKU'lar" listesi ve kapsam yüzdesi aynı sınıflamadan gelir (ayrı kopya SQL yok). Sınıflama 20261008190000 ile birebir aynıdır
-- (mükerrer anahtarı satır kimlikli); dönüş tipi, imza ve görünüm (cfo_maliyet_kapsami) değişmez → üretimdeki sayılar aynı kalır.
-- Yeni fonksiyon da yalnız sunucu tarafı okuyucular içindir: PUBLIC / anon / authenticated yetkisi alınır (160000 ile aynı kalıp).
-- Geri alma: 20261008190000 içindeki cfo_maliyet_kapsami_at gövdesini yeniden çalıştır, sonra
--   DROP FUNCTION IF EXISTS public.cfo_maliyet_kapsami_satir(timestamptz);
CREATE OR REPLACE FUNCTION public.cfo_maliyet_kapsami_satir(asof timestamptz)
RETURNS TABLE (kanal text, siparis text, sku text, guven text, kopya bigint, tutar numeric, eslesti boolean, durum text)
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
)
SELECT channel::text, "orderNumber"::text, "modelNumber"::text, guven::text, kopya, tutar, eslesti,
  CASE WHEN NOT guvenilir THEN 'guvenilmez' WHEN NOT eslesti THEN 'eslesmeyen'
    WHEN maliyet IS NULL OR maliyet <= 0 THEN 'maliyetsiz' ELSE 'kapsanan' END
FROM satir;
$fn$;

CREATE OR REPLACE FUNCTION public.cfo_maliyet_kapsami_at(asof timestamptz)
RETURNS TABLE (pencere_bas date, pencere_bit date, kapsam_pct numeric, ciro_try numeric, kapsanan_try numeric, guvenilmez_try numeric,
  eslesmeyen_try numeric, maliyetsiz_try numeric, satir int, kapsam_satir_pct numeric, sku int, kapsam_sku_pct numeric, eslesme_pct numeric,
  tanim text, olcum_zamani timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $fn$
SELECT
  (date_trunc('day', asof AT TIME ZONE 'Europe/Istanbul') - interval '30 days')::date AS pencere_bas,
  (date_trunc('day', asof AT TIME ZONE 'Europe/Istanbul') - interval '1 day')::date AS pencere_bit,
  round(100 * sum(tutar) FILTER (WHERE durum = 'kapsanan') / NULLIF(sum(tutar), 0), 1) AS kapsam_pct,
  round(sum(tutar), 2) AS ciro_try,
  round(COALESCE(sum(tutar) FILTER (WHERE durum = 'kapsanan'), 0), 2) AS kapsanan_try,
  round(COALESCE(sum(tutar) FILTER (WHERE durum = 'guvenilmez'), 0), 2) AS guvenilmez_try,
  round(COALESCE(sum(tutar) FILTER (WHERE durum = 'eslesmeyen'), 0), 2) AS eslesmeyen_try,
  round(COALESCE(sum(tutar) FILTER (WHERE durum = 'maliyetsiz'), 0), 2) AS maliyetsiz_try,
  count(*)::int AS satir,
  round(100.0 * count(*) FILTER (WHERE durum = 'kapsanan') / NULLIF(count(*), 0), 1) AS kapsam_satir_pct,
  count(DISTINCT sku)::int AS sku,
  round(100.0 * count(DISTINCT sku) FILTER (WHERE durum = 'kapsanan') / NULLIF(count(DISTINCT sku), 0), 1) AS kapsam_sku_pct,
  round(100.0 * count(*) FILTER (WHERE eslesti) / NULLIF(count(*), 0), 1) AS eslesme_pct,
  'Birincil: son 30 tam gün (İstanbul) satış cirosunun güvenilir + eşleşmiş + maliyetli satırlara düşen payı. Diğer yüzdeler açıklama içindir.'::text AS tanim,
  asof AS olcum_zamani
FROM public.cfo_maliyet_kapsami_satir(asof);
$fn$;

COMMENT ON FUNCTION public.cfo_maliyet_kapsami_satir(timestamptz) IS 'Maliyet kapsamının satır sınıflaması (kapsanan / guvenilmez / eslesmeyen / maliyetsiz); cfo_maliyet_kapsami_at toplamı bundan alır. 2026-10-08.';
COMMENT ON FUNCTION public.cfo_maliyet_kapsami_at(timestamptz) IS 'Maliyet kapsamının tek tanımı; asof anına göre son 30 tam gün (İstanbul). Satır sınıflaması cfo_maliyet_kapsami_satir (2026-10-08).';

REVOKE ALL ON FUNCTION public.cfo_maliyet_kapsami_satir(timestamptz) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON FUNCTION public.cfo_maliyet_kapsami_satir(timestamptz) FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON FUNCTION public.cfo_maliyet_kapsami_satir(timestamptz) FROM authenticated; END IF;
END $$;

-- cfo_maliyet_kapsami — maliyet kapsamının TEK tanımı (Cowork CFO kararı 2026-10-08: "bundan sonra ne ben ne motor kendi sayısını söylesin").
-- Önceki sayılar (%56,7 motor, %88,9 / %95,9 Cowork) farklı tanımlardı: satır mı ciro mu SKU mu, grup bazlı güven mi satır bazlı mı.
--
-- TANIM (birincil, kapsam_pct):
--   Son 30 tam gün (İstanbul; bugün hariç — motorun last30Days dönemiyle aynı) cfo_satis_birim_duz satırları (adet_duz > 0) içinde,
--   CİRO (tutar_duz) ağırlıklı olarak maliyeti bilinen satırların payı. Bir satır KAPSANAN sayılır ancak:
--     1) güvenilir: guven KARMA / BILINMIYOR / boş değil ve (kanal, sipariş, model) kopyası yok;
--     2) eşleşmiş: modelNumber = Product.sku (tam), yoksa cfo_norm(sku) ile TEK ürün; set SKU'su cfo_set_fiyat'ta;
--     3) maliyetli: tekil ürün Product.unitCostTry > 0; set cfo_set_fiyat.maliyet tek ve > 0.
--   Ciro, ilk tutan sebebe göre dört parçaya ayrılır ve toplamı ciro_try'dir:
--     guvenilmez_try → eslesmeyen_try → maliyetsiz_try → kapsanan_try.
-- İkincil sayılar yalnız açıklama içindir (kapsam_satir_pct, kapsam_sku_pct, eslesme_pct); karar eşiği kapsam_pct'dir.
-- Tanım TEK yerde: cfo_maliyet_kapsami_at(asof). Görünüm onu now() ile çağırır (Cowork okur); motor anlık görüntünün asOf'u ile
-- çağırır (aynı anlık görüntü aynı sayıyı verir). Görünüm de fonksiyon da çağıranın yetkisiyle çalışır.
-- Yalnız ekleme: tablo değişmez, veri yazılmaz. anon/authenticated/PUBLIC erişemez.
-- Geri alma: DROP VIEW public.cfo_maliyet_kapsami; DROP FUNCTION public.cfo_maliyet_kapsami_at(timestamptz);
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
         count(*) OVER (PARTITION BY s.channel, s."orderNumber", s."modelNumber") AS kopya
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

CREATE OR REPLACE VIEW public.cfo_maliyet_kapsami WITH (security_invoker = true) AS
SELECT * FROM public.cfo_maliyet_kapsami_at(now());

COMMENT ON FUNCTION public.cfo_maliyet_kapsami_at(timestamptz) IS 'Maliyet kapsamının tek tanımı; asof anına göre son 30 tam gün (İstanbul). 2026-10-08.';
COMMENT ON VIEW public.cfo_maliyet_kapsami IS 'Maliyet kapsamının tek tanımı (kapsam_pct = ciro ağırlıklı, son 30 tam gün). Motorun COST_COVERAGE kapısı ve Cowork CFO bunu okur. 2026-10-08.';

REVOKE ALL ON public.cfo_maliyet_kapsami FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cfo_maliyet_kapsami_at(timestamptz) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.cfo_maliyet_kapsami FROM anon; REVOKE ALL ON FUNCTION public.cfo_maliyet_kapsami_at(timestamptz) FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.cfo_maliyet_kapsami FROM authenticated; REVOKE ALL ON FUNCTION public.cfo_maliyet_kapsami_at(timestamptz) FROM authenticated; END IF;
END $$;

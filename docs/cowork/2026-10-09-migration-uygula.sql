-- Cowork için: 3 migration + tek seferlik satış hafızası tazelemesi + doğrulama (2026-10-09).
-- Her migration kendi transaction'ında: SQL + _prisma_migrations kaydı (checksum = migration.sql dosyasının sha256'sı, repo ile birebir).
-- Sıra önemli: 110000 → 120000 → 120000 sonrası tazeleme → 130000. Bir blok hata verirse o blok geri alınır; sonrakini çalıştırmadan bildir.
-- Hiçbiri veri silmez. Tazeleme yeni sürüm satırı yazar (eski satırlar is_current=false olarak kalır).

-- ═══ 1/3 · 20261009110000_cfo_kart_karari_kart_faizi · sha256 99359b09d889ef9f7bee918db02cb366d50ca48e17c3cb701d0af9709e1b7314 ═══
BEGIN;
DO $g$ BEGIN IF EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name = '20261009110000_cfo_kart_karari_kart_faizi') THEN RAISE EXCEPTION 'zaten uygulanmış: 20261009110000_cfo_kart_karari_kart_faizi'; END IF; END $g$;
-- Kart ertelemesi = KART faizi (CFO-005b / RF-20261008-004, 2026-10-09).
-- cfo_kart_karari asgariye çekilen (devreden) kart bakiyesinin aylık faizini cfo_settings."kmhMonthlyRatePct" (küresel KMH oranı, %4,5)
-- ile hesaplıyordu: hem yanlış ürün (KMH ≠ kart) hem KKDF/BSMV yok. Artık eşleşen kartın akdi aylık oranı × (1 + KKDF %15 + BSMV %15)
-- (lib/cfo/card-cost.ts ile aynı formül); kartın oranı girilmemişse aylık_faiz NULL ve gerekçe "BILINMIYOR" der (uydurma oran yok).
-- Karar mantığı, sıralama, dönüş tipi, imza ve yetkiler değişmez. Geri alma: prisma/baseline/2026-10-06.sql içindeki cfo_kart_karari tanımı.
CREATE OR REPLACE FUNCTION public.cfo_kart_karari()
 RETURNS TABLE(sira integer, karar text, tarih date, kalem text, mevcut_odeme numeric, yeni_odeme numeric, kazanc numeric, aylik_faiz numeric, kumulatif_kazanc numeric, yeni_dip numeric, gerekce text)
 LANGUAGE plpgsql
 STABLE
AS $function$
declare
  v_taban numeric := (select "netPositionFloorTry" from cfo_settings);
  v_minpct numeric := (select "cardMinPct" from cfo_settings);
  v_dip numeric; v_dip_tarih date; v_acik numeric;
  v_kum numeric := 0; v_i int := 0; r record; v_poz numeric;
begin
  select min(p.pozisyon) into v_dip from cfo_nakit_projeksiyon(120) p;
  select p.tarih into v_dip_tarih from cfo_nakit_projeksiyon(120) p
   where p.pozisyon = v_dip order by p.tarih limit 1;

  if v_dip >= v_taban then
    return query select 1,'TABAN KORUNUYOR'::text, v_dip_tarih,'-'::text,
      0::numeric,0::numeric,0::numeric,0::numeric,0::numeric,v_dip,
      ('En dip '||round(v_dip)||' TL, taban '||round(v_taban)||' TL, pay '||round(v_dip-v_taban)
       ||' TL. Kart odemeleri PLANLANDIGI GIBI yapilir.')::text;
    return;
  end if;

  v_acik := v_taban - v_dip;
  return query select 0,'TABAN DELINIYOR'::text, v_dip_tarih,'-'::text,
    0::numeric,0::numeric,0::numeric,0::numeric,0::numeric,v_dip,
    ('En dip '||round(v_dip)||' TL ('||v_dip_tarih||'), taban '||round(v_taban)||' TL. ACIK '
     ||round(v_acik)||' TL.')::text;

  for r in
    with kalem as (
      select e."eventDate"::date d, e.description aciklama, e."outflowTry" tam,
        (e.description ilike '%HARD DEADLINE%') korumali,
        (select coalesce(c."minOverrideTry", round(coalesce(c."statementDebtTry", e."outflowTry")*v_minpct/100.0,2))
           from cfo_credit_card c where c."isActive" and e.description ilike '%'||c.bank||'%'
          order by c."sortOrder" limit 1) asg,
        (select c."contractMonthlyRatePct"
           from cfo_credit_card c where c."isActive" and e.description ilike '%'||c.bank||'%'
          order by c."sortOrder" limit 1) oran
      from cfo_cash_event e
      where not e."isSettled" and e.kind::text='KART_ODEMESI'
        and e."eventDate"::date <= v_dip_tarih
        and e.description not ilike '%asgari%'
        and not (e.description ilike '%taksiti%' and e.description not ilike '%dahil%')
    )
    select d, aciklama, tam, asg, korumali, oran from kalem where asg is not null and tam > asg + 1
    order by korumali asc, (tam - asg) desc
  loop
    if r.korumali then
      select p.pozisyon into v_poz from cfo_nakit_projeksiyon(120) p where p.tarih = r.d;
      if coalesce(v_poz, -1) >= 0 then
        return query select 50,'KORUMALI — TAM ODENIR'::text, r.d, left(r.aciklama,45),
          r.tam, r.tam, 0::numeric, 0::numeric, v_kum, (v_dip+v_kum),
          ('HARD DEADLINE var ve o gun pozisyon '||round(coalesce(v_poz,0))||' TL: tam odenir.')::text;
      else
        v_i := v_i + 1; v_kum := v_kum + (r.tam - r.asg);
        return query select 51,'KORUMALI AMA NAKIT YOK — ASGARIYE CEK'::text, r.d, left(r.aciklama,45),
          r.tam, r.asg, (r.tam-r.asg), (case when r.oran is null or r.oran <= 0 then null else round((r.tam-r.asg)*r.oran/100.0*1.30,2) end), v_kum, (v_dip+v_kum),
          ('HARD DEADLINE var AMA o gun pozisyon '||round(coalesce(v_poz,0))
           ||' TL — tam odeme MUMKUN DEGIL. Asgari odenir, kalan '||round(r.tam-r.asg)
           ||' TL sonraki ekstreye devreder. Korumanin kaybi RAPORDA belirtilir.')::text;
      end if;
      continue;
    end if;

    exit when v_kum >= v_acik;
    v_i := v_i + 1; v_kum := v_kum + (r.tam - r.asg);
    return query select v_i,'ASGARIYE CEK'::text, r.d, left(r.aciklama,45),
      r.tam, r.asg, (r.tam-r.asg), (case when r.oran is null or r.oran <= 0 then null else round((r.tam-r.asg)*r.oran/100.0*1.30,2) end), v_kum, (v_dip+v_kum),
      ('Ertelenen '||round(r.tam-r.asg)||' TL · aylik faiz '
       ||coalesce('~'||round((r.tam-r.asg)*nullif(r.oran,0)/100.0*1.30)||' TL (kart akdi orani x 1,30 KKDF+BSMV)', 'BILINMIYOR (kartin akdi orani girilmemis)'))::text;
  end loop;

  if coalesce(v_kum,0) < v_acik then
    return query select 99,'YETERSIZ — BASKA KALDIRAC SART'::text, v_dip_tarih,'-'::text,
      0::numeric,0::numeric,0::numeric,0::numeric, coalesce(v_kum,0), (v_dip+coalesce(v_kum,0)),
      ('Kart asgarilerinden sonra taban hala '||round(v_acik-coalesce(v_kum,0))
       ||' TL deliniyor. GECERLI KALDIRAC MERDIVENI (30.08 teyidi sonrasi): '
       ||'(1) 28.09 KISMI CEKIM karari — beyannameyi bol, kaynagin yettigi kadarini cek [cfo_gumruk_dilim()]; '
       ||'(2) antrepoda bekletme — ardiye maliyeti karsiligi nakdi zamana yay; '
       ||'(3) Trendyol erken odeme — ekim hakedislerini 04.10 oncesine cek; '
       ||'(4) 01.10 sabit giderlerini kis (348.400 TL, dip oncesindeki tek buyuk esnek kalem); '
       ||'(5) en pahali borcu yapilandir; (6) sahsi hesaplar — son care, sifir tampon. '
       ||'DIKKAT: gumruk TAKSITLENDIRME ve TEMINAT MEKTUBU ile mal cekimi YOKTUR '
       ||'(gumruk musaviri 30.08.2026 kesin ret). Yurtdisi siparis erteleme 30.08de zaten yapildi.')::text;
  end if;
end;
$function$;
INSERT INTO public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '99359b09d889ef9f7bee918db02cb366d50ca48e17c3cb701d0af9709e1b7314', now(), '20261009110000_cfo_kart_karari_kart_faizi', NULL, NULL, now(), 1);
COMMIT;

-- ═══ 2/3 · 20261009120000_fm_kdv_haric_ciro · sha256 86d9416b76ef86c44db2d980121f1ac8a0681c36bc7926fa22753a2ce6135468 ═══
BEGIN;
DO $g$ BEGIN IF EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name = '20261009120000_fm_kdv_haric_ciro') THEN RAISE EXCEPTION 'zaten uygulanmış: 20261009120000_fm_kdv_haric_ciro'; END IF; END $g$;
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
INSERT INTO public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '86d9416b76ef86c44db2d980121f1ac8a0681c36bc7926fa22753a2ce6135468', now(), '20261009120000_fm_kdv_haric_ciro', NULL, NULL, now(), 1);
COMMIT;

-- ═══ 2b · tek seferlik satış hafızası tazelemesi (2026-05 → bugün; KDV hariç ciroyu geçmiş aylara da yazar) ═══
DO $$
DECLARE v uuid; r jsonb; d date := (now() AT TIME ZONE 'Europe/Istanbul')::date;
BEGIN
  INSERT INTO public.fm_ingest_run (kind, status, range_from, range_to, lineage)
  VALUES ('sales_backfill', 'running', DATE '2026-05-01', d, jsonb_build_object('reason', '20261009120000_fm_kdv_haric_ciro'))
  RETURNING id INTO v;
  PERFORM public.fm_backfill_sales_snapshot(v);
  r := public.fm_backfill_sales_run(v, DATE '2026-05-01', d, 12, false, d);
  UPDATE public.fm_ingest_run
     SET status = CASE WHEN r ->> 'failed' IS NULL AND coalesce((r ->> 'finished')::boolean, false) THEN 'succeeded' ELSE 'failed' END,
         finished_at = clock_timestamp(), lineage = lineage || jsonb_build_object('result', r)
   WHERE id = v;
END $$;

-- ═══ 3/3 · 20261009130000_fm_goal_kaynak_tazeligi · sha256 394fd496485508c6806b23ddd3fe7b917c42829ccd4d59efe00c28cdd5d3ba52 ═══
BEGIN;
DO $g$ BEGIN IF EXISTS (SELECT 1 FROM public._prisma_migrations WHERE migration_name = '20261009130000_fm_goal_kaynak_tazeligi') THEN RAISE EXCEPTION 'zaten uygulanmış: 20261009130000_fm_goal_kaynak_tazeligi'; END IF; END $g$;
-- Hedef motoru kaynak tazeliği (RF-20261008-025 ikinci yarı / CFO-008, 2026-10-09). fm_goal_evaluate "tamamlanmış gün"ü yalnız hafıza
-- tazeleme anından türetiyordu; Entegra (pazaryeri) haftalık içe aktarılıyor ve Trendyol günde bir senkronlanıyor → son günler eksik ama
-- tam sayılıyordu (09.10: 05–08.10 kısmi; 08.10 = 2.943 TL; hız 51.941 TL/gün yerine tam günlerle 58.318, aylık projeksiyon −197,7k TL).
-- Artık hız / projeksiyon / gereken hız yalnız her kaynağın o gün BİTTİKTEN sonra okunduğu günlerden (known_at, İstanbul günü − 1);
-- gözlenen MTD aynen raporlanır; kısmi gün varsa bayrak goal_sources_partial (kalite en iyi B; hiç tam gün yoksa C ve eski davranış).
-- Diğer hedefler ve fonksiyonun geri kalanı 20261006130000_fm_goal_engine ile birebir. Geri alma: o migration'daki fm_goal_evaluate tanımı.
INSERT INTO public.fm_quality_flag (flag, severity, description) VALUES
 ('goal_sources_partial', 'warn', 'Son günlerin bir kısmında en az bir satış kaynağı (Trendyol senkronu / Entegra içe aktarımı) günü kapsamıyor; hız ve projeksiyon yalnız tüm kaynakların tamam olduğu günlerden.')
ON CONFLICT (flag) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fm_goal_evaluate(p_as_of date DEFAULT (now() AT TIME ZONE 'Europe/Istanbul')::date)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  g record;
  fx record;
  fx_rate numeric; fx_month date; fx_grade char(1); fx_flags text[];
  st text; obs numeric; obs_on date; tgt numeric; prog numeric; gap numeric; cur_rate numeric; req_rate numeric;
  proj numeric; proj_on date; grade char(1); flags text[]; inputs jsonb; p_start date; p_end date;
  sales_refresh_at timestamptz; complete_through date; elapsed integer; dim integer; remaining integer;
  ty_through date; mp_through date; rate_through date; rate_elapsed integer; mtd_rate numeric;
  mtd numeric; mtd_alfas numeric; slope numeric; npts integer; span integer; days_left integer;
  h text; written integer := 0; skipped integer := 0; summary jsonb := '[]'::jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('fm_goal_evaluate'));
  PERFORM public.fm_goal_sync();

  -- TCMB aylık kur (değerlendirme ayı; yoksa önceki en yakın ay → kalite B + bayrak)
  SELECT f.month, f.usd_try_forex_buying, f.usd_try_grade INTO fx
    FROM public.fm_memory_fx_monthly f WHERE f.month <= date_trunc('month', p_as_of)::date AND f.usd_try_forex_buying IS NOT NULL ORDER BY f.month DESC LIMIT 1;
  IF FOUND THEN
    fx_rate := fx.usd_try_forex_buying; fx_month := fx.month;
    IF fx.month < date_trunc('month', p_as_of)::date THEN fx_grade := greatest(fx.usd_try_grade, 'B'); fx_flags := ARRAY['goal_fx_prior_month'];
    ELSE fx_grade := fx.usd_try_grade; fx_flags := '{}'; END IF;
  ELSE
    fx_rate := NULL; fx_month := NULL; fx_grade := 'U'; fx_flags := ARRAY['goal_fx_missing'];
  END IF;

  SELECT max(finished_at) INTO sales_refresh_at FROM public.fm_ingest_run
   WHERE kind IN ('sales_backfill', 'sales_refresh') AND status = 'succeeded';
  -- Kaynak tazeliği (RF-20261008-025): bir gün ancak her satış kaynağı o gün BİTTİKTEN sonra okunduysa tamamdır. known_at = kaynağın
  -- okunma anı (Trendyol senkronu / Entegra içe aktarımı; UTC). Kaynağın hiç satırı yoksa sınır koymaz.
  SELECT (max(known_at) FILTER (WHERE source_system = 'TRENDYOL_API') AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul')::date - 1,
         (max(known_at) FILTER (WHERE source_system = 'MARKETPLACE') AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Istanbul')::date - 1
    INTO ty_through, mp_through
    FROM public.fm_sales_canonical_snapshot;

  FOR g IN SELECT * FROM public.fm_goal WHERE valid_to IS NULL ORDER BY goal_key LOOP
    st := 'UNKNOWN'; obs := NULL; obs_on := NULL; tgt := NULL; prog := NULL; gap := NULL; cur_rate := NULL; req_rate := NULL;
    proj := NULL; proj_on := NULL; grade := 'U'; flags := '{}'; inputs := '{}'::jsonb; p_start := NULL; p_end := NULL;

    IF g.target_currency = 'USD' THEN
      tgt := CASE WHEN fx_rate IS NOT NULL THEN round(g.target_value * fx_rate, 2) END;
      flags := flags || fx_flags;
    ELSE
      tgt := g.target_value;
    END IF;

    IF g.kind = 'revenue_month' THEN
      -- Ayın ilk günü tamamlanmış gün yok → önceki ayın nihai sonucu.
      IF p_as_of = date_trunc('month', p_as_of)::date THEN
        p_start := (p_as_of - interval '1 month')::date; flags := flags || ARRAY['goal_previous_month_final'];
      ELSE
        p_start := date_trunc('month', p_as_of)::date;
      END IF;
      p_end := (p_start + interval '1 month - 1 day')::date;
      dim := p_end - p_start + 1;
      -- Hafıza, ancak tazeleme günü (İstanbul) - 1'e kadar tamamdır; eksik günler 0 sayılmaz.
      complete_through := least(p_as_of - 1, p_end, coalesce((sales_refresh_at AT TIME ZONE 'Europe/Istanbul')::date - 1, p_start - 1));
      elapsed := greatest(complete_through - p_start + 1, 0);
      remaining := dim - elapsed;
      SELECT coalesce(sum(revenue_incl_vat_try), 0), coalesce(sum(revenue_alfas_incl_vat_try), 0), coalesce(max(revenue_grade), 'U')
        INTO mtd, mtd_alfas, grade
        FROM public.fm_memory_sales_company_day WHERE economic_date BETWEEN p_start AND complete_through AND elapsed > 0;
      obs := mtd; obs_on := CASE WHEN elapsed > 0 THEN complete_through END;
      inputs := jsonb_build_object('period_start', p_start, 'period_end', p_end, 'complete_through', complete_through, 'days_elapsed', elapsed,
                                   'days_in_month', dim, 'revenue_mtd_try', mtd, 'revenue_alfas_mtd_try', mtd_alfas,
                                   'sales_memory_refreshed_at', sales_refresh_at, 'target_usd', g.target_value, 'fx_usd_try', fx_rate, 'fx_month', fx_month);
      IF complete_through < least(p_as_of - 1, p_end) OR elapsed = 0 THEN
        flags := flags || ARRAY['goal_sales_memory_stale']; grade := 'U'; st := 'UNKNOWN';
        IF elapsed = 0 THEN obs := NULL; END IF;
      ELSIF tgt IS NULL THEN
        st := 'UNKNOWN'; grade := 'U';
      ELSE
        grade := greatest(grade, fx_grade);
        -- Hız ve projeksiyon yalnız TÜM kaynakların tamam olduğu günlerden (eksik günler hızı düşürmesin; gözlenen MTD aynen raporlanır)
        rate_through := least(complete_through, coalesce(ty_through, complete_through), coalesce(mp_through, complete_through));
        rate_elapsed := greatest(rate_through - p_start + 1, 0);
        IF rate_through < complete_through AND rate_elapsed > 0 THEN
          SELECT coalesce(sum(revenue_incl_vat_try), 0) INTO mtd_rate
            FROM public.fm_memory_sales_company_day WHERE economic_date BETWEEN p_start AND rate_through;
          flags := flags || ARRAY['goal_sources_partial']; grade := greatest(grade, 'B');
        ELSE
          IF rate_through < complete_through THEN flags := flags || ARRAY['goal_sources_partial']; grade := greatest(grade, 'C'); END IF;
          rate_through := complete_through; rate_elapsed := elapsed; mtd_rate := mtd;
        END IF;
        inputs := inputs || jsonb_build_object('trendyol_complete_through', ty_through, 'marketplace_complete_through', mp_through,
                                               'rate_through', rate_through, 'rate_days', rate_elapsed, 'revenue_rate_window_try', mtd_rate);
        IF rate_elapsed < 7 THEN flags := flags || ARRAY['goal_short_window']; END IF;
        cur_rate := round(mtd_rate / rate_elapsed, 2);
        proj := round(mtd_rate / rate_elapsed * dim, 2); proj_on := p_end;
        req_rate := CASE WHEN dim - rate_elapsed > 0 THEN round(greatest(tgt - mtd_rate, 0) / (dim - rate_elapsed), 2) END;
        prog := round(mtd / tgt * 100, 2); gap := round(tgt - mtd, 2);
        st := CASE WHEN mtd >= tgt THEN 'ACHIEVED'
                   WHEN remaining = 0 THEN 'OFF_TRACK'
                   WHEN proj >= tgt THEN 'ON_TRACK'
                   WHEN proj >= tgt * (1 - g.at_risk_band_pct / 100) THEN 'AT_RISK'
                   ELSE 'OFF_TRACK' END;
      END IF;

    ELSIF g.kind IN ('debt_ceiling', 'wealth_by_date') THEN
      SELECT b.economic_date, b.value_try, b.grade INTO obs_on, obs, grade
        FROM public.fm_memory_balance_day b
       WHERE b.metric_key = g.metric_key AND b.economic_date <= p_as_of
       ORDER BY b.economic_date DESC, b.definition_version DESC LIMIT 1;
      -- Eğilim: son 30 gün (≥5 gözlem, ≥14 gün aralık), TL/gün.
      SELECT regr_slope(b.value_try, (b.economic_date - DATE '2000-01-01')::numeric), count(*), max(b.economic_date) - min(b.economic_date)
        INTO slope, npts, span
        FROM public.fm_balance_day b
       WHERE b.metric_key = g.metric_key AND b.economic_date BETWEEN p_as_of - 30 AND p_as_of;
      inputs := jsonb_build_object('observed_on', obs_on, 'value_try', obs, 'trend_points', npts, 'trend_span_days', span,
                                   'trend_slope_try_per_day', round(slope, 2), 'target_value', g.target_value, 'target_currency', g.target_currency,
                                   'fx_usd_try', fx_rate, 'fx_month', fx_month, 'deadline', g.deadline);
      IF obs IS NULL OR obs_on < p_as_of - 3 THEN
        flags := flags || ARRAY['goal_balance_stale']; st := 'UNKNOWN'; grade := 'U';
      ELSIF tgt IS NULL THEN
        st := 'UNKNOWN'; grade := 'U';
      ELSE
        IF g.target_currency = 'USD' THEN grade := greatest(grade, fx_grade); END IF;
        IF npts >= 5 AND span >= 14 THEN cur_rate := round(slope, 2); ELSE flags := flags || ARRAY['goal_short_history']; END IF;
        IF g.kind = 'debt_ceiling' THEN
          gap := round(obs - tgt, 2);
          prog := NULL;
          IF obs < tgt THEN st := 'ACHIEVED';
          ELSE
            st := 'NOT_MET';
            IF cur_rate IS NOT NULL AND cur_rate < 0 THEN
              flags := flags || ARRAY['goal_trend_decreasing'];
              -- Eşiğe ulaşma tarihi yalnız gözlenen eğilim aralığının 4 katına kadar ileri tahmin edilir.
              IF ceil((obs - tgt) / (-cur_rate)) <= 4 * span THEN
                proj_on := obs_on + ceil((obs - tgt) / (-cur_rate))::integer; proj := tgt;
              ELSE
                flags := flags || ARRAY['goal_projection_horizon_exceeded'];
              END IF;
            ELSIF cur_rate IS NOT NULL THEN
              flags := flags || ARRAY['goal_trend_not_decreasing'];
            END IF;
          END IF;
        ELSE -- wealth_by_date
          flags := flags || ARRAY['goal_fx_constant_assumption'];
          gap := round(tgt - obs, 2); prog := round(obs / tgt * 100, 2);
          days_left := g.deadline - obs_on; p_end := g.deadline;
          IF obs >= tgt THEN st := 'ACHIEVED';
          ELSIF days_left <= 0 THEN st := 'OFF_TRACK'; flags := flags || ARRAY['goal_deadline_passed'];
          ELSE
            req_rate := round((tgt - obs) / days_left, 2);
            IF cur_rate IS NULL THEN st := 'UNKNOWN';
            ELSE
              -- Durum, gözlenen hız ile gereken hızın karşılaştırmasıdır (run-rate); değer projeksiyonu yalnız
              -- eğilim aralığının 4 katına kadar gösterilir (kısa geçmişten uzun vadeli değer uydurulmaz).
              st := CASE WHEN cur_rate >= req_rate THEN 'ON_TRACK'
                         WHEN cur_rate >= req_rate * (1 - g.at_risk_band_pct / 100) THEN 'AT_RISK'
                         ELSE 'OFF_TRACK' END;
              IF days_left <= 4 * span THEN
                proj := round(obs + cur_rate * days_left, 2); proj_on := g.deadline;
              ELSE
                flags := flags || ARRAY['goal_projection_horizon_exceeded'];
              END IF;
            END IF;
          END IF;
        END IF;
      END IF;

    ELSIF g.kind = 'position_floor' THEN
      flags := flags || ARRAY['goal_projection_based'];
      BEGIN
        SELECT p.pozisyon, p.tarih INTO obs, proj_on FROM public.cfo_nakit_projeksiyon(120) p ORDER BY p.pozisyon ASC, p.tarih ASC LIMIT 1;
        obs_on := p_as_of;
        inputs := jsonb_build_object('source', 'cfo_nakit_projeksiyon(120)', 'min_position_try', obs, 'min_position_date', proj_on, 'floor_try', tgt);
        IF obs IS NULL THEN st := 'UNKNOWN'; grade := 'U';
        ELSE
          grade := 'D'; proj := obs; gap := CASE WHEN obs < tgt THEN round(tgt - obs, 2) ELSE 0 END;
          st := CASE WHEN obs >= tgt THEN 'ACHIEVED' ELSE 'OFF_TRACK' END;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        st := 'UNKNOWN'; grade := 'U'; inputs := jsonb_build_object('source', 'cfo_nakit_projeksiyon(120)', 'error', SQLSTATE);
      END;
    END IF;

    SELECT coalesce(array_agg(DISTINCT f ORDER BY f), '{}') INTO flags FROM unnest(flags) f;
    h := md5(concat_ws('|', g.version, st, obs, obs_on, tgt, prog, gap, cur_rate, req_rate, proj, proj_on, grade, array_to_string(flags, ','), p_start, p_end, inputs::text));
    IF EXISTS (SELECT 1 FROM (SELECT o.input_hash FROM public.fm_goal_observation o WHERE o.goal_key = g.goal_key AND o.as_of = p_as_of
                              ORDER BY o.evaluated_at DESC LIMIT 1) last WHERE last.input_hash = h) THEN
      skipped := skipped + 1;
    ELSE
      INSERT INTO public.fm_goal_observation (goal_key, goal_version, as_of, period_start, period_end, state, observed_value_try, observed_on,
          target_value_try, fx_usd_try, fx_month, progress_pct, gap_try, current_rate_try_per_day, required_rate_try_per_day,
          projected_value_try, projected_on, grade, flags, inputs, input_hash)
      VALUES (g.goal_key, g.version, p_as_of, p_start, p_end, st, obs, obs_on,
          tgt, CASE WHEN g.target_currency = 'USD' THEN fx_rate END, CASE WHEN g.target_currency = 'USD' THEN fx_month END,
          prog, gap, cur_rate, req_rate, proj, proj_on, grade, flags, inputs, h);
      written := written + 1;
    END IF;
    summary := summary || jsonb_build_array(jsonb_build_object('goal_key', g.goal_key, 'state', st, 'grade', grade));
  END LOOP;
  RETURN jsonb_build_object('as_of', p_as_of, 'written', written, 'unchanged', skipped, 'goals', summary);
END
$$;
INSERT INTO public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '394fd496485508c6806b23ddd3fe7b917c42829ccd4d59efe00c28cdd5d3ba52', now(), '20261009130000_fm_goal_kaynak_tazeligi', NULL, NULL, now(), 1);
COMMIT;

-- ═══ Doğrulama (salt okuma) ═══
-- A) üç kayıt, checksum'lar yukarıdakilerle aynı olmalı
SELECT migration_name, checksum, finished_at FROM public._prisma_migrations WHERE migration_name >= '20261009110000' ORDER BY 1;
-- B) KDV hariç ciro dolu; Eylül ≈ 1.604.768
SELECT to_char(economic_date, 'YYYY-MM') ay, round(sum(revenue_incl_vat_try)) kdv_dahil, round(sum(revenue_ex_vat_try)) kdv_haric,
       max(revenue_ex_vat_grade) not_ FROM public.fm_memory_sales_company_day WHERE economic_date >= '2026-05-01' GROUP BY 1 ORDER BY 1;
-- C) hedef motoru: hız yalnız tam günlerden (bugünkü kaynak tazeliğine göre), bayrak goal_sources_partial (kaynaklar tazeyse bayrak yok)
SELECT public.fm_goal_evaluate();
SELECT current_rate_try_per_day, projected_value_try, observed_value_try, flags, inputs ->> 'rate_through' rate_through,
       inputs ->> 'marketplace_complete_through' entegra_tam, inputs ->> 'trendyol_complete_through' trendyol_tam
  FROM public.fm_memory_goal WHERE kind = 'revenue_month';
-- D) kart kararı: oranı olan kartta aylık faiz dolu, oranı yoksa NULL + 'BILINMIYOR'
SELECT sira, karar, kalem, aylik_faiz, left(gerekce, 90) gerekce FROM public.cfo_kart_karari();

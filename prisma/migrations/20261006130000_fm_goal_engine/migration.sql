-- AI CFO V2 — Step 2: Goal Engine v1 (deterministik; LLM yok). Kullanıcı kararları (2026-10-06):
--   hedefler: aylık ciro (USD), toplam borç < 5M TL, servet (USD, tarihli), net pozisyon tabanı;
--   kur: TCMB aylık (Financial Memory, fm_memory_fx_monthly); projeksiyon: yalnız run-rate; CFO iş akışı hedefleri doğrudan devralır.
-- İlkeler (Financial Memory ile aynı): bilinmeyen = UNKNOWN/NULL (asla 0 veya tahmin değil); kalite A/B/C/D/U = girdilerin en kötüsü;
-- her gözlem girdileriyle (inputs) saklanır; hedef tanımı sürümlüdür (yerinde değiştirilmez); ham veriye dokunulmaz.
--  • fm_goal: hedef tanımı (cfo_settings'ten fm_goal_sync ile sürümlenir).
--  • fm_goal_observation: değerlendirme geçmişi (yalnız ekleme; aynı gün aynı girdi → yeni satır yazılmaz = idempotent).
--  • fm_goal_evaluate(as_of): tüm aktif hedefleri değerlendirir. fm_memory_goal: hedef başına son gözlem (CFO hot-path).
--  • fm_memory_refresh_daily(today): satış hafızasını (önceki + bu ay) ve bakiye hafızasını günceller; aralık içinde tekrar çağrı atlanır.
-- Durumlar: ACHIEVED · ON_TRACK · AT_RISK (run-rate hedefin at_risk_band_pct kadar altında) · OFF_TRACK · NOT_MET (tarihsiz tavan aşılmış) · UNKNOWN.
-- Geri alma: fm_memory_goal view'ı, fm_goal_evaluate/fm_goal_sync/fm_memory_refresh_daily fonksiyonları ve fm_goal_observation/fm_goal tabloları kaldırılır (başka nesne bağımlı değil).

CREATE TABLE IF NOT EXISTS public.fm_goal (
  goal_key text NOT NULL,
  version integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('revenue_month', 'debt_ceiling', 'wealth_by_date', 'position_floor')),
  title text NOT NULL,
  metric_key text NOT NULL,
  target_value numeric(18, 2) NOT NULL,
  target_currency text NOT NULL CHECK (target_currency IN ('TRY', 'USD')),
  deadline date,
  at_risk_band_pct numeric(5, 2) NOT NULL DEFAULT 10 CHECK (at_risk_band_pct >= 0 AND at_risk_band_pct < 100),
  source text NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  PRIMARY KEY (goal_key, version),
  CHECK (valid_to IS NULL OR valid_to >= valid_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS fm_goal_active_key ON public.fm_goal (goal_key) WHERE valid_to IS NULL;

CREATE TABLE IF NOT EXISTS public.fm_goal_observation (
  goal_key text NOT NULL,
  goal_version integer NOT NULL,
  as_of date NOT NULL,
  evaluated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  period_start date,
  period_end date,
  state text NOT NULL CHECK (state IN ('ACHIEVED', 'ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'NOT_MET', 'UNKNOWN')),
  observed_value_try numeric(18, 2),
  observed_on date,
  target_value_try numeric(18, 2),
  fx_usd_try numeric(12, 4),
  fx_month date,
  progress_pct numeric(9, 2),
  gap_try numeric(18, 2),
  current_rate_try_per_day numeric(18, 2),
  required_rate_try_per_day numeric(18, 2),
  projected_value_try numeric(18, 2),
  projected_on date,
  grade char(1) NOT NULL CHECK (grade IN ('A', 'B', 'C', 'D', 'U')),
  flags text[] NOT NULL DEFAULT '{}',
  inputs jsonb NOT NULL,
  input_hash text NOT NULL,
  PRIMARY KEY (goal_key, as_of, evaluated_at),
  FOREIGN KEY (goal_key, goal_version) REFERENCES public.fm_goal (goal_key, version)
);
CREATE INDEX IF NOT EXISTS fm_goal_observation_latest ON public.fm_goal_observation (goal_key, as_of DESC, evaluated_at DESC);

INSERT INTO public.fm_quality_flag (flag, severity, description) VALUES
 ('goal_sales_memory_stale',  'block', 'Satış hafızası değerlendirme gününden önceki günü kapsamıyor; ilerleme bilinmiyor sayılır (eksik gün 0 sayılmaz).'),
 ('goal_balance_stale',       'block', 'Son bakiye gözlemi 3 günden eski; hedef durumu bilinmiyor.'),
 ('goal_fx_prior_month',      'warn',  'Değerlendirme ayının TCMB kuru henüz yok; önceki ayın kuru kullanıldı (kalite en iyi B).'),
 ('goal_fx_missing',          'block', 'TCMB kuru bulunamadı; USD hedef TL''ye çevrilemedi.'),
 ('goal_short_window',        'warn',  'Ay içinde 7 günden az tamamlanmış gün var; run-rate oynak.'),
 ('goal_short_history',       'warn',  'Eğilim için yeterli geçmiş yok (≥5 gözlem ve ≥14 gün gerekir); projeksiyon üretilmedi.'),
 ('goal_trend_decreasing',    'info',  'Son 30 gün eğilimi azalan.'),
 ('goal_trend_not_decreasing','warn',  'Son 30 gün eğilimi azalmıyor; mevcut hızla eşiğe ulaşılmaz.'),
 ('goal_fx_constant_assumption','info','Uzun vadeli USD hedefi bugünkü TCMB kuruyla TL''ye çevrildi; kur değişimi modellenmedi.'),
 ('goal_deadline_passed',     'info',  'Hedef tarihi geçti; nihai sonuç.'),
 ('goal_projection_based',    'warn',  'Değer Financial Memory değil, cfo_nakit_projeksiyon(120) senaryosundan; kalite D.'),
 ('goal_previous_month_final','info',  'Ayın ilk günü: tamamlanmış önceki ayın nihai sonucu raporlandı.'),
 ('goal_projection_horizon_exceeded','info','Tahmin ufku gözlenen eğilim aralığının 4 katını aşıyor; değer/tarih projeksiyonu üretilmedi (durum hız karşılaştırmasıyla).')
ON CONFLICT (flag) DO NOTHING;

-- Hedef tanımlarını cfo_settings'ten sürümle. Değer değişirse eski sürüm kapanır, yeni sürüm açılır; ayar boşsa hedef emekliye ayrılır.
-- Borç eşiği iş kuralıdır (lib/cfo-agent: NEW_ORDER_DEBT_LIMIT_TRY = 5.000.000); ayardan gelmez.
CREATE OR REPLACE FUNCTION public.fm_goal_sync() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  s record;
  d record;
  cur record;
  changed integer := 0;
BEGIN
  SELECT "monthlyRevenueTargetUsd" AS rev_usd, "usdWealthTarget" AS wealth_usd, "wealthTargetDate"::date AS wealth_date,
         "netPositionFloorTry" AS floor_try
    INTO s FROM public.cfo_settings ORDER BY "updatedAt" DESC LIMIT 1;
  FOR d IN
    SELECT * FROM (VALUES
      ('revenue_month_usd', 'revenue_month', 'Aylık ciro hedefi', 'revenue_incl_vat_try', s.rev_usd::numeric, 'USD', NULL::date, 'cfo_settings.monthlyRevenueTargetUsd'),
      ('debt_below_5m_try', 'debt_ceiling', 'Toplam borç 5 milyon TL altına', 'debt_try', 5000000::numeric, 'TRY', NULL::date, 'policy:NEW_ORDER_DEBT_LIMIT_TRY'),
      ('wealth_usd', 'wealth_by_date', 'Servet hedefi (net sermaye)', 'net_capital_try', s.wealth_usd::numeric, 'USD', s.wealth_date, 'cfo_settings.usdWealthTarget+wealthTargetDate'),
      ('net_position_floor_try', 'position_floor', 'Net pozisyon tabanı (120 gün projeksiyon dibi)', 'projected_min_position_try', s.floor_try::numeric, 'TRY', NULL::date, 'cfo_settings.netPositionFloorTry')
    ) AS v(goal_key, kind, title, metric_key, target_value, target_currency, deadline, source)
  LOOP
    SELECT * INTO cur FROM public.fm_goal WHERE goal_key = d.goal_key AND valid_to IS NULL;
    IF d.target_value IS NULL OR (d.kind = 'wealth_by_date' AND d.deadline IS NULL) THEN
      IF FOUND THEN UPDATE public.fm_goal SET valid_to = now() WHERE goal_key = d.goal_key AND valid_to IS NULL; changed := changed + 1; END IF;
      CONTINUE;
    END IF;
    IF FOUND AND cur.target_value = d.target_value AND cur.target_currency = d.target_currency
       AND cur.deadline IS NOT DISTINCT FROM d.deadline AND cur.kind = d.kind AND cur.metric_key = d.metric_key THEN
      CONTINUE;
    END IF;
    IF FOUND THEN UPDATE public.fm_goal SET valid_to = now() WHERE goal_key = d.goal_key AND valid_to IS NULL; END IF;
    INSERT INTO public.fm_goal (goal_key, version, kind, title, metric_key, target_value, target_currency, deadline, source)
    VALUES (d.goal_key, coalesce((SELECT max(version) FROM public.fm_goal WHERE goal_key = d.goal_key), 0) + 1,
            d.kind, d.title, d.metric_key, d.target_value, d.target_currency, d.deadline, d.source);
    changed := changed + 1;
  END LOOP;
  RETURN changed;
END
$$;

-- Hedefleri değerlendir. p_as_of = değerlendirme günü (İstanbul); "tamamlanmış gün" = p_as_of'tan önceki günler.
CREATE OR REPLACE FUNCTION public.fm_goal_evaluate(p_as_of date DEFAULT (now() AT TIME ZONE 'Europe/Istanbul')::date)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  g record;
  fx record;
  fx_rate numeric; fx_month date; fx_grade char(1); fx_flags text[];
  st text; obs numeric; obs_on date; tgt numeric; prog numeric; gap numeric; cur_rate numeric; req_rate numeric;
  proj numeric; proj_on date; grade char(1); flags text[]; inputs jsonb; p_start date; p_end date;
  sales_refresh_at timestamptz; complete_through date; elapsed integer; dim integer; remaining integer;
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
        IF elapsed < 7 THEN flags := flags || ARRAY['goal_short_window']; END IF;
        cur_rate := round(mtd / elapsed, 2);
        proj := round(mtd / elapsed * dim, 2); proj_on := p_end;
        req_rate := CASE WHEN remaining > 0 THEN round(greatest(tgt - mtd, 0) / remaining, 2) END;
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

-- Satış (önceki + bu ay) ve bakiye hafızasını tazele. p_min_interval içinde başarılı bir tazeleme varsa atlanır (olay tetiklemeleri için).
CREATE OR REPLACE FUNCTION public.fm_memory_refresh_daily(p_today date DEFAULT (now() AT TIME ZONE 'Europe/Istanbul')::date,
                                                          p_min_interval interval DEFAULT interval '6 hours')
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_run uuid;
  res jsonb;
  bal bigint;
  from_m date := date_trunc('month', p_today - interval '1 month')::date;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('fm_memory_refresh_daily'));
  IF EXISTS (SELECT 1 FROM public.fm_ingest_run WHERE kind = 'sales_refresh' AND status = 'succeeded' AND finished_at > now() - p_min_interval) THEN
    RETURN jsonb_build_object('refreshed', false, 'reason', 'recent_refresh');
  END IF;
  INSERT INTO public.fm_ingest_run (kind, status, range_from, range_to, lineage)
  VALUES ('sales_refresh', 'running', from_m, p_today, jsonb_build_object('source', 'fm_sales_canonical', 'today', p_today))
  RETURNING id INTO v_run;
  BEGIN
    PERFORM public.fm_backfill_sales_snapshot(v_run);
    res := public.fm_backfill_sales_run(v_run, from_m, p_today, 3, false, p_today);
    IF (res ->> 'failed') IS NOT NULL OR NOT coalesce((res ->> 'finished')::boolean, false) THEN
      RAISE EXCEPTION 'sales refresh incomplete: %', res ->> 'failed';
    END IF;
    bal := public.fm_balance_refresh();
    UPDATE public.fm_ingest_run SET status = 'succeeded', finished_at = clock_timestamp(),
           rows_written = coalesce((SELECT sum(c.rows_written) FROM public.fm_ingest_chunk c WHERE c.run_id = v_run), 0),
           lineage = lineage || jsonb_build_object('months', res -> 'processed', 'balance_rows', bal)
     WHERE id = v_run;
    RETURN jsonb_build_object('refreshed', true, 'run_id', v_run, 'months', res -> 'processed', 'balance_rows', bal);
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.fm_ingest_run SET status = 'failed', finished_at = clock_timestamp(), lineage = lineage || jsonb_build_object('error', SQLSTATE)
     WHERE id = v_run;
    RETURN jsonb_build_object('refreshed', false, 'reason', 'refresh_error', 'error', SQLSTATE);
  END;
END
$$;

CREATE OR REPLACE VIEW public.fm_memory_goal WITH (security_invoker = true) AS
SELECT DISTINCT ON (g.goal_key)
       g.goal_key, g.version AS goal_version, g.kind, g.title, g.metric_key, g.target_value, g.target_currency, g.deadline, g.at_risk_band_pct, g.source,
       o.as_of, o.evaluated_at, o.period_start, o.period_end, o.state, o.observed_value_try, o.observed_on, o.target_value_try,
       o.fx_usd_try, o.fx_month, o.progress_pct, o.gap_try, o.current_rate_try_per_day, o.required_rate_try_per_day,
       o.projected_value_try, o.projected_on, o.grade, o.flags, o.inputs
FROM public.fm_goal g
JOIN public.fm_goal_observation o ON o.goal_key = g.goal_key AND o.goal_version = g.version
WHERE g.valid_to IS NULL
ORDER BY g.goal_key, o.as_of DESC, o.evaluated_at DESC;

-- Güvenlik: RLS açık; anon/authenticated/PUBLIC yok; reader yalnız SELECT (policy); yazan fonksiyonlar yalnız postgres/service_role.
DO $$
DECLARE o text; r text;
BEGIN
  FOREACH o IN ARRAY ARRAY['fm_goal', 'fm_goal_observation'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', o);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC', o);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cfo_acceptance_reader') THEN
      EXECUTE format('GRANT SELECT ON public.%I TO cfo_acceptance_reader', o);
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = o AND policyname = 'cfo_acceptance_reader_select') THEN
        EXECUTE format('CREATE POLICY cfo_acceptance_reader_select ON public.%I FOR SELECT TO cfo_acceptance_reader USING (true)', o);
      END IF;
    END IF;
  END LOOP;
  REVOKE ALL ON public.fm_memory_goal FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cfo_acceptance_reader') THEN GRANT SELECT ON public.fm_memory_goal TO cfo_acceptance_reader; END IF;
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON public.fm_goal, public.fm_goal_observation, public.fm_memory_goal FROM %I', r);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.fm_goal_sync(), public.fm_goal_evaluate(date), public.fm_memory_refresh_daily(date, interval) FROM %I', r);
    END IF;
  END LOOP;
  REVOKE EXECUTE ON FUNCTION public.fm_goal_sync(), public.fm_goal_evaluate(date), public.fm_memory_refresh_daily(date, interval) FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.fm_goal_sync(), public.fm_goal_evaluate(date), public.fm_memory_refresh_daily(date, interval) TO service_role;
  END IF;
END
$$;

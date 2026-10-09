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

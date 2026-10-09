-- CFO-001 PR-D: net sermayenin TEK tanımı (metrik sözleşmesi, docs/CFO-METRIC-CONTRACT.md; Alperen kararları 2026-10-09).
--   D-P01 GENİŞ (yoldaki malın ödenmiş kısmı dahil) · D-P02 stok = maliyet ile KDV hariç NRV'nin düşüğü (LCNRV) ·
--   D-P03 borç = kredi kalan anapara + kart toplam + kullanılan KMH; yoldaki ödenmemiş gümrük/navlun iki taraflı (net 0).
-- 1) cfo_metrik_net_sermaye(): bileşen satırları + sira 100 = NET SERMAYE. Değeri bilinmeyen stok 0 sayılmaz, BİLGİ satırında
--    BILINMIYOR olarak sayılır; satan ama birim maliyeti olmayan stok da (LCNRV maliyetsiz hesaplanamaz) toplama girmez, KDV hariç NRV'si
--    üst sınır olarak BİLGİ satırında. Üretim 09.10 (salt-okuma): 2.900.562 TL (DAR 2.467.282 / GENİŞ-NRV 6.225.616 yerine).
-- 2) cfo_snapshot."contractNetWorthTry" (yeni, boş olabilir) — cfo_take_snapshot sözleşme değerini de yazar; eski alanlar aynen.
-- 3) fm_balance_refresh: net_capital_try definition_version 3 = sözleşme (v2 yazılmaya devam eder).
-- 4) fm_goal_evaluate: bakiye hedefleri yalnız EN YENİ tanım sürümünden gözlenir ve eğilim yalnız o sürümden hesaplanır
--    (v3 ilk sözleşme snapshot'ıyla devreye girer; o güne kadar v2 aynen). Diğer her şey 20261009130000 ile birebir.
-- Yetki: yeni fonksiyon anon/authenticated/PUBLIC'e kapalı. Geri alma: cfo_take_snapshot → baseline, fm_balance_refresh →
-- 20261005250000, fm_goal_evaluate → 20261009130000; DROP FUNCTION cfo_metrik_net_sermaye(); kolon boş kalabilir.
ALTER TABLE public.cfo_snapshot ADD COLUMN IF NOT EXISTS "contractNetWorthTry" numeric(14,2);

CREATE OR REPLACE FUNCTION public.cfo_metrik_net_sermaye()
 RETURNS TABLE(sira integer, tur text, kalem text, tutar numeric, aciklama text)
 LANGUAGE sql
 STABLE
AS $function$
WITH h AS (
  SELECT round(COALESCE(sum(GREATEST(b."balanceTry", 0)), 0), 2) AS nakit,
         round(COALESCE(sum(GREATEST(-b."balanceTry", 0)), 0), 2) AS kmh,
         count(*) FILTER (WHERE b."balanceTry" < 0) AS kmh_hesap
    FROM public.cfo_bank_account b WHERE b."isActive" AND b."balanceTry" IS NOT NULL
), a AS (
  SELECT round(COALESCE(sum(r."amountTry"), 0), 2) AS alacak FROM public.cfo_receivable r WHERE NOT r."isCollected"
), s AS (
  SELECT round(COALESCE(sum(CASE WHEN d.deger_kaynagi = 'GERCEKLESEN_SATIS' AND d.birim_maliyet IS NOT NULL
                                   THEN LEAST(d.maliyet_degeri, d.stok * (d.birim_net_deger - d.birim_fiyat / 6.0))
                                 WHEN d.deger_kaynagi = 'MALIYET' THEN d.maliyet_degeri END), 0), 2) AS lcnrv,
         count(*) FILTER (WHERE d.deger_kaynagi = 'MALIYET' OR (d.deger_kaynagi = 'GERCEKLESEN_SATIS' AND d.birim_maliyet IS NOT NULL)) AS sku,
         count(*) FILTER (WHERE d.deger_kaynagi = 'GERCEKLESEN_SATIS' AND d.birim_maliyet IS NULL) AS maliyetsiz_sku,
         round(COALESCE(sum(d.stok * (d.birim_net_deger - d.birim_fiyat / 6.0)) FILTER (WHERE d.deger_kaynagi = 'GERCEKLESEN_SATIS' AND d.birim_maliyet IS NULL), 0), 2) AS maliyetsiz_nrv,
         count(*) FILTER (WHERE d.deger_kaynagi = 'GERCEKLESEN_SATIS' AND d.birim_maliyet IS NOT NULL AND d.stok * (d.birim_net_deger - d.birim_fiyat / 6.0) < d.maliyet_degeri) AS nrv_alti,
         count(*) FILTER (WHERE d.deger_kaynagi IS DISTINCT FROM 'GERCEKLESEN_SATIS' AND d.deger_kaynagi IS DISTINCT FROM 'MALIYET') AS bilinmeyen_sku,
         COALESCE(sum(d.stok) FILTER (WHERE d.deger_kaynagi IS DISTINCT FROM 'GERCEKLESEN_SATIS' AND d.deger_kaynagi IS DISTINCT FROM 'MALIYET'), 0) AS bilinmeyen_adet
    FROM public.cfo_stok_deger d WHERE d.gercek_stok
), y AS (
  SELECT round(COALESCE(sum(m.odenmis_try), 0), 2) AS odenmis,
         round(COALESCE(sum(m.odenmemis_vergi_try + m.odenmemis_navlun_try), 0), 2) AS taahhut
    FROM public.cfo_yoldaki_mal m WHERE m.risk = 'NORMAL'
), k AS (
  SELECT round(COALESCE(sum(l."remainingTry"), 0), 2) AS kredi FROM public.cfo_loan l WHERE l.status::text = 'AKTIF'
), c AS (
  SELECT round(COALESCE(sum(cc."totalDebtTry"), 0), 2) AS kart FROM public.cfo_credit_card cc WHERE cc."isActive"
)
SELECT v.sira, v.tur, v.kalem, v.tutar, v.aciklama
FROM h, a, s, y, k, c, LATERAL (VALUES
  (1, 'VARLIK', 'Nakit', h.nakit, 'Aktif banka hesaplarinin arti bakiyeleri (eksi bakiye KMH satirinda)'),
  (2, 'VARLIK', 'Alacaklar', a.alacak, 'cfo_receivable, tahsil edilmemis'),
  (3, 'VARLIK', 'Stok (rafta) - maliyet ile KDV haric NRV in dusugu', s.lcnrv,
     s.sku || ' SKU; ' || s.nrv_alti || ' SKU NRV maliyetin altinda (NRV ile). KDV haric NRV = birim net deger - birim fiyat/6 (%20 KDV yaklasimi)'),
  (4, 'VARLIK', 'Yoldaki mal - odenmis kisim', y.odenmis, 'cfo_yoldaki_mal NORMAL; odenmemis gumruk/navlun iki tarafli (net 0), asagida bilgi satiri'),
  (5, 'BORC', 'Krediler (kalan anapara)', -k.kredi, 'cfo_loan AKTIF remainingTry'),
  (6, 'BORC', 'Kredi kartlari (toplam borc)', -c.kart, 'cfo_credit_card totalDebtTry (ekstre + donem ici)'),
  (7, 'BORC', 'Kullanilan KMH', -h.kmh, h.kmh_hesap || ' hesap eksi bakiyede'),
  (90, 'BILGI', 'Degeri bilinmeyen stok (toplama girmedi)', NULL::numeric,
     CASE WHEN s.bilinmeyen_sku > 0 THEN 'BILINMIYOR: ' || s.bilinmeyen_sku || ' SKU, ' || s.bilinmeyen_adet || ' adet (maliyet ve satis kaniti yok); 0 sayilmadi, net sermaye bu kadar eksik olabilir'
          ELSE 'yok' END),
  (91, 'BILGI', 'Yoldaki mal - odenmemis gumruk/navlun (taahhut)', y.taahhut, 'Varlik ve borc tarafinda esit; net sermayeye etkisi 0 (D-P03)'),
  (92, 'BILGI', 'Maliyeti bilinmeyen satan stok (toplama girmedi)', CASE WHEN s.maliyetsiz_sku > 0 THEN s.maliyetsiz_nrv END,
     CASE WHEN s.maliyetsiz_sku > 0 THEN 'BILINMIYOR: ' || s.maliyetsiz_sku || ' SKU satiyor ama birim maliyeti yok; LCNRV hesaplanamaz. Tutar = KDV haric NRV (ust sinir); maliyet girilince toplama girer'
          ELSE 'yok' END),
  (100, 'TOPLAM', 'NET SERMAYE', h.nakit + a.alacak + s.lcnrv + y.odenmis - k.kredi - c.kart - h.kmh,
     'Sozlesme (CFO-001; D-P01 GENIS, D-P02 LCNRV, D-P03 borc = kredi + kart + KMH)')
) AS v(sira, tur, kalem, tutar, aciklama)
ORDER BY v.sira;
$function$;

CREATE OR REPLACE FUNCTION public.cfo_take_snapshot(p_note text DEFAULT NULL::text)
 RETURNS cfo_snapshot
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_usd NUMERIC; v_cash NUMERIC; v_recv NUMERIC; v_stok NUMERIC;
  v_yolda NUMERIC; v_kredi NUMERIC; v_kart NUMERIC; v_yolda_borc NUMERIC;
  v_narrow NUMERIC; v_wide NUMERIC; v_row "cfo_snapshot"; v_sozlesme NUMERIC;
BEGIN
  SELECT COALESCE(NULLIF("usdTryRate", 0), 1) INTO v_usd FROM "cfo_settings" LIMIT 1;
  IF v_usd IS NULL THEN v_usd := 1; END IF;

  SELECT
    COALESCE(SUM(tutar) FILTER (WHERE sira = 1), 0),
    COALESCE(SUM(tutar) FILTER (WHERE sira = 2), 0),
    COALESCE(SUM(tutar) FILTER (WHERE sira IN (3,4)), 0),
    COALESCE(SUM(tutar) FILTER (WHERE sira IN (5,6)), 0),
    COALESCE(-SUM(tutar) FILTER (WHERE sira = 7), 0),
    COALESCE(-SUM(tutar) FILTER (WHERE sira = 8), 0),
    COALESCE(-SUM(tutar) FILTER (WHERE sira = 9), 0)
  INTO v_cash, v_recv, v_stok, v_yolda, v_kredi, v_kart, v_yolda_borc
  FROM "cfo_servet_kalem";

  -- DAR: yoldaki mal haric (ne varligi ne borcu)
  v_narrow := v_cash + v_recv + v_stok - v_kredi - v_kart;
  -- GENIS: yoldaki mal iki tarafa birden (§4E kural 4)
  v_wide   := v_narrow + v_yolda - v_yolda_borc;

  -- SOZLESME (CFO-001, D-P01..03): net sermayenin tek tanimi; Goal Engine bunu okur (fm_balance_day v3)
  -- Hata snapshot'i durdurmaz: sozlesme NULL kalir (Goal v3 bayatlar → UNKNOWN), eski alanlar yine yazilir.
  BEGIN
    SELECT m.tutar INTO v_sozlesme FROM public.cfo_metrik_net_sermaye() m WHERE m.sira = 100;
  EXCEPTION WHEN OTHERS THEN
    v_sozlesme := NULL;
  END;

  INSERT INTO "cfo_snapshot" ("id","takenAt","netWorthTry","netWorthUsd","wideWorthTry",
      "wideWorthUsd","cashTry","receivablesTry","stockTry","debtTry","usdTryRate","note","contractNetWorthTry")
  VALUES (gen_random_uuid()::text, now(),
      round(v_narrow,2), round(v_narrow/v_usd,2), round(v_wide,2), round(v_wide/v_usd,2),
      round(v_cash,2), round(v_recv,2), round(v_stok + v_yolda,2),
      round(v_kredi + v_kart + v_yolda_borc,2), v_usd, p_note, round(v_sozlesme,2))
  RETURNING * INTO v_row;
  RETURN v_row;
END $function$;

CREATE OR REPLACE FUNCTION public.fm_balance_refresh(p_v2_from date DEFAULT DATE '2026-09-11') RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint; m bigint;
BEGIN
  INSERT INTO public.fm_balance_day (economic_date, metric_key, definition_version, value_try, source, known_at)
  SELECT s.d, m.metric_key, 2, m.v, 'cfo_snapshot', s.known_at
  FROM (SELECT DISTINCT ON ("takenAt"::date) "takenAt"::date AS d, "takenAt" AS known_at, "cashTry", "debtTry", "receivablesTry", "netWorthTry", "stockTry"
        FROM public.cfo_snapshot WHERE "takenAt"::date >= p_v2_from ORDER BY "takenAt"::date, "takenAt" DESC) s
  CROSS JOIN LATERAL (VALUES ('cash_try', s."cashTry"), ('debt_try', s."debtTry"), ('receivables_try', s."receivablesTry"),
                             ('net_capital_try', s."netWorthTry"), ('inventory_value_try', s."stockTry")) AS m(metric_key, v)
  WHERE m.v IS NOT NULL
  ON CONFLICT (economic_date, metric_key, definition_version) DO UPDATE SET value_try = EXCLUDED.value_try,
    source = EXCLUDED.source, known_at = EXCLUDED.known_at;
  GET DIAGNOSTICS n = ROW_COUNT;
  -- v3 (CFO-001, 2026-10-09): net sermaye SOZLESME tanimi (cfo_snapshot.contractNetWorthTry = cfo_metrik_net_sermaye()); v2 (DAR) aynen yazilmaya devam eder.
  INSERT INTO public.fm_balance_day (economic_date, metric_key, definition_version, value_try, source, known_at)
  SELECT s.d, 'net_capital_try', 3, s.v, 'cfo_snapshot.contractNetWorthTry', s.known_at
  FROM (SELECT DISTINCT ON ("takenAt"::date) "takenAt"::date AS d, "takenAt" AS known_at, "contractNetWorthTry" AS v
        FROM public.cfo_snapshot WHERE "takenAt"::date >= p_v2_from ORDER BY "takenAt"::date, "takenAt" DESC) s
  WHERE s.v IS NOT NULL
  ON CONFLICT (economic_date, metric_key, definition_version) DO UPDATE SET value_try = EXCLUDED.value_try,
    source = EXCLUDED.source, known_at = EXCLUDED.known_at;
  GET DIAGNOSTICS m = ROW_COUNT;
  RETURN n + m;
END
$$;

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
  bver integer; h text; written integer := 0; skipped integer := 0; summary jsonb := '[]'::jsonb;
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
      -- Gozlem ve egilim YALNIZ en yeni tanim surumunden (CFO-001: net_capital_try v3 = sozlesme); surumler ayni seri degildir,
      -- egilim karisik surumlerden hesaplanmaz (yeni surumun ilk 14 gununde goal_short_history).
      SELECT max(b.definition_version) INTO bver FROM public.fm_balance_day b WHERE b.metric_key = g.metric_key AND b.economic_date <= p_as_of;
      SELECT b.economic_date, b.value_try, b.grade INTO obs_on, obs, grade
        FROM public.fm_memory_balance_day b
       WHERE b.metric_key = g.metric_key AND b.economic_date <= p_as_of AND b.definition_version = bver
       ORDER BY b.economic_date DESC LIMIT 1;
      -- Eğilim: son 30 gün (≥5 gözlem, ≥14 gün aralık), TL/gün.
      SELECT regr_slope(b.value_try, (b.economic_date - DATE '2000-01-01')::numeric), count(*), max(b.economic_date) - min(b.economic_date)
        INTO slope, npts, span
        FROM public.fm_balance_day b
       WHERE b.metric_key = g.metric_key AND b.economic_date BETWEEN p_as_of - 30 AND p_as_of AND b.definition_version = bver;
      inputs := jsonb_build_object('observed_on', obs_on, 'value_try', obs, 'definition_version', bver, 'trend_points', npts, 'trend_span_days', span,
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

COMMENT ON FUNCTION public.cfo_metrik_net_sermaye() IS 'Net sermayenin tek tanımı (CFO-001 sözleşmesi; GENİŞ + LCNRV + KMH). sira 100 = toplam. 2026-10-09.';
REVOKE ALL ON FUNCTION public.cfo_metrik_net_sermaye() FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON FUNCTION public.cfo_metrik_net_sermaye() FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON FUNCTION public.cfo_metrik_net_sermaye() FROM authenticated; END IF;
END $$;

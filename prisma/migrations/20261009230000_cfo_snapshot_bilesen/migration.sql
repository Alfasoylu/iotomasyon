-- CFO-017 / RF-011 (2026-10-09): net sermaye atfi kimligi. fm_balance_day bilesenleri (nakit + alacak + stok - borc) net sermayeyi
-- vermiyordu: v2 stockTry yoldaki mali icerir ama v2 net (DAR) icermez; 170000/180000 sonrasi net ve borc v3 (sozlesme), nakit/alacak/stok v2.
-- Duzeltme: cfo_take_snapshot sozlesmenin varlik bilesenlerini (cfo_metrik_net_sermaye sira 1-4) yeni sutunlara yazar; fm_balance_refresh
-- bunlari v3 olarak (cash_try, receivables_try, inventory_value_try, in_transit_try) fm_balance_day'e tasir. Kimlik (her v3 gunu):
--   net_capital_try v3 = cash_try v3 + receivables_try v3 + inventory_value_try v3 + in_transit_try v3 - debt_try v3.
-- Ham veri degismez: yeni bos sutunlar + iki fonksiyonun yeni surumu (eski alanlar ve v2 satirlari aynen yazilir).
-- Geri alma: 20261009180000 icindeki cfo_take_snapshot / fm_balance_refresh; ALTER TABLE cfo_snapshot DROP COLUMN (4 sutun); v3 bilesen satirlari silinebilir.
ALTER TABLE public.cfo_snapshot ADD COLUMN IF NOT EXISTS "contractCashTry" numeric(14,2);
ALTER TABLE public.cfo_snapshot ADD COLUMN IF NOT EXISTS "contractReceivablesTry" numeric(14,2);
ALTER TABLE public.cfo_snapshot ADD COLUMN IF NOT EXISTS "contractStockTry" numeric(14,2);
ALTER TABLE public.cfo_snapshot ADD COLUMN IF NOT EXISTS "contractInTransitTry" numeric(14,2);
-- Yeni bakiye metriği (fm_balance_day.metric_key → fm_metric): yoldaki ödenmiş mal (sözleşmenin 4. varlık kalemi)
INSERT INTO public.fm_metric (metric_key, domain, unit, headline, description) VALUES
 ('in_transit_try', 'balance', 'TRY', false, 'Yoldaki ödenmiş mal (RİSKLİ hariç; net sermaye sözleşmesinin 4. varlık kalemi, v3).')
ON CONFLICT (metric_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.cfo_take_snapshot(p_note text DEFAULT NULL::text)
 RETURNS cfo_snapshot
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_usd NUMERIC; v_cash NUMERIC; v_recv NUMERIC; v_stok NUMERIC;
  v_yolda NUMERIC; v_kredi NUMERIC; v_kart NUMERIC; v_yolda_borc NUMERIC;
  v_narrow NUMERIC; v_wide NUMERIC; v_row "cfo_snapshot"; v_sozlesme NUMERIC; v_borc NUMERIC;
  c_cash NUMERIC; c_recv NUMERIC; c_stok NUMERIC; c_yolda NUMERIC;
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
  -- CFO-017: sozlesmenin VARLIK bilesenleri de (nakit 1, alacak 2, stok LCNRV 3, yoldaki odenmis 4) ayni cagridan; kimlik:
  -- sozlesme = nakit + alacak + stok + yoldaki - borc sozlesmesi (fm_balance_day v3 bilesenleri net sermayeyi verir)
  BEGIN
    SELECT max(m.tutar) FILTER (WHERE m.sira = 100), max(m.tutar) FILTER (WHERE m.sira = 1), max(m.tutar) FILTER (WHERE m.sira = 2),
           max(m.tutar) FILTER (WHERE m.sira = 3), max(m.tutar) FILTER (WHERE m.sira = 4)
      INTO v_sozlesme, c_cash, c_recv, c_stok, c_yolda
      FROM public.cfo_metrik_net_sermaye() m;
  EXCEPTION WHEN OTHERS THEN
    v_sozlesme := NULL; c_cash := NULL; c_recv := NULL; c_stok := NULL; c_yolda := NULL;
  END;
  -- BORC SOZLESMESI (CFO-002, D-P03): kredi kalan + kart toplam + kullanilan KMH; Goal debt_try v3
  BEGIN
    SELECT m.tutar INTO v_borc FROM public.cfo_metrik_borc() m WHERE m.sira = 100;
  EXCEPTION WHEN OTHERS THEN
    v_borc := NULL;
  END;

  INSERT INTO "cfo_snapshot" ("id","takenAt","netWorthTry","netWorthUsd","wideWorthTry",
      "wideWorthUsd","cashTry","receivablesTry","stockTry","debtTry","usdTryRate","note","contractNetWorthTry","contractDebtTry",
      "contractCashTry","contractReceivablesTry","contractStockTry","contractInTransitTry")
  VALUES (gen_random_uuid()::text, now(),
      round(v_narrow,2), round(v_narrow/v_usd,2), round(v_wide,2), round(v_wide/v_usd,2),
      round(v_cash,2), round(v_recv,2), round(v_stok + v_yolda,2),
      round(v_kredi + v_kart + v_yolda_borc,2), v_usd, p_note, round(v_sozlesme,2), round(v_borc,2),
      round(c_cash,2), round(c_recv,2), round(c_stok,2), round(c_yolda,2))
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
  n := n + m;
  -- v3 (CFO-002, 2026-10-09): borc SOZLESME tanimi (cfo_snapshot.contractDebtTry = cfo_metrik_borc()); v2 aynen yazilmaya devam eder.
  INSERT INTO public.fm_balance_day (economic_date, metric_key, definition_version, value_try, source, known_at)
  SELECT s.d, 'debt_try', 3, s.v, 'cfo_snapshot.contractDebtTry', s.known_at
  FROM (SELECT DISTINCT ON ("takenAt"::date) "takenAt"::date AS d, "takenAt" AS known_at, "contractDebtTry" AS v
        FROM public.cfo_snapshot WHERE "takenAt"::date >= p_v2_from ORDER BY "takenAt"::date, "takenAt" DESC) s
  WHERE s.v IS NOT NULL
  ON CONFLICT (economic_date, metric_key, definition_version) DO UPDATE SET value_try = EXCLUDED.value_try,
    source = EXCLUDED.source, known_at = EXCLUDED.known_at;
  GET DIAGNOSTICS m = ROW_COUNT;
  n := n + m;
  -- v3 bilesenler (CFO-017, 2026-10-09): sozlesmenin varlik kalemleri; v3 nakit + alacak + stok + yoldaki - v3 borc = v3 net sermaye.
  -- Yalniz bilesenleri olan (bu migration sonrasi) snapshot'lardan; eski v2 bilesenler aynen kalir (surumler karismaz).
  INSERT INTO public.fm_balance_day (economic_date, metric_key, definition_version, value_try, source, known_at)
  SELECT s.d, c.metric_key, 3, c.v, 'cfo_snapshot.' || c.col, s.known_at
  FROM (SELECT DISTINCT ON ("takenAt"::date) "takenAt"::date AS d, "takenAt" AS known_at,
               "contractCashTry", "contractReceivablesTry", "contractStockTry", "contractInTransitTry"
        FROM public.cfo_snapshot WHERE "takenAt"::date >= p_v2_from ORDER BY "takenAt"::date, "takenAt" DESC) s
  CROSS JOIN LATERAL (VALUES ('cash_try', 'contractCashTry', s."contractCashTry"), ('receivables_try', 'contractReceivablesTry', s."contractReceivablesTry"),
                             ('inventory_value_try', 'contractStockTry', s."contractStockTry"), ('in_transit_try', 'contractInTransitTry', s."contractInTransitTry")) AS c(metric_key, col, v)
  WHERE c.v IS NOT NULL
  ON CONFLICT (economic_date, metric_key, definition_version) DO UPDATE SET value_try = EXCLUDED.value_try,
    source = EXCLUDED.source, known_at = EXCLUDED.known_at;
  GET DIAGNOSTICS m = ROW_COUNT;
  RETURN n + m;
END
$$;

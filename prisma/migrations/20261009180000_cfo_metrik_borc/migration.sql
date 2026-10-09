-- CFO-002: borcun TEK tanımı + hedef < 100.000 USD (metrik sözleşmesi; Alperen D-P03 2026-10-09, hedef kararı 2026-10-08).
--   Finansal borç = kredi kalan anapara + kart toplam borcu + kullanılan KMH. Yoldaki malın ödenmemiş gümrük/navlunu ticari taahhüttür:
--   hedefin dışında, bilgi satırında (bugün borç 9.676.976 TL "gösteriliyordu"; bunun 3.787.072'si taahhüt).
-- 1) cfo_metrik_borc(): bileşen satırları + sira 100 = FİNANSAL BORÇ (net sermaye sözleşmesindeki borç satırlarıyla aynı kaynaklar).
-- 2) cfo_settings."debtTargetUsd" (yeni, varsayılan 100.000) — hedef ve sipariş kapısı aynı ayardan; 5.000.000 TL sabiti emekli.
-- 3) cfo_snapshot."contractDebtTry"; cfo_take_snapshot yazar (hata → NULL, snapshot durmaz); fm_balance_refresh debt_try v3.
-- 4) fm_goal_sync: debt_below_usd (USD, TCMB kuruyla) açılır, debt_below_5m_try emekli (gözlem geçmişi kalır). Goal en yeni tanım
--    sürümünü okur (20261009170000) → v3 ilk sözleşme snapshot'ıyla devreye girer.
-- 20261009170000'den SONRA uygulanır (cfo_take_snapshot / fm_balance_refresh onun üstüne). Yetki: yeni fonksiyon anon/authenticated'a kapalı.
-- Geri alma: 20261009170000 içindeki cfo_take_snapshot / fm_balance_refresh, 20261006130000 içindeki fm_goal_sync; DROP FUNCTION cfo_metrik_borc().
ALTER TABLE public.cfo_settings ADD COLUMN IF NOT EXISTS "debtTargetUsd" numeric(14,2) DEFAULT 100000;
ALTER TABLE public.cfo_snapshot ADD COLUMN IF NOT EXISTS "contractDebtTry" numeric(14,2);

CREATE OR REPLACE FUNCTION public.cfo_metrik_borc()
 RETURNS TABLE(sira integer, tur text, kalem text, tutar numeric, aciklama text)
 LANGUAGE sql
 STABLE
AS $function$
WITH k AS (
  SELECT round(COALESCE(sum(l."remainingTry"), 0), 2) AS kredi,
         round(COALESCE(sum(COALESCE(l."earlyPayoffTry", l."remainingTry")), 0), 2) AS erken,
         count(*) AS adet
    FROM public.cfo_loan l WHERE l.status::text = 'AKTIF'
), c AS (
  SELECT round(COALESCE(sum(cc."totalDebtTry"), 0), 2) AS kart,
         round(COALESCE(sum(cc."totalDebtTry") FILTER (WHERE btrim(COALESCE(cc.holder, '')) = 'Alp'), 0), 2) AS kart_sahsi,
         count(*) FILTER (WHERE cc."totalDebtTry" IS NULL) AS bilinmeyen
    FROM public.cfo_credit_card cc WHERE cc."isActive"
), h AS (
  SELECT round(COALESCE(sum(GREATEST(-b."balanceTry", 0)), 0), 2) AS kmh,
         round(COALESCE(sum(GREATEST(-b."balanceTry", 0)) FILTER (WHERE b."accountType" ~* 'ŞAHSİ|SAHSI'), 0), 2) AS kmh_sahsi,
         count(*) FILTER (WHERE b."balanceTry" < 0) AS hesap
    FROM public.cfo_bank_account b WHERE b."isActive" AND b."balanceTry" IS NOT NULL
), y AS (
  SELECT round(COALESCE(sum(m.odenmemis_vergi_try + m.odenmemis_navlun_try), 0), 2) AS taahhut
    FROM public.cfo_yoldaki_mal m WHERE m.risk = 'NORMAL'
)
SELECT v.sira, v.tur, v.kalem, v.tutar, v.aciklama
FROM k, c, h, y, LATERAL (VALUES
  (1, 'BORC', 'Krediler (kalan anapara)', k.kredi, k.adet || ' aktif kredi; cfo_loan remainingTry (taksit sayisi degil)'),
  (2, 'BORC', 'Kredi kartlari (toplam borc)', c.kart,
     'cfo_credit_card totalDebtTry (ekstre + donem ici)' || CASE WHEN c.bilinmeyen > 0 THEN '; ' || c.bilinmeyen || ' kartin borcu BILINMIYOR (toplama girmedi)' ELSE '' END),
  (3, 'BORC', 'Kullanilan KMH', h.kmh, h.hesap || ' hesap eksi bakiyede'),
  (90, 'BILGI', 'Yoldaki mal - odenmemis gumruk/navlun (ticari taahhut, hedef disi)', y.taahhut,
     'Mal teslim alininca odenir ve stok maliyetine eklenir; nakit projeksiyonunda gorunur (D-P03)'),
  (91, 'BILGI', 'Krediler erken kapama tutariyla', k.erken, 'earlyPayoffTry, yoksa kalan anapara; hedef kalan anaparayla olculur'),
  (92, 'BILGI', 'Toplamin sahsi kismi (kart + KMH, hedefe dahil)', c.kart_sahsi + h.kmh_sahsi, 'Sahsi kart (holder Alp) + SAHSI hesap KMH; sirket/sahsi ayrimi CFO-006'),
  (100, 'TOPLAM', 'FINANSAL BORC', k.kredi + c.kart + h.kmh, 'Sozlesme (CFO-002; D-P03 borc = kredi kalan + kart toplam + kullanilan KMH)')
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
  v_narrow NUMERIC; v_wide NUMERIC; v_row "cfo_snapshot"; v_sozlesme NUMERIC; v_borc NUMERIC;
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
  -- BORC SOZLESMESI (CFO-002, D-P03): kredi kalan + kart toplam + kullanilan KMH; Goal debt_try v3
  BEGIN
    SELECT m.tutar INTO v_borc FROM public.cfo_metrik_borc() m WHERE m.sira = 100;
  EXCEPTION WHEN OTHERS THEN
    v_borc := NULL;
  END;

  INSERT INTO "cfo_snapshot" ("id","takenAt","netWorthTry","netWorthUsd","wideWorthTry",
      "wideWorthUsd","cashTry","receivablesTry","stockTry","debtTry","usdTryRate","note","contractNetWorthTry","contractDebtTry")
  VALUES (gen_random_uuid()::text, now(),
      round(v_narrow,2), round(v_narrow/v_usd,2), round(v_wide,2), round(v_wide/v_usd,2),
      round(v_cash,2), round(v_recv,2), round(v_stok + v_yolda,2),
      round(v_kredi + v_kart + v_yolda_borc,2), v_usd, p_note, round(v_sozlesme,2), round(v_borc,2))
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
  RETURN n + m;
END
$$;

CREATE OR REPLACE FUNCTION public.fm_goal_sync() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  s record;
  d record;
  cur record;
  changed integer := 0;
BEGIN
  SELECT "monthlyRevenueTargetUsd" AS rev_usd, "usdWealthTarget" AS wealth_usd, "wealthTargetDate"::date AS wealth_date,
         "netPositionFloorTry" AS floor_try, "debtTargetUsd" AS debt_usd
    INTO s FROM public.cfo_settings ORDER BY "updatedAt" DESC LIMIT 1;
  FOR d IN
    SELECT * FROM (VALUES
      ('revenue_month_usd', 'revenue_month', 'Aylık ciro hedefi', 'revenue_incl_vat_try', s.rev_usd::numeric, 'USD', NULL::date, 'cfo_settings.monthlyRevenueTargetUsd'),
      ('debt_below_usd', 'debt_ceiling', 'Finansal borç hedefin altına (kredi + kart + KMH)', 'debt_try', s.debt_usd::numeric, 'USD', NULL::date, 'cfo_settings.debtTargetUsd'),
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
  -- CFO-002: eski 5 milyon TL hedefi emekli (yerine debt_below_usd; gozlem gecmisi korunur)
  UPDATE public.fm_goal SET valid_to = now() WHERE goal_key = 'debt_below_5m_try' AND valid_to IS NULL;
  IF FOUND THEN changed := changed + 1; END IF;
  RETURN changed;
END
$$;

COMMENT ON FUNCTION public.cfo_metrik_borc() IS 'Finansal borcun tek tanımı (CFO-002; kredi kalan + kart toplam + kullanılan KMH). sira 100 = toplam. 2026-10-09.';
REVOKE ALL ON FUNCTION public.cfo_metrik_borc() FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON FUNCTION public.cfo_metrik_borc() FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON FUNCTION public.cfo_metrik_borc() FROM authenticated; END IF;
END $$;

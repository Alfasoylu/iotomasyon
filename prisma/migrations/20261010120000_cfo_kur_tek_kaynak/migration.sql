-- CFO-003 kalan (RF-20261008-003, 2026-10-10): KUR TEK KAYNAK — SQL'deki sabit kur yedekleri ve snapshot kur dongusu kalkar.
-- D-P04: hedef/servet olcen USD donusumu STRATEJIK kur (TCMB doviz alis, ayin 15'i; fm_memory_fx_monthly — Goal Engine ve lib/fx/strategic.ts ile
-- ayni kural: degerlendirme ayina kadarki en yeni ay); ithalat fiyatlama ISLEM kuru (lib/fx/current.ts ile ayni sira: cfo_kur → cfo_settings →
-- MonthlyExchangeRate). Kur yoksa NULL (BILINMIYOR) — 48,5 / 1 sabit yedegi YOK.
--   cfo_take_snapshot: USD alanlari stratejik kurla; cfo_settings.usdTryRate ya da 1 degil. netWorthUsd kur yoksa NULL olabilir (NOT NULL kalkar).
--   cfo_servet.kur / servet_usd: stratejik kur (onceden son snapshot'in usdTryRate'i — cfo_settings'ten gelen kur dongusu).
--   cfo_ciro_hedef: ciro USD'si stratejik kurla (onceden cfo_settings, yoksa 48,5).
--   cfo_ithalat_oneri / cfo_ithalat_oneri_ozet: islem kuru (onceden cfo_settings, yoksa 48,5).
-- Kur ifadeleri gorunumlerde satir ici (okuyucu rolune fonksiyon EXECUTE yetkisi gerekmez). Ham veri degismez; TL alanlari ayni.
-- Geri alma: prisma/baseline/2026-10-06.sql gorunum tanimlari + 20261009230000 cfo_take_snapshot; ALTER COLUMN "netWorthUsd" SET NOT NULL (NULL satir yoksa).
ALTER TABLE public.cfo_snapshot ALTER COLUMN "netWorthUsd" DROP NOT NULL;

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
  -- CFO-003 (D-P04): USD alanlari STRATEJIK kurla (TCMB doviz alis, Goal Engine ile ayni kural); kur yoksa USD alanlari NULL (BILINMIYOR).
  -- Eski: cfo_settings.usdTryRate, yoksa 1 (1 USD = 1 TL) — cfo_servet.kur bu degeri snapshot uzerinden geri okuyordu (kur dongusu).
  SELECT f.usd_try_forex_buying INTO v_usd FROM public.fm_memory_fx_monthly f
   WHERE f.usd_try_forex_buying IS NOT NULL AND f.month <= date_trunc('month', now() AT TIME ZONE 'Europe/Istanbul')::date
   ORDER BY f.month DESC LIMIT 1;

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
      round(v_narrow,2), round(v_narrow/NULLIF(v_usd,0),2), round(v_wide,2), round(v_wide/NULLIF(v_usd,0),2),
      round(v_cash,2), round(v_recv,2), round(v_stok + v_yolda,2),
      round(v_kredi + v_kart + v_yolda_borc,2), v_usd, p_note, round(v_sozlesme,2), round(v_borc,2),
      round(c_cash,2), round(c_recv,2), round(c_stok,2), round(c_yolda,2))
  RETURNING * INTO v_row;
  RETURN v_row;
END $function$;

CREATE OR REPLACE VIEW public.cfo_ciro_hedef AS
 WITH kural AS (
         SELECT COALESCE(max(cfo_settings."monthlyRevenueTargetUsd"), (100000)::numeric) AS hedef_usd,
            ( SELECT f.usd_try_forex_buying
           FROM fm_memory_fx_monthly f
          WHERE ((f.usd_try_forex_buying IS NOT NULL) AND (f.month <= (date_trunc('month'::text, (now() AT TIME ZONE 'Europe/Istanbul'::text)))::date))
          ORDER BY f.month DESC
         LIMIT 1) AS kur
           FROM cfo_settings
        ), son_tam AS (
         SELECT cfo_aylik_urun_kar.ay,
            cfo_aylik_urun_kar.ay_str,
            sum(cfo_aylik_urun_kar.brut_ciro) AS ciro_try,
            sum(cfo_aylik_urun_kar.adet) AS adet
           FROM cfo_aylik_urun_kar
          WHERE (cfo_aylik_urun_kar.ay < date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone))
          GROUP BY cfo_aylik_urun_kar.ay, cfo_aylik_urun_kar.ay_str
          ORDER BY cfo_aylik_urun_kar.ay DESC
         LIMIT 1
        )
 SELECT s.ay_str AS ay,
    round((s.ciro_try)::numeric, 0) AS ciro_try,
    round(((s.ciro_try / (k.kur)::double precision))::numeric, 0) AS ciro_usd,
    k.hedef_usd,
    round(((((s.ciro_try / (k.kur)::double precision) / (NULLIF(k.hedef_usd, (0)::numeric))::double precision) * (100)::double precision))::numeric, 1) AS hedef_pct,
    round((((k.hedef_usd)::double precision - (s.ciro_try / (k.kur)::double precision)))::numeric, 0) AS acik_usd,
    round((((k.hedef_usd)::double precision / NULLIF((s.ciro_try / (k.kur)::double precision), (0)::double precision)))::numeric, 2) AS gereken_kat,
    (s.adet)::integer AS adet
   FROM (son_tam s
     CROSS JOIN kural k);

CREATE OR REPLACE VIEW public.cfo_servet AS
 SELECT round(sum(tutar) FILTER (WHERE (tur = 'VARLIK'::text)), 2) AS varlik,
    round((- sum(tutar) FILTER (WHERE (tur = 'BORC'::text))), 2) AS borc,
    round(sum(tutar) FILTER (WHERE (tur = ANY (ARRAY['VARLIK'::text, 'BORC'::text]))), 2) AS servet_try,
    round(sum(tutar) FILTER (WHERE (tur = 'RISKLI'::text)), 2) AS riskli_haric_tutulan,
    round((sum(tutar) FILTER (WHERE (tur <> 'RISKLI'::text)) + sum(tutar) FILTER (WHERE (tur = 'RISKLI'::text))), 2) AS servet_riskli_dahil,
    (( SELECT f.usd_try_forex_buying
           FROM fm_memory_fx_monthly f
          WHERE ((f.usd_try_forex_buying IS NOT NULL) AND (f.month <= (date_trunc('month'::text, (now() AT TIME ZONE 'Europe/Istanbul'::text)))::date))
          ORDER BY f.month DESC
         LIMIT 1))::numeric(10,4) AS kur,
    round((sum(tutar) FILTER (WHERE (tur = ANY (ARRAY['VARLIK'::text, 'BORC'::text]))) / ( SELECT f.usd_try_forex_buying
           FROM fm_memory_fx_monthly f
          WHERE ((f.usd_try_forex_buying IS NOT NULL) AND (f.month <= (date_trunc('month'::text, (now() AT TIME ZONE 'Europe/Istanbul'::text)))::date))
          ORDER BY f.month DESC
         LIMIT 1)), 2) AS servet_usd
   FROM cfo_servet_kalem;

CREATE OR REPLACE VIEW public.cfo_ithalat_oneri AS
 WITH kural AS (
         SELECT COALESCE(max(cfo_settings."importAirLeadDays"), 22) AS air_lead,
            COALESCE(max(cfo_settings."importSeaLeadDays"), 67) AS sea_lead,
            COALESCE(max(cfo_settings."importMinLineQty"), 5) AS min_adet,
            COALESCE(( SELECT k_1.usd_try
           FROM cfo_kur k_1
          WHERE (k_1.usd_try > (0)::numeric)
          ORDER BY k_1.ay DESC
         LIMIT 1), ( SELECT s_1."usdTryRate"
           FROM cfo_settings s_1
          WHERE (s_1."usdTryRate" > (0)::numeric)
         LIMIT 1), ( SELECT m_1."usdTryRate"
           FROM "MonthlyExchangeRate" m_1
          WHERE (m_1."usdTryRate" > (0)::numeric)
          ORDER BY m_1.year DESC, m_1.month DESC
         LIMIT 1)) AS kur
           FROM cfo_settings
        ), ham AS (
         SELECT l.id,
            l.batch_id,
            l.sku,
            l.product_name,
            l.qty,
            l.unit_cost_usd,
            l.total_usd,
            l.priority,
            l.reason,
            l.monthly_sales,
            l.stock_now,
            l.stockout_date,
            l.wait_cost_try_monthly,
            l.data_tag,
            l.status,
            l.added_at,
            l.note,
            b.transport_mode,
            b.status AS batch_status,
            b.cash_gate,
            b.decision
           FROM (cfo_order_line l
             JOIN cfo_order_batch b ON ((b.id = l.batch_id)))
          WHERE ((l.status = 'BEKLIYOR'::text) AND (COALESCE(l.qty, 0) > 0) AND (b.status = ANY (ARRAY['ACIK'::text, 'PLANLANIYOR'::text])))
        ), tekil AS (
         SELECT DISTINCT ON (ham.transport_mode, ham.sku) ham.transport_mode AS mod,
            ham.sku,
            ham.product_name,
            ham.qty,
            ham.unit_cost_usd,
            ham.monthly_sales,
            ham.stock_now,
            ham.stockout_date,
            ham.wait_cost_try_monthly,
            ham.priority,
            ham.data_tag,
            ham.batch_id,
            ham.reason
           FROM ham
          ORDER BY ham.transport_mode, ham.sku, ham.added_at DESC NULLS LAST, ham.id DESC
        ), kopru AS (
         SELECT ham.sku
           FROM ham
          GROUP BY ham.sku
         HAVING (count(DISTINCT ham.transport_mode) > 1)
        ), fiyat AS (
         SELECT cfo_aylik_urun_kar.sku,
            ((sum(cfo_aylik_urun_kar.brut_ciro) / (NULLIF(sum(cfo_aylik_urun_kar.adet), (0)::numeric))::double precision))::numeric AS birim_fiyat_try
           FROM cfo_aylik_urun_kar
          WHERE (cfo_aylik_urun_kar.ay >= (date_trunc('month'::text, (CURRENT_DATE)::timestamp with time zone) - '3 mons'::interval))
          GROUP BY cfo_aylik_urun_kar.sku
        )
 SELECT t.mod,
    t.sku,
    t.product_name,
    t.priority,
    t.data_tag,
    t.batch_id AS kaynak_parti,
    t.reason,
    t.qty AS parti_adedi,
    GREATEST(t.qty, k.min_adet) AS onerilen_adet,
    (GREATEST(t.qty, k.min_adet) > t.qty) AS min_adet_uygulandi,
    t.unit_cost_usd AS birim_maliyet_usd,
    round(((GREATEST(t.qty, k.min_adet))::numeric * t.unit_cost_usd), 2) AS tutar_usd,
    (t.unit_cost_usd IS NULL) AS maliyet_eksik,
    t.monthly_sales AS aylik_satis,
    t.stock_now AS stok,
    COALESCE(t.stockout_date, (CURRENT_DATE + ((((COALESCE(t.stock_now, 0))::numeric / NULLIF(t.monthly_sales, (0)::numeric)) * (30)::numeric))::integer)) AS tukenis_tarihi,
        CASE
            WHEN (t.mod = 'HAVA'::text) THEN k.air_lead
            ELSE k.sea_lead
        END AS termin_gun,
    (COALESCE(t.stockout_date, (CURRENT_DATE + ((((COALESCE(t.stock_now, 0))::numeric / NULLIF(t.monthly_sales, (0)::numeric)) * (30)::numeric))::integer)) -
        CASE
            WHEN (t.mod = 'HAVA'::text) THEN k.air_lead
            ELSE k.sea_lead
        END) AS son_siparis_tarihi,
    ((COALESCE(t.stockout_date, (CURRENT_DATE + ((((COALESCE(t.stock_now, 0))::numeric / NULLIF(t.monthly_sales, (0)::numeric)) * (30)::numeric))::integer)) -
        CASE
            WHEN (t.mod = 'HAVA'::text) THEN k.air_lead
            ELSE k.sea_lead
        END) < CURRENT_DATE) AS gecikti,
    (CURRENT_DATE +
        CASE
            WHEN (t.mod = 'HAVA'::text) THEN k.air_lead
            ELSE k.sea_lead
        END) AS tahmini_varis,
    round(((GREATEST(t.qty, k.min_adet))::numeric / NULLIF(t.monthly_sales, (0)::numeric)), 1) AS kapsam_ay,
    COALESCE(t.wait_cost_try_monthly, (0)::numeric) AS aylik_risk_kar_try,
    round(f.birim_fiyat_try, 2) AS birim_fiyat_try,
    round(((t.monthly_sales * f.birim_fiyat_try) / k.kur), 0) AS aylik_ciro_usd,
    (kp.sku IS NOT NULL) AS kopru,
    ka.karar,
    ka.sebep AS karar_sebep,
    ka.gecerli_bitis AS karar_bitis,
    COALESCE((ka.karar = 'ALMA'::text), false) AS haric,
    COALESCE(y.yolda_adet, 0) AS yolda_adet,
    y.en_yakin_eta AS yolda_eta,
    y.partiler AS yolda_parti,
    ((y.yolda_adet IS NOT NULL) AND (y.en_yakin_eta IS NOT NULL) AND (y.en_yakin_eta <= (CURRENT_DATE +
        CASE
            WHEN (t.mod = 'HAVA'::text) THEN k.air_lead
            ELSE k.sea_lead
        END)) AND ((y.yolda_adet)::numeric >= (COALESCE(t.monthly_sales, (0)::numeric) * ((((CURRENT_DATE +
        CASE
            WHEN (t.mod = 'HAVA'::text) THEN k.air_lead
            ELSE k.sea_lead
        END) - y.en_yakin_eta))::numeric / (30)::numeric)))) AS yolda_yeterli,
    (row_number() OVER (PARTITION BY t.mod ORDER BY COALESCE(t.wait_cost_try_monthly, (0)::numeric) DESC, t.priority, t.sku))::integer AS sira
   FROM (((((tekil t
     CROSS JOIN kural k)
     LEFT JOIN fiyat f ON ((f.sku = t.sku)))
     LEFT JOIN kopru kp ON ((kp.sku = t.sku)))
     LEFT JOIN cfo_urun_karar ka ON (((ka.sku = t.sku) AND ((ka.gecerli_bitis IS NULL) OR (ka.gecerli_bitis >= CURRENT_DATE)))))
     LEFT JOIN cfo_yolda_sku y ON ((y.sku = t.sku)));

CREATE OR REPLACE VIEW public.cfo_ithalat_oneri_ozet AS
 WITH kural AS (
         SELECT COALESCE(max(cfo_settings."importMinOrderUsd"), (10000)::numeric) AS min_usd,
            COALESCE(max(cfo_settings."importMinLineQty"), 5) AS min_adet,
            COALESCE(( SELECT k_1.usd_try
           FROM cfo_kur k_1
          WHERE (k_1.usd_try > (0)::numeric)
          ORDER BY k_1.ay DESC
         LIMIT 1), ( SELECT s_1."usdTryRate"
           FROM cfo_settings s_1
          WHERE (s_1."usdTryRate" > (0)::numeric)
         LIMIT 1), ( SELECT m_1."usdTryRate"
           FROM "MonthlyExchangeRate" m_1
          WHERE (m_1."usdTryRate" > (0)::numeric)
          ORDER BY m_1.year DESC, m_1.month DESC
         LIMIT 1)) AS kur,
            COALESCE(max(cfo_settings."monthlyRevenueTargetUsd"), (100000)::numeric) AS hedef_ciro_usd
           FROM cfo_settings
        ), toplam AS (
         SELECT cfo_ithalat_oneri.mod,
            (count(*))::integer AS satir,
            (sum(cfo_ithalat_oneri.onerilen_adet))::integer AS toplam_adet,
            round(sum(cfo_ithalat_oneri.tutar_usd), 2) AS toplam_usd,
            (count(*) FILTER (WHERE cfo_ithalat_oneri.maliyet_eksik))::integer AS maliyet_eksik_satir,
            (count(*) FILTER (WHERE cfo_ithalat_oneri.gecikti))::integer AS gecikmis_satir,
            (count(*) FILTER (WHERE cfo_ithalat_oneri.kopru))::integer AS kopru_satir,
            round(sum(cfo_ithalat_oneri.aylik_ciro_usd), 0) AS aylik_ciro_usd,
            round(sum(cfo_ithalat_oneri.aylik_risk_kar_try), 0) AS aylik_risk_kar_try,
            min(cfo_ithalat_oneri.son_siparis_tarihi) AS en_erken_son_siparis,
            min(cfo_ithalat_oneri.tukenis_tarihi) AS en_erken_tukenis,
            max(cfo_ithalat_oneri.termin_gun) AS termin_gun
           FROM cfo_ithalat_oneri
          WHERE ((NOT cfo_ithalat_oneri.haric) AND (NOT cfo_ithalat_oneri.yolda_yeterli))
          GROUP BY cfo_ithalat_oneri.mod
        ), disarida AS (
         SELECT cfo_ithalat_oneri.mod,
            (count(*) FILTER (WHERE cfo_ithalat_oneri.haric))::integer AS haric_satir,
            (count(*) FILTER (WHERE cfo_ithalat_oneri.yolda_yeterli))::integer AS yolda_satir
           FROM cfo_ithalat_oneri
          GROUP BY cfo_ithalat_oneri.mod
        ), bugun AS (
         SELECT COALESCE(( SELECT cfo_nakit_kapisi.nakit_try
                   FROM cfo_nakit_kapisi), (0)::numeric) AS nakit_try
        ), kapi AS (
         SELECT t_1.mod,
            ( SELECT min(g.tarih) AS min
                   FROM cfo_odeme_gunluk g
                  WHERE ((g.tarih >= CURRENT_DATE) AND (g.gun_sonu_nakit >= (t_1.toplam_usd * k_1.kur)))) AS nakit_kapisi_tarihi,
            ( SELECT max(g.tarih) AS max
                   FROM cfo_odeme_gunluk g) AS projeksiyon_sonu,
            ( SELECT max(g.gun_sonu_nakit) AS max
                   FROM cfo_odeme_gunluk g
                  WHERE (g.tarih >= CURRENT_DATE)) AS projeksiyon_en_yuksek_nakit
           FROM (toplam t_1
             CROSS JOIN kural k_1)
        )
 SELECT t.mod,
    t.satir,
    t.toplam_adet,
    t.toplam_usd,
    round((t.toplam_usd * k.kur), 2) AS toplam_try,
    t.maliyet_eksik_satir,
    t.gecikmis_satir,
    t.kopru_satir,
    COALESCE(d.haric_satir, 0) AS haric_satir,
    COALESCE(d.yolda_satir, 0) AS yolda_satir,
    t.termin_gun,
    t.en_erken_tukenis,
    t.en_erken_son_siparis,
    GREATEST(CURRENT_DATE, t.en_erken_son_siparis) AS ideal_siparis_tarihi,
    k.min_usd AS min_tutar_usd,
    k.min_adet AS min_adet_kural,
    (t.toplam_usd >= k.min_usd) AS esik_karsilandi,
    GREATEST((k.min_usd - t.toplam_usd), (0)::numeric) AS esige_kalan_usd,
    b.nakit_try AS bugunku_nakit_try,
    GREATEST(round(((t.toplam_usd * k.kur) - b.nakit_try), 2), (0)::numeric) AS nakit_acigi_try,
    kp.nakit_kapisi_tarihi,
    kp.projeksiyon_sonu,
    round(kp.projeksiyon_en_yuksek_nakit, 2) AS projeksiyon_en_yuksek_nakit,
        CASE
            WHEN (kp.nakit_kapisi_tarihi IS NULL) THEN NULL::date
            ELSE GREATEST(GREATEST(CURRENT_DATE, t.en_erken_son_siparis), kp.nakit_kapisi_tarihi)
        END AS tavsiye_siparis_tarihi,
        CASE
            WHEN (kp.nakit_kapisi_tarihi IS NULL) THEN NULL::date
            ELSE (GREATEST(GREATEST(CURRENT_DATE, t.en_erken_son_siparis), kp.nakit_kapisi_tarihi) + t.termin_gun)
        END AS tahmini_varis,
        CASE
            WHEN (t.toplam_usd < k.min_usd) THEN 'ESIK_ALTI'::text
            WHEN (kp.nakit_kapisi_tarihi IS NULL) THEN 'KAPI_KAPALI'::text
            WHEN (kp.nakit_kapisi_tarihi > CURRENT_DATE) THEN 'NAKIT_BEKLIYOR'::text
            WHEN (t.en_erken_son_siparis < CURRENT_DATE) THEN 'GECIKMIS'::text
            ELSE 'HAZIR'::text
        END AS durum,
    t.aylik_ciro_usd,
    t.aylik_risk_kar_try,
    k.hedef_ciro_usd
   FROM ((((toplam t
     CROSS JOIN kural k)
     CROSS JOIN bugun b)
     JOIN kapi kp ON ((kp.mod = t.mod)))
     LEFT JOIN disarida d ON ((d.mod = t.mod)));

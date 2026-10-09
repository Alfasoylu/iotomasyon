-- CFO METRİK MUTABAKATI (salt-okunur; CFO-001 PR-A, 2026-10-08). Bugün sistemde yaşayan net sermaye / borç / kur / ciro / nakit
-- tanımlarını TEK satırda yan yana ölçer — tek tanım (metrik sözleşmesi, docs/CFO-METRIC-CONTRACT.md) gelene kadar farkların TL
-- karşılığını görünür tutar. Yan etkisi yoktur (yalnız SELECT); Cowork ve CI aynı dosyayı çalıştırır.
-- Not: "KDV hariç NRV" yaklaşıktır: birim_net_deger − birim_fiyat/6 (satış fiyatındaki %20 çıktı KDV'si, banka net oranından düşülür).
WITH k AS (
  SELECT
    COALESCE(SUM(tutar) FILTER (WHERE sira = 1), 0) AS nakit,
    COALESCE(SUM(tutar) FILTER (WHERE sira = 2), 0) AS alacak,
    COALESCE(SUM(tutar) FILTER (WHERE sira IN (3, 4)), 0) AS stok_servet,
    COALESCE(SUM(tutar) FILTER (WHERE sira = 5), 0) AS yolda_odenmis,
    COALESCE(SUM(tutar) FILTER (WHERE sira = 6), 0) AS yolda_odenmemis_varlik,
    COALESCE(-SUM(tutar) FILTER (WHERE sira = 7), 0) AS kredi_servet,
    COALESCE(-SUM(tutar) FILTER (WHERE sira = 8), 0) AS kart_servet,
    COALESCE(-SUM(tutar) FILTER (WHERE sira = 9), 0) AS yolda_odenmemis_borc
  FROM public.cfo_servet_kalem
), stok AS (
  SELECT
    COALESCE(SUM(maliyet_degeri), 0) AS maliyet,
    COALESCE(SUM(net_deger), 0) AS nrv_kdv_dahil,
    COALESCE(SUM(CASE WHEN deger_kaynagi = 'GERCEKLESEN_SATIS' THEN stok * (birim_net_deger - birim_fiyat / 6.0) ELSE net_deger END), 0) AS nrv_kdv_haric,
    COALESCE(SUM(CASE WHEN deger_kaynagi = 'GERCEKLESEN_SATIS' THEN LEAST(maliyet_degeri, stok * (birim_net_deger - birim_fiyat / 6.0))
                      WHEN deger_kaynagi = 'MALIYET' THEN maliyet_degeri END), 0) AS lcnrv,
    -- sözleşme (CFO-001 PR-D): satan ama birim maliyeti olmayan SKU LCNRV'ye girmez (maliyetsiz hesaplanamaz → BILINMIYOR)
    COALESCE(SUM(CASE WHEN deger_kaynagi = 'GERCEKLESEN_SATIS' AND birim_maliyet IS NOT NULL THEN LEAST(maliyet_degeri, stok * (birim_net_deger - birim_fiyat / 6.0))
                      WHEN deger_kaynagi = 'MALIYET' THEN maliyet_degeri END), 0) AS lcnrv_sozlesme,
    COUNT(*) FILTER (WHERE deger_kaynagi = 'GERCEKLESEN_SATIS' AND stok * (birim_net_deger - birim_fiyat / 6.0) < maliyet_degeri) AS sku_nrv_maliyet_alti,
    COUNT(*) FILTER (WHERE deger_kaynagi = 'DEGERSIZ') AS sku_degersiz
  FROM public.cfo_stok_deger WHERE gercek_stok
), borc AS (
  SELECT
    (SELECT COALESCE(SUM("remainingTry"), 0) FROM public.cfo_loan WHERE status::text = 'AKTIF') AS kredi_kalan,
    (SELECT COALESCE(SUM(COALESCE("earlyPayoffTry", "remainingTry")), 0) FROM public.cfo_loan WHERE status::text = 'AKTIF') AS kredi_erken_kapama,
    (SELECT COUNT(*) FROM public.cfo_loan WHERE status::text = 'AKTIF' AND "remainingOverride" IS NOT NULL) AS kredi_override_sayisi,
    (SELECT COALESCE(SUM("totalDebtTry"), 0) FROM public.cfo_credit_card WHERE "isActive") AS kart_toplam,
    (SELECT COALESCE(SUM(GREATEST(-"balanceTry", 0)), 0) FROM public.cfo_bank_account WHERE "isActive" AND "accountType" !~* 'ŞAHSİ|SAHSI') AS kmh_kullanilan_sirket,
    (SELECT COALESCE(SUM(GREATEST(-"balanceTry", 0)), 0) FROM public.cfo_bank_account WHERE "isActive" AND "accountType" ~* 'ŞAHSİ|SAHSI') AS kmh_kullanilan_sahsi,
    (SELECT COALESCE(SUM(GREATEST(-"balanceTry", 0)), 0) FROM public.cfo_bank_account WHERE "isActive") AS kmh_kullanilan_tum,
    (SELECT COALESCE(SUM(GREATEST("balanceTry", 0)), 0) FROM public.cfo_bank_account WHERE "isActive") AS nakit_pozitif
), nakit AS (
  SELECT
    (SELECT COALESCE(SUM("balanceTry"), 0) FROM public.cfo_bank_account WHERE "isActive" AND "balanceTry" IS NOT NULL) AS tum_hesaplar,
    (SELECT nakit_try FROM public.cfo_nakit_kapisi) AS sirket_kapisi
), kur AS (
  SELECT
    (SELECT usd_try_forex_buying FROM public.fm_memory_fx_monthly WHERE usd_try_forex_buying IS NOT NULL ORDER BY month DESC LIMIT 1) AS tcmb_aylik,
    (SELECT month FROM public.fm_memory_fx_monthly WHERE usd_try_forex_buying IS NOT NULL ORDER BY month DESC LIMIT 1) AS tcmb_ay,
    (SELECT usd_try FROM public.cfo_kur ORDER BY ay DESC LIMIT 1) AS cfo_kur,
    (SELECT "usdTryRate" FROM public.cfo_settings LIMIT 1) AS ayar,
    (SELECT kur FROM public.cfo_servet) AS servet_snapshot
), hedef AS (
  SELECT
    (SELECT observed_value_try FROM public.fm_goal_observation WHERE goal_key = 'wealth_usd' ORDER BY evaluated_at DESC LIMIT 1) AS goal_net_sermaye,
    (SELECT observed_value_try FROM public.fm_goal_observation WHERE goal_key LIKE 'debt%' ORDER BY evaluated_at DESC LIMIT 1) AS goal_borc,
    (SELECT inputs->>'revenue_mtd_try' FROM public.fm_goal_observation WHERE goal_key = 'revenue_month_usd' ORDER BY evaluated_at DESC LIMIT 1)::numeric AS goal_ciro_mtd
), ciro AS (
  SELECT
    (SELECT COALESCE(SUM(revenue_incl_vat_try), 0) FROM public.fm_memory_sales_company_day WHERE economic_date >= date_trunc('month', current_date)) AS fm_mtd_kdv_dahil,
    (SELECT SUM(revenue_ex_vat_try) FROM public.fm_memory_sales_company_day WHERE economic_date >= date_trunc('month', current_date)) AS fm_mtd_kdv_haric,  -- NULL = ölçülmüyor (grade U)
    (SELECT COALESCE(SUM(siparis_tutari), 0) FROM public.cfo_satis_siparis WHERE siparis_tarihi >= date_trunc('month', current_date)) AS satis_siparis_mtd
)
SELECT
  -- NET SERMAYE varyantları (TL)
  round(k.nakit + k.alacak + k.stok_servet - k.kredi_servet - k.kart_servet, 2) AS net_dar_bugunku,
  round(k.nakit + k.alacak + k.stok_servet + k.yolda_odenmis - k.kredi_servet - k.kart_servet, 2) AS net_genis_bugunku,
  round(k.nakit + k.alacak + s.maliyet + k.yolda_odenmis - k.kredi_servet - k.kart_servet, 2) AS net_genis_stok_maliyet,
  round(k.nakit + k.alacak + s.nrv_kdv_haric + k.yolda_odenmis - k.kredi_servet - k.kart_servet, 2) AS net_genis_stok_nrv_kdv_haric,
  round(k.nakit + k.alacak + s.lcnrv + k.yolda_odenmis - k.kredi_servet - k.kart_servet - b.kmh_kullanilan_sirket, 2) AS net_genis_lcnrv_kmh_dahil,
  -- SÖZLEŞME (CFO-001 PR-D; D-P01 GENİŞ, D-P02 LCNRV, D-P03 kredi + kart + KMH): cfo_metrik_net_sermaye() sira 100 ile eşit olmalı
  -- (bağımsız ikinci uygulama; __tests__/cfo-net-sermaye.test.ts eşitliği denetler). Nakit = artı bakiyeler, KMH = eksi bakiyeler.
  round(b.nakit_pozitif + k.alacak + s.lcnrv_sozlesme + k.yolda_odenmis - b.kredi_kalan - b.kart_toplam - b.kmh_kullanilan_tum, 2) AS net_sozlesme,
  h.goal_net_sermaye,
  -- STOK (rafta)
  round(s.maliyet, 2) AS stok_maliyet, round(s.nrv_kdv_dahil, 2) AS stok_nrv_kdv_dahil, round(s.nrv_kdv_haric, 2) AS stok_nrv_kdv_haric,
  round(s.lcnrv, 2) AS stok_lcnrv, s.sku_nrv_maliyet_alti, s.sku_degersiz, round(k.yolda_odenmis, 2) AS yolda_odenmis,
  -- BORÇ varyantları (TL)
  round(k.kredi_servet + k.kart_servet + k.yolda_odenmemis_borc, 2) AS borc_servet_bugunku,
  round(b.kredi_kalan + b.kart_toplam + b.kmh_kullanilan_sirket, 2) AS borc_finansal_sirket,
  round(b.kredi_erken_kapama + b.kart_toplam + b.kmh_kullanilan_sirket + b.kmh_kullanilan_sahsi, 2) AS borc_erken_kapama_tum,
  round(k.yolda_odenmemis_borc, 2) AS yolda_odenmemis_vergi_navlun, b.kredi_override_sayisi, h.goal_borc,
  round(k.kredi_servet - b.kredi_kalan, 2) AS kredi_servet_fark,   -- 0 değilse remainingOverride hatası (RF-20261008-005) etkin
  -- NAKİT
  round(n.tum_hesaplar, 2) AS nakit_tum_hesaplar, round(n.sirket_kapisi, 2) AS nakit_sirket, round(k.nakit, 2) AS nakit_servet,
  -- KUR
  kr.tcmb_aylik, kr.tcmb_ay, kr.cfo_kur, kr.ayar AS kur_ayar, kr.servet_snapshot AS kur_servet,
  -- CİRO (bu ay, TL)
  round(c.fm_mtd_kdv_dahil, 2) AS ciro_mtd_kdv_dahil, round(c.fm_mtd_kdv_haric, 2) AS ciro_mtd_kdv_haric,
  (SELECT max(economic_date) FROM public.fm_memory_sales_company_day) AS ciro_son_gun,
  round(c.satis_siparis_mtd, 2) AS ciro_mtd_satis_siparis, h.goal_ciro_mtd
FROM k, stok s, borc b, nakit n, kur kr, hedef h, ciro c;

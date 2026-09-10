-- =============================================================================
-- CFO — Servet (net varlik) katmani
-- =============================================================================
-- Bu migration YENI bir sey yaratmiyor: asagidaki tablo ve view'lar 10.09.2026
-- tarihinde CFO ajani tarafindan dogrudan canli veritabaninda olusturuldu.
-- Burada repoya alinmalarinin tek sebebi sema tanimlarinin surum kontrolunde
-- yasamasi; boylece canli DB ile repo arasindaki fark kapaniyor ve yeni bir
-- ortam sifirdan kurulabiliyor.
--
-- NEDEN GEREKTI:
-- Servet hesabi eskiden cfo_settings icindeki iki ELLE GIRILMIS USD sabitine
-- dayaniyordu: stockCostUsd ve blockedStockUsd. Bu sabitler kimse elle
-- guncellemedigi surece degismedigi icin cfo_snapshot.stockTry on bir gun
-- boyunca tam olarak 13.130.432,65 TL'de cakili kaldi — yani stok degeri
-- gercekte ne satildigindan, ne fiyattan, ne de kur hareketinden etkilenmedi.
--
-- YENI YAKLASIM:
-- Stok artik net gerceklesebilir deger (net realisable value) ile
-- degerleniyor: son 90 gunde GERCEKTEN GERCEKLESEN satis fiyatlari
-- uzerinden, kanal net orani ve bant tarifeli kargo dusulerek SKU basina
-- hesaplaniyor. Satis kaniti olmayan SKU'lar birim maliyetle, hic degeri
-- olmayanlar sifirla tasiniyor. Sabit USD rakami kullanilmiyor.
--
-- BAGIMLILIK NOTU:
-- Gercek bagimlilik zinciri sudur:
--   cfo_stok_deger  ->  cfo_servet_kalem  ->  cfo_servet
--   cfo_stok_deger  ->  cfo_servet_likidite
-- Yani cfo_servet, cfo_servet_kalem'i okur (tersi degil). Drop sirasi bu
-- zincirin tersi, create sirasi ise zincirin kendisidir.
--
-- View govdeleri pg_get_viewdef() ciktisindan HIC DEGISTIRILMEDEN alinmistir;
-- bicimlendirme, sayi veya ifade degisikligi yapilmamistir.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Tablo: cfo_yoldaki_mal (yoldaki / gumrukteki mal kalemleri)
-- -----------------------------------------------------------------------------
create table if not exists cfo_yoldaki_mal (
    kod                   text        not null,
    aciklama              text        not null,
    durum                 text        not null,
    odenmis_try           numeric     not null default 0,
    odenmemis_vergi_try   numeric     not null default 0,
    odenmemis_navlun_try  numeric     not null default 0,
    vergi_tarihi          date,
    risk                  text        not null default 'NORMAL'::text,
    guven                 text        not null default 'ORTA'::text,
    kaynak                text,
    note                  text,
    updated_at            timestamptz not null default now(),
    constraint cfo_yoldaki_mal_pkey primary key (kod)
);

-- -----------------------------------------------------------------------------
-- View'lari guvenli bagimlilik sirasinda dusur (once bagimli olanlar)
-- -----------------------------------------------------------------------------
drop view if exists cfo_servet;
drop view if exists cfo_servet_likidite;
drop view if exists cfo_servet_kalem;
drop view if exists cfo_stok_deger;

-- -----------------------------------------------------------------------------
-- 1) cfo_stok_deger — SKU bazinda net gerceklesebilir deger
-- -----------------------------------------------------------------------------
create view cfo_stok_deger as
 WITH satis AS (
         SELECT COALESCE(d."productId", pm.id) AS pid,
            sum(d.adet_duz) AS adet,
            sum(d.tutar_duz) AS tutar,
            sum(d.tutar_duz * (COALESCE(n.net_oran, 0.65) + COALESCE(n.kargo_payi, 0.121))::double precision) AS kargosuz_net,
            sum(d.tutar_duz * COALESCE(n.kargo_payi, 0.121)::double precision) / NULLIF(sum(d.tutar_duz), 0::double precision) AS kargo_payi
           FROM cfo_satis_birim_duz d
             LEFT JOIN "Product" pm ON pm.sku = d."productCode"
             LEFT JOIN cfo_kanal_net_oran n ON n.channel = d.channel
          WHERE d."orderDate" >= (CURRENT_DATE - 90) AND d.adet_duz > 0
          GROUP BY (COALESCE(d."productId", pm.id))
        ), t AS (
         SELECT p.id,
            p.sku,
            p.name,
            p.category,
            p."stockQuantity" AS stok,
            p."unitCostTry" AS birim_maliyet,
            p."stockQuantity" <> ALL (ARRAY[500, 998, 999, 1000, 9999, 10000]) AS gercek_stok,
            (s.tutar / NULLIF(s.adet, 0)::double precision)::numeric AS birim_fiyat,
            (s.kargosuz_net / NULLIF(s.adet, 0)::double precision)::numeric AS birim_brut_net,
            s.kargo_payi::numeric AS kargo_payi,
            s.adet::numeric / 90.0 AS gunluk_hiz
           FROM "Product" p
             LEFT JOIN satis s ON s.pid = p.id
          WHERE p."isActive" AND p."stockQuantity" > 0
        ), k AS (
         SELECT t.id,
            t.sku,
            t.name,
            t.category,
            t.stok,
            t.birim_maliyet,
            t.gercek_stok,
            t.birim_fiyat,
            t.birim_brut_net,
            t.kargo_payi,
            t.gunluk_hiz,
                CASE
                    WHEN t.birim_fiyat IS NULL THEN NULL::numeric
                    WHEN COALESCE(t.kargo_payi, 0.121) = 0::numeric THEN 0::numeric
                    WHEN t.birim_fiyat < 200::numeric THEN 53.61
                    WHEN t.birim_fiyat < 350::numeric THEN 91.89
                    WHEN t.birim_fiyat < 750::numeric THEN 106.25
                    WHEN t.birim_fiyat < 1500::numeric THEN 113.41
                    ELSE 154.91
                END AS birim_kargo
           FROM t
        )
 SELECT id,
    sku,
    name,
    category,
    stok,
    birim_maliyet,
    gercek_stok,
    birim_fiyat,
    birim_brut_net,
    kargo_payi,
    gunluk_hiz,
    birim_kargo,
        CASE
            WHEN birim_fiyat IS NOT NULL THEN 'GERCEKLESEN_SATIS'::text
            WHEN birim_maliyet IS NOT NULL THEN 'MALIYET'::text
            ELSE 'DEGERSIZ'::text
        END AS deger_kaynagi,
    round(COALESCE(birim_brut_net - birim_kargo, birim_maliyet, 0::numeric), 2) AS birim_net_deger,
    round(stok::numeric * COALESCE(birim_brut_net - birim_kargo, birim_maliyet, 0::numeric), 2) AS net_deger,
    round(stok::numeric * COALESCE(birim_maliyet, 0::numeric), 2) AS maliyet_degeri,
        CASE
            WHEN gunluk_hiz > 0::numeric THEN round(stok::numeric / gunluk_hiz, 0)
            ELSE NULL::numeric
        END AS ortu_gun
   FROM k;

-- -----------------------------------------------------------------------------
-- 2) cfo_servet_kalem — servet bilancosunun tek tek kalemleri
-- -----------------------------------------------------------------------------
create view cfo_servet_kalem as
 SELECT 1 AS sira,
    'VARLIK'::text AS tur,
    'Nakit'::text AS kalem,
    ( SELECT round(COALESCE(sum(cfo_bank_account."balanceTry"), 0::numeric), 2) AS round
           FROM cfo_bank_account
          WHERE cfo_bank_account."isActive") AS tutar,
    'Banka bakiyeleri (cfo_bank_account)'::text AS kaynak,
    'YUKSEK'::text AS guven
UNION ALL
 SELECT 2 AS sira,
    'VARLIK'::text AS tur,
    'Alacaklar (pazaryeri hakedis)'::text AS kalem,
    ( SELECT round(COALESCE(sum(cfo_receivable."amountTry"), 0::numeric), 2) AS round
           FROM cfo_receivable
          WHERE NOT cfo_receivable."isCollected") AS tutar,
    'cfo_receivable, tahsil edilmemis'::text AS kaynak,
    'YUKSEK'::text AS guven
UNION ALL
 SELECT 3 AS sira,
    'VARLIK'::text AS tur,
    'Stok — net gerceklesebilir deger'::text AS kalem,
    ( SELECT round(COALESCE(sum(cfo_stok_deger.net_deger), 0::numeric), 2) AS round
           FROM cfo_stok_deger
          WHERE cfo_stok_deger.gercek_stok AND cfo_stok_deger.deger_kaynagi = 'GERCEKLESEN_SATIS'::text) AS tutar,
    '110 SKU: 90 gunluk gerceklesen satis fiyati x kanal net orani − kargo (bant tarifesi)'::text AS kaynak,
    'ORTA'::text AS guven
UNION ALL
 SELECT 4 AS sira,
    'VARLIK'::text AS tur,
    'Stok — satis kaniti yok, maliyetle'::text AS kalem,
    ( SELECT round(COALESCE(sum(cfo_stok_deger.net_deger), 0::numeric), 2) AS round
           FROM cfo_stok_deger
          WHERE cfo_stok_deger.gercek_stok AND cfo_stok_deger.deger_kaynagi = 'MALIYET'::text) AS tutar,
    '7 SKU: 90 gunde satis yok, birim maliyetle deger verildi'::text AS kaynak,
    'DUSUK'::text AS guven
UNION ALL
 SELECT 5 AS sira,
    'VARLIK'::text AS tur,
    'Yoldaki mal — odenmis kisim'::text AS kalem,
    ( SELECT round(COALESCE(sum(cfo_yoldaki_mal.odenmis_try), 0::numeric), 2) AS round
           FROM cfo_yoldaki_mal
          WHERE cfo_yoldaki_mal.risk = 'NORMAL'::text) AS tutar,
    'cfo_yoldaki_mal: 07.26sea + ROMANYA-2408'::text AS kaynak,
    'YUKSEK'::text AS guven
UNION ALL
 SELECT 6 AS sira,
    'VARLIK'::text AS tur,
    'Yoldaki mal — odenmemis vergi/navlun (varlik tarafi)'::text AS kalem,
    ( SELECT round(COALESCE(sum(cfo_yoldaki_mal.odenmemis_vergi_try + cfo_yoldaki_mal.odenmemis_navlun_try), 0::numeric), 2) AS round
           FROM cfo_yoldaki_mal
          WHERE cfo_yoldaki_mal.risk = 'NORMAL'::text) AS tutar,
    'Mal bu tutar odenince rafa iner; karsiligi asagida borc olarak dusulur'::text AS kaynak,
    'ORTA'::text AS guven
UNION ALL
 SELECT 7 AS sira,
    'BORC'::text AS tur,
    'Krediler'::text AS kalem,
    - (( SELECT round(COALESCE(sum(COALESCE(cfo_loan."remainingOverride"::numeric, cfo_loan."remainingTry")), 0::numeric), 2) AS round
           FROM cfo_loan
          WHERE cfo_loan.status::text = 'AKTIF'::text)) AS tutar,
    'cfo_loan AKTIF kalan anapara'::text AS kaynak,
    'YUKSEK'::text AS guven
UNION ALL
 SELECT 8 AS sira,
    'BORC'::text AS tur,
    'Kredi kartlari (toplam borc)'::text AS kalem,
    - (( SELECT round(COALESCE(sum(cfo_credit_card."totalDebtTry"), 0::numeric), 2) AS round
           FROM cfo_credit_card
          WHERE cfo_credit_card."isActive")) AS tutar,
    'cfo_credit_card totalDebtTry — ekstre + donem ici'::text AS kaynak,
    'YUKSEK'::text AS guven
UNION ALL
 SELECT 9 AS sira,
    'BORC'::text AS tur,
    'Yoldaki mal — odenmemis gumruk/navlun'::text AS kalem,
    - (( SELECT round(COALESCE(sum(cfo_yoldaki_mal.odenmemis_vergi_try + cfo_yoldaki_mal.odenmemis_navlun_try), 0::numeric), 2) AS round
           FROM cfo_yoldaki_mal
          WHERE cfo_yoldaki_mal.risk = 'NORMAL'::text)) AS tutar,
    '07.26sea gumruk 3.000.000 (15.10, +-%5) + navlun 339.500 · ROMANYA-2408 vergi 500.000'::text AS kaynak,
    'ORTA'::text AS guven
UNION ALL
 SELECT 10 AS sira,
    'RISKLI'::text AS tur,
    'Romanya 1. parti (adli surec) — mansete dahil degil'::text AS kalem,
    ( SELECT round(COALESCE(sum(cfo_yoldaki_mal.odenmis_try), 0::numeric), 2) AS round
           FROM cfo_yoldaki_mal
          WHERE cfo_yoldaki_mal.risk = 'RISKLI'::text) AS tutar,
    'Hukuki mulkiyet Eczacinda, 5607 musadere riski, ardiye isliyor'::text AS kaynak,
    'DUSUK'::text AS guven;

-- -----------------------------------------------------------------------------
-- 3) cfo_servet_likidite — stok degerinin nakde donme hizi dilimleri
-- -----------------------------------------------------------------------------
create view cfo_servet_likidite as
 WITH s AS (
         SELECT
                CASE
                    WHEN cfo_stok_deger.ortu_gun IS NULL THEN '4_SATMIYOR'::text
                    WHEN cfo_stok_deger.ortu_gun <= 90::numeric THEN '1_0-3AY'::text
                    WHEN cfo_stok_deger.ortu_gun <= 365::numeric THEN '2_3-12AY'::text
                    ELSE '3_12AY+'::text
                END AS dilim,
            cfo_stok_deger.net_deger,
            cfo_stok_deger.stok,
            cfo_stok_deger.ortu_gun,
                CASE
                    WHEN cfo_stok_deger.ortu_gun IS NULL OR cfo_stok_deger.ortu_gun <= 0::numeric THEN 0::numeric
                    ELSE LEAST(1.0, 365.0 / cfo_stok_deger.ortu_gun)
                END AS yil_ici_pay
           FROM cfo_stok_deger
          WHERE cfo_stok_deger.gercek_stok
        )
 SELECT dilim,
    count(*) AS urun,
    sum(stok) AS adet,
    round(sum(net_deger)) AS net_deger,
    round(sum(net_deger * yil_ici_pay)) AS bir_yilda_nakde_donen
   FROM s
  GROUP BY dilim
  ORDER BY dilim;

-- -----------------------------------------------------------------------------
-- 4) cfo_servet — tek satirlik ozet (varlik / borc / net servet)
-- -----------------------------------------------------------------------------
create view cfo_servet as
 SELECT round(sum(tutar) FILTER (WHERE tur = 'VARLIK'::text), 2) AS varlik,
    round(- sum(tutar) FILTER (WHERE tur = 'BORC'::text), 2) AS borc,
    round(sum(tutar) FILTER (WHERE tur = ANY (ARRAY['VARLIK'::text, 'BORC'::text])), 2) AS servet_try,
    round(sum(tutar) FILTER (WHERE tur = 'RISKLI'::text), 2) AS riskli_haric_tutulan,
    round(sum(tutar) FILTER (WHERE tur <> 'RISKLI'::text) + sum(tutar) FILTER (WHERE tur = 'RISKLI'::text), 2) AS servet_riskli_dahil,
    ( SELECT cfo_snapshot."usdTryRate"
           FROM cfo_snapshot
          ORDER BY cfo_snapshot."takenAt" DESC
         LIMIT 1) AS kur,
    round(sum(tutar) FILTER (WHERE tur = ANY (ARRAY['VARLIK'::text, 'BORC'::text])) / (( SELECT cfo_snapshot."usdTryRate"
           FROM cfo_snapshot
          ORDER BY cfo_snapshot."takenAt" DESC
         LIMIT 1)), 2) AS servet_usd
   FROM cfo_servet_kalem;

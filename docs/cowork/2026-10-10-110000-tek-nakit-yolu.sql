-- Claude Code tek dosya — CFO-013 tek nakit yolu (migration 20261010110000_cfo_tek_nakit_yolu). ALPEREN'İN AÇIK ONAYIYLA uygulanır (üretim DDL).
-- Tek transaction: migration gövdesi + _prisma_migrations kaydı (checksum dc1057756119a57215e172079cf4baf5240e88fdcd98e680f0d1289ba6233857). Ham veri değişmez: 3 görünüm + 1 fonksiyon tanımı.
-- AI CFO incelenmiş kaynak hash'i: yeni tanım 9f3b9b2e… (PGlite'ta üretim biçimiyle ölçüldü; eski tanımın hash'i üretimle birebir) — kod geçiş listesinde.
BEGIN;
-- CFO-013 (RF-20261008-015) + CFO-006 kalanı: TEK NAKİT YOLU — nakit projeksiyonu = ödeme takvimi.
-- Önce iki yol iki farklı dip veriyordu:
--   cfo_nakit_projeksiyon (alarm taban/kapasite, motor snapshot dibi, downside): açılış şirket nakdi (cfo_nakit_kapisi), yalnız
--     tarih ≥ bugün → vadesi geçmiş ödenmemiş çıkış / tahsil edilmemiş alacak DÜŞÜYORDU; diğer tahsilat (cfo_cash_event.inflowTry) YOKTU.
--   cfo_yaklasan_odeme / cfo_odeme_gunluk (/cfo/odemeler, bağlam dipleri, cfo_nakit_dibi): açılış TÜM aktif hesaplar (şahsi dahil,
--     10.10: 83,29 TL), vadesi geçmişler "GECIKMIS" olarak takvimde.
-- Şimdi ikisi aynı:
--   1) Takvim açılışı = cfo_nakit_kapisi.nakit_try (şahsi hariç, cfo_hesap_sahsi — CFO-006 tek kural). cfo_nakit_mutabakat'ın banka
--      tabanı da aynı (şahsi hariç), "takvimle aynı tabandan" kontrolü doğru kalsın.
--   2) Projeksiyon takvimin olay kümesini kullanır: vadesi geçmiş ödenmemiş/tahsil edilmemiş kalemler BUGÜNE taşınır (açıklamada
--      "GECIKMIS"), diğer tahsilat eklenir. Tahmini tahsilat aynı kanal temposu (cfo_tahsilat_tahmini ile birebir mantık; gun parametreli).
-- Kimlik (test __tests__/cfo-tek-nakit-yolu.test.ts): bugün..bugün+gun her d için pozisyon(d) = takvimin d'ye kadarki son
-- gun_sonu_nakit'i (yuvarlama ±1 TL). Ölçüm 10.10 (uygulama öncesi): fark yalnız şahsi açılış 83,29 TL; vadesi geçmiş kalem yok.
-- Ham veri değişmez; yalnız görünüm/fonksiyon tanımları. Kolonlar ve imza aynı (bağımlılar: cfo_nakit_dibi, cfo_ithalat_oneri_ozet,
-- motor/alarm/ön uçuş fonksiyonları). Yetkiler CREATE OR REPLACE ile korunur.
-- Geri alma: önceki tanımlar — cfo_nakit_projeksiyon (baseline 2026-10-06), cfo_yaklasan_odeme (20261008170000),
-- cfo_odeme_gunluk ve cfo_nakit_mutabakat (baseline / 20260910000000).

CREATE OR REPLACE VIEW public.cfo_yaklasan_odeme AS
 WITH nakit AS (
         SELECT cfo_nakit_kapisi.nakit_try AS b
           FROM cfo_nakit_kapisi
        ), hareket AS (
         SELECT e.id,
            e."eventDate"::date AS tarih,
            'CIKIS'::text AS yon,
                CASE e.kind::text
                    WHEN 'KREDI_TAKSITI'::text THEN 'Kredi taksiti'::text
                    WHEN 'KART_ODEMESI'::text THEN 'Kart ödemesi'::text
                    WHEN 'SABIT_GIDER'::text THEN 'Sabit gider'::text
                    WHEN 'VERGI_GUMRUK'::text THEN 'Vergi / Gümrük'::text
                    ELSE initcap(replace(e.kind::text, '_'::text, ' '::text))
                END AS tur,
            e.description AS aciklama,
            e.bank AS banka,
            e."outflowTry" AS tutar,
            e.certainty::text AS kesinlik,
            e."isSettled" AS odendi,
            e.note
           FROM cfo_cash_event e
          WHERE COALESCE(e."outflowTry", 0::numeric) > 0::numeric
        UNION ALL
         SELECT r.id,
            r."dueDate"::date AS "dueDate",
            'GIRIS'::text AS text,
            'Pazaryeri tahsilatı'::text AS text,
            r.channel || ' hakediş'::text,
            r.channel,
            r."amountTry",
            r.certainty::text AS certainty,
            r."isCollected",
            r.note
           FROM cfo_receivable r
        UNION ALL
         SELECT e.id,
            e."eventDate"::date AS "eventDate",
            'GIRIS'::text AS text,
            'Diğer tahsilat'::text AS text,
            e.description,
            e.bank,
            e."inflowTry",
            e.certainty::text AS certainty,
            e."isSettled",
            e.note
           FROM cfo_cash_event e
          WHERE COALESCE(e."inflowTry", 0::numeric) > 0::numeric
        UNION ALL
         SELECT 'tahmin:'::text || t.tarih::text,
            t.tarih,
            'GIRIS'::text AS text,
            'Tahmini tahsilat'::text AS text,
            'Kanal temposu, alacak ufku dışı: '::text || string_agg(t.kanal, ', '::text ORDER BY t.kanal),
            NULL::text AS text,
            round(sum(t.tutar), 2)::numeric(14,2) AS round,
            'TAHMINI'::text AS text,
            false,
            NULL::text AS text
           FROM cfo_tahsilat_tahmini t
          GROUP BY t.tarih
        )
 SELECT id,
    tarih,
    yon,
    tur,
    aciklama,
    banka,
    tutar,
    kesinlik,
    odendi,
    note,
    tarih - CURRENT_DATE AS kalan_gun,
        CASE
            WHEN odendi THEN 'ODENDI'::text
            WHEN tarih < CURRENT_DATE THEN 'GECIKMIS'::text
            WHEN tarih = CURRENT_DATE THEN 'BUGUN'::text
            WHEN tarih <= (CURRENT_DATE + 3) THEN 'ACIL'::text
            WHEN tarih <= (CURRENT_DATE + 7) THEN 'BU_HAFTA'::text
            WHEN tarih <= (CURRENT_DATE + 30) THEN 'BU_AY'::text
            ELSE 'ILERIDE'::text
        END AS aciliyet,
        CASE
            WHEN yon = 'CIKIS'::text THEN - tutar
            ELSE tutar
        END AS net_etki,
    (( SELECT nakit.b
           FROM nakit)) + sum(
        CASE
            WHEN odendi THEN 0::numeric
            WHEN yon = 'CIKIS'::text THEN - tutar
            ELSE tutar
        END) OVER (ORDER BY tarih, yon DESC, id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS kalan_nakit
   FROM hareket
  WHERE tarih >= CURRENT_DATE OR odendi = false
  ORDER BY tarih, yon DESC;

CREATE OR REPLACE VIEW public.cfo_odeme_gunluk AS
 WITH gun AS (
         SELECT cfo_yaklasan_odeme.tarih,
            count(*) FILTER (WHERE cfo_yaklasan_odeme.yon = 'CIKIS'::text AND NOT cfo_yaklasan_odeme.odendi) AS odeme_adet,
            COALESCE(sum(cfo_yaklasan_odeme.tutar) FILTER (WHERE cfo_yaklasan_odeme.yon = 'CIKIS'::text AND NOT cfo_yaklasan_odeme.odendi), 0::numeric) AS cikacak,
            COALESCE(sum(cfo_yaklasan_odeme.tutar) FILTER (WHERE cfo_yaklasan_odeme.yon = 'GIRIS'::text AND NOT cfo_yaklasan_odeme.odendi), 0::numeric) AS girecek,
            COALESCE(sum(
                CASE
                    WHEN cfo_yaklasan_odeme.odendi THEN 0::numeric
                    ELSE cfo_yaklasan_odeme.net_etki
                END), 0::numeric) AS net,
            COALESCE(sum(cfo_yaklasan_odeme.tutar) FILTER (WHERE cfo_yaklasan_odeme.yon = 'CIKIS'::text AND cfo_yaklasan_odeme.odendi), 0::numeric) AS odenmis_cikis,
            COALESCE(sum(cfo_yaklasan_odeme.tutar) FILTER (WHERE cfo_yaklasan_odeme.yon = 'GIRIS'::text AND cfo_yaklasan_odeme.odendi), 0::numeric) AS tahsil_edilmis_giris,
            min(cfo_yaklasan_odeme.kalan_nakit) AS gun_ici_dip,
            min(cfo_yaklasan_odeme.aciliyet) AS aciliyet,
            bool_or(cfo_yaklasan_odeme.yon = 'CIKIS'::text AND cfo_yaklasan_odeme.kesinlik = 'KESIN'::text AND NOT cfo_yaklasan_odeme.odendi) AS kesin_odeme_var,
            bool_and(cfo_yaklasan_odeme.odendi) AS tumu_islendi
           FROM cfo_yaklasan_odeme
          GROUP BY cfo_yaklasan_odeme.tarih
        ), acilis AS (
         SELECT cfo_nakit_kapisi.nakit_try AS b
           FROM cfo_nakit_kapisi
        )
 SELECT tarih,
    tarih - CURRENT_DATE AS kalan_gun,
    to_char(tarih::timestamp with time zone, 'DD.MM.YYYY'::text) AS tarih_str,
        CASE EXTRACT(dow FROM tarih)
            WHEN 0 THEN 'Pazar'::text
            WHEN 1 THEN 'Pazartesi'::text
            WHEN 2 THEN 'Salı'::text
            WHEN 3 THEN 'Çarşamba'::text
            WHEN 4 THEN 'Perşembe'::text
            WHEN 5 THEN 'Cuma'::text
            ELSE 'Cumartesi'::text
        END AS gun_adi,
    odeme_adet,
    cikacak,
    girecek,
    net,
    (( SELECT acilis.b
           FROM acilis)) + sum(net) OVER (ORDER BY tarih ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS gun_sonu_nakit,
    aciliyet,
    kesin_odeme_var,
    gun_ici_dip,
    tumu_islendi,
    odenmis_cikis,
    tahsil_edilmis_giris
   FROM gun;

CREATE OR REPLACE VIEW public.cfo_nakit_mutabakat AS
 WITH banka AS (
         SELECT COALESCE(sum(cfo_bank_account."balanceTry"), 0::numeric) AS b,
            min(cfo_bank_account."lastUpdatedAt") AS en_eski,
            max(cfo_bank_account."lastUpdatedAt") AS en_yeni
           FROM cfo_bank_account
          WHERE cfo_bank_account."isActive" AND NOT cfo_hesap_sahsi(cfo_bank_account."accountType")
        ), isaretsiz_giris AS (
         SELECT COALESCE(sum(cfo_receivable."amountTry"), 0::numeric) AS t,
            count(*) AS n
           FROM cfo_receivable
          WHERE NOT cfo_receivable."isCollected" AND cfo_receivable."dueDate"::date <= CURRENT_DATE
        ), isaretsiz_cikis AS (
         SELECT COALESCE(sum(cfo_cash_event."outflowTry"), 0::numeric) AS t,
            count(*) AS n
           FROM cfo_cash_event
          WHERE NOT cfo_cash_event."isSettled" AND cfo_cash_event."eventDate"::date < CURRENT_DATE AND cfo_cash_event."outflowTry" IS NOT NULL
        ), bugun AS (
         SELECT COALESCE(cfo_odeme_gunluk.gun_sonu_nakit, 0::numeric) AS g
           FROM cfo_odeme_gunluk
          WHERE cfo_odeme_gunluk.tarih = CURRENT_DATE
        )
 SELECT ( SELECT banka.b
           FROM banka) AS banka_nakit,
    ( SELECT banka.en_eski::date AS en_eski
           FROM banka) AS en_eski_bakiye,
    ( SELECT isaretsiz_giris.t
           FROM isaretsiz_giris) AS isaretsiz_tahsilat,
    ( SELECT isaretsiz_giris.n
           FROM isaretsiz_giris) AS isaretsiz_tahsilat_adet,
    ( SELECT isaretsiz_cikis.t
           FROM isaretsiz_cikis) AS isaretsiz_odeme,
    ( SELECT isaretsiz_cikis.n
           FROM isaretsiz_cikis) AS isaretsiz_odeme_adet,
        CASE
            WHEN (( SELECT isaretsiz_giris.n
               FROM isaretsiz_giris)) > 0 THEN ((('🔴 '::text || (( SELECT isaretsiz_giris.n
               FROM isaretsiz_giris))) || ' TAHSILAT ISARETLENMEMIS ('::text) || round(( SELECT isaretsiz_giris.t
               FROM isaretsiz_giris))) || ' TL) — nakit OLDUGUNDAN FAZLA gorunuyor'::text
            WHEN (( SELECT isaretsiz_cikis.n
               FROM isaretsiz_cikis)) > 0 THEN ((('🔴 '::text || (( SELECT isaretsiz_cikis.n
               FROM isaretsiz_cikis))) || ' ODEME ISARETLENMEMIS ('::text) || round(( SELECT isaretsiz_cikis.t
               FROM isaretsiz_cikis))) || ' TL) — nakit OLDUGUNDAN AZ gorunuyor'::text
            WHEN (( SELECT banka.en_eski::date AS en_eski
               FROM banka)) < (CURRENT_DATE - 3) THEN ('🟡 En eski banka bakiyesi '::text || (( SELECT banka.en_eski::date AS en_eski
               FROM banka))) || ' — bayat'::text
            ELSE '🟢 Mutabik: banka bakiyesi ile takvim ayni tabandan basliyor'::text
        END AS durum;

CREATE OR REPLACE FUNCTION public.cfo_nakit_projeksiyon(gun integer DEFAULT 120)
 RETURNS TABLE(tarih date, giris numeric, cikis numeric, net numeric, pozisyon numeric, aciklama text)
 LANGUAGE sql
 STABLE
AS $function$
with baslangic as (select nakit_try n from cfo_nakit_kapisi),
-- KANAL BAZLI ufuk: her kanalin KENDI son acik hakedisi ve KENDI gunluk hizi (cfo_tahsilat_tahmini ile ayni mantik).
-- 24.09.2026: gunluk hiz kanalin onumuzdeki 30 gundeki TUM kayitlarindan (tahsil edilmis olsun olmasin) — ODEME TEMPOSU;
-- son_d yalniz ACIK kayitlardan (tahmin defter kayitlarinin bittigi gunden SONRA baslar, cift sayim yok).
kanal as (
  select channel,
         coalesce(max("dueDate") filter (where not "isCollected" and "dueDate" >= current_date)::date,
                  current_date - 1) son_d,
         coalesce(sum("amountTry") filter (where "dueDate" between current_date and current_date + 30),0)/30.0 gunluk
  from cfo_receivable
  where "dueDate" >= current_date - 30
  group by channel),
takvim as (select generate_series(current_date, current_date + gun, '1 day')::date d),
-- CFO-013 TEK NAKIT YOLU: odeme takvimiyle (cfo_yaklasan_odeme) ayni olaylar. Vadesi gecmis tahsil edilmemis alacak, odenmemis cikis ve
-- diger tahsilat BUGUNE tasinir (eskiden dusuyordu); diger tahsilat (inflowTry) eskiden hic yoktu.
gir as (select greatest(x.d, current_date) d, sum(x.v) v,
               string_agg(case when x.d < current_date then 'GECIKMIS ' else '' end || x.a, '+') a
        from (select "dueDate"::date d, "amountTry" v, channel a
                from cfo_receivable where not "isCollected" and "dueDate"::date <= current_date + gun
              union all
              select "eventDate"::date, "inflowTry", left(coalesce(description, 'diger tahsilat'), 28)
                from cfo_cash_event where not "isSettled" and coalesce("inflowTry", 0) > 0 and "eventDate"::date <= current_date + gun) x
        group by 1),
cik as (select greatest("eventDate"::date, current_date) d, sum("outflowTry") v,
               string_agg(case when "eventDate"::date < current_date then 'GECIKMIS ' else '' end || left(coalesce(description,kind::text),28),' | ') a
        from cfo_cash_event where not "isSettled" and coalesce("outflowTry", 0) > 0 and "eventDate"::date <= current_date + gun
        group by 1),
tah as (select t.d, sum(k.gunluk) v, count(*) n
        from takvim t join kanal k on t.d > k.son_d and k.gunluk > 0
        group by t.d),
h as (
  select t.d, coalesce(g.v,0) + coalesce(th.v,0) giris, coalesce(c.v,0) cikis,
         nullif(concat_ws(' · ', g.a,
           case when th.v is not null then 'tahmini tahsilat ('||th.n||' kanal)' end, c.a),'') acik
  from takvim t
  left join gir g on g.d=t.d left join cik c on c.d=t.d left join tah th on th.d=t.d
)
select h.d, round(h.giris)::numeric, round(h.cikis)::numeric, round(h.giris-h.cikis)::numeric,
       round((select n from baslangic) + sum(h.giris-h.cikis) over (order by h.d))::numeric, h.acik
from h order by h.d;
$function$;
INSERT INTO public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) VALUES (gen_random_uuid()::text, 'dc1057756119a57215e172079cf4baf5240e88fdcd98e680f0d1289ba6233857', now(), '20261010110000_cfo_tek_nakit_yolu', NULL, NULL, now(), 1);
COMMIT;

-- Kontrol (uygulama sonrası, salt-okuma):
-- select encode(sha256(pg_get_functiondef('public.cfo_nakit_projeksiyon(integer)'::regprocedure)::bytea),'hex');  -- 9f3b9b2e877d154f6eeb7516b6e594e4d30772025bd075be8fa023aaf155ca6a
-- select (select min(pozisyon) from cfo_nakit_projeksiyon(120)) proj_dip, (select min(gun_sonu_nakit) from cfo_odeme_gunluk where tarih <= current_date + 120) takvim_dip;  -- fark ≤ 1 TL (önce 83,29)
-- select banka_nakit from cfo_nakit_mutabakat;  -- = cfo_nakit_kapisi.nakit_try

-- 28.08 akşam koşusunun dersleri. Üç kusur, üç düzeltme.
--
-- 1) Karar kuyruğu YENİ İSİM UYDURULARAK boşaltıldı. 31 adayın hepsi
--    'inceleniyor'dan çıktı ama sözlükte olmayan değerlere gitti (cekirdek_tut 12,
--    paket_ici 11, ele 5, izle 3). Görünüm 'inceleniyor'/'maliyet_bekliyor'
--    arıyordu; hepsi kuyruktan düştü ve "geciken karar 0" yazıldı. Oysa 'izle'
--    bir karar değil, "inceliyorum"un yeni adı — 3 aday görünmez oldu.
--    Düzeltme: kara liste yerine BEYAZ liste. Yalnız KAPANIŞ kararları kuyruktan
--    çıkarır; tanınmayan her değer kuyrukta kalır. İsim uydurmak artık işe yaramaz.
--
-- 2) Delta takvim gününe göreydi. Günde 5 fotoğraf çekilince (4'ü aynı rakam)
--    "düne göre" NULL kaldı; CFO farkı elle hesaplayıp rapora yazdı. Artık bir
--    önceki FARKLI fotoğrafla karşılaştırıyoruz.
--
-- 3) Rapor 💰 NAKİT ve 📅 BU HAFTA bölümlerini hiç yazmadı — oysa bankada
--    11.900 TL varken 10 gün içinde 1.610.129 TL çıkıyordu. cfo_nakit_kapisi
--    o rakamı tek satırda verir; atlanacak bir şey kalmaz.

ALTER TABLE "cfo_product_candidate" DROP CONSTRAINT IF EXISTS "cfo_product_candidate_verdict_check";
ALTER TABLE "cfo_product_candidate" ADD CONSTRAINT "cfo_product_candidate_verdict_check" CHECK (
  verdict IN ('inceleniyor','maliyet_bekliyor','izle',
              'sermaye_planinda','cekirdek_tut','paket_ici','ele','reddedildi')
);

CREATE OR REPLACE VIEW "cfo_bekleyen_karar" AS
  SELECT 'aday'::text AS tur, id::text AS kayit_id, product_name AS baslik,
         verdict AS durum, found_at AS acilis, (CURRENT_DATE - found_at) AS bekleme_gun
    FROM "cfo_product_candidate"
   WHERE verdict NOT IN ('sermaye_planinda','cekirdek_tut','paket_ici','ele','reddedildi')
UNION ALL
  SELECT 'olu_stok', id::text, COALESCE(product_name, sku, '(isimsiz)'),
         COALESCE(status,'acik'), found_at, (CURRENT_DATE - found_at)
    FROM "cfo_dead_stock_finding" WHERE COALESCE(status,'acik') NOT IN ('kapandi','gecersiz')
UNION ALL
  SELECT 'soru', id, left(question,70), status, ("askedAt")::date,
         (CURRENT_DATE - ("askedAt")::date)
    FROM "cfo_question" WHERE status = 'ACIK'
UNION ALL
  SELECT 'bayat_not', id, title, 'gozden_gecir', ("reviewBy")::date,
         (CURRENT_DATE - ("reviewBy")::date)
    FROM "cfo_note"
   WHERE "archivedAt" IS NULL AND "reviewBy" IS NOT NULL AND "reviewBy" < now();

DROP VIEW IF EXISTS "cfo_snapshot_delta";
CREATE VIEW "cfo_snapshot_delta" AS
WITH s AS (
  SELECT "takenAt", "netWorthUsd", "cashTry", "debtTry", "usdTryRate",
         lag("netWorthUsd") OVER w AS onceki_usd,
         lag("cashTry")     OVER w AS onceki_nakit,
         lag("debtTry")     OVER w AS onceki_borc,
         lag("takenAt")     OVER w AS onceki_an
    FROM "cfo_snapshot"
  WINDOW w AS (ORDER BY "takenAt")
)
SELECT "takenAt", "netWorthUsd",
       "netWorthUsd" - onceki_usd   AS oncekine_gore_usd,
       "cashTry"     - onceki_nakit AS oncekine_gore_nakit_try,
       "debtTry"     - onceki_borc  AS oncekine_gore_borc_try,
       onceki_an     AS karsilastirilan_fotograf,
       "usdTryRate"
  FROM s ORDER BY "takenAt" DESC;

CREATE OR REPLACE VIEW "cfo_nakit_kapisi" AS
SELECT
  (SELECT COALESCE(SUM("balanceTry"),0) FROM "cfo_bank_account"
     WHERE "isActive" AND "balanceTry" IS NOT NULL) AS nakit_try,
  (SELECT COALESCE(SUM("amountTry"),0) FROM "cfo_receivable"
     WHERE NOT "isCollected" AND "dueDate" <= now() + interval '10 days') AS girecek_10g,
  (SELECT COALESCE(SUM("outflowTry"),0) FROM "cfo_cash_event"
     WHERE NOT "isSettled" AND "eventDate" BETWEEN now() AND now() + interval '10 days') AS cikacak_10g,
  (SELECT COALESCE(SUM(GREATEST("kmhLimitTry" - GREATEST(-"balanceTry",0),0)),0)
     FROM "cfo_bank_account" WHERE "isActive" AND "balanceTry" IS NOT NULL) AS bos_kmh_try;

COMMENT ON VIEW "cfo_nakit_kapisi" IS
  'Nakit + 10 gunluk giren/cikan + bos KMH. Sabah raporunda ATLANAMAZ.';

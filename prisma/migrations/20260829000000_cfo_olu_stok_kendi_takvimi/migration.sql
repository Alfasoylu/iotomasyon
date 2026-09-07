-- Ölü stok bulgularının KENDİ kontrol takvimi var (next_review_at: KIRMIZI +14,
-- SARI +30 gün) ve artık kendi sayfası da var (/cfo/olu-stok). Bunları ayrıca
-- günlük karar kuyruğuna doldurmak kuyruğu kalıcı olarak doldurdu: 64 bulgu,
-- 12'si 3 günü geçmiş. "Sabah raporunda boş olmak zorunda" denen bir kuyruk asla
-- boşalamıyorsa kural ölür — ajan onu görmezden gelmeyi öğrenir.
--
-- Düzeltme: bulgu kuyruğa yalnız KONTROL VAKTİ GEÇTİĞİNDE girer. Takvimi
-- ilerideyse sayfada durur, kuyruğu kirletmez. Bekleme günü de bulgunun açılış
-- tarihinden değil, kaçırılan kontrol tarihinden sayılır.

CREATE OR REPLACE VIEW "cfo_bekleyen_karar" AS
  SELECT 'aday'::text AS tur, id::text AS kayit_id, product_name AS baslik,
         verdict AS durum, found_at AS acilis, (CURRENT_DATE - found_at) AS bekleme_gun
    FROM "cfo_product_candidate"
   WHERE verdict NOT IN ('sermaye_planinda','cekirdek_tut','paket_ici','ele','reddedildi')
UNION ALL
  SELECT 'olu_stok', id::text, COALESCE(product_name, sku, '(isimsiz)'),
         COALESCE(status,'acik'),
         COALESCE(next_review_at, found_at),
         (CURRENT_DATE - COALESCE(next_review_at, found_at))
    FROM "cfo_dead_stock_finding"
   WHERE COALESCE(status,'acik') NOT IN ('kapandi','gecersiz')
     AND (next_review_at IS NULL OR next_review_at < CURRENT_DATE)
UNION ALL
  SELECT 'soru', id, left(question,70), status, ("askedAt")::date,
         (CURRENT_DATE - ("askedAt")::date)
    FROM "cfo_question" WHERE status = 'ACIK'
UNION ALL
  SELECT 'bayat_not', id, title, 'gozden_gecir', ("reviewBy")::date,
         (CURRENT_DATE - ("reviewBy")::date)
    FROM "cfo_note"
   WHERE "archivedAt" IS NULL AND "reviewBy" IS NOT NULL AND "reviewBy" < now();

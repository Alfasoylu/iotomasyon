-- 2026-10-07 panel taraması: kullanıcı onaylı ("Sil") silme. Yalnız hiçbir kodun, görünümün ya da fonksiyonun
-- okumadığı 3 yedek / tek seferlik yama tablosu (pg_depend ve repo taraması: 0 bağımlılık). Kullanımdaki tablolara
-- (Market Scout'un eski kaynakları, CFO defter tabloları, özelliklerin boş tabloları) dokunulmaz.
--   cfo_change_log_area_yedek          (472 satır)  — defter "area" düzeltmesinin yedeği
--   cfo_question_file_url_backup       (8 satır)    — soru dosyası URL yedeği (dosyalar özel bucket'a taşındı)
--   cfo_backfill_trendyol_pid_20260922 (1.448 satır) — 22.09 tek seferlik Trendyol ürün kimliği düzeltmesinin kaydı
DROP TABLE IF EXISTS public.cfo_change_log_area_yedek;
DROP TABLE IF EXISTS public.cfo_question_file_url_backup;
DROP TABLE IF EXISTS public.cfo_backfill_trendyol_pid_20260922;

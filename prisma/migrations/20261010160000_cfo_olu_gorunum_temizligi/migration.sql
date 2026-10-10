-- CFO-024 / RF-024 — ölü görünüm temizliği (Alperen onayı 2026-10-10 "Onaylıyorum devam et").
-- cfo_ciro_hedef: CFO-008 ile tek ciro kaynağı (Goal Engine satırları, lib/cfo/revenue.ts) geldi; görünümü okuyan kod, görünüm ya da
-- fonksiyon kalmadı (üretim 10.10: pg_proc/pg_views taraması 0, bağımlı kural 0). Veri tutmaz → silmek veri kaybı değildir.
-- Bilerek SİLİNMEYEN: cfo_insight / cfo_usage (eski AI CFO geçmiş kayıtları — veri taşır; artık yazılmıyor), cfo_settings ölü alanları
-- (sütun silmek değer siler). cfo_model_hakedis üretimde yok.
-- Geri alma: 20261010120000_cfo_kur_tek_kaynak içindeki CREATE OR REPLACE VIEW public.cfo_ciro_hedef bloğu yeniden çalıştırılır.
DROP VIEW IF EXISTS public.cfo_ciro_hedef;

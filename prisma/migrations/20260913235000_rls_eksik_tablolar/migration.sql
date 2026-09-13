-- RLS değişmezini geri getir: policy'siz tabloları deny-all'a çek.
--
-- BULGU (13.09.2026): 22 public tabloda RLS KAPALI ve `anon` rolünün SELECT
-- yetkisi VAR. İçlerinde banka/ödeme/maliyet verisi taşıyanlar da bulunuyor
-- (cfo_order_line, cfo_import_cost, cfo_statement_import, cfo_set_fiyat ...).
-- Yani Data API açıksa bu tablolar anonim olarak okunabilir durumda.
--
-- NEDEN OLDU: 20260613000000_enable_rls_all_public_tables O GÜN var olan
-- tabloları kapattı. Sonradan Supabase SQL editöründen elle oluşturulan
-- tablolar bu korumayı almadı ve Supabase'in varsayılan yetkileri anon/
-- authenticated'a SELECT verdi. Hata sessiz: tablo çalışır, uygulama çalışır,
-- yalnız dışarı açıktır.
--
-- NEDEN GÜVENLİ: Uygulama bu tabloların HİÇBİRİNE Supabase istemcisiyle
-- erişmiyor — repoda `createClient` çağrısı ve anon anahtar referansı YOK;
-- tüm erişim Prisma üzerinden `postgres` rolüyle yapılıyor ve o rol
-- `rolbypassrls` taşıdığı için RLS'ten etkilenmiyor. Storage `service_role`
-- kullanıyor, o da bypass eder. Politika EKLENMİYOR — deny-all kasıtlı,
-- 20260613000000 ile birebir aynı desen.
--
-- Tablo yoksa atlanır: migration bu tabloların bir kısmının bulunmadığı
-- ortamlarda (yerel, yeni kurulum) da çalışmalı.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cfo_ay_kazanan', 'cfo_change_log_area_yedek', 'cfo_fba_aday',
    'cfo_import_cost', 'cfo_kanal_gecikme', 'cfo_kanal_net_oran',
    'cfo_kargo_tarife', 'cfo_note', 'cfo_order_batch', 'cfo_order_line',
    'cfo_pay_obs', 'cfo_question', 'cfo_question_file',
    'cfo_set_bilesen_maliyet', 'cfo_set_fiyat', 'cfo_statement_import',
    'cfo_stok_istisna', 'cfo_urun_karar', 'cfo_yoldaki_kalem',
    'cfo_yoldaki_mal', 'urun_aday', 'urun_aday_gorsel'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

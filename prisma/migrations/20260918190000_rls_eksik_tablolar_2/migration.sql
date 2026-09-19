-- RLS değişmezini yine geri getir: policy'siz tabloları deny-all'a çek.
--
-- BULGU (18.09.2026): 13.09'da "RLS'siz public tablo sıfır" denmişti; bugün
-- Supabase security advisor 5 tabloda yine RLS KAPALI buldu:
--   cfo_hamle, cfo_hamle_olcum, cfo_kart_taksit, cfo_kilometre_tasi, cfo_kur
--
-- NEDEN TEKRARLADI: 20260913235000 o gün var olan tabloları kapattı; bu beş
-- tablo SONRADAN Supabase SQL editöründen elle açıldı ve Supabase'in
-- varsayılan yetkileri yüzünden korumasız kaldı. Yani bu bir "düzeltilmemiş
-- hata" değil, **tekrarlayan bir sınıf**: SQL editöründen açılan her yeni
-- tablo aynı açıkla doğuyor. Kalıcı çözümü tek bir migration veremez —
-- backlog'a "yeni tabloda RLS'i otomatik kapatan event trigger" maddesi
-- girdi (docs/PDKS.md).
--
-- NEDEN GÜVENLİ: bu beş tablo TypeScript kodunda hiç geçmiyor (grep: sıfır
-- eşleşme); tüm DB erişimi Prisma → `postgres` rolü ve o rol `rolbypassrls`
-- taşıdığı için RLS'ten etkilenmiyor. Repoda Supabase istemcisi (`createClient`)
-- ve anon anahtar kullanımı YOK. Politika EKLENMİYOR — deny-all kasıtlı,
-- 20260613000000 ve 20260913235000 ile birebir aynı desen.
--
-- Tablo yoksa atlanır: migration bu tabloların bulunmadığı ortamlarda
-- (yerel, yeni kurulum) da çalışmalı.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cfo_hamle', 'cfo_hamle_olcum', 'cfo_kart_taksit',
    'cfo_kilometre_tasi', 'cfo_kur'
  ]
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

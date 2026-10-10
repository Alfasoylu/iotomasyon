-- Claude Code tek dosya — migration 20261010150000_olu_stok_bagimsiz_ilan. Alperen onayı 2026-10-10 ("Önerilerini onaylıyorum").
-- Tek transaction: migration gövdesi + _prisma_migrations kaydı (checksum bad536ea74a76557f022987b5cada15dc7dcdf714c154d53d82eed06d9a33049). Ham veri değişmez: yeni boş tablo; anon/authenticated yetkisi yok.
BEGIN;
-- Ölü stok BAĞIMSIZ İLAN kaydı (Alperen 2026-10-10: "yeni ilanı farklı SKU/barkodla aç, Entegra'dan bağımsız yürüt, stok adedini XML'den
-- çek"; "önerilerini onaylıyorum"). Entegra'nın yönetmediği ALFOS-… barkodlu ilanlar burada tutulur; gece XML senkronundan sonra stok
-- yalnız bu satırlara, yalnız adet olarak, Entegra XML stoğundan eşitlenir (lib/olu-stok/stock-sync.ts). Fiyat otomatik değişmez.
-- Ham veri değişmez: yeni boş tablo; anon/authenticated yetkisi yok.
-- Geri alma: DROP TABLE public.olu_stok_bagimsiz_ilan (pazaryerindeki ilanlar kalır; stok eşitlemesi durur).
CREATE TABLE IF NOT EXISTS public.olu_stok_bagimsiz_ilan (
  id             text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  sku            text NOT NULL,
  kanal          text NOT NULL CHECK (kanal IN ('TRENDYOL', 'PTTAVM')),
  barkod         text NOT NULL CHECK (barkod LIKE 'ALFOS-%' AND length(barkod) <= 40),
  baslik         text NOT NULL CHECK (length(btrim(baslik)) >= 3),
  kaynak_barkod  text,
  satis_fiyati   numeric(14, 2) NOT NULL CHECK (satis_fiyati > 0),
  islem_no       text,
  durum          text NOT NULL DEFAULT 'GONDERILDI' CHECK (durum IN ('GONDERILDI', 'AKTIF', 'REDDEDILDI', 'KAPALI')),
  olusturan      text NOT NULL,
  olusturuldu_at timestamptz NOT NULL DEFAULT now(),
  son_stok       integer CHECK (son_stok IS NULL OR son_stok >= 0),
  son_stok_at    timestamptz,
  son_stok_islem text,
  UNIQUE (kanal, barkod)
);
CREATE INDEX IF NOT EXISTS olu_stok_bagimsiz_ilan_sku ON public.olu_stok_bagimsiz_ilan (sku);
ALTER TABLE public.olu_stok_bagimsiz_ilan ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  REVOKE ALL ON public.olu_stok_bagimsiz_ilan FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON public.olu_stok_bagimsiz_ilan FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON public.olu_stok_bagimsiz_ilan FROM authenticated; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cfo_acceptance_reader') THEN
    GRANT SELECT ON public.olu_stok_bagimsiz_ilan TO cfo_acceptance_reader; END IF;
END $$;
INSERT INTO public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) VALUES (gen_random_uuid()::text, 'bad536ea74a76557f022987b5cada15dc7dcdf714c154d53d82eed06d9a33049', now(), '20261010150000_olu_stok_bagimsiz_ilan', NULL, NULL, now(), 1);
COMMIT;

-- Kontrol (salt-okuma): select to_regclass('public.olu_stok_bagimsiz_ilan'), has_table_privilege('anon','public.olu_stok_bagimsiz_ilan','select');  -- olu_stok_bagimsiz_ilan, false

-- Cowork / Claude Code tek dosya — CFO-027 (migration 20261009240000_cfo_belge). Alperen onayıyla uygulanır.
-- Tek transaction: migration gövdesi + _prisma_migrations kaydı (checksum 2bd3b4f91026cd98986d3fe7a2e817f72db2d1e064efc05d489f07002f4142a6). Ham veri değişmez: yeni boş tablo, 1 görünüm, 2 fonksiyon; anon/authenticated yetkisi yok.
BEGIN;
-- CFO-027 (Cowork brief, Alperen 2026-10-09): CFO belge kütüphanesi — komisyon oranları, kart/banka ekstreleri, KDV beyannamesi,
-- platform faturaları vb. soruya bağlı olmadan, kategori + ZORUNLU kullanıcı açıklamasıyla saklanır (dosya: private bucket cfo-files/belge/).
-- Kurallar: (1) ham dosya motora girmez — bağlama açıklama + kısa özet + çıkarılan sayılar; (2) kullanıcı açıklaması AI özetinden üstün,
-- çelişki `celiski` + değişiklik günlüğüne; (3) belge kanıttır: bu tablo hiçbir defteri değiştirmez, defter değişikliği onaylı akışla.
-- Sitede LLM yok: özeti Cowork yazar, YALNIZ cfo_belge_ozet_yaz() ile (IBAN / kart no / 10–11 haneli kimlik maskelenir; günlüğe iz).
-- Geri alma: DROP FUNCTION cfo_belge_ozet_yaz(text,text,jsonb,text,text); DROP VIEW cfo_belge_kuyrugu; DROP TABLE cfo_belge (dosyalar bucket'ta kalır).
CREATE TABLE IF NOT EXISTS public.cfo_belge (
  id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  kategori        text NOT NULL CHECK (kategori IN ('KOMISYON_ORANI','PLATFORM_FATURASI','KART_EKSTRESI','BANKA_EKSTRESI','KREDI_SOZLESMESI',
                                                    'KDV_BEYANNAMESI','GUMRUK_BEYANNAMESI','TEDARIKCI_FATURASI','DIGER')),
  baslik          text NOT NULL CHECK (length(btrim(baslik)) >= 3),
  aciklama        text NOT NULL CHECK (length(btrim(aciklama)) >= 30),
  donem_baslangic date,
  donem_bitis     date,
  gecerlilik_bitis date,
  dosya_ref       text NOT NULL CHECK (dosya_ref LIKE 'private:cfo-files/belge/%'),
  dosya_adi       text NOT NULL,
  mime            text NOT NULL,
  boyut           integer NOT NULL CHECK (boyut > 0 AND boyut <= 10485760),
  sha256          text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  yukleyen        text NOT NULL,
  yuklendi_at     timestamptz NOT NULL DEFAULT now(),
  ozet            text,
  ozet_durumu     text NOT NULL DEFAULT 'BEKLIYOR' CHECK (ozet_durumu IN ('BEKLIYOR','HAZIR','OKUNAMADI')),
  ozet_yazan      text,
  ozet_at         timestamptz,
  cikarilan       jsonb,
  celiski         text,
  arsiv_at        timestamptz,
  CHECK (donem_baslangic IS NULL OR donem_bitis IS NULL OR donem_baslangic <= donem_bitis)
);
CREATE UNIQUE INDEX IF NOT EXISTS cfo_belge_sha256_aktif ON public.cfo_belge (sha256) WHERE arsiv_at IS NULL;
CREATE INDEX IF NOT EXISTS cfo_belge_kategori ON public.cfo_belge (kategori, yuklendi_at DESC);
ALTER TABLE public.cfo_belge ENABLE ROW LEVEL SECURITY;

-- Cowork okuma kuyruğu: özeti bekleyen, arşivlenmemiş belgeler (dosyanın kendisi değil, yalnız üst veri)
CREATE OR REPLACE VIEW public.cfo_belge_kuyrugu WITH (security_invoker = true) AS
SELECT id, kategori, baslik, aciklama, donem_baslangic, donem_bitis, gecerlilik_bitis, dosya_ref, dosya_adi, mime, boyut, yuklendi_at
  FROM public.cfo_belge WHERE arsiv_at IS NULL AND ozet_durumu = 'BEKLIYOR' ORDER BY yuklendi_at;

-- Maskeleme (TS lib/cfo/documents.ts maskSensitive ile aynı kural; Luhn denetimi TS tarafında — SQL tarafı 13–19 haneli her diziyi maskeler)
CREATE OR REPLACE FUNCTION public.cfo_belge_maskele(t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(
           regexp_replace(
             regexp_replace(coalesce(t, ''), '\m([A-Z]{2})[0-9]{2}( ?[0-9A-Z]{4}){3,7}( ?[0-9A-Z]{1,3})?\M', '\1** **** ****', 'g'),
             '\m([0-9][ -]?){12,18}[0-9]\M', '**** **** **** ****', 'g'),
           '(^|[^0-9.,])([0-9]{2})[0-9]{6,7}([0-9]{2})(?![0-9.,])', '\1\2*******\3', 'g')
$$;

-- Cowork'ün tek yazma yolu: özet + çıkarılan sayılar (öneri) + varsa açıklamayla çelişki. Defter DEĞİŞMEZ.
CREATE OR REPLACE FUNCTION public.cfo_belge_ozet_yaz(p_id text, p_ozet text, p_cikarilan jsonb, p_yazan text, p_celiski text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_ozet text := public.cfo_belge_maskele(left(p_ozet, 4000)); v_cel text := nullif(public.cfo_belge_maskele(left(p_celiski, 1000)), '');
BEGIN
  IF p_yazan IS NULL OR btrim(p_yazan) = '' THEN RAISE EXCEPTION 'yazan zorunlu'; END IF;
  IF p_cikarilan IS NOT NULL AND jsonb_typeof(p_cikarilan) <> 'object' THEN RAISE EXCEPTION 'cikarilan bir JSON nesnesi olmali'; END IF;
  UPDATE public.cfo_belge SET ozet = v_ozet, cikarilan = CASE WHEN p_cikarilan IS NULL THEN NULL ELSE public.cfo_belge_maskele(p_cikarilan::text)::jsonb END,
         celiski = v_cel, ozet_durumu = CASE WHEN btrim(coalesce(p_ozet, '')) = '' THEN 'OKUNAMADI' ELSE 'HAZIR' END, ozet_yazan = p_yazan, ozet_at = now()
   WHERE id = p_id AND arsiv_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'belge yok ya da arsivde: %', p_id; END IF;
  INSERT INTO public.cfo_change_log (id, area, item, "oldValue", "newValue", source, kind, note)
  VALUES (gen_random_uuid()::text, 'veri', 'belge ' || p_id || ' ozet', NULL, left(v_ozet, 200), p_yazan, CASE WHEN v_cel IS NULL THEN 'analiz' ELSE 'celiski' END,
          CASE WHEN v_cel IS NULL THEN 'Belge ozeti yazildi (defter degismez; oneriler onay bekler)'
               ELSE 'CELISKI (kullanici aciklamasi gecerli): ' || left(v_cel, 300) END);
END $$;

DO $$
BEGIN
  REVOKE ALL ON public.cfo_belge, public.cfo_belge_kuyrugu FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.cfo_belge_ozet_yaz(text, text, jsonb, text, text) FROM PUBLIC;
  REVOKE ALL ON FUNCTION public.cfo_belge_maskele(text) FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.cfo_belge, public.cfo_belge_kuyrugu FROM anon;
    REVOKE ALL ON FUNCTION public.cfo_belge_ozet_yaz(text, text, jsonb, text, text) FROM anon;
    REVOKE ALL ON FUNCTION public.cfo_belge_maskele(text) FROM anon; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.cfo_belge, public.cfo_belge_kuyrugu FROM authenticated;
    REVOKE ALL ON FUNCTION public.cfo_belge_ozet_yaz(text, text, jsonb, text, text) FROM authenticated;
    REVOKE ALL ON FUNCTION public.cfo_belge_maskele(text) FROM authenticated; END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'cfo_acceptance_reader') THEN
    GRANT SELECT ON public.cfo_belge, public.cfo_belge_kuyrugu TO cfo_acceptance_reader; END IF;
END $$;
INSERT INTO public._prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) VALUES (gen_random_uuid()::text, '2bd3b4f91026cd98986d3fe7a2e817f72db2d1e064efc05d489f07002f4142a6', now(), '20261009240000_cfo_belge', NULL, NULL, now(), 1);
COMMIT;

-- Kontrol (salt-okuma): select to_regclass('public.cfo_belge'), has_table_privilege('anon','public.cfo_belge','select') as anon_okur;  -- cfo_belge, false

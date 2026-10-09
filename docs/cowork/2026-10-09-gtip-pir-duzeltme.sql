-- CFO-026 kalan (Alperen 2026-10-09: "GTİP düzeltmelerini sen yap, tam yetkilisin"): AY-PIRSENSORSWITCH ürününün gtip1 değeri
-- 8536.50.19.00.11 2026 Türk Gümrük Tarife Cetvelinde yok (8536.50.19 alt bölünmemiş: 8536.50.19.00.00, GV %2,3, İGV 0, ÖTV yok).
-- Güvenli tekrar: yalnız gtip1 hâlâ eski değerdeyse güncellenir; değişiklik cfo_change_log'a (eski → yeni). Maliyet/fiyat/stok değişmez.
BEGIN;
WITH u AS (
  UPDATE public."Product" SET gtip1 = '8536.50.19.00.00', "gtip1Desc" = 'Diğer anahtarlar (≤1000V) — diğerleri (PIR hareket sensörlü anahtar)'
   WHERE sku = 'AY-PIRSENSORSWITCH' AND gtip1 = '8536.50.19.00.11'
  RETURNING sku
)
INSERT INTO public.cfo_change_log (id, area, item, "oldValue", "newValue", source, kind, note)
SELECT gen_random_uuid()::text, 'urun', u.sku || ' GTİP', '8536.50.19.00.11', '8536.50.19.00.00', 'Sistem', 'duzeltme',
       'CFO-026: eski kod 2026 tarifesinde yok (ith-rejim-karari.zip, 85. fasıl); oran satırı migration 20261009220000'
  FROM u;
COMMIT;
-- Doğrulama: SELECT sku, gtip1 FROM public."Product" WHERE sku = 'AY-PIRSENSORSWITCH';

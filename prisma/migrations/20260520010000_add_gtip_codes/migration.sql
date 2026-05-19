-- GTİP kodları (Gümrük Tarife İstatistik Pozisyonu)
--
-- 3 adet GTİP kolonu eklendi; bazı ürünler farklı GTİP'lerle ithal edilebildiği için
-- birden fazla muhtemel kod tutulabilsin. Tüm alanlar NULLABLE, additive migration.
-- Format: "XXXX.XX.XX.XX.XX" tipi 8-12 haneli string. Validation app katmanında.

ALTER TABLE "Product" ADD COLUMN "gtip1" TEXT;
ALTER TABLE "Product" ADD COLUMN "gtip2" TEXT;
ALTER TABLE "Product" ADD COLUMN "gtip3" TEXT;

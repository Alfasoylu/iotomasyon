-- Kredi kartı borç maliyeti (CFO yol haritası #7, 2026-10-08). Yalnız EKLEME: iki boş sütun, mevcut veri değişmez.
-- revolvingTry: son ekstreden ödenmeyip devreden, FAİZ İŞLEYEN bakiye (ekranda "son ekstreden kalan borç"). Dönem içi harcama
--   ve gelecek taksitler faizsizdir, buraya girmez. NULL = bilinmiyor (0 değil).
-- contractMonthlyRatePct: ekstredeki aylık akdi faiz (vergi HARİÇ, %). Efektif maliyet = oran × (1 + KKDF + BSMV) kodda hesaplanır.
-- Eklenen sütunlar: cfo_credit_card."revolvingTry" DECIMAL(14,2) NULL, cfo_credit_card."contractMonthlyRatePct" DECIMAL(6,3) NULL.
-- Kod sütunlar yokken de çalışır (varlıkları önce sorulur). Geri alma (veri kaybı yalnız bu iki sütunda):
--   ALTER TABLE "cfo_credit_card" DROP COLUMN IF EXISTS "revolvingTry", DROP COLUMN IF EXISTS "contractMonthlyRatePct";
ALTER TABLE "cfo_credit_card" ADD COLUMN IF NOT EXISTS "revolvingTry" DECIMAL(14,2);
ALTER TABLE "cfo_credit_card" ADD COLUMN IF NOT EXISTS "contractMonthlyRatePct" DECIMAL(6,3);

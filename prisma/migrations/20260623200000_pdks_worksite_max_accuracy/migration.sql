-- PDKS: şantiye-başına kabul edilen azami konum doğruluğu (GPS accuracy, metre).
-- Cihazın bildirdiği accuracy bu değeri aşarsa check-in reddedilir.
-- Additive + default'lu → mevcut satırlar 100 alır, geriye dönük güvenli.
ALTER TABLE "pdks_worksites" ADD COLUMN "maxAccuracyMeters" INTEGER NOT NULL DEFAULT 100;

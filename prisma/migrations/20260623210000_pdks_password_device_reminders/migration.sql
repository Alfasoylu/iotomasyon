-- PDKS: kalıcı şifre/PIN girişi + cihaz bağlama + çıkış saati + artan geç-bildirim eşiği.
-- Hepsi additive; mevcut satırlar için NULL / default güvenli.
ALTER TABLE "pdks_personnel" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "pdks_personnel" ADD COLUMN "deviceIdHash" TEXT;
ALTER TABLE "pdks_personnel" ADD COLUMN "deviceBoundAt" TIMESTAMP(3);
ALTER TABLE "pdks_personnel" ADD COLUMN "expectedCheckOut" TEXT;
ALTER TABLE "pdks_personnel" ADD COLUMN "lateReminderLastMin" INTEGER NOT NULL DEFAULT 0;

-- Şantiye varsayılan yarıçapı 100 m (yeni kayıtlar için; mevcut satırlar etkilenmez).
ALTER TABLE "pdks_worksites" ALTER COLUMN "radiusMeters" SET DEFAULT 100;

-- PDKS: kalıcı şifre/PIN + cihaz bağlama + çıkış saati + artan geç-bildirim.
-- Supabase 'iotomasyon' (ref frbxpodiostxuwlrubkt) → SQL Editor → Run.
BEGIN;

ALTER TABLE "pdks_personnel" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "pdks_personnel" ADD COLUMN "deviceIdHash" TEXT;
ALTER TABLE "pdks_personnel" ADD COLUMN "deviceBoundAt" TIMESTAMP(3);
ALTER TABLE "pdks_personnel" ADD COLUMN "expectedCheckOut" TEXT;
ALTER TABLE "pdks_personnel" ADD COLUMN "lateReminderLastMin" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "pdks_worksites" ALTER COLUMN "radiusMeters" SET DEFAULT 100;

INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, 'd25fcfe1a8350f97853bb67b9bb05a57fc7196609a4a41da3bb9b36d638c8408', now(), '20260623210000_pdks_password_device_reminders', NULL, NULL, now(), 1);

-- Mevcut test personeline şifre/PIN ata (1234). Yoksa zaten yeni seed eklersiniz.
UPDATE "pdks_personnel"
SET "passwordHash" = '$2b$10$DsythrgRZdagGs86HwStNuiMstokMVgnYkg6/6/B7D.katpryTt72'
WHERE "id" = 'seed_personnel_test';

COMMIT;

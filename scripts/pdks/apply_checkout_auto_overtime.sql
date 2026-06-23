-- PDKS: çıkış hatırlatması + otomatik çıkış + fazla mesai.
-- Supabase 'iotomasyon' (ref frbxpodiostxuwlrubkt) → SQL Editor → Run.
BEGIN;
ALTER TABLE "pdks_attendance_records" ADD COLUMN "autoCheckout" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pdks_attendance_records" ADD COLUMN "checkoutReminderAt" TIMESTAMP(3);
ALTER TABLE "pdks_attendance_records" ADD COLUMN "overtime" BOOLEAN NOT NULL DEFAULT false;

INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '2060621c31f806cfedc53802c58345c30b9c9962e6146cedeed3249867518327', now(), '20260623220000_pdks_checkout_auto_overtime', NULL, NULL, now(), 1);
COMMIT;

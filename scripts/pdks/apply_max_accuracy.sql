-- PDKS: şantiye-başına azami konum doğruluğu kolonu.
-- Supabase 'iotomasyon' (ref frbxpodiostxuwlrubkt) → SQL Editor → Run.
BEGIN;

ALTER TABLE "pdks_worksites" ADD COLUMN "maxAccuracyMeters" INTEGER NOT NULL DEFAULT 100;

INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, 'd5b38ae7b72630f0f760ad3d9e926e819009f4f7c8e0d8092be5222977f1e144', now(), '20260623200000_pdks_worksite_max_accuracy', NULL, NULL, now(), 1);

COMMIT;

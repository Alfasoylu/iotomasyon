-- PDKS: tenant haftalık çalışma programı kolonu.
-- Supabase 'iotomasyon' (ref frbxpodiostxuwlrubkt) → SQL Editor → Run.
BEGIN;
ALTER TABLE "pdks_tenants" ADD COLUMN "workScheduleJson" TEXT;

INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '4623c914c92f32d3ae8982bde64536e0585846346c2042308c4242c146fa1512', now(), '20260624120000_pdks_tenant_work_schedule', NULL, NULL, now(), 1);
COMMIT;

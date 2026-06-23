-- ============================================================================
-- PDKS — 4 migration birleşik (Faz1 + giriş kodları + geç-hatırlatma + KVKK)
-- Supabase 'iotomasyon' projesi (ref: frbxpodiostxuwlrubkt) SQL Editor'de çalıştırın.
-- Tamamı tek transaction; herhangi bir adım başarısız olursa hepsi geri alınır.
-- ============================================================================
BEGIN;

-- ----------------------------------------------------------------------------
-- 20260623000000_add_pdks_module
-- ----------------------------------------------------------------------------
-- PDKS (Personel Devam Kontrol Sistemi) — Faz 1
-- Multi-tenant devam takip tabloları. public şemada, "pdks_" önekli.
-- Tenant izolasyonu uygulama katmanında (lib/pdks). DB-seviyesi RLS yalnızca
-- mevcut güvenlik posture'ı (anon/authenticated kilitli) ile tutarlılık için
-- enable edilir; politika yok — Prisma (tablo sahibi rol) RLS'i baypas eder.

-- CreateTable
CREATE TABLE "pdks_tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pdks_tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pdks_personnel" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "crmUserId" TEXT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "role" TEXT NOT NULL DEFAULT 'employee',
    "expectedCheckIn" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pdks_personnel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pdks_worksites" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radiusMeters" INTEGER NOT NULL DEFAULT 150,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pdks_worksites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pdks_personnel_worksites" (
    "tenantId" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "worksiteId" TEXT NOT NULL,
    CONSTRAINT "pdks_personnel_worksites_pkey" PRIMARY KEY ("personnelId","worksiteId")
);

-- CreateTable
CREATE TABLE "pdks_attendance_records" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "worksiteId" TEXT,
    "workDate" DATE NOT NULL,
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "checkInDistanceM" INTEGER,
    "checkOutDistanceM" INTEGER,
    "checkInAccuracyM" INTEGER,
    "checkOutAccuracyM" INTEGER,
    "checkInLat" DOUBLE PRECISION,
    "checkInLng" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pdks_attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pdks_push_subscriptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pdks_push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pdks_tenants_slug_key" ON "pdks_tenants"("slug");
CREATE INDEX "pdks_personnel_tenantId_idx" ON "pdks_personnel"("tenantId");
CREATE INDEX "pdks_worksites_tenantId_idx" ON "pdks_worksites"("tenantId");
CREATE INDEX "pdks_personnel_worksites_tenantId_idx" ON "pdks_personnel_worksites"("tenantId");
CREATE INDEX "pdks_attendance_records_tenantId_workDate_idx" ON "pdks_attendance_records"("tenantId","workDate");
CREATE INDEX "pdks_attendance_records_personnelId_workDate_idx" ON "pdks_attendance_records"("personnelId","workDate");
CREATE UNIQUE INDEX "pdks_push_subscriptions_endpoint_key" ON "pdks_push_subscriptions"("endpoint");
CREATE INDEX "pdks_push_subscriptions_tenantId_idx" ON "pdks_push_subscriptions"("tenantId");

-- AddForeignKey
ALTER TABLE "pdks_personnel" ADD CONSTRAINT "pdks_personnel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "pdks_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pdks_worksites" ADD CONSTRAINT "pdks_worksites_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "pdks_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pdks_personnel_worksites" ADD CONSTRAINT "pdks_personnel_worksites_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "pdks_personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pdks_personnel_worksites" ADD CONSTRAINT "pdks_personnel_worksites_worksiteId_fkey" FOREIGN KEY ("worksiteId") REFERENCES "pdks_worksites"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pdks_attendance_records" ADD CONSTRAINT "pdks_attendance_records_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "pdks_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pdks_attendance_records" ADD CONSTRAINT "pdks_attendance_records_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "pdks_personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pdks_attendance_records" ADD CONSTRAINT "pdks_attendance_records_worksiteId_fkey" FOREIGN KEY ("worksiteId") REFERENCES "pdks_worksites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pdks_push_subscriptions" ADD CONSTRAINT "pdks_push_subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "pdks_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pdks_push_subscriptions" ADD CONSTRAINT "pdks_push_subscriptions_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "pdks_personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Güvenlik posture tutarlılığı: RLS enable (politika yok; tablo sahibi rol baypas eder).
-- Mevcut "enable_rls_all_public_tables" migration'ı ile aynı savunma derinliği.
ALTER TABLE "pdks_tenants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pdks_personnel" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pdks_worksites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pdks_personnel_worksites" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pdks_attendance_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pdks_push_subscriptions" ENABLE ROW LEVEL SECURITY;

INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '6a4d4435e17ade6f48a0e3cd6746d1a0f59583738dc9e28c440fa34abbd4a202', now(), '20260623000000_add_pdks_module', NULL, NULL, now(), 1);

-- ----------------------------------------------------------------------------
-- 20260623000100_add_pdks_login_codes
-- ----------------------------------------------------------------------------
-- PDKS — Admin-üretimli tek kullanımlık giriş kodları (SMS yok).
CREATE TABLE "pdks_login_codes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pdks_login_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pdks_login_codes_personnelId_idx" ON "pdks_login_codes"("personnelId");
CREATE INDEX "pdks_login_codes_tenantId_idx" ON "pdks_login_codes"("tenantId");

ALTER TABLE "pdks_login_codes" ADD CONSTRAINT "pdks_login_codes_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "pdks_personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pdks_login_codes" ENABLE ROW LEVEL SECURITY;

INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '8d5d3d966370626b2d49ad03299342ac11e4b15cc405677c5975c50154bff4cd', now(), '20260623000100_add_pdks_login_codes', NULL, NULL, now(), 1);

-- ----------------------------------------------------------------------------
-- 20260623120000_pdks_late_reminder
-- ----------------------------------------------------------------------------
-- PDKS: geç-kalan hatırlatma idempotency alanı (cron'un günde bir kez göndermesi için).
ALTER TABLE "pdks_personnel" ADD COLUMN "lastLateReminderOn" DATE;

INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, '8061bbf198d4da629410bd593818d1a942e19dcb2f396fe2045704ad19ef05a5', now(), '20260623120000_pdks_late_reminder', NULL, NULL, now(), 1);

-- ----------------------------------------------------------------------------
-- 20260623130000_pdks_kvkk_consent
-- ----------------------------------------------------------------------------
-- PDKS: KVKK açık rıza zamanı. null ise giriş/çıkış (konum işleme) engellenir.
ALTER TABLE "pdks_personnel" ADD COLUMN "kvkkConsentAt" TIMESTAMP(3);

INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
VALUES (gen_random_uuid()::text, 'f094852c13de156eb8f30f88f0b50833928c0ed0a288ffe1405f25574b4d7387', now(), '20260623130000_pdks_kvkk_consent', NULL, NULL, now(), 1);

COMMIT;

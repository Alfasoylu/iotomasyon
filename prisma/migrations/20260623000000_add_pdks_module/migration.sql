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

-- PDKS: izin (leave) tablosu. Personel talep oluşturur (pending), yönetici onaylar/reddeder;
-- yönetici doğrudan (approved) da tanımlayabilir.
CREATE TABLE "pdks_leaves" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'annual',
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedBy" TEXT NOT NULL DEFAULT 'personnel',
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pdks_leaves_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pdks_leaves_tenantId_idx" ON "pdks_leaves"("tenantId");
CREATE INDEX "pdks_leaves_personnelId_idx" ON "pdks_leaves"("personnelId");
ALTER TABLE "pdks_leaves" ADD CONSTRAINT "pdks_leaves_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "pdks_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pdks_leaves" ADD CONSTRAINT "pdks_leaves_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "pdks_personnel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pdks_leaves" ENABLE ROW LEVEL SECURITY;

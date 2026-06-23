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

-- Phase 97 — Lead List Manager
CREATE TABLE IF NOT EXISTS "LeadList" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "city" TEXT,
  "category" TEXT,
  "totalCount" INTEGER NOT NULL DEFAULT 0,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT NOT NULL,
  CONSTRAINT "LeadList_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LeadList_createdById_idx" ON "LeadList"("createdById");
CREATE INDEX IF NOT EXISTS "LeadList_source_idx" ON "LeadList"("source");
CREATE INDEX IF NOT EXISTS "LeadList_city_idx" ON "LeadList"("city");

CREATE TABLE IF NOT EXISTS "CustomerLeadListMembership" (
  "customerId" TEXT NOT NULL,
  "leadListId" TEXT NOT NULL,
  "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerLeadListMembership_pkey" PRIMARY KEY ("customerId","leadListId")
);
CREATE INDEX IF NOT EXISTS "CustomerLeadListMembership_leadListId_idx" ON "CustomerLeadListMembership"("leadListId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'LeadList_createdById_fkey') THEN
    ALTER TABLE "LeadList" ADD CONSTRAINT "LeadList_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerLeadListMembership_customerId_fkey') THEN
    ALTER TABLE "CustomerLeadListMembership" ADD CONSTRAINT "CustomerLeadListMembership_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerLeadListMembership_leadListId_fkey') THEN
    ALTER TABLE "CustomerLeadListMembership" ADD CONSTRAINT "CustomerLeadListMembership_leadListId_fkey"
      FOREIGN KEY ("leadListId") REFERENCES "LeadList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

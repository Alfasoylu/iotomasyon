-- Phase 99 — Industry hiyerarşisi + Customer.industryId/usedTech/currentSupplier
CREATE TABLE IF NOT EXISTS "Industry" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL UNIQUE,
  "parentId" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS "Industry_parentId_idx" ON "Industry"("parentId");
CREATE INDEX IF NOT EXISTS "Industry_slug_idx" ON "Industry"("slug");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Industry_parentId_fkey'
  ) THEN
    ALTER TABLE "Industry"
      ADD CONSTRAINT "Industry_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "Industry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "Customer"
  ADD COLUMN IF NOT EXISTS "industryId" TEXT,
  ADD COLUMN IF NOT EXISTS "usedTech" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "currentSupplier" TEXT;

CREATE INDEX IF NOT EXISTS "Customer_industryId_idx" ON "Customer"("industryId");
CREATE INDEX IF NOT EXISTS "Customer_city_idx" ON "Customer"("city");
CREATE INDEX IF NOT EXISTS "Customer_district_idx" ON "Customer"("district");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'Customer_industryId_fkey'
  ) THEN
    ALTER TABLE "Customer"
      ADD CONSTRAINT "Customer_industryId_fkey"
      FOREIGN KEY ("industryId") REFERENCES "Industry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

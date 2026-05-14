-- Phase 5: ProductCategory tree, CategoryInterest, Product.categoryId FK
-- Additive only — no existing columns/values removed.

-- 1. ProductCategory table
CREATE TABLE IF NOT EXISTS "ProductCategory" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "slug"        TEXT NOT NULL,
  "description" TEXT,
  "parentId"    TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductCategory_slug_key"     ON "ProductCategory"("slug");
CREATE INDEX        IF NOT EXISTS "ProductCategory_slug_idx"     ON "ProductCategory"("slug");
CREATE INDEX        IF NOT EXISTS "ProductCategory_parentId_idx" ON "ProductCategory"("parentId");

ALTER TABLE "ProductCategory"
  ADD CONSTRAINT "ProductCategory_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "ProductCategory"("id")
  ON DELETE SET NULL ON UPDATE CASCADE
  NOT VALID;

-- 2. CategoryInterest table
CREATE TABLE IF NOT EXISTS "CategoryInterest" (
  "id"          TEXT NOT NULL,
  "customerId"  TEXT NOT NULL,
  "categoryId"  TEXT NOT NULL,
  "stage"       "InterestStage" NOT NULL DEFAULT 'INTERESTED',
  "notes"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  CONSTRAINT "CategoryInterest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CategoryInterest_customerId_categoryId_key"
  ON "CategoryInterest"("customerId", "categoryId");
CREATE INDEX IF NOT EXISTS "CategoryInterest_customerId_idx"  ON "CategoryInterest"("customerId");
CREATE INDEX IF NOT EXISTS "CategoryInterest_categoryId_idx"  ON "CategoryInterest"("categoryId");

ALTER TABLE "CategoryInterest"
  ADD CONSTRAINT "CategoryInterest_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "CategoryInterest"
  ADD CONSTRAINT "CategoryInterest_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id")
  ON DELETE CASCADE ON UPDATE CASCADE
  NOT VALID;

ALTER TABLE "CategoryInterest"
  ADD CONSTRAINT "CategoryInterest_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE
  NOT VALID;

-- 3. Add categoryId FK column to Product
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;
CREATE INDEX IF NOT EXISTS "Product_categoryId_idx" ON "Product"("categoryId");

ALTER TABLE "Product"
  ADD CONSTRAINT "Product_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id")
  ON DELETE SET NULL ON UPDATE CASCADE
  NOT VALID;

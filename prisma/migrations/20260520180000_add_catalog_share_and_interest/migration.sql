-- Faz 4 — Public katalog link + analytics
-- CatalogShare: token tabanlı public erişim + açılma + bitiş tarihi
-- CatalogProductInterest: müşteri kataloğa "İlgilendim" tıklaması

CREATE TABLE IF NOT EXISTS "CatalogShare" (
  "id" TEXT PRIMARY KEY,
  "token" TEXT NOT NULL UNIQUE,
  "customerId" TEXT NOT NULL,
  "sentById" TEXT,
  "profileSlug" TEXT NOT NULL,
  "priceMode" TEXT NOT NULL,
  "brandFilter" TEXT,
  "onlyStock" BOOLEAN NOT NULL DEFAULT TRUE,
  "coverNote" TEXT,
  "expiresAt" TIMESTAMP NOT NULL,
  "viewCount" INTEGER NOT NULL DEFAULT 0,
  "firstViewedAt" TIMESTAMP,
  "lastViewedAt" TIMESTAMP,
  "followUpTaskCreated" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "CatalogShare_token_idx" ON "CatalogShare"("token");
CREATE INDEX IF NOT EXISTS "CatalogShare_customerId_idx" ON "CatalogShare"("customerId");
CREATE INDEX IF NOT EXISTS "CatalogShare_sentById_idx" ON "CatalogShare"("sentById");
CREATE INDEX IF NOT EXISTS "CatalogShare_createdAt_idx" ON "CatalogShare"("createdAt");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CatalogShare_customerId_fkey'
  ) THEN
    ALTER TABLE "CatalogShare"
      ADD CONSTRAINT "CatalogShare_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CatalogShare_sentById_fkey'
  ) THEN
    ALTER TABLE "CatalogShare"
      ADD CONSTRAINT "CatalogShare_sentById_fkey"
      FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "CatalogProductInterest" (
  "id" TEXT PRIMARY KEY,
  "catalogShareId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "CatalogProductInterest_share_idx" ON "CatalogProductInterest"("catalogShareId");
CREATE INDEX IF NOT EXISTS "CatalogProductInterest_product_idx" ON "CatalogProductInterest"("productId");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CatalogProductInterest_share_fkey'
  ) THEN
    ALTER TABLE "CatalogProductInterest"
      ADD CONSTRAINT "CatalogProductInterest_share_fkey"
      FOREIGN KEY ("catalogShareId") REFERENCES "CatalogShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'CatalogProductInterest_product_fkey'
  ) THEN
    ALTER TABLE "CatalogProductInterest"
      ADD CONSTRAINT "CatalogProductInterest_product_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

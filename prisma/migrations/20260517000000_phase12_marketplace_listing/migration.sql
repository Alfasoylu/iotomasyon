-- Phase 12: Marketplace Listing Registry
-- Adds MarketplacePlatform enum, ListingStatus enum, MarketplaceListing table.

CREATE TYPE "MarketplacePlatform" AS ENUM ('TRENDYOL', 'HEPSIBURADA', 'N11', 'PTTAVM', 'KOCTAS', 'TEKNOSA', 'TEMU', 'CUSTOM');
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'UNKNOWN');

CREATE TABLE "MarketplaceListing" (
  "id"                TEXT NOT NULL,
  "productId"         TEXT NOT NULL,
  "platform"          "MarketplacePlatform" NOT NULL,
  "platformListingId" TEXT,
  "listingUrl"        TEXT,
  "listingBarcode"    TEXT,
  "listingSku"        TEXT,
  "listingTitle"      TEXT,
  "status"            "ListingStatus" NOT NULL DEFAULT 'UNKNOWN',
  "lastCheckedAt"     TIMESTAMP(3),
  "notes"             TEXT,
  "responsibleId"     TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketplaceListing_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketplaceListing_productId_idx" ON "MarketplaceListing"("productId");
CREATE INDEX "MarketplaceListing_platform_idx" ON "MarketplaceListing"("platform");
CREATE INDEX "MarketplaceListing_status_idx" ON "MarketplaceListing"("status");
CREATE INDEX "MarketplaceListing_responsibleId_idx" ON "MarketplaceListing"("responsibleId");

ALTER TABLE "MarketplaceListing"
  ADD CONSTRAINT "MarketplaceListing_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceListing"
  ADD CONSTRAINT "MarketplaceListing_responsibleId_fkey"
  FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Phase 71: MarketplacePrice canonical price registry
-- Applied to Supabase via MCP apply_migration on 2026-05-18
-- Migration name: phase_71_marketplace_price_table
-- Part of PRODUCT PROFIT ENGINE REFACTOR (production-safe, additive only)

-- Enums
CREATE TYPE "PriceMarketplace" AS ENUM ('TRENDYOL', 'HEPSIBURADA', 'AMAZON', 'N11', 'PAZARAMA', 'IDEFIX', 'WEBSITE', 'OTHER');
CREATE TYPE "PriceSource" AS ENUM ('XML', 'API', 'MANUAL');

-- MarketplacePrice table
CREATE TABLE "MarketplacePrice" (
    "id"               TEXT NOT NULL,
    "productId"        TEXT NOT NULL,
    "marketplace"      "PriceMarketplace" NOT NULL,
    "priceTry"         DECIMAL(15,2) NOT NULL,
    "currency"         TEXT NOT NULL DEFAULT 'TRY',
    "source"           "PriceSource" NOT NULL DEFAULT 'XML',
    "rawExternalValue" DECIMAL(15,4),
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplacePrice_pkey" PRIMARY KEY ("id")
);

-- Foreign key
ALTER TABLE "MarketplacePrice"
    ADD CONSTRAINT "MarketplacePrice_productId_fkey"
    FOREIGN KEY ("productId")
    REFERENCES "Product"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Unique + indexes
CREATE UNIQUE INDEX "MarketplacePrice_productId_marketplace_key"
    ON "MarketplacePrice"("productId", "marketplace");

CREATE INDEX "MarketplacePrice_productId_idx"
    ON "MarketplacePrice"("productId");

CREATE INDEX "MarketplacePrice_marketplace_idx"
    ON "MarketplacePrice"("marketplace");

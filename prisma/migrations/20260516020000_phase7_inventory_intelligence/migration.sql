-- Phase 7: Inventory Intelligence Core
-- Adds barcode, imageUrl, supplier, stock source/confidence/sync metadata,
-- reorder lead time, shipping cost, and marketplace commission fields to Product.

-- CreateEnum
CREATE TYPE "StockSource" AS ENUM ('MANUAL', 'XML', 'API', 'IMPORT');

-- CreateEnum
CREATE TYPE "StockConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- AlterTable
ALTER TABLE "Product"
  ADD COLUMN "barcode"                      TEXT,
  ADD COLUMN "imageUrl"                     TEXT,
  ADD COLUMN "supplier"                     TEXT,
  ADD COLUMN "stockSource"                  "StockSource",
  ADD COLUMN "stockConfidence"              "StockConfidence",
  ADD COLUMN "lastStockSyncAt"              TIMESTAMP(3),
  ADD COLUMN "lastStockCountById"           TEXT,
  ADD COLUMN "reorderLeadTime"              INTEGER,
  ADD COLUMN "shippingCost"                 DECIMAL(65,30),
  ADD COLUMN "shippingCostOverride"         DECIMAL(65,30),
  ADD COLUMN "marketplaceCommission"        DECIMAL(65,30),
  ADD COLUMN "marketplaceCommissionOverride" DECIMAL(65,30);

-- CreateIndex
CREATE UNIQUE INDEX "Product_barcode_key" ON "Product"("barcode");

-- CreateIndex
CREATE INDEX "Product_barcode_idx" ON "Product"("barcode");

-- CreateIndex
CREATE INDEX "Product_supplier_idx" ON "Product"("supplier");

-- CreateIndex
CREATE INDEX "Product_stockSource_idx" ON "Product"("stockSource");

-- CreateIndex
CREATE INDEX "Product_stockConfidence_idx" ON "Product"("stockConfidence");

-- CreateIndex
CREATE INDEX "Product_lastStockCountById_idx" ON "Product"("lastStockCountById");

-- AddForeignKey
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_lastStockCountById_fkey"
  FOREIGN KEY ("lastStockCountById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

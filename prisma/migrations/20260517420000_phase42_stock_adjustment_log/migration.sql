-- Phase 42 — Stock Adjustment Log
-- Adds StockAdjustmentType enum and StockAdjustmentLog table.
-- Records every manual stock movement with type, delta, before/after qty, notes, and creator.
-- Non-destructive additive migration.

CREATE TYPE "StockAdjustmentType" AS ENUM (
  'RESTOCK',
  'CORRECTION',
  'DAMAGE',
  'RETURN',
  'SALE',
  'OTHER'
);

CREATE TABLE "StockAdjustmentLog" (
    "id"             TEXT NOT NULL,
    "productId"      TEXT NOT NULL,
    "adjustmentType" "StockAdjustmentType" NOT NULL,
    "quantityChange" INTEGER NOT NULL,
    "previousQty"    INTEGER NOT NULL,
    "newQty"         INTEGER NOT NULL,
    "notes"          TEXT,
    "createdById"    TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockAdjustmentLog_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "StockAdjustmentLog"
    ADD CONSTRAINT "StockAdjustmentLog_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "StockAdjustmentLog"
    ADD CONSTRAINT "StockAdjustmentLog_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "StockAdjustmentLog_productId_idx"      ON "StockAdjustmentLog"("productId");
CREATE INDEX "StockAdjustmentLog_createdAt_idx"      ON "StockAdjustmentLog"("createdAt");
CREATE INDEX "StockAdjustmentLog_adjustmentType_idx" ON "StockAdjustmentLog"("adjustmentType");

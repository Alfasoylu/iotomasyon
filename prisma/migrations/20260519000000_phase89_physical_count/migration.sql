-- Phase 89: Physical Count (Entegra source-of-truth fix)
--
-- Adds physical count tracking columns to Product. Warehouse staff and manual
-- stock adjustments now write to these columns instead of stockQuantity.
-- stockQuantity remains exclusively managed by XML sync (Entegra ERP).
--
-- Migration is additive and reversible: all new columns are NULLABLE; existing
-- StockAdjustmentLog audit trail is preserved unchanged.

ALTER TABLE "Product" ADD COLUMN "physicalCountQuantity" INTEGER;
ALTER TABLE "Product" ADD COLUMN "physicalCountAt"       TIMESTAMP(3);
ALTER TABLE "Product" ADD COLUMN "physicalCountById"     TEXT;
ALTER TABLE "Product" ADD COLUMN "physicalCountNote"     TEXT;

ALTER TABLE "Product" ADD CONSTRAINT "Product_physicalCountById_fkey"
    FOREIGN KEY ("physicalCountById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Product_physicalCountAt_idx"   ON "Product"("physicalCountAt");
CREATE INDEX "Product_physicalCountById_idx" ON "Product"("physicalCountById");

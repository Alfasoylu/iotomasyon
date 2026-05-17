-- Phase 43 — Trendyol Stock Auto-Deduction
-- Adds stockDeducted flag to TrendyolSalesRecord.
-- Tracks which delivered order lines have been deducted from Product.stockQuantity.
-- Non-destructive additive migration.

ALTER TABLE "TrendyolSalesRecord"
    ADD COLUMN "stockDeducted" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "TrendyolSalesRecord_stockDeducted_idx" ON "TrendyolSalesRecord"("stockDeducted");

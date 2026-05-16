-- Phase 8: Profitability Engine
-- Adds pricing and cost-rate fields to Product for per-channel profitability calculation.

ALTER TABLE "Product"
  ADD COLUMN "unitCostTry"         DECIMAL(65,30),
  ADD COLUMN "sellingPriceTry"     DECIMAL(65,30),
  ADD COLUMN "wholesalePriceTry"   DECIMAL(65,30),
  ADD COLUMN "marketplacePriceTry" DECIMAL(65,30),
  ADD COLUMN "packagingCost"       DECIMAL(65,30),
  ADD COLUMN "vatRate"             DECIMAL(65,30),
  ADD COLUMN "paymentFeeRate"      DECIMAL(65,30),
  ADD COLUMN "returnReserveRate"   DECIMAL(65,30);

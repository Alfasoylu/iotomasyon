-- Phase 31: Import Economics Normalization (RMB-first formula)
-- Additive changes only. No data loss. No destructive operations.

-- Add RMB/USD rate to MonthlyExchangeRate
ALTER TABLE "MonthlyExchangeRate"
  ADD COLUMN IF NOT EXISTS "rmbUsdRate" DECIMAL(12,4);

-- Add RMB source cost and payment fee % to Product
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "sourceCostRmb" DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS "importPaymentFeePct" DECIMAL(5,2);

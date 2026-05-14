-- Phase 8: Product import/inventory intelligence fields + Quote currency system

-- Product import & inventory fields (all nullable — no default needed, no data impact)
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "importDate"          TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "importQuantity"      INTEGER,
  ADD COLUMN IF NOT EXISTS "importUnitCostUsd"   DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "inventoryCountDate"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "inventoryCountStock" INTEGER;

-- Quote currency system
DO $$ BEGIN
  CREATE TYPE "QuoteCurrencyMode" AS ENUM ('USD', 'TRY', 'BOTH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Quote"
  ADD COLUMN IF NOT EXISTS "currencyMode" "QuoteCurrencyMode" NOT NULL DEFAULT 'TRY',
  ADD COLUMN IF NOT EXISTS "exchangeRate" DECIMAL(65,30);

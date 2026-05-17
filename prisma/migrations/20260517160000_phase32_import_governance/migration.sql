-- Phase 32: Holding-Grade Import Governance
-- Additive only. No data loss. No destructive operations.

-- Add supplier-level import freight defaults
ALTER TABLE "Supplier"
  ADD COLUMN IF NOT EXISTS "defaultAirFreightUsdPerKg" DECIMAL(8,4),
  ADD COLUMN IF NOT EXISTS "defaultSeaFreightUsdPerKg" DECIMAL(8,4),
  ADD COLUMN IF NOT EXISTS "defaultPaymentFeePct" DECIMAL(5,2);

-- Create ImportDecisionSnapshot table
CREATE TABLE IF NOT EXISTS "ImportDecisionSnapshot" (
  "id"                  TEXT         NOT NULL,
  "productId"           TEXT         NOT NULL,
  "supplierId"          TEXT,
  "rateYear"            INTEGER,
  "rateMonth"           INTEGER,
  "usdTryRate"          DECIMAL(12,4) NOT NULL,
  "rmbUsdRate"          DECIMAL(12,4),
  "sourceCostRmb"       DECIMAL(15,2),
  "sourcePriceUsd"      DECIMAL(12,4),
  "importPaymentFeePct" DECIMAL(5,2),
  "weightKg"            DECIMAL(8,3),
  "customsRatePct"      DECIMAL(5,2),
  "shippingMethodPref"  TEXT,
  "airFreightPerKg"     DECIMAL(8,4)  NOT NULL,
  "seaFreightPerKg"     DECIMAL(8,4)  NOT NULL,
  "effectiveSourceUsd"  DECIMAL(12,4) NOT NULL,
  "effectiveMethod"     TEXT          NOT NULL,
  "landedCostUsd"       DECIMAL(12,4) NOT NULL,
  "profitRatio"         DECIMAL(8,4)  NOT NULL,
  "decision"            TEXT          NOT NULL,
  "score"               DECIMAL(8,4)  NOT NULL,
  "notes"               TEXT,
  "createdById"         TEXT,
  "createdAt"           TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImportDecisionSnapshot_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "ImportDecisionSnapshot_productId_idx"  ON "ImportDecisionSnapshot"("productId");
CREATE INDEX IF NOT EXISTS "ImportDecisionSnapshot_supplierId_idx" ON "ImportDecisionSnapshot"("supplierId");
CREATE INDEX IF NOT EXISTS "ImportDecisionSnapshot_createdAt_idx"  ON "ImportDecisionSnapshot"("createdAt");

-- Foreign keys
ALTER TABLE "ImportDecisionSnapshot"
  ADD CONSTRAINT "ImportDecisionSnapshot_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "ImportDecisionSnapshot_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "ImportDecisionSnapshot_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL;

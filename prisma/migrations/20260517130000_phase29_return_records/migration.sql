-- Phase 29 — Order Ledger and Return Claims
-- Adds TrendyolReturnRecord table for storing Trendyol return/claim data locally.
-- One row per (claimId, orderLineId) pair.
-- Non-destructive additive migration.

CREATE TABLE "TrendyolReturnRecord" (
    "id"           TEXT NOT NULL,
    "claimId"      TEXT NOT NULL,
    "orderLineId"  INTEGER NOT NULL,
    "productId"    TEXT,
    "orderNumber"  TEXT NOT NULL,
    "orderDate"    TIMESTAMP(3) NOT NULL,
    "claimDate"    TIMESTAMP(3) NOT NULL,
    "status"       TEXT NOT NULL,
    "reasonName"   TEXT,
    "reasonCode"   TEXT,
    "productName"  TEXT NOT NULL,
    "barcode"      TEXT,
    "merchantSku"  TEXT,
    "unitPriceTry" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "syncedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrendyolReturnRecord_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one row per claim × line
CREATE UNIQUE INDEX "TrendyolReturnRecord_claimId_orderLineId_key"
    ON "TrendyolReturnRecord"("claimId", "orderLineId");

-- Performance indexes
CREATE INDEX "TrendyolReturnRecord_productId_idx"    ON "TrendyolReturnRecord"("productId");
CREATE INDEX "TrendyolReturnRecord_claimDate_idx"    ON "TrendyolReturnRecord"("claimDate");
CREATE INDEX "TrendyolReturnRecord_orderNumber_idx"  ON "TrendyolReturnRecord"("orderNumber");
CREATE INDEX "TrendyolReturnRecord_status_idx"       ON "TrendyolReturnRecord"("status");

-- FK to Product (nullable — unmatched rows stay for audit)
ALTER TABLE "TrendyolReturnRecord"
    ADD CONSTRAINT "TrendyolReturnRecord_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

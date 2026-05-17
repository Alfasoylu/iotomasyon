-- Phase 26: Product Performance Ranking
-- Adds TrendyolSalesRecord table for per-order-line sales data synced from Trendyol API.
-- All operations are additive. No existing data is modified.

CREATE TABLE "TrendyolSalesRecord" (
  "id"            TEXT NOT NULL,
  "orderId"       TEXT NOT NULL,
  "lineId"        INTEGER NOT NULL,
  "productId"     TEXT,
  "orderDate"     TIMESTAMP(3) NOT NULL,
  "status"        TEXT NOT NULL,
  "merchantSku"   TEXT,
  "barcode"       TEXT,
  "productName"   TEXT NOT NULL,
  "quantity"      INTEGER NOT NULL,
  "unitPriceTry"  DECIMAL(15,2) NOT NULL,
  "totalPriceTry" DECIMAL(15,2) NOT NULL,
  "syncedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrendyolSalesRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TrendyolSalesRecord_orderId_lineId_key"
  ON "TrendyolSalesRecord"("orderId", "lineId");

CREATE INDEX "TrendyolSalesRecord_productId_idx"
  ON "TrendyolSalesRecord"("productId");

CREATE INDEX "TrendyolSalesRecord_orderDate_idx"
  ON "TrendyolSalesRecord"("orderDate");

CREATE INDEX "TrendyolSalesRecord_merchantSku_idx"
  ON "TrendyolSalesRecord"("merchantSku");

CREATE INDEX "TrendyolSalesRecord_barcode_idx"
  ON "TrendyolSalesRecord"("barcode");

ALTER TABLE "TrendyolSalesRecord"
  ADD CONSTRAINT "TrendyolSalesRecord_productId_fkey"
  FOREIGN KEY ("productId")
  REFERENCES "Product"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

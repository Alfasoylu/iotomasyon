-- Phase 92 — Generic MarketplaceSalesRecord for Entegra historical export
-- 14 channel discriminator: TRENDYOL, HEPSIBURADA, N11, IDEASOFT, GG, PAZARAMA,
-- EPTT, MIRAKL_KOCTAS, IDEFIX, AMAZON, CICEKSEPETI, TEMU, MIRAKL_TEKNOSA,
-- SHOPPHP, MANUAL.
--
-- Trendyol API'sinden gelen kayıtlar TrendyolSalesRecord'da kalır; Excel
-- yüklerken existing Trendyol orderId'leri atlanır (no double count).

CREATE TABLE IF NOT EXISTS "MarketplaceSalesRecord" (
  "id" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "orderNumber" TEXT NOT NULL,
  "platformRef" TEXT,
  "externalLineId" TEXT,
  "orderDate" TIMESTAMP(3) NOT NULL,
  "status" TEXT,
  "productName" TEXT,
  "productCode" TEXT,
  "modelNumber" TEXT,
  "storeStockName" TEXT,
  "productId" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "grossAmountTry" DECIMAL(15,2),
  "vatAmountTry" DECIMAL(15,2),
  "totalAmountTry" DECIMAL(15,2),
  "commissionTry" DECIMAL(15,2),
  "commissionPct" DECIMAL(5,2),
  "platformPaymentTry" DECIMAL(15,2),
  "customerCode" TEXT,
  "customerFirma" TEXT,
  "customerInvoiceName" TEXT,
  "customerVergiNo" TEXT,
  "customerTcKimlik" TEXT,
  "customerVergiDairesi" TEXT,
  "customerCity" TEXT,
  "cargoCompany" TEXT,
  "cargoTrackingNo" TEXT,
  "desiTotal" DECIMAL(8,2),
  "customerId" TEXT,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketplaceSalesRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MarketplaceSalesRecord_channel_orderNumber_externalLineId_key"
  ON "MarketplaceSalesRecord"("channel", "orderNumber", "externalLineId");

CREATE INDEX IF NOT EXISTS "MarketplaceSalesRecord_channel_idx" ON "MarketplaceSalesRecord"("channel");
CREATE INDEX IF NOT EXISTS "MarketplaceSalesRecord_orderDate_idx" ON "MarketplaceSalesRecord"("orderDate");
CREATE INDEX IF NOT EXISTS "MarketplaceSalesRecord_productId_idx" ON "MarketplaceSalesRecord"("productId");
CREATE INDEX IF NOT EXISTS "MarketplaceSalesRecord_customerId_idx" ON "MarketplaceSalesRecord"("customerId");
CREATE INDEX IF NOT EXISTS "MarketplaceSalesRecord_customerVergiNo_idx" ON "MarketplaceSalesRecord"("customerVergiNo");
CREATE INDEX IF NOT EXISTS "MarketplaceSalesRecord_customerCity_idx" ON "MarketplaceSalesRecord"("customerCity");
CREATE INDEX IF NOT EXISTS "MarketplaceSalesRecord_status_idx" ON "MarketplaceSalesRecord"("status");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MarketplaceSalesRecord_productId_fkey') THEN
    ALTER TABLE "MarketplaceSalesRecord"
      ADD CONSTRAINT "MarketplaceSalesRecord_productId_fkey"
      FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'MarketplaceSalesRecord_customerId_fkey') THEN
    ALTER TABLE "MarketplaceSalesRecord"
      ADD CONSTRAINT "MarketplaceSalesRecord_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Customer_taxNumber_idx" ON "Customer"("taxNumber");

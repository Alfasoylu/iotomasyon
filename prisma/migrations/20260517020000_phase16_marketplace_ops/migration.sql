-- Phase 16: Marketplace Operations Expansion
-- Adds:
--   1. Product.unitCostUsd (nullable Decimal, USD unit cost for import-priced products)
--   2. MarketplaceProductMapping (many marketplace identities -> one internal product)
--   3. MarketplaceQuestionActionLog (audit log for Q&A answers sent to Trendyol)
--   4. MarketplaceReturnActionLog (audit log for claim approve/reject actions)
--   5. MonthlyExchangeRate (historical USD/TRY rates for per-order profit calculation)

-- 1. Add unitCostUsd to Product (do NOT touch unitCostTry)
ALTER TABLE "Product" ADD COLUMN "unitCostUsd" DECIMAL;

-- 2. MarketplaceProductMapping
CREATE TABLE "MarketplaceProductMapping" (
  "id"                TEXT NOT NULL,
  "platform"          "MarketplacePlatform" NOT NULL,
  "platformProductId" TEXT,
  "platformListingId" TEXT,
  "platformBarcode"   TEXT,
  "platformSku"       TEXT,
  "platformTitle"     TEXT,
  "productId"         TEXT NOT NULL,
  "confidence"        TEXT NOT NULL DEFAULT 'MANUAL',
  "isManual"          BOOLEAN NOT NULL DEFAULT TRUE,
  "createdById"       TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketplaceProductMapping_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketplaceProductMapping_platform_idx" ON "MarketplaceProductMapping"("platform");
CREATE INDEX "MarketplaceProductMapping_productId_idx" ON "MarketplaceProductMapping"("productId");
CREATE INDEX "MarketplaceProductMapping_platform_barcode_idx" ON "MarketplaceProductMapping"("platform", "platformBarcode");
CREATE INDEX "MarketplaceProductMapping_platform_sku_idx" ON "MarketplaceProductMapping"("platform", "platformSku");
CREATE INDEX "MarketplaceProductMapping_platform_listingId_idx" ON "MarketplaceProductMapping"("platform", "platformListingId");

ALTER TABLE "MarketplaceProductMapping"
  ADD CONSTRAINT "MarketplaceProductMapping_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MarketplaceProductMapping"
  ADD CONSTRAINT "MarketplaceProductMapping_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. MarketplaceQuestionActionLog
CREATE TABLE "MarketplaceQuestionActionLog" (
  "id"             TEXT NOT NULL,
  "platform"       TEXT NOT NULL DEFAULT 'TRENDYOL',
  "questionId"     TEXT NOT NULL,
  "actionType"     TEXT NOT NULL DEFAULT 'ANSWERED',
  "answerText"     TEXT,
  "userId"         TEXT,
  "responseStatus" TEXT NOT NULL,
  "errorMessage"   TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketplaceQuestionActionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketplaceQuestionActionLog_questionId_idx" ON "MarketplaceQuestionActionLog"("questionId");
CREATE INDEX "MarketplaceQuestionActionLog_platform_idx" ON "MarketplaceQuestionActionLog"("platform");
CREATE INDEX "MarketplaceQuestionActionLog_userId_idx" ON "MarketplaceQuestionActionLog"("userId");
CREATE INDEX "MarketplaceQuestionActionLog_createdAt_idx" ON "MarketplaceQuestionActionLog"("createdAt");

ALTER TABLE "MarketplaceQuestionActionLog"
  ADD CONSTRAINT "MarketplaceQuestionActionLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. MarketplaceReturnActionLog
CREATE TABLE "MarketplaceReturnActionLog" (
  "id"             TEXT NOT NULL,
  "platform"       TEXT NOT NULL DEFAULT 'TRENDYOL',
  "claimId"        TEXT NOT NULL,
  "claimItemId"    TEXT,
  "actionType"     TEXT NOT NULL,
  "reasonCode"     TEXT,
  "note"           TEXT,
  "userId"         TEXT,
  "responseStatus" TEXT NOT NULL,
  "errorMessage"   TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketplaceReturnActionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketplaceReturnActionLog_claimId_idx" ON "MarketplaceReturnActionLog"("claimId");
CREATE INDEX "MarketplaceReturnActionLog_platform_idx" ON "MarketplaceReturnActionLog"("platform");
CREATE INDEX "MarketplaceReturnActionLog_userId_idx" ON "MarketplaceReturnActionLog"("userId");
CREATE INDEX "MarketplaceReturnActionLog_createdAt_idx" ON "MarketplaceReturnActionLog"("createdAt");

ALTER TABLE "MarketplaceReturnActionLog"
  ADD CONSTRAINT "MarketplaceReturnActionLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. MonthlyExchangeRate
CREATE TABLE "MonthlyExchangeRate" (
  "id"         TEXT NOT NULL,
  "year"       INTEGER NOT NULL,
  "month"      INTEGER NOT NULL,
  "usdTryRate" DECIMAL NOT NULL,
  "note"       TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MonthlyExchangeRate_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MonthlyExchangeRate_year_month_key" UNIQUE ("year", "month")
);

CREATE INDEX "MonthlyExchangeRate_year_month_idx" ON "MonthlyExchangeRate"("year", "month");

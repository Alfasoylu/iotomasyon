-- Phase 11A — XML Product Foundation
-- Additive migration: no existing data is modified or deleted.

-- 1. ProductKind enum
CREATE TYPE "ProductKind" AS ENUM ('MAIN_STOCK', 'LISTING_PACKAGE');

-- 2. Product table additions
ALTER TABLE "Product"
  ADD COLUMN "xmlImported"   BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN "productKind"   "ProductKind" NOT NULL DEFAULT 'MAIN_STOCK',
  ADD COLUMN "mainProductId" TEXT;

-- 3. Self-referential FK for product hierarchy
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_mainProductId_fkey"
  FOREIGN KEY ("mainProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. XmlSyncLog: add recordsCreated column
ALTER TABLE "XmlSyncLog"
  ADD COLUMN "recordsCreated" INTEGER NOT NULL DEFAULT 0;

-- 5. ProductImage table
CREATE TABLE "ProductImage" (
  "id"        TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "url"       TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "source"    TEXT NOT NULL DEFAULT 'XML',
  "altText"   TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ProductImage"
  ADD CONSTRAINT "ProductImage_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. XmlProductData table
CREATE TABLE "XmlProductData" (
  "id"                    TEXT NOT NULL,
  "productId"             TEXT NOT NULL,
  "sourceId"              TEXT,
  "xmlSku"                TEXT NOT NULL,
  "xmlName"               TEXT,
  "xmlBrand"              TEXT,
  "xmlUrunTipi"           TEXT,
  "xmlCurrencyType"       TEXT,
  "xmlKdv"                DECIMAL(65,30),
  "xmlDateChange"         TEXT,
  "xmlDateAdd"            TEXT,
  "xmlAnaUrunKodu"        TEXT,
  "xmlPrice4"             DECIMAL(65,30),
  "xmlTrendyolPrice"      DECIMAL(65,30),
  "xmlHbPrice"            DECIMAL(65,30),
  "xmlAmazonPrice"        DECIMAL(65,30),
  "xmlPazaramaPrice"      DECIMAL(65,30),
  "xmlIdefixPrice"        DECIMAL(65,30),
  "xmlBayiPrice"          DECIMAL(65,30),
  "xmlKoctasPrice"        DECIMAL(65,30),
  "xmlTeknosaPrice"       DECIMAL(65,30),
  "xmlTemuPrice"          DECIMAL(65,30),
  "xmlDescription"        TEXT,
  "xmlImage1"             TEXT,
  "xmlImage2"             TEXT,
  "xmlImage3"             TEXT,
  "xmlImage4"             TEXT,
  "xmlImage5"             TEXT,
  "firstSeenAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "missingFromLatestFeed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "XmlProductData_pkey"       PRIMARY KEY ("id"),
  CONSTRAINT "XmlProductData_productId_key" UNIQUE ("productId")
);

ALTER TABLE "XmlProductData"
  ADD CONSTRAINT "XmlProductData_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 7. Indexes
CREATE INDEX "Product_mainProductId_idx" ON "Product"("mainProductId");
CREATE INDEX "Product_productKind_idx"   ON "Product"("productKind");
CREATE INDEX "ProductImage_productId_sortOrder_idx" ON "ProductImage"("productId", "sortOrder");
CREATE INDEX "ProductImage_productId_idx"            ON "ProductImage"("productId");
CREATE INDEX "XmlProductData_xmlSku_idx"             ON "XmlProductData"("xmlSku");
CREATE INDEX "XmlProductData_lastSeenAt_idx"         ON "XmlProductData"("lastSeenAt");
CREATE INDEX "XmlProductData_missingFromLatestFeed_idx" ON "XmlProductData"("missingFromLatestFeed");

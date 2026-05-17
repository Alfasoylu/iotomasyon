-- Phase 49: XML Stok Değişim Logu
-- Tracks per-product stock quantity changes made by each XML sync run from Entegra ERP.

CREATE TABLE "XmlStockChangeLog" (
    "id"          TEXT NOT NULL,
    "productId"   TEXT NOT NULL,
    "syncLogId"   TEXT NOT NULL,
    "sourceId"    TEXT NOT NULL,
    "previousQty" INTEGER NOT NULL,
    "newQty"      INTEGER NOT NULL,
    "delta"       INTEGER NOT NULL,
    "syncedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XmlStockChangeLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "XmlStockChangeLog_productId_idx" ON "XmlStockChangeLog"("productId");
CREATE INDEX "XmlStockChangeLog_syncLogId_idx" ON "XmlStockChangeLog"("syncLogId");
CREATE INDEX "XmlStockChangeLog_sourceId_idx" ON "XmlStockChangeLog"("sourceId");
CREATE INDEX "XmlStockChangeLog_syncedAt_idx" ON "XmlStockChangeLog"("syncedAt");

ALTER TABLE "XmlStockChangeLog" ADD CONSTRAINT "XmlStockChangeLog_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

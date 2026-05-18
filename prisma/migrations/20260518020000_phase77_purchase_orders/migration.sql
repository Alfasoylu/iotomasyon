-- Phase 77: Satın Alma Siparişi (Purchase Order)
-- Additive migration — new enum + two new tables, no existing tables changed.

CREATE TYPE "PurchaseOrderStatus" AS ENUM (
  'DRAFT',
  'CONFIRMED',
  'ORDERED',
  'SHIPPED',
  'RECEIVED'
);

CREATE TABLE "PurchaseOrder" (
  "id"               TEXT NOT NULL,
  "orderNo"          TEXT NOT NULL,
  "supplierId"       TEXT,
  "status"           "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "shippingMethod"   TEXT,
  "orderDate"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "estimatedArrival" TIMESTAMP(3),
  "notes"            TEXT,
  "totalCostTry"     DECIMAL(14,2),
  "createdById"      TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PurchaseOrder_orderNo_key" ON "PurchaseOrder"("orderNo");
CREATE INDEX "PurchaseOrder_status_idx"    ON "PurchaseOrder"("status");
CREATE INDEX "PurchaseOrder_createdAt_idx" ON "PurchaseOrder"("createdAt");
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");

ALTER TABLE "PurchaseOrder"
  ADD CONSTRAINT "PurchaseOrder_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrder"
  ADD CONSTRAINT "PurchaseOrder_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PurchaseOrderItem" (
  "id"           TEXT NOT NULL,
  "orderId"      TEXT NOT NULL,
  "productId"    TEXT NOT NULL,
  "qty"          INTEGER NOT NULL,
  "unitCostRmb"  DECIMAL(12,4),
  "unitCostTry"  DECIMAL(12,2),
  "totalCostTry" DECIMAL(14,2),
  "notes"        TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PurchaseOrderItem_orderId_productId_key"
  ON "PurchaseOrderItem"("orderId", "productId");
CREATE INDEX "PurchaseOrderItem_orderId_idx"   ON "PurchaseOrderItem"("orderId");
CREATE INDEX "PurchaseOrderItem_productId_idx" ON "PurchaseOrderItem"("productId");

ALTER TABLE "PurchaseOrderItem"
  ADD CONSTRAINT "PurchaseOrderItem_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PurchaseOrderItem"
  ADD CONSTRAINT "PurchaseOrderItem_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON UPDATE CASCADE;

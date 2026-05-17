-- Phase 20 — Supplier Intelligence
-- Additive only: new tables Supplier and SupplierProduct

-- Supplier table: name, contact, country, payment terms, default lead time
CREATE TABLE "Supplier" (
    "id"              TEXT NOT NULL,
    "name"            TEXT NOT NULL,
    "contactName"     TEXT,
    "phone"           TEXT,
    "email"           TEXT,
    "countryOfOrigin" TEXT,
    "paymentTerms"    TEXT,
    "defaultLeadDays" INTEGER,
    "notes"           TEXT,
    "isActive"        BOOLEAN NOT NULL DEFAULT true,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Supplier_name_idx" ON "Supplier"("name");
CREATE INDEX "Supplier_isActive_idx" ON "Supplier"("isActive");

-- SupplierProduct join: one row per (supplier, product) pair
CREATE TABLE "SupplierProduct" (
    "id"          TEXT NOT NULL,
    "supplierId"  TEXT NOT NULL,
    "productId"   TEXT NOT NULL,
    "unitCostUsd" DECIMAL(65,30),
    "moq"         INTEGER,
    "leadDays"    INTEGER,
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "notes"       TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierProduct_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SupplierProduct"
    ADD CONSTRAINT "SupplierProduct_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierProduct"
    ADD CONSTRAINT "SupplierProduct_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "SupplierProduct_supplierId_productId_key" ON "SupplierProduct"("supplierId", "productId");
CREATE INDEX "SupplierProduct_supplierId_idx" ON "SupplierProduct"("supplierId");
CREATE INDEX "SupplierProduct_productId_idx" ON "SupplierProduct"("productId");
CREATE INDEX "SupplierProduct_isPreferred_idx" ON "SupplierProduct"("isPreferred");

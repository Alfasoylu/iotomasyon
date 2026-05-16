-- Phase 9: Sales Potential Engine
-- Adds per-channel monthly demand estimates to Product.

ALTER TABLE "Product"
  ADD COLUMN "onlineSalesPotential"    INTEGER,
  ADD COLUMN "wholesaleSalesPotential" INTEGER,
  ADD COLUMN "installerSalesPotential" INTEGER;

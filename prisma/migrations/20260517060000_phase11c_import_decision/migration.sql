-- Phase 11C — Import Decision System
-- Adds three product-level fields needed for air/sea freight economics:
--   weightKg          : product weight in kilograms (for freight cost formula)
--   customsRatePct    : Turkish customs duty rate as a percentage (e.g. 20 = 20%)
--   shippingMethodPref: owner preference override — 'AIR', 'SEA', or NULL (system decides)
--
-- All three are nullable — existing products are unaffected.
-- No destructive changes. Safe to apply on live production.

ALTER TABLE "Product" ADD COLUMN "weightKg" DECIMAL(10,3);
ALTER TABLE "Product" ADD COLUMN "customsRatePct" DECIMAL(5,2);
ALTER TABLE "Product" ADD COLUMN "shippingMethodPref" TEXT;

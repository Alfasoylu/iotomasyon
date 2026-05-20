-- Faz 2 — Catalog USD net prices (KDV hariç)
-- Sales rep katalog gönderdiğinde gösterilen USD bazlı, KDV hariç fiyatlar.
-- TRY alanları (sellingPriceTry, wholesalePriceTry) quote sistemi için dokunulmaz.

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "wholesalePriceUsd" DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "retailPriceUsd" DECIMAL(12, 2);

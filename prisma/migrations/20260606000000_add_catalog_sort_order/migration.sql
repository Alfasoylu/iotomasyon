-- Catalog sort order — admin'in ürün başına manuel sıralama vermesi için.
-- 1000 = otomatik (default — sıralamada eşit, stockQuantity desc + name asc ile bölünür)
-- 1-999 = manuel öncelik (küçük sayı önce listelenir)
ALTER TABLE "Product"
  ADD COLUMN "catalogSortOrder" INTEGER NOT NULL DEFAULT 1000;

-- Sıralama sorgusunda kullanılır (catalogSortOrder asc, sonra stockQuantity desc)
CREATE INDEX "Product_catalogSortOrder_idx" ON "Product"("catalogSortOrder");

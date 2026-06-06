-- Composite index'ler — 142k satırlık MarketplaceSalesRecord için critical query'ler.
-- 142k satır küçük olduğundan CREATE INDEX 1-2 saniyede tamamlanır, table lock kısa.
CREATE INDEX "MarketplaceSalesRecord_channel_orderDate_idx"
  ON "MarketplaceSalesRecord"("channel", "orderDate");

CREATE INDEX "MarketplaceSalesRecord_productId_orderDate_idx"
  ON "MarketplaceSalesRecord"("productId", "orderDate");

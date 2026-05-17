-- Phase 26 fix: Trendyol order line IDs exceed PostgreSQL INT range (max ~2.1B)
-- Widening INT to BIGINT is non-destructive — no data loss possible.
ALTER TABLE "TrendyolSalesRecord" ALTER COLUMN "lineId" TYPE BIGINT;

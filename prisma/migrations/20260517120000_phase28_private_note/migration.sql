-- Phase 28: Product Governance and Private Intelligence
-- Safe additive migration: adds nullable TEXT column — no data loss risk.
-- Owner-only private intelligence field (EXECUTIVE_READ permission required to read/write).

ALTER TABLE "Product" ADD COLUMN "privateNote" TEXT;

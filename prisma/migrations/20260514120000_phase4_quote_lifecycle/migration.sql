-- Phase 4: Quote lifecycle, WhatsApp CRM, customer last-contact tracking
-- Additive only — no existing columns/values removed.

-- 1. Extend QuoteStatus enum with new values
ALTER TYPE "QuoteStatus" ADD VALUE IF NOT EXISTS 'VIEWED';
ALTER TYPE "QuoteStatus" ADD VALUE IF NOT EXISTS 'WON';
ALTER TYPE "QuoteStatus" ADD VALUE IF NOT EXISTS 'LOST';

-- 2. Quote: validity date and sent timestamp
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "validityDate" TIMESTAMP(3);
ALTER TABLE "Quote" ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3);

-- 3. Customer: last WhatsApp contact timestamp (customer-level, not per-interest)
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "lastContactedAt" TIMESTAMP(3);

-- 4. Index on Quote.validityDate for expiry queries
CREATE INDEX IF NOT EXISTS "Quote_validityDate_idx" ON "Quote"("validityDate");

-- Phase 7: Campaign Conversion Tracking
-- Additive only: new enum values, new columns on OutreachRecipient. No existing data modified.

-- Extend RecipientStatus with conversion stages
-- ALTER TYPE ... ADD VALUE runs outside transaction (PostgreSQL 12+ handles inside txn fine)
ALTER TYPE "RecipientStatus" ADD VALUE IF NOT EXISTS 'REPLIED' AFTER 'SENT';
ALTER TYPE "RecipientStatus" ADD VALUE IF NOT EXISTS 'QUOTED'  AFTER 'REPLIED';
ALTER TYPE "RecipientStatus" ADD VALUE IF NOT EXISTS 'WON'     AFTER 'QUOTED';
ALTER TYPE "RecipientStatus" ADD VALUE IF NOT EXISTS 'LOST'    AFTER 'WON';

-- Add conversion tracking columns to OutreachRecipient
ALTER TABLE "OutreachRecipient"
  ADD COLUMN IF NOT EXISTS "repliedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "quoteId"   TEXT,
  ADD COLUMN IF NOT EXISTS "wonAmount" DECIMAL(65,30);

-- FK: recipient → quote (nullable, set null on quote delete)
ALTER TABLE "OutreachRecipient"
  ADD CONSTRAINT "OutreachRecipient_quoteId_fkey"
  FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE SET NULL NOT VALID;

-- Index for quote lookups
CREATE INDEX IF NOT EXISTS "OutreachRecipient_quoteId_idx" ON "OutreachRecipient"("quoteId");

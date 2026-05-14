-- Phase 6: WhatsApp Outreach Campaigns
-- Additive only: two new tables, two new enums. No existing tables modified.

DO $$ BEGIN
  CREATE TYPE "OutreachStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RecipientStatus" AS ENUM ('PENDING', 'OPENED', 'SENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "OutreachCampaign" (
    "id"          TEXT NOT NULL,
    "productId"   TEXT,
    "categoryId"  TEXT,
    "message"     TEXT NOT NULL,
    "offerText"   TEXT,
    "price"       DECIMAL(65,30),
    "currency"    TEXT NOT NULL DEFAULT 'TRY',
    "status"      "OutreachStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "OutreachRecipient" (
    "id"          TEXT NOT NULL,
    "campaignId"  TEXT NOT NULL,
    "customerId"  TEXT NOT NULL,
    "phone"       TEXT,
    "status"      "RecipientStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt"      TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachRecipient_pkey" PRIMARY KEY ("id")
);

-- Unique constraint
ALTER TABLE "OutreachRecipient"
  ADD CONSTRAINT "OutreachRecipient_campaignId_customerId_key"
  UNIQUE ("campaignId", "customerId");

-- Indexes
CREATE INDEX IF NOT EXISTS "OutreachCampaign_productId_idx"   ON "OutreachCampaign"("productId");
CREATE INDEX IF NOT EXISTS "OutreachCampaign_categoryId_idx"  ON "OutreachCampaign"("categoryId");
CREATE INDEX IF NOT EXISTS "OutreachCampaign_createdAt_idx"   ON "OutreachCampaign"("createdAt");
CREATE INDEX IF NOT EXISTS "OutreachRecipient_campaignId_idx" ON "OutreachRecipient"("campaignId");
CREATE INDEX IF NOT EXISTS "OutreachRecipient_customerId_idx" ON "OutreachRecipient"("customerId");

-- FKs (NOT VALID = no row scan on new tables; skips constraint check at creation time)
ALTER TABLE "OutreachCampaign"
  ADD CONSTRAINT "OutreachCampaign_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL NOT VALID;

ALTER TABLE "OutreachCampaign"
  ADD CONSTRAINT "OutreachCampaign_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "ProductCategory"("id") ON DELETE SET NULL NOT VALID;

ALTER TABLE "OutreachCampaign"
  ADD CONSTRAINT "OutreachCampaign_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL NOT VALID;

ALTER TABLE "OutreachRecipient"
  ADD CONSTRAINT "OutreachRecipient_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "OutreachCampaign"("id") ON DELETE CASCADE NOT VALID;

ALTER TABLE "OutreachRecipient"
  ADD CONSTRAINT "OutreachRecipient_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE NOT VALID;

-- Phase 98 — Customer.segment (B2B_RESELLER / INSTALLATION / MARKETPLACE)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CustomerSegment') THEN
    CREATE TYPE "CustomerSegment" AS ENUM ('B2B_RESELLER', 'INSTALLATION', 'MARKETPLACE');
  END IF;
END $$;

ALTER TABLE "Customer"
  ADD COLUMN IF NOT EXISTS "segment" "CustomerSegment";

CREATE INDEX IF NOT EXISTS "Customer_segment_idx" ON "Customer"("segment");

-- Backfill: mevcut müşterileri otomatik segment'e ata
UPDATE "Customer" SET "segment" = 'MARKETPLACE'
  WHERE "segment" IS NULL AND "source" LIKE 'Entegra import%';

UPDATE "Customer" SET "segment" = 'B2B_RESELLER'
  WHERE "segment" IS NULL
    AND "customerType" IN ('TOPTAN', 'GUVENLIK_SIRKETI', 'MAGAZA', 'ONLINE_SATICI');

UPDATE "Customer" SET "segment" = 'INSTALLATION'
  WHERE "segment" IS NULL
    AND "customerType" IN ('SITE_YONETICISI', 'PERAKENDE');

UPDATE "Customer" SET "segment" = 'B2B_RESELLER' WHERE "segment" IS NULL;

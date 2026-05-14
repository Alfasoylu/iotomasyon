-- CRM Extension: customer ownership (ownedById) + indexes
-- source column already exists as String? in baseline migration — no action needed.

ALTER TABLE "Customer"
  ADD COLUMN IF NOT EXISTS "ownedById" TEXT;

ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_ownedById_fkey"
  FOREIGN KEY ("ownedById") REFERENCES "User"("id") ON DELETE SET NULL NOT VALID;

CREATE INDEX IF NOT EXISTS "Customer_ownedById_idx" ON "Customer"("ownedById");
CREATE INDEX IF NOT EXISTS "Customer_source_idx"    ON "Customer"("source");

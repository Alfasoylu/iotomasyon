-- PDKS Faz 2 — tenant abonelik/deneme alanları (idempotent; Supabase SQL Editor).
-- prisma/migrations/20260625230000_pdks_tenant_subscription ile aynı; canlıya
-- güvenle birden çok kez çalıştırılabilir.
ALTER TABLE "pdks_tenants" ADD COLUMN IF NOT EXISTS "subscriptionStatus" TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE "pdks_tenants" ADD COLUMN IF NOT EXISTS "plan" TEXT;
ALTER TABLE "pdks_tenants" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "pdks_tenants" ADD COLUMN IF NOT EXISTS "currentPeriodEnd" TIMESTAMP(3);
ALTER TABLE "pdks_tenants" ADD COLUMN IF NOT EXISTS "ownerEmail" TEXT;

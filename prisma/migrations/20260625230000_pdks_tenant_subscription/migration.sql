-- PDKS Faz 2 — tenant abonelik/deneme alanları (additive)
ALTER TABLE "pdks_tenants" ADD COLUMN "subscriptionStatus" TEXT NOT NULL DEFAULT 'trial';
ALTER TABLE "pdks_tenants" ADD COLUMN "plan" TEXT;
ALTER TABLE "pdks_tenants" ADD COLUMN "trialEndsAt" TIMESTAMP(3);
ALTER TABLE "pdks_tenants" ADD COLUMN "currentPeriodEnd" TIMESTAMP(3);
ALTER TABLE "pdks_tenants" ADD COLUMN "ownerEmail" TEXT;

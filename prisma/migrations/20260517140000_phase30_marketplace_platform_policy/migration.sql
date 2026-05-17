-- Phase 30: Marketplace Platform Policy
-- Adds per-platform standard shipping cost and commission rate table.
-- Non-destructive additive migration.

CREATE TABLE "MarketplacePlatformPolicy" (
    "id"                    TEXT NOT NULL,
    "platform"              "MarketplacePlatform" NOT NULL,
    "standardShippingTry"   DECIMAL(10,2) NOT NULL DEFAULT 0,
    "standardCommissionPct" DECIMAL(5,2)  NOT NULL DEFAULT 20,
    "paymentFeePct"         DECIMAL(5,2)  NOT NULL DEFAULT 0,
    "returnReservePct"      DECIMAL(5,2)  NOT NULL DEFAULT 0,
    "vatPct"                DECIMAL(5,2)  NOT NULL DEFAULT 20,
    "notes"                 TEXT,
    "updatedAt"             TIMESTAMP(3) NOT NULL,
    "updatedById"           TEXT,
    CONSTRAINT "MarketplacePlatformPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketplacePlatformPolicy_platform_key"
    ON "MarketplacePlatformPolicy"("platform");

CREATE INDEX "MarketplacePlatformPolicy_platform_idx"
    ON "MarketplacePlatformPolicy"("platform");

ALTER TABLE "MarketplacePlatformPolicy"
    ADD CONSTRAINT "MarketplacePlatformPolicy_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

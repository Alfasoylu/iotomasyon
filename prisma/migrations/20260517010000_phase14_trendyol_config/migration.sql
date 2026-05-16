-- Phase 14 — Trendyol API Integration (READ ONLY)
-- Creates singleton TrendyolConfig table for API credentials

CREATE TABLE "TrendyolConfig" (
    "id"         TEXT         NOT NULL DEFAULT 'singleton',
    "supplierId" TEXT         NOT NULL DEFAULT '',
    "apiKey"     TEXT         NOT NULL DEFAULT '',
    "apiSecret"  TEXT         NOT NULL DEFAULT '',
    "isEnabled"  BOOLEAN      NOT NULL DEFAULT FALSE,
    "lastSyncAt" TIMESTAMP(3),
    "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TrendyolConfig_pkey" PRIMARY KEY ("id")
);

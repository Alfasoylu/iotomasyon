-- Phase 10: Capital Allocation Engine
-- Creates CapitalConfig table for admin-only capital settings.

CREATE TABLE "CapitalConfig" (
  "id"                    TEXT NOT NULL,
  "totalCapitalTry"       DECIMAL(65,30) NOT NULL,
  "reservePct"            DECIMAL(65,30) NOT NULL DEFAULT 20,
  "desiredTurnoverMonths" DECIMAL(65,30) NOT NULL DEFAULT 3,
  "updatedAt"             TIMESTAMP(3) NOT NULL,
  "updatedById"           TEXT,
  CONSTRAINT "CapitalConfig_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "CapitalConfig"
  ADD CONSTRAINT "CapitalConfig_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

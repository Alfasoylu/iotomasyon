-- Phase 11: XML Inventory Sync
-- Adds XmlSyncSource, XmlSyncLog tables and XmlSyncStatus enum.
-- Adds xmlLocked flag to Product for manual override protection.

CREATE TYPE "XmlSyncStatus" AS ENUM ('RUNNING', 'SUCCESS', 'PARTIAL', 'ERROR');

CREATE TABLE "XmlSyncSource" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "url"         TEXT NOT NULL,
  "isEnabled"   BOOLEAN NOT NULL DEFAULT true,
  "authHeader"  TEXT,
  "lastSyncAt"  TIMESTAMP(3),
  "lastStatus"  TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "XmlSyncSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "XmlSyncLog" (
  "id"             TEXT NOT NULL,
  "sourceId"       TEXT NOT NULL,
  "startedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt"    TIMESTAMP(3),
  "status"         "XmlSyncStatus" NOT NULL DEFAULT 'RUNNING',
  "recordsFound"   INTEGER NOT NULL DEFAULT 0,
  "recordsUpdated" INTEGER NOT NULL DEFAULT 0,
  "recordsSkipped" INTEGER NOT NULL DEFAULT 0,
  "errorMessage"   TEXT,
  CONSTRAINT "XmlSyncLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "XmlSyncLog_sourceId_idx" ON "XmlSyncLog"("sourceId");
CREATE INDEX "XmlSyncLog_startedAt_idx" ON "XmlSyncLog"("startedAt");

ALTER TABLE "XmlSyncLog"
  ADD CONSTRAINT "XmlSyncLog_sourceId_fkey"
  FOREIGN KEY ("sourceId") REFERENCES "XmlSyncSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Product"
  ADD COLUMN "xmlLocked" BOOLEAN NOT NULL DEFAULT false;

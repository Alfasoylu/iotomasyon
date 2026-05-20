-- Phase 95b — Çağrı Merkezi Sales Workspace v2 — Customer + SavedView

ALTER TABLE "Customer"
  ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "doNotCall" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "callAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastCallAttemptAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "shownInQueueCount" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "Customer_doNotCall_idx" ON "Customer"("doNotCall");
CREATE INDEX IF NOT EXISTS "Customer_shownInQueueCount_idx" ON "Customer"("shownInQueueCount");

CREATE TABLE IF NOT EXISTS "SavedView" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isShared" BOOLEAN NOT NULL DEFAULT false,
  "resource" TEXT NOT NULL,
  "filtersJson" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SavedView_userId_resource_idx" ON "SavedView"("userId", "resource");
CREATE INDEX IF NOT EXISTS "SavedView_isShared_resource_idx" ON "SavedView"("isShared", "resource");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SavedView_userId_fkey') THEN
    ALTER TABLE "SavedView"
      ADD CONSTRAINT "SavedView_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Phase 96d — WhatsApp / mesaj şablonları
CREATE TABLE IF NOT EXISTS "MessageTemplate" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'whatsapp',
  "category" TEXT,
  "body" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "usageCount" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "MessageTemplate_isActive_idx" ON "MessageTemplate"("isActive");
CREATE INDEX IF NOT EXISTS "MessageTemplate_channel_idx" ON "MessageTemplate"("channel");
CREATE INDEX IF NOT EXISTS "MessageTemplate_createdById_idx" ON "MessageTemplate"("createdById");

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'MessageTemplate_createdById_fkey'
  ) THEN
    ALTER TABLE "MessageTemplate"
      ADD CONSTRAINT "MessageTemplate_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

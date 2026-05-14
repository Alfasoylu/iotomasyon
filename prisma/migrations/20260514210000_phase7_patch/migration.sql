-- Phase 7 Patch: state machine enforcement, remove dead OPENED status
-- Additive-only on data. Recreates RecipientStatus enum without OPENED.

-- Safety guard: abort if any row still carries OPENED (should be zero — never set in code)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "OutreachRecipient" WHERE status::text = 'OPENED') THEN
    RAISE EXCEPTION 'Migration aborted: rows with status=OPENED exist. Resolve before running.';
  END IF;
END $$;

-- Recreate enum without OPENED
-- PostgreSQL does not support DROP VALUE; full type swap is required.
ALTER TYPE "RecipientStatus" RENAME TO "RecipientStatus_old";

CREATE TYPE "RecipientStatus" AS ENUM (
  'PENDING',
  'SENT',
  'REPLIED',
  'QUOTED',
  'WON',
  'LOST'
);

ALTER TABLE "OutreachRecipient"
  ALTER COLUMN "status" TYPE "RecipientStatus"
  USING "status"::text::"RecipientStatus";

DROP TYPE "RecipientStatus_old";

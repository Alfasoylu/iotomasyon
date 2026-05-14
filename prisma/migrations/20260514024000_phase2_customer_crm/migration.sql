-- Phase 2 Customer CRM
-- Extend the existing internal inventory workspace into customer CRM flows
-- without replacing the existing Product/User foundation.

CREATE TYPE "CustomerStatus" AS ENUM (
  'NEW',
  'CONTACTED',
  'QUOTED',
  'NEGOTIATING',
  'WON',
  'LOST'
);

CREATE TYPE "InterestStage" AS ENUM (
  'INTERESTED',
  'PRICE_SENT',
  'NEGOTIATING',
  'WAITING',
  'ORDERED',
  'CANCELLED'
);

CREATE TYPE "NoteType" AS ENUM (
  'NOTE',
  'CALL',
  'MEETING',
  'EMAIL',
  'WHATSAPP',
  'QUOTE'
);

CREATE TYPE "TaskPriority" AS ENUM (
  'LOW',
  'MEDIUM',
  'HIGH',
  'URGENT'
);

ALTER TABLE "Customer"
  ADD COLUMN "whatsapp" TEXT,
  ADD COLUMN "status" "CustomerStatus" NOT NULL DEFAULT 'NEW',
  ADD COLUMN "country" TEXT,
  ADD COLUMN "notes" TEXT;

ALTER TABLE "ProductInterest"
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'TRY',
  ADD COLUMN "stage" "InterestStage" NOT NULL DEFAULT 'INTERESTED';

ALTER TABLE "Note"
  ADD COLUMN "type" "NoteType" NOT NULL DEFAULT 'NOTE';

ALTER TYPE "TaskStatus" RENAME TO "TaskStatus_old";

CREATE TYPE "TaskStatus" AS ENUM (
  'OPEN',
  'DONE',
  'CANCELLED'
);

ALTER TABLE "FollowUpTask"
  ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "FollowUpTask"
  ALTER COLUMN "status" TYPE "TaskStatus"
  USING (
    CASE
      WHEN "status"::text = 'PENDING' THEN 'OPEN'::"TaskStatus"
      WHEN "status"::text = 'COMPLETED' THEN 'DONE'::"TaskStatus"
      WHEN "status"::text = 'CANCELLED' THEN 'CANCELLED'::"TaskStatus"
      ELSE 'OPEN'::"TaskStatus"
    END
  );

ALTER TABLE "FollowUpTask"
  ALTER COLUMN "status" SET DEFAULT 'OPEN',
  ADD COLUMN "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM';

DROP TYPE "TaskStatus_old";

CREATE INDEX "Customer_status_idx" ON "Customer"("status");
CREATE INDEX "ProductInterest_stage_idx" ON "ProductInterest"("stage");
CREATE INDEX "FollowUpTask_priority_idx" ON "FollowUpTask"("priority");

-- Additive only. No business/CFO data, views or functions are rewritten.
CREATE TABLE "cfo_run" (
  "id" TEXT PRIMARY KEY, "type" TEXT NOT NULL CHECK (type IN ('monitor','morning')),
  "status" TEXT NOT NULL, "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "period_key" TEXT NOT NULL, "idempotency_key" TEXT NOT NULL UNIQUE,
  "snapshot" JSONB, "snapshot_hash" TEXT, "trigger_reasons" JSONB NOT NULL,
  "schema_version" TEXT NOT NULL, "calculation_version" TEXT NOT NULL,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "finished_at" TIMESTAMP(3), "error" TEXT,
  "avoided_calls" INTEGER NOT NULL DEFAULT 0 CHECK (avoided_calls >= 0), "avoided_cost_try" DECIMAL(14,6)
);
CREATE INDEX "cfo_run_generated_at_idx" ON "cfo_run"("generated_at");
CREATE TABLE "cfo_insight" (
  "id" TEXT PRIMARY KEY, "run_id" TEXT NOT NULL REFERENCES "cfo_run"("id") ON DELETE RESTRICT,
  "severity" TEXT NOT NULL CHECK (severity IN ('info','warning','critical')),
  "category" TEXT NOT NULL CHECK (category IN ('margin','inventory','sales','cash','pricing','procurement','marketing','data_quality')),
  "entity_type" TEXT NOT NULL, "entity_id" TEXT NOT NULL, "fingerprint" TEXT NOT NULL, "cooldown_key" TEXT NOT NULL,
  "title" TEXT NOT NULL, "observation" TEXT NOT NULL, "recommendation" TEXT NOT NULL, "risk_if_ignored" TEXT NOT NULL,
  "financial_impact" DECIMAL(14,2), "financial_impact_type" TEXT, "impact_calculation" JSONB,
  "confidence" TEXT NOT NULL CHECK (confidence IN ('low','medium','high')),
  "evidence" JSONB NOT NULL, "status" TEXT NOT NULL DEFAULT 'open',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "reviewed_at" TIMESTAMP(3), "reviewed_by" TEXT,
  UNIQUE ("run_id","fingerprint")
);
CREATE INDEX "cfo_insight_cooldown_key_created_at_idx" ON "cfo_insight"("cooldown_key","created_at");
CREATE INDEX "cfo_insight_created_at_idx" ON "cfo_insight"("created_at");
CREATE TABLE "cfo_usage" (
  "id" TEXT PRIMARY KEY, "run_id" TEXT NOT NULL REFERENCES "cfo_run"("id") ON DELETE RESTRICT,
  "provider" TEXT NOT NULL, "model" TEXT NOT NULL, "input_tokens" INTEGER NOT NULL DEFAULT 0 CHECK(input_tokens >= 0),
  "output_tokens" INTEGER NOT NULL DEFAULT 0 CHECK(output_tokens >= 0), "cache_read_tokens" INTEGER NOT NULL DEFAULT 0,
  "cache_write_tokens" INTEGER NOT NULL DEFAULT 0, "estimated_cost" DECIMAL(14,6), "reserved_cost_try" DECIMAL(14,6),
  "currency" TEXT NOT NULL DEFAULT 'TRY', "trigger_reason" TEXT NOT NULL, "provider_request_id" TEXT,
  "status" TEXT NOT NULL, "price_context" JSONB, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "cfo_usage_created_at_status_idx" ON "cfo_usage"("created_at","status");
-- Existing Data API policy: deny-all; Prisma/agent trusted server role only.
ALTER TABLE "cfo_run" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cfo_insight" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cfo_usage" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "cfo_run", "cfo_insight", "cfo_usage" FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON TABLE "cfo_run", "cfo_insight", "cfo_usage" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON TABLE "cfo_run", "cfo_insight", "cfo_usage" FROM authenticated;
  END IF;
END $$;

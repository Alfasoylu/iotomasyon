-- AI CFO V1 — monitor/morning çalışma kaydı + AI bulguları + kullanım/fatura.
--
-- ⚠️ Yalnız additive. Mevcut CFO motoru, cfo_snapshot, cfo_question/cfo_note/
-- cfo_change_log ve /cfo/calisan deterministik döngüsü DEĞİŞMEZ. Bu üç tablo
-- yalnız bu modülün kendi denetim izini taşır; işletme kaydı/view/fonksiyon
-- yeniden yazılmaz.
--
-- AI_CFO_ENABLED / AI_CFO_MONITOR_ENABLED varsayılan kapalıyken buraya hiç
-- satır yazılmaz — bkz. lib/cfo-agent/config.ts.
--
-- Tümü idempotent (IF NOT EXISTS): migration iki kez koşarsa hata vermez.

CREATE TABLE IF NOT EXISTS "cfo_run" (
  "id"                 TEXT NOT NULL,
  "type"               TEXT NOT NULL,
  "status"             TEXT NOT NULL,
  "generatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "periodKey"          TEXT NOT NULL,
  "idempotencyKey"     TEXT NOT NULL,
  "snapshot"           JSONB,
  "snapshotHash"       TEXT,
  "triggerReasons"     JSONB NOT NULL,
  "schemaVersion"      TEXT NOT NULL,
  "calculationVersion" TEXT NOT NULL,
  "startedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt"         TIMESTAMP(3),
  "error"              TEXT,
  "avoidedCalls"       INTEGER NOT NULL DEFAULT 0,
  "avoidedCostTry"     DECIMAL(14,6),
  CONSTRAINT "cfo_run_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cfo_run_type_check" CHECK ("type" IN ('monitor','morning')),
  CONSTRAINT "cfo_run_avoidedCalls_check" CHECK ("avoidedCalls" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "cfo_run_idempotencyKey_key" ON "cfo_run" ("idempotencyKey");
CREATE INDEX IF NOT EXISTS "cfo_run_generatedAt_idx" ON "cfo_run" ("generatedAt");

CREATE TABLE IF NOT EXISTS "cfo_insight" (
  "id"                  TEXT NOT NULL,
  "runId"               TEXT NOT NULL,
  "severity"            TEXT NOT NULL,
  "category"            TEXT NOT NULL,
  "entityType"          TEXT NOT NULL,
  "entityId"            TEXT NOT NULL,
  "fingerprint"         TEXT NOT NULL,
  "cooldownKey"         TEXT NOT NULL,
  "title"               TEXT NOT NULL,
  "observation"         TEXT NOT NULL,
  "recommendation"      TEXT NOT NULL,
  "riskIfIgnored"       TEXT NOT NULL,
  "financialImpact"     DECIMAL(14,2),
  "financialImpactType" TEXT,
  "impactCalculation"   JSONB,
  "confidence"          TEXT NOT NULL,
  "evidence"            JSONB NOT NULL,
  "status"              TEXT NOT NULL DEFAULT 'open',
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt"          TIMESTAMP(3),
  "reviewedBy"          TEXT,
  CONSTRAINT "cfo_insight_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cfo_insight_runId_fkey" FOREIGN KEY ("runId") REFERENCES "cfo_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cfo_insight_severity_check" CHECK ("severity" IN ('info','warning','critical')),
  CONSTRAINT "cfo_insight_category_check" CHECK ("category" IN ('margin','inventory','sales','cash','pricing','procurement','marketing','data_quality')),
  CONSTRAINT "cfo_insight_confidence_check" CHECK ("confidence" IN ('low','medium','high'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "cfo_insight_runId_fingerprint_key" ON "cfo_insight" ("runId", "fingerprint");
CREATE INDEX IF NOT EXISTS "cfo_insight_cooldownKey_createdAt_idx" ON "cfo_insight" ("cooldownKey", "createdAt");
CREATE INDEX IF NOT EXISTS "cfo_insight_createdAt_idx" ON "cfo_insight" ("createdAt");

CREATE TABLE IF NOT EXISTS "cfo_usage" (
  "id"                 TEXT NOT NULL,
  "runId"              TEXT NOT NULL,
  "provider"           TEXT NOT NULL,
  "model"              TEXT NOT NULL,
  "inputTokens"        INTEGER NOT NULL DEFAULT 0,
  "outputTokens"       INTEGER NOT NULL DEFAULT 0,
  "cacheReadTokens"    INTEGER NOT NULL DEFAULT 0,
  "cacheWriteTokens"   INTEGER NOT NULL DEFAULT 0,
  "estimatedCost"      DECIMAL(14,6),
  "reservedCostTry"    DECIMAL(14,6),
  "currency"           TEXT NOT NULL DEFAULT 'TRY',
  "triggerReason"      TEXT NOT NULL,
  "providerRequestId"  TEXT,
  "status"             TEXT NOT NULL,
  "priceContext"       JSONB,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cfo_usage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cfo_usage_runId_fkey" FOREIGN KEY ("runId") REFERENCES "cfo_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cfo_usage_inputTokens_check" CHECK ("inputTokens" >= 0),
  CONSTRAINT "cfo_usage_outputTokens_check" CHECK ("outputTokens" >= 0)
);

CREATE INDEX IF NOT EXISTS "cfo_usage_createdAt_status_idx" ON "cfo_usage" ("createdAt", "status");

-- RLS deny-all: repo değişmezi (20260613000000 / 20260913235000 / 20260918190000
-- / 20260922160000 ile aynı desen). Politika BİLEREK eklenmiyor — tüm erişim
-- Prisma üzerinden `postgres` rolüyle ve o rol rolbypassrls taşıyor.
ALTER TABLE "cfo_run" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cfo_insight" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cfo_usage" ENABLE ROW LEVEL SECURITY;

-- CFO soru-cevap defteri: CFO sorularını buradan sorar, Alperen buradan cevaplar.
-- Cevaplar sistemde kalıcı olur; sohbet geçmişine bağımlılık biter.

CREATE TABLE IF NOT EXISTS "cfo_question" (
  "id"          TEXT NOT NULL,
  "askedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "question"    TEXT NOT NULL,
  "why"         TEXT,
  "area"        TEXT NOT NULL DEFAULT 'diger',
  "priority"    INTEGER NOT NULL DEFAULT 3,
  "status"      TEXT NOT NULL DEFAULT 'ACIK',
  "answer"      TEXT,
  "answeredAt"  TIMESTAMP(3),
  "answeredBy"  TEXT,
  "processedAt" TIMESTAMP(3),
  "processNote" TEXT,
  CONSTRAINT "cfo_question_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "cfo_question_file" (
  "id"         TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "url"        TEXT NOT NULL,
  "fileName"   TEXT NOT NULL,
  "mimeType"   TEXT,
  "sizeBytes"  INTEGER,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cfo_question_file_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "cfo_question_status_priority_idx" ON "cfo_question"("status", "priority");
CREATE INDEX IF NOT EXISTS "cfo_question_askedAt_idx" ON "cfo_question"("askedAt");
CREATE INDEX IF NOT EXISTS "cfo_question_file_questionId_idx" ON "cfo_question_file"("questionId");

DO $$ BEGIN
  ALTER TABLE "cfo_question_file"
    ADD CONSTRAINT "cfo_question_file_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "cfo_question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

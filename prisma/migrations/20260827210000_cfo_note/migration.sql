-- CFO Not Defteri: cevaplardan çıkan kalıcı bilgiler.
-- Amaç: aynı soruyu ikinci kez sormamak. Bilgi değişirse not güncellenir,
-- eski değeri cfo_change_log'a yazılır; gereksizleşirse arşivlenir, silinmez.
CREATE TABLE "cfo_note" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'diger',
    "dataTag" TEXT NOT NULL DEFAULT 'KESIN',
    "source" TEXT,
    "sourceQuestionId" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "reviewBy" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cfo_note_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cfo_note_archivedAt_pinned_category_idx" ON "cfo_note"("archivedAt", "pinned", "category");
CREATE INDEX "cfo_note_sourceQuestionId_idx" ON "cfo_note"("sourceQuestionId");

ALTER TABLE "cfo_note" ADD CONSTRAINT "cfo_note_sourceQuestionId_fkey"
    FOREIGN KEY ("sourceQuestionId") REFERENCES "cfo_question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

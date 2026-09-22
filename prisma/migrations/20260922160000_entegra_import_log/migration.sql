-- Entegra satış yükleme günlüğü.
--
-- Her onaylanmış yükleme buraya bir satır yazar: kim, ne zaman, hangi dosya,
-- kaç satır, kaç yeni/güncellenen/atlanan, dosyadaki tarih aralığı.
-- Önizleme (yazma yapmayan adım) kayıt AÇMAZ — yalnız uygulanan yükleme.
--
-- Tümü idempotent (IF NOT EXISTS): migration iki kez koşarsa hata vermez.

CREATE TABLE IF NOT EXISTS "EntegraImportLog" (
  "id"            TEXT NOT NULL,
  "fileName"      TEXT NOT NULL,
  "fileHash"      TEXT NOT NULL,
  "rowCount"      INTEGER NOT NULL,
  "createdCount"  INTEGER NOT NULL,
  "updatedCount"  INTEGER NOT NULL,
  "skippedCount"  INTEGER NOT NULL,
  "dateFrom"      TIMESTAMP(3),
  "dateTo"        TIMESTAMP(3),
  "durationMs"    INTEGER NOT NULL,
  -- Kullanıcıya YABANCI ANAHTAR YOK: kullanıcı silinse bile yüklemeyi kimin
  -- yaptığı kaydı durmalı (denetim izi). E-posta o an kopyalanır.
  "userId"        TEXT,
  "userEmail"     TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EntegraImportLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "EntegraImportLog_createdAt_idx"
  ON "EntegraImportLog" ("createdAt");

-- RLS deny-all: repo değişmezi (20260613000000 / 20260913235000 / 20260918190000
-- ile aynı desen). Politika BİLEREK eklenmiyor — tüm erişim Prisma üzerinden
-- `postgres` rolüyle ve o rol rolbypassrls taşıyor. Politikasız RLS, Supabase
-- anon/authenticated anahtarlarına tabloyu tamamen kapatır.
ALTER TABLE "EntegraImportLog" ENABLE ROW LEVEL SECURITY;

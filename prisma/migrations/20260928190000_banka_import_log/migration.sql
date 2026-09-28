-- Banka hareketleri yükleme günlüğü.
--
-- Her onaylanmış yükleme buraya bir satır yazar: kim, ne zaman, hangi banka/
-- dosya, kaç satır, kaç eklendi/atlandı, dosyadaki tarih aralığı, dosyanın
-- son satırındaki bakiye. Önizleme (yazma yapmayan adım) kayıt AÇMAZ.
--
-- ⚠️ Bu migration `cfo_banka_hareket`'e DOKUNMAZ — o tablo CFO tarafından
-- Supabase'de zaten açıldı ve şemasına migration ile dokunulmayacak (görev
-- şartı). Bu tablo yalnız `BankaImportLog`; `id` bigserial, çünkü
-- `cfo_banka_hareket.import_id` bu değeri (gerçek bir FK olmadan) taşır.
--
-- Tümü idempotent (IF NOT EXISTS): migration iki kez koşarsa hata vermez.

CREATE TABLE IF NOT EXISTS "BankaImportLog" (
  "id"             BIGSERIAL NOT NULL,
  "banka"          TEXT NOT NULL,
  "fileName"       TEXT NOT NULL,
  "rowCount"       INTEGER NOT NULL,
  "addedCount"     INTEGER NOT NULL,
  "skippedCount"   INTEGER NOT NULL,
  "dateFrom"       TIMESTAMP(3),
  "dateTo"         TIMESTAMP(3),
  "fileBalanceTry" DECIMAL(14,2),
  -- Kullanıcıya YABANCI ANAHTAR YOK: kullanıcı silinse bile yüklemeyi kimin
  -- yaptığı kaydı durmalı (denetim izi). E-posta o an kopyalanır.
  "userId"         TEXT,
  "userEmail"      TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankaImportLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BankaImportLog_createdAt_idx"
  ON "BankaImportLog" ("createdAt");

CREATE INDEX IF NOT EXISTS "BankaImportLog_banka_idx"
  ON "BankaImportLog" ("banka");

-- RLS deny-all: repo değişmezi (20260613000000 / 20260913235000 / 20260918190000
-- / 20260922160000 ile aynı desen). Politika BİLEREK eklenmiyor — tüm erişim
-- Prisma üzerinden `postgres` rolüyle ve o rol rolbypassrls taşıyor.
ALTER TABLE "BankaImportLog" ENABLE ROW LEVEL SECURITY;

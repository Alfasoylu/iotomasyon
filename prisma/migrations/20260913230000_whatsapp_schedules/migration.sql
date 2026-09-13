-- WhatsApp zamanlanmış mesajlar + soru/cevap bağı
-- SALT EKLEME: bir tablo iki yeni tablo, WhatsAppMessage'a üç yeni kolon.
-- Mevcut kolonlar değişmiyor, hiçbir veri silinmiyor.

-- ── Zamanlanmış görev ───────────────────────────────────────────────────────
-- "Depoya her sabah 08:30'da: işe başladınız mı?"
--
-- Saat Europe/Istanbul YEREL saatidir. UTC saklamak yaz saati degisiminde
-- mesaji bir saat kaydirirdi; "her sabah 08:30" kullanici icin yerel bir vaat.
CREATE TABLE "WhatsAppSchedule" (
    "id"             TEXT NOT NULL,
    "name"           TEXT NOT NULL,
    -- Onayli sablon adi. BOSSA serbest metin gonderilir; o da yalnizca alici
    -- son 24 saatte yazmissa calisir. Sabah yoklamasinda pencere KAPALI olur,
    -- yani isletme baslatimli mesajda sablon fiilen zorunludur.
    "templateName"   TEXT,
    "templateLang"   TEXT,
    "templateParams" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "body"           TEXT NOT NULL,
    "hour"           INTEGER NOT NULL,
    "minute"         INTEGER NOT NULL DEFAULT 0,
    -- 0=Pazar … 6=Cumartesi. Bos dizi = her gun.
    "daysOfWeek"     INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "expectsReply"   BOOLEAN NOT NULL DEFAULT true,
    "isActive"       BOOLEAN NOT NULL DEFAULT true,
    -- En son calistigi Istanbul yerel gunu ("2026-09-14"). MUKERRER FRENI:
    -- harici zamanlayici saat basi cagirdigi icin bu damga olmasa ayni yoklama
    -- gun icinde defalarca giderdi (ve her biri ayrica ucretlenirdi).
    "lastRunOn"      TEXT,
    "lastRunAt"      TIMESTAMP(3),
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WhatsAppSchedule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WhatsAppSchedule_isActive_idx" ON "WhatsAppSchedule"("isActive");

-- ── Görev ↔ alıcı bağı ──────────────────────────────────────────────────────
CREATE TABLE "WhatsAppScheduleRecipient" (
    "scheduleId" TEXT NOT NULL,
    "contactId"  TEXT NOT NULL,
    CONSTRAINT "WhatsAppScheduleRecipient_pkey" PRIMARY KEY ("scheduleId", "contactId")
);

CREATE INDEX "WhatsAppScheduleRecipient_contactId_idx" ON "WhatsAppScheduleRecipient"("contactId");

-- RESTRICT (CASCADE DEGIL): docs/AI-RULES.md + MIGRATION-SAFETY.md cascade icin
-- acik onay istiyor. Bagin kaldirilmasi gorevi/kisiyi silmenin parcasi oldugu
-- icin uygulama tarafinda tek transaction'da yapilir.
ALTER TABLE "WhatsAppScheduleRecipient"
  ADD CONSTRAINT "WhatsAppScheduleRecipient_scheduleId_fkey"
  FOREIGN KEY ("scheduleId") REFERENCES "WhatsAppSchedule"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WhatsAppScheduleRecipient"
  ADD CONSTRAINT "WhatsAppScheduleRecipient_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "WhatsAppContact"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Mesaja zamanlama + cevap bağı ───────────────────────────────────────────
-- Hepsi nullable / DEFAULT'lu: mevcut satirlar icin backfill GEREKMEZ.
ALTER TABLE "WhatsAppMessage" ADD COLUMN "scheduleId"    TEXT;
ALTER TABLE "WhatsAppMessage" ADD COLUMN "awaitingReply" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WhatsAppMessage" ADD COLUMN "replyToId"     TEXT;

-- Bir soruya YALNIZ BIR cevap baglanir. Tekillik olmasa ayni soru birden cok
-- cevaba baglanir ve "cevaplandi mi" sorusu belirsizlesirdi.
CREATE UNIQUE INDEX "WhatsAppMessage_replyToId_key" ON "WhatsAppMessage"("replyToId");
CREATE INDEX "WhatsAppMessage_scheduleId_createdAt_idx" ON "WhatsAppMessage"("scheduleId", "createdAt");
-- "Cevap bekleyenler" sorgusu: webhook HER gelen mesajda calistirir.
CREATE INDEX "WhatsAppMessage_contactId_awaitingReply_idx" ON "WhatsAppMessage"("contactId", "awaitingReply");

-- SET NULL: gorev silinince mesaj GECMISI durur, yalnizca bagi kopar.
-- Gecmisi silmek "o soruyu sormustuk, cevabi neydi" sorusunu cevapsiz birakirdi.
ALTER TABLE "WhatsAppMessage"
  ADD CONSTRAINT "WhatsAppMessage_scheduleId_fkey"
  FOREIGN KEY ("scheduleId") REFERENCES "WhatsAppSchedule"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WhatsAppMessage"
  ADD CONSTRAINT "WhatsAppMessage_replyToId_fkey"
  FOREIGN KEY ("replyToId") REFERENCES "WhatsAppMessage"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS degismez kural (docs/MIGRATION-SAFETY.md): her yeni public tabloda,
-- olusturan migration'in icinde acilir. Politika EKLENMEZ — deny-all kalir.
ALTER TABLE "WhatsAppSchedule"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppScheduleRecipient" ENABLE ROW LEVEL SECURITY;

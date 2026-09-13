-- Faz 3 — WhatsApp mesajlaşma altyapısı
-- SALT EKLEME: yeni iki tablo. Mevcut hiçbir tablo/kolon değişmiyor.

-- Mesaj alıcıları. Personel/kullanıcı olmak zorunda değil (depocu, kurye,
-- tedarikçi). pdks_personnel'i bu iş için genişletmek o modeli bulanıklaştırırdı.
CREATE TABLE "WhatsAppContact" (
    "id"            TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    -- Normallestirilmis, ulke kodlu, rakam-only: 905321112233
    "phone"         TEXT NOT NULL,
    "label"         TEXT,
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    -- Son GELEN mesaj ani. 24 saatlik serbest metin penceresi buradan hesaplanir.
    "lastInboundAt" TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WhatsAppContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppContact_phone_key" ON "WhatsAppContact"("phone");
CREATE INDEX "WhatsAppContact_isActive_idx" ON "WhatsAppContact"("isActive");

-- Giden ve gelen her mesaj. Panelde gecmis, teshis ve cevap takibi buradan.
CREATE TABLE "WhatsAppMessage" (
    "id"           TEXT NOT NULL,
    "contactId"    TEXT NOT NULL,
    -- "OUT" (biz gonderdik) | "IN" (karsidan geldi)
    "direction"    TEXT NOT NULL,
    -- Meta'nin mesaj kimligi. TEKIL olmasi sart: Meta webhook'u yeniden
    -- gonderir; bu kisit olmasa ayni cevap defalarca kaydedilirdi.
    "waMessageId"  TEXT,
    "templateName" TEXT,
    "body"         TEXT NOT NULL,
    -- queued | sent | delivered | read | failed
    "status"       TEXT NOT NULL DEFAULT 'queued',
    "error"        TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppMessage_waMessageId_key" ON "WhatsAppMessage"("waMessageId");
CREATE INDEX "WhatsAppMessage_contactId_createdAt_idx" ON "WhatsAppMessage"("contactId", "createdAt");
CREATE INDEX "WhatsAppMessage_direction_createdAt_idx" ON "WhatsAppMessage"("direction", "createdAt");

-- RESTRICT (CASCADE DEGIL): mesaj gecmisi olan kisi silinemez. Gecmisi sessizce
-- silmek, "o soruyu sormustuk, cevabi neydi" sorusunu cevapsiz birakirdi.
-- CASCADE kullanimi docs/AI-RULES.md geregi acik onay ister.
ALTER TABLE "WhatsAppMessage"
  ADD CONSTRAINT "WhatsAppMessage_contactId_fkey"
  FOREIGN KEY ("contactId") REFERENCES "WhatsAppContact"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS degismez kural (docs/MIGRATION-SAFETY.md): her yeni public tabloda,
-- olusturan migration'in icinde acilir. Politika EKLENMEZ - deny-all kalir,
-- uygulama Prisma ile postgres rolunden baglandigi icin etkilenmez.
ALTER TABLE "WhatsAppContact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WhatsAppMessage" ENABLE ROW LEVEL SECURITY;

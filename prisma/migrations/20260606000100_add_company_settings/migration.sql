-- CompanySettings — singleton DB tablosu.
-- lib/company-settings.ts'teki mevcut hard-coded defaults bir kez seed olur,
-- sonra /admin/company-settings'ten düzenlenir.
CREATE TABLE "CompanySettings" (
  "id"                TEXT NOT NULL DEFAULT 'default',
  "companyName"       TEXT NOT NULL,
  "legalName"         TEXT NOT NULL,
  "tagline"           TEXT NOT NULL,
  "salesContact"      TEXT NOT NULL,
  "website"           TEXT NOT NULL,
  "email"             TEXT NOT NULL,
  "phone"             TEXT NOT NULL,
  "phoneSecondary"    TEXT NOT NULL,
  "address"           TEXT NOT NULL,
  "perpaAddress"      TEXT NOT NULL,
  "city"              TEXT NOT NULL,
  "district"          TEXT NOT NULL,
  "country"           TEXT NOT NULL,
  "taxOffice"         TEXT NOT NULL,
  "taxNumber"         TEXT NOT NULL,
  "bankName"          TEXT NOT NULL,
  "bankIban"          TEXT NOT NULL,
  "bankAccountHolder" TEXT NOT NULL,
  "bankAccountType"   TEXT NOT NULL,
  "paymentTerms"      TEXT NOT NULL,
  "deliveryTerms"     TEXT NOT NULL,
  "warrantyTerms"     TEXT NOT NULL,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CompanySettings_pkey" PRIMARY KEY ("id")
);

-- Seed mevcut defaults
INSERT INTO "CompanySettings" (
  "id", "companyName", "legalName", "tagline", "salesContact",
  "website", "email", "phone", "phoneSecondary",
  "address", "perpaAddress", "city", "district", "country",
  "taxOffice", "taxNumber",
  "bankName", "bankIban", "bankAccountHolder", "bankAccountType",
  "paymentTerms", "deliveryTerms", "warrantyTerms"
) VALUES (
  'default',
  'ALFA SOYLU ELEKTRONİK',
  'ALFA SOYLU ELEKTRONİK BASIM VE İNŞAAT SANAYİ TİCARET LİMİTED ŞİRKETİ',
  'Güvenlik Kameraları ve Elektronik Sistemler · Toptan + Montaj',
  'Satış Departmanı',
  'soyluelektronik.com',
  'destek@soyluelektronik.com',
  '0850 307 7397',
  '0543 871 6900',
  'Yedikule Çırpıcı Yolu Cad., Maltepe Mh., Topkapı Tic. Merkezi 2. Kısım No:4, Cevizlibağ, Zeytinburnu / İstanbul',
  'Perpa Ticaret Merkezi A Blok Kat:8 No:758, Şişli / İstanbul',
  'İstanbul',
  'Zeytinburnu',
  'Türkiye',
  'DAVUTPAŞA',
  '0510811231',
  'Ziraat Bankası',
  'TR12 0001 0025 8696 1728 4950 01',
  'ALFA SOYLU ELEKTRONİK BASIM VE İNŞAAT SANAYİ TİCARET LİMİTED ŞİRKETİ',
  'TL Hesabı',
  '%50 peşin sipariş onayında, %50 sevkiyat öncesi havale/EFT. Sipariş onaylanmadan üretim/sevkiyat başlamaz.',
  'Stoklu ürünlerde 1-3 iş günü içinde sevkiyat. İthal ürünlerde tedarik süresi sipariş anında teyit edilir.',
  'Ürünler 2 yıl üretici garantisi kapsamındadır. Garanti dışı durumlar üretici şartlarına göre değerlendirilir.'
);

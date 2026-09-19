-- ALFAS Home (alfashome.com) bağlantı ayarı — panelden girilen salt okunur
-- CRM jetonu. Trendyol/Hepsiburada config tablolarıyla aynı desen: tek satır
-- ("singleton"), panelden düzenlenir, ANINDA geçerli olur (env değişkeni
-- yeniden dağıtım beklerdi).
CREATE TABLE IF NOT EXISTS "AlfashomeConfig" (
  "id"        TEXT NOT NULL DEFAULT 'singleton',
  "baseUrl"   TEXT NOT NULL DEFAULT '',
  "token"     TEXT NOT NULL DEFAULT '',
  "isEnabled" BOOLEAN NOT NULL DEFAULT false,
  "lastOkAt"  TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AlfashomeConfig_pkey" PRIMARY KEY ("id")
);

-- RLS: public şemadaki her tablo için ZORUNLU (Supabase advisor ERROR verir ve
-- bu proje aynı açığı iki kez yaşadı — 13.09'da 22 tablo, 18.09'da 5 tablo).
-- Politika YOK = deny-all: uygulama Prisma üzerinden `postgres` rolüyle
-- bağlanıyor (rolbypassrls), bu yüzden deny-all hiçbir şeyi bozmaz ama
-- Supabase anon/authenticated anahtarlarıyla tabloya erişimi kapatır.
-- ⚠️ Bu tablo bir SIR tutuyor (CRM jetonu); RLS'siz bırakmak, ileride bir
-- Supabase client eklenirse jetonu istemciye açardı.
ALTER TABLE "AlfashomeConfig" ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PDKS — Test verisi (seed). ÖNCE migration'ları uygulayın, SONRA bunu çalıştırın.
-- Supabase 'iotomasyon' (ref: frbxpodiostxuwlrubkt) → SQL Editor.
--
-- Oluşturduğu test ortamı:
--   • Tenant : "Test Şirketi" (slug: test)
--   • Şantiye: "Test Şantiye" — radius 100.000 km (geofence testte HER konumu kabul eder)
--   • Personel: "Test Personel", telefon 555 111 22 33
--   • Şifre/PIN: 1234  (bcrypt)
--   • Cihaz: bağlı değil → ilk giriş bu cihaza bağlanır
--   • KVKK rızası: VERİLMEDİ → uygulamada önce aydınlatma onayını test edersiniz
--
-- Telefonda /personel aç → Telefon: 05551112233, Şifre: 1234 → KVKK onayla → Giriş yap.
-- NOT: Gerçek geofence'i denemek için sonradan radiusMeters'ı düşürüp (örn. 100)
--      latitude/longitude'u şantiyenizin gerçek koordinatına çekin.
-- ============================================================================
BEGIN;

INSERT INTO "pdks_tenants" ("id","name","slug","isActive","createdAt")
VALUES ('seed_tenant_test','Test Şirketi','test',true,now())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "pdks_worksites" ("id","tenantId","name","latitude","longitude","radiusMeters","maxAccuracyMeters","isActive","createdAt")
VALUES ('seed_worksite_test','seed_tenant_test','Test Şantiye',41.0082,28.9784,100000000,100,true,now())
ON CONFLICT ("id") DO NOTHING;

-- Şifre/PIN = 1234 (bcrypt). KVKK rızası NULL → uygulama önce onay akışını gösterir.
INSERT INTO "pdks_personnel" ("id","tenantId","fullName","phone","role","passwordHash","isActive","createdAt")
VALUES (
  'seed_personnel_test','seed_tenant_test','Test Personel','5551112233','employee',
  '$2b$10$DsythrgRZdagGs86HwStNuiMstokMVgnYkg6/6/B7D.katpryTt72',
  true, now()
)
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "pdks_personnel_worksites" ("tenantId","personnelId","worksiteId")
VALUES ('seed_tenant_test','seed_personnel_test','seed_worksite_test')
ON CONFLICT ("personnelId","worksiteId") DO NOTHING;

COMMIT;

-- Temizlik (testi bitirince çalıştırın — cascade ile bağlı kayıtları da siler):
-- DELETE FROM "pdks_tenants" WHERE "id" = 'seed_tenant_test';

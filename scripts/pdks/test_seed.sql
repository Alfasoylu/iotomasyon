-- ============================================================================
-- PDKS — Test verisi (seed). ÖNCE migration'ı uygulayın, SONRA bunu çalıştırın.
-- Supabase 'iotomasyon' (ref: frbxpodiostxuwlrubkt) → SQL Editor.
--
-- Oluşturduğu test ortamı:
--   • Tenant : "Test Şirketi" (slug: test)
--   • Şantiye: "Test Şantiye" — radius 100.000 km (geofence testte HER konumu kabul eder)
--   • Personel: "Test Personel", telefon 555 111 22 33
--   • Giriş kodu: 123456  (son kullanım 2035 — testte süresi dolmaz)
--   • KVKK rızası: VERİLMEDİ → uygulamada önce aydınlatma onayını test edersiniz
--
-- Telefonda /pdks aç → Telefon: 5551112233, Kod: 123456 → KVKK onayla → Giriş yap.
-- NOT: Gerçek geofence'i denemek için sonradan radiusMeters'ı düşürüp
--      latitude/longitude'u şantiyenizin gerçek koordinatına çekin.
-- ============================================================================
BEGIN;

INSERT INTO "pdks_tenants" ("id","name","slug","isActive","createdAt")
VALUES ('seed_tenant_test','Test Şirketi','test',true,now())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "pdks_worksites" ("id","tenantId","name","latitude","longitude","radiusMeters","isActive","createdAt")
VALUES ('seed_worksite_test','seed_tenant_test','Test Şantiye',41.0082,28.9784,100000000,true,now())
ON CONFLICT ("id") DO NOTHING;

-- KVKK rızası NULL bırakıldı → uygulama önce onay akışını gösterir.
INSERT INTO "pdks_personnel" ("id","tenantId","fullName","phone","role","isActive","createdAt")
VALUES ('seed_personnel_test','seed_tenant_test','Test Personel','5551112233','employee',true,now())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "pdks_personnel_worksites" ("tenantId","personnelId","worksiteId")
VALUES ('seed_tenant_test','seed_personnel_test','seed_worksite_test')
ON CONFLICT ("personnelId","worksiteId") DO NOTHING;

-- Giriş kodu 123456 (bcrypt, 10 round). expiresAt = 2035 → testte dolmaz.
INSERT INTO "pdks_login_codes" ("id","tenantId","personnelId","codeHash","expiresAt","createdAt")
VALUES (
  'seed_logincode_test',
  'seed_tenant_test',
  'seed_personnel_test',
  '$2b$10$HDUOea2Fa3BEULanvTSX5uSyZi8qMEmOEh3moV5Vbl/Up2K53KtEe',
  '2035-01-01T00:00:00.000Z',
  now()
)
ON CONFLICT ("id") DO NOTHING;

COMMIT;

-- Temizlik (testi bitirince çalıştırın — cascade ile bağlı kayıtları da siler):
-- DELETE FROM "pdks_tenants" WHERE "id" = 'seed_tenant_test';

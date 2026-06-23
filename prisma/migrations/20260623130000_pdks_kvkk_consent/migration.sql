-- PDKS: KVKK açık rıza zamanı. null ise giriş/çıkış (konum işleme) engellenir.
ALTER TABLE "pdks_personnel" ADD COLUMN "kvkkConsentAt" TIMESTAMP(3);

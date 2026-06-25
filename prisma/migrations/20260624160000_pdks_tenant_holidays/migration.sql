-- PDKS: tenant resmi tatil listesi (JSON). null = tatil tanımlı değil.
ALTER TABLE "pdks_tenants" ADD COLUMN "holidaysJson" TEXT;

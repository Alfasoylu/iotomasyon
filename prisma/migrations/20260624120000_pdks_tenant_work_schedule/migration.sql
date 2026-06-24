-- PDKS: tenant haftalık çalışma programı (panelden düzenlenebilir; null = kod varsayılanı).
ALTER TABLE "pdks_tenants" ADD COLUMN "workScheduleJson" TEXT;

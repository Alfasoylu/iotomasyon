-- PDKS: çıkış hatırlatması + otomatik çıkış + fazla mesai bayrağı.
-- Hepsi additive; mevcut satırlar için default/NULL güvenli.
ALTER TABLE "pdks_attendance_records" ADD COLUMN "autoCheckout" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "pdks_attendance_records" ADD COLUMN "checkoutReminderAt" TIMESTAMP(3);
ALTER TABLE "pdks_attendance_records" ADD COLUMN "overtime" BOOLEAN NOT NULL DEFAULT false;

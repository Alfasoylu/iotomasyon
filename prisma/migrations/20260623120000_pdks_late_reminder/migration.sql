-- PDKS: geç-kalan hatırlatma idempotency alanı (cron'un günde bir kez göndermesi için).
ALTER TABLE "pdks_personnel" ADD COLUMN "lastLateReminderOn" DATE;

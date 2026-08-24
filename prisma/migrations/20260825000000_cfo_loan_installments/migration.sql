-- CFO — Krediler: kalan taksit sayısı + kredi bitiş tarihi görünürlüğü
-- Additive. Mevcut veriye dokunmaz, kolon silmez.
--
-- lastInstallmentDate zaten vardı (= kredi bitiş tarihi), sadece arayüzde gösterilmiyordu.
-- Bu göç iki alan ekler:
--   totalInstallments — toplam taksit sayısı, "kalan / toplam" gösterimi için
--   remainingOverride — düzensiz ödeme planlarında kalan taksitin elle girilmesi için;
--                       boş bırakılırsa kalan taksit nextPaymentDate..lastInstallmentDate
--                       ay farkından hesaplanır ve zamanla kendiliğinden azalır.

ALTER TABLE "cfo_loan" ADD COLUMN IF NOT EXISTS "totalInstallments" INTEGER;
ALTER TABLE "cfo_loan" ADD COLUMN IF NOT EXISTS "remainingOverride" INTEGER;

-- ROLLBACK:
-- ALTER TABLE "cfo_loan" DROP COLUMN IF EXISTS "totalInstallments";
-- ALTER TABLE "cfo_loan" DROP COLUMN IF EXISTS "remainingOverride";

// /cfo/odemeler "Kullanılabilir kapasite" (CFO-006 / RF-010 son parça, 2026-10-10). Şirket/şahsi ayrımı veritabanındaki tek kural
// `cfo_hesap_sahsi` ile (lib/cfo/ownership.ts ile birebir); önceden sayfa kendi `like '%ŞAHSİ%'` kuralını kullanıyor ve açılışa şahsi
// hesapları da katıyordu. Açılış = şirket hesapları (= cfo_nakit_kapisi.nakit_try = ödeme takvimi açılışı, CFO-013).
// Bakiyesi bilinmeyen şirket hesabının KMH limiti kapasiteye girmez (kullanılıp kullanılmadığı bilinmiyor); ayrı gösterilir.
export const PAYMENT_CAPACITY_SQL = `
  select coalesce(sum("balanceTry") filter (where not cfo_hesap_sahsi("accountType")), 0) as acilis,
         coalesce(sum("kmhLimitTry") filter (where not cfo_hesap_sahsi("accountType") and "balanceTry" is not null), 0) as ticari_kmh,
         coalesce(sum("kmhLimitTry") filter (where not cfo_hesap_sahsi("accountType") and "balanceTry" is null), 0) as bilinmeyen_kmh,
         coalesce(sum("kmhLimitTry") filter (where cfo_hesap_sahsi("accountType")), 0) as sahsi_kmh,
         coalesce(sum("purposeLimitTry") filter (where not cfo_hesap_sahsi("accountType")), 0) as amac_kmh,
         max(current_date - "lastUpdatedAt"::date) filter (where not cfo_hesap_sahsi("accountType")) as en_bayat_gun
    from cfo_bank_account where "isActive"`;

export type PaymentCapacity = {
  acilis: unknown;
  ticari_kmh: unknown;
  bilinmeyen_kmh: unknown;
  sahsi_kmh: unknown;
  amac_kmh: unknown;
  en_bayat_gun: number | null;
};

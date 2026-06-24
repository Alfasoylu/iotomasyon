import "server-only";

/**
 * PDKS — Haftalık çalışma programı (şirket geneli).
 *
 * Standart saatler: Pzt–Cuma 08:30–18:30, Cumartesi 08:30–13:00, Pazar tatil.
 * Personelin kendi `expectedCheckIn/expectedCheckOut` alanı doluysa o gün için
 * programı geçersiz kılar (override). Boşsa programdaki saat kullanılır.
 *
 * İndeks JS getUTCDay() ile aynı: 0=Pazar … 6=Cumartesi. (workDate UTC gece-yarısı
 * TR tarihi olduğundan getUTCDay o TR gününün haftagünüdür.)
 */
export type DaySchedule = { in: string; out: string } | null; // null = tatil
export type WeekSchedule = DaySchedule[]; // uzunluk 7

export const DEFAULT_WEEK_SCHEDULE: WeekSchedule = [
  null, // 0 Pazar — tatil
  { in: "08:30", out: "18:30" }, // 1 Pazartesi
  { in: "08:30", out: "18:30" }, // 2 Salı
  { in: "08:30", out: "18:30" }, // 3 Çarşamba
  { in: "08:30", out: "18:30" }, // 4 Perşembe
  { in: "08:30", out: "18:30" }, // 5 Cuma
  { in: "08:30", out: "13:00" }, // 6 Cumartesi
];

/** workDate (@db.Date → UTC gece-yarısı) → haftagünü 0..6. */
export function trWeekday(date: Date): number {
  return date.getUTCDay();
}

/**
 * Verilen gün ve personel için beklenen giriş/çıkış saatini çözer.
 * Öncelik: personel override → program. Tatil gününde null döner.
 */
export function resolveExpected(
  week: WeekSchedule,
  date: Date,
  overrideIn?: string | null,
  overrideOut?: string | null,
): { in: string; out: string } | null {
  const day = week[trWeekday(date)] ?? null;
  if (!day) return null; // tatil → beklenti yok
  return {
    in: overrideIn && overrideIn.length > 0 ? overrideIn : day.in,
    out: overrideOut && overrideOut.length > 0 ? overrideOut : day.out,
  };
}

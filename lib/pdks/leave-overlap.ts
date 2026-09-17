/**
 * PDKS — İzin çakışması. SAF: ağ, DB, `server-only` YOK.
 *
 * NEDEN VAR: çakışma kontrolü HİÇ YOKTU. Aynı personel için üst üste binen
 * izinler oluşturulabiliyordu (talep + admin'in elle eklediği izin de dahil).
 * Sonuç sessiz: puantaj aynı günü iki kez izinli sayar, yıllık izin bakiyesi
 * (C7) hesaplanmaya başlandığında gün sayısı şişer ve hata geriye dönük
 * düzeltilemez.
 */

/** Çakışma engelleyen durumlar. Reddedilen/iptal edilen izin engellemez. */
export const BLOCKING_STATUSES = ["pending", "approved"] as const;

export type LeaveRange = {
  id?: string;
  startDate: Date;
  endDate: Date;
  status?: string | null;
};

/**
 * İki kapalı aralık kesişiyor mu? Uçlar DAHİL: 10–12 ile 12–14 çakışır,
 * çünkü 12'sinde iki izin de sürüyor. (Yarı-açık kabul edilse aynı gün iki
 * kez izinli sayılırdı — sessiz hata.)
 */
export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() <= bEnd.getTime() && bStart.getTime() <= aEnd.getTime();
}

/**
 * Adayla çakışan İLK engelleyici izni döndürür; yoksa null.
 * `haricId` düzenleme içindir — kaydın kendisi kendisiyle çakışmasın.
 */
export function findOverlappingLeave(
  mevcut: readonly LeaveRange[],
  aday: { startDate: Date; endDate: Date },
  haricId?: string
): LeaveRange | null {
  for (const l of mevcut) {
    if (haricId && l.id === haricId) continue;
    const durum = (l.status ?? "").toLowerCase();
    if (!BLOCKING_STATUSES.includes(durum as (typeof BLOCKING_STATUSES)[number])) continue;
    if (rangesOverlap(aday.startDate, aday.endDate, l.startDate, l.endDate)) return l;
  }
  return null;
}

/** Kullanıcıya gösterilecek mesaj (YYYY-MM-DD biçiminde tarihler). */
export function overlapMessage(l: LeaveRange): string {
  const ymd = (d: Date) => d.toISOString().slice(0, 10);
  const durum = (l.status ?? "").toLowerCase() === "approved" ? "onaylı" : "bekleyen";
  return `Bu tarihler ${durum} bir izinle çakışıyor (${ymd(l.startDate)} – ${ymd(l.endDate)}).`;
}

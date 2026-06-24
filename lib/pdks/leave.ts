import "server-only";

/** İzin türü ve durum etiketleri (UI + CSV). */
export const LEAVE_TYPE_LABELS: Record<string, string> = {
  annual: "Yıllık izin",
  sick: "Hastalık / rapor",
  unpaid: "Ücretsiz izin",
  other: "Diğer",
};

export const LEAVE_STATUS_LABELS: Record<string, string> = {
  pending: "Onay bekliyor",
  approved: "Onaylandı",
  rejected: "Reddedildi",
};

/** "YYYY-MM-DD" → @db.Date için UTC gece-yarısı Date. */
export function ymdToDate(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

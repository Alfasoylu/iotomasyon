import "server-only";

import { prismaPdks } from "./prisma";
import { toMinutes } from "./tr-time";

export type TimesheetRow = {
  id: string;
  personnelId: string;
  personnelName: string;
  workDate: Date;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  worksiteName: string | null;
  checkInDistanceM: number | null;
  checkOutDistanceM: number | null;
  hours: number | null; // çalışılan saat (giriş+çıkış varsa)
  expectedCheckIn: string | null; // "HH:MM" — personelin beklenen giriş saati
  late: boolean; // giriş, beklenen saatten sonra mı (beklenen tanımlıysa)
  missingCheckout: boolean; // giriş var ama çıkış yok
  autoCheckout: boolean; // çıkış sistem tarafından otomatik mi kapatıldı
  overtimeHours: number | null; // beklenen mesai süresini aşan saat (her ikisi tanımlıysa)
};

/** Personel-bazlı dönem özeti (geç giriş / eksik çıkış / toplam saat). */
export type TimesheetSummary = {
  personnelId: string;
  personnelName: string;
  days: number; // giriş yapılan ayrı gün sayısı
  totalHours: number;
  overtimeHours: number;
  lateCount: number;
  missingCheckoutCount: number;
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Date → Europe/Istanbul gününde dakika (0-1439). */
function trMinutes(d: Date): number {
  const hm = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Istanbul",
  });
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

// "HH:MM" → dakika: tek kaynak lib/pdks/tr-time.ts (kopya, saat sınırı
// kontrolünü de kaybetmişti: "25:99" geçerli sayılıyordu).
const hhmmToMinutes = toMinutes;

// Zaman dönüşümü buradan TAŞINDI → lib/pdks/tr-time.ts (saf, test edilebilir).
// Bu dosya `server-only` + prisma taşıdığı için içindeki zaman mantığı hiç
// sınanamıyordu; puantajın en kırılgan yeri de tam orası.
// Mevcut çağıranlar kırılmasın diye yeniden dışa veriliyor.
export { trTimeOnDateToUtc, TR_OFFSET_MIN } from "./tr-time";

/**
 * Tarih aralığını çözer. workDate (@db.Date) TR gününün UTC gece-yarısı olarak
 * saklandığından, "YYYY-MM-DD" → `${ymd}T00:00:00Z` ile birebir eşleşir.
 * Varsayılan: içinde bulunulan TR ayının 1'i → bugün.
 */
export function parseRange(
  fromStr?: string,
  toStr?: string,
): { from: Date; to: Date; fromYmd: string; toYmd: string } {
  const todayYmd = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
  const monthStart = `${todayYmd.slice(0, 8)}01`;
  const fromYmd = fromStr && YMD.test(fromStr) ? fromStr : monthStart;
  const toYmd = toStr && YMD.test(toStr) ? toStr : todayYmd;
  return {
    from: new Date(`${fromYmd}T00:00:00.000Z`),
    to: new Date(`${toYmd}T00:00:00.000Z`),
    fromYmd,
    toYmd,
  };
}

/** Aralıktaki devam kayıtlarını puantaj satırlarına dönüştürür. Tenant bağlamı içinde çağrılır. */
export async function fetchTimesheet(from: Date, to: Date): Promise<TimesheetRow[]> {
  const records = await prismaPdks.pdksAttendanceRecord.findMany({
    where: { workDate: { gte: from, lte: to } },
    include: {
      personnel: { select: { fullName: true, expectedCheckIn: true, expectedCheckOut: true } },
      worksite: { select: { name: true } },
    },
    orderBy: [{ workDate: "asc" }, { createdAt: "asc" }],
  });

  return records.map((r) => {
    const expectedMin = hhmmToMinutes(r.personnel.expectedCheckIn);
    const expectedOutMin = hhmmToMinutes(r.personnel.expectedCheckOut);
    const late =
      r.checkInAt != null && expectedMin != null && trMinutes(r.checkInAt) > expectedMin;
    const hours =
      r.checkInAt && r.checkOutAt
        ? (r.checkOutAt.getTime() - r.checkInAt.getTime()) / 3_600_000
        : null;
    // Fazla mesai: çalışılan saat, beklenen mesai süresini (çıkış−giriş) aşan kısım.
    const expectedDurH =
      expectedMin != null && expectedOutMin != null && expectedOutMin > expectedMin
        ? (expectedOutMin - expectedMin) / 60
        : null;
    const overtimeHours =
      hours != null && expectedDurH != null ? Math.max(0, hours - expectedDurH) : null;
    return {
      id: r.id,
      personnelId: r.personnelId,
      personnelName: r.personnel.fullName,
      workDate: r.workDate,
      checkInAt: r.checkInAt,
      checkOutAt: r.checkOutAt,
      worksiteName: r.worksite?.name ?? null,
      checkInDistanceM: r.checkInDistanceM,
      checkOutDistanceM: r.checkOutDistanceM,
      hours,
      expectedCheckIn: r.personnel.expectedCheckIn,
      late,
      missingCheckout: r.checkInAt != null && r.checkOutAt == null,
      autoCheckout: r.autoCheckout,
      overtimeHours,
    };
  });
}

/** Puantaj satırlarını personel-bazlı döneme özetler (ada göre sıralı). */
export function buildTimesheetSummary(rows: TimesheetRow[]): TimesheetSummary[] {
  const byPersonnel = new Map<string, TimesheetSummary & { _days: Set<string> }>();
  for (const r of rows) {
    let s = byPersonnel.get(r.personnelId);
    if (!s) {
      s = {
        personnelId: r.personnelId,
        personnelName: r.personnelName,
        days: 0,
        totalHours: 0,
        overtimeHours: 0,
        lateCount: 0,
        missingCheckoutCount: 0,
        _days: new Set<string>(),
      };
      byPersonnel.set(r.personnelId, s);
    }
    if (r.checkInAt) s._days.add(r.workDate.toISOString().slice(0, 10));
    s.totalHours += r.hours ?? 0;
    s.overtimeHours += r.overtimeHours ?? 0;
    if (r.late) s.lateCount += 1;
    if (r.missingCheckout) s.missingCheckoutCount += 1;
  }
  return Array.from(byPersonnel.values())
    .map(({ _days, ...rest }) => ({ ...rest, days: _days.size }))
    .sort((a, b) => a.personnelName.localeCompare(b.personnelName, "tr"));
}

import "server-only";

import { prismaPdks } from "./prisma";

export type TimesheetRow = {
  personnelId: string;
  personnelName: string;
  workDate: Date;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  worksiteName: string | null;
  checkInDistanceM: number | null;
  checkOutDistanceM: number | null;
  hours: number | null; // çalışılan saat (giriş+çıkış varsa)
};

const YMD = /^\d{4}-\d{2}-\d{2}$/;

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
      personnel: { select: { fullName: true } },
      worksite: { select: { name: true } },
    },
    orderBy: [{ workDate: "asc" }, { createdAt: "asc" }],
  });

  return records.map((r) => ({
    personnelId: r.personnelId,
    personnelName: r.personnel.fullName,
    workDate: r.workDate,
    checkInAt: r.checkInAt,
    checkOutAt: r.checkOutAt,
    worksiteName: r.worksite?.name ?? null,
    checkInDistanceM: r.checkInDistanceM,
    checkOutDistanceM: r.checkOutDistanceM,
    hours:
      r.checkInAt && r.checkOutAt
        ? (r.checkOutAt.getTime() - r.checkInAt.getTime()) / 3_600_000
        : null,
  }));
}

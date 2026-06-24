import { NextResponse, type NextRequest } from "next/server";

import { getCurrentSession, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { runWithPdksAdmin } from "@/lib/pdks/admin";
import { fetchTimesheet, parseRange, buildTimesheetSummary, type TimesheetRow } from "@/lib/pdks/timesheet";

export const dynamic = "force-dynamic";

function trDate(d: Date): string {
  return d.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
}
function trTime(d: Date | null): string {
  if (!d) return "";
  return d.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  });
}

/** CSV alanı kaçışı (; ayraç, TR Excel uyumlu). */
function csv(value: string): string {
  if (/[";\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function buildCsv(rows: TimesheetRow[]): string {
  const header = [
    "Personel",
    "Tarih",
    "Beklenen giriş",
    "Giriş",
    "Geç",
    "Çıkış",
    "Eksik çıkış",
    "Otomatik çıkış",
    "Süre (saat)",
    "Fazla mesai (saat)",
    "Şantiye",
    "Giriş mesafe (m)",
    "Çıkış mesafe (m)",
  ];
  const lines = [header.join(";")];
  for (const r of rows) {
    lines.push(
      [
        csv(r.personnelName),
        csv(trDate(r.workDate)),
        csv(r.expectedCheckIn ?? ""),
        csv(trTime(r.checkInAt)),
        csv(r.late ? "Evet" : ""),
        csv(trTime(r.checkOutAt)),
        csv(r.missingCheckout ? "Evet" : ""),
        csv(r.autoCheckout ? "Evet" : ""),
        csv(r.hours != null ? r.hours.toFixed(2).replace(".", ",") : ""),
        csv(r.overtimeHours != null ? r.overtimeHours.toFixed(2).replace(".", ",") : ""),
        csv(r.worksiteName ?? ""),
        csv(r.checkInDistanceM != null ? String(r.checkInDistanceM) : ""),
        csv(r.checkOutDistanceM != null ? String(r.checkOutDistanceM) : ""),
      ].join(";"),
    );
  }
  return lines.join("\r\n");
}

/** Özet CSV: personel başına tek satır (bordro). */
function buildSummaryCsv(rows: TimesheetRow[]): string {
  const header = [
    "Personel",
    "Çalışılan gün",
    "Toplam saat",
    "Fazla mesai (saat)",
    "Geç giriş",
    "Eksik çıkış",
  ];
  const lines = [header.join(";")];
  for (const s of buildTimesheetSummary(rows)) {
    lines.push(
      [
        csv(s.personnelName),
        csv(String(s.days)),
        csv(s.totalHours.toFixed(2).replace(".", ",")),
        csv(s.overtimeHours.toFixed(2).replace(".", ",")),
        csv(String(s.lateCount)),
        csv(String(s.missingCheckoutCount)),
      ].join(";"),
    );
  }
  return lines.join("\r\n");
}

/**
 * GET /api/pdks/admin/export?from=YYYY-MM-DD&to=YYYY-MM-DD[&summary=1] → CSV.
 * summary=1 → personel başına özet (bordro); aksi halde günlük detay.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentSession();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!(await checkPermission(user, PERMISSIONS.PDKS_MANAGE))) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const { from, to, fromYmd, toYmd } = parseRange(sp.get("from") ?? undefined, sp.get("to") ?? undefined);
  const summary = sp.get("summary") === "1";

  const rows = await runWithPdksAdmin(user, () => fetchTimesheet(from, to));
  const body = "﻿" + (summary ? buildSummaryCsv(rows) : buildCsv(rows)); // UTF-8 BOM

  const name = summary ? "pdks-ozet" : "pdks-puantaj";
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}-${fromYmd}_${toYmd}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

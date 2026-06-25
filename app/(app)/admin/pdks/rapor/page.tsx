import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { runWithPdksAdmin } from "@/lib/pdks/admin";
import { prisma } from "@/lib/prisma";
import { fetchTimesheet, buildTimesheetSummary } from "@/lib/pdks/timesheet";
import { parseWeekSchedule, countWorkingDays } from "@/lib/pdks/schedule";
import { parseHolidays, holidaySet } from "@/lib/pdks/holidays";

export const dynamic = "force-dynamic";

const MONTH_RE = /^\d{4}-\d{2}$/;
const inputCls =
  "rounded-lg border border-[var(--border-default)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:outline-none";

function currentMonthTR(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" }).slice(0, 7);
}

export default async function PdksReportPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.PDKS_MANAGE);
  const sp = await searchParams;
  const month = sp.month && MONTH_RE.test(sp.month) ? sp.month : currentMonthTR();

  const [y, mo] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, mo - 1, 1));
  const monthEnd = new Date(Date.UTC(y, mo, 0));
  const todayTR = new Date(
    `${new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" })}T00:00:00.000Z`,
  );
  const to = monthEnd.getTime() > todayTR.getTime() ? todayTR : monthEnd;
  const fromYmd = from.toISOString().slice(0, 10);
  const toYmd = to.toISOString().slice(0, 10);

  const { summary, workingDays } = await runWithPdksAdmin(user, async (tenantId) => {
    const [rows, tenant] = await Promise.all([
      fetchTimesheet(from, to),
      prisma.pdksTenant.findUnique({
        where: { id: tenantId },
        select: { workScheduleJson: true, holidaysJson: true },
      }),
    ]);
    const week = parseWeekSchedule(tenant?.workScheduleJson);
    const holidays = holidaySet(parseHolidays(tenant?.holidaysJson));
    return {
      summary: buildTimesheetSummary(rows),
      workingDays: countWorkingDays(week, from, to, holidays),
    };
  });

  const totalHours = summary.reduce((a, s) => a + s.totalHours, 0);
  const totalOvertime = summary.reduce((a, s) => a + s.overtimeHours, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Devam Takip
          </p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
            Aylık Rapor
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Bordro için aylık özet: personel başına çalışılan gün, toplam saat, fazla mesai,
            geç giriş ve eksik çıkış.
          </p>
        </div>
        <Link href="/admin/pdks">
          <Button variant="secondary">← Pano</Button>
        </Link>
      </div>

      <Card className="p-5">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Ay</label>
            <input type="month" name="month" defaultValue={month} className={inputCls} />
          </div>
          <Button type="submit">Göster</Button>
          <a
            href={`/api/pdks/admin/export?from=${fromYmd}&to=${toYmd}&summary=1`}
            className="inline-flex h-9 items-center rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3.5 text-[13px] text-[var(--text-primary)] hover:border-[var(--border-strong)]"
          >
            ⬇ Özet CSV
          </a>
          <a
            href={`/api/pdks/admin/export?from=${fromYmd}&to=${toYmd}`}
            className="inline-flex h-9 items-center rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3.5 text-[13px] text-[var(--text-primary)] hover:border-[var(--border-strong)]"
          >
            ⬇ Detay CSV
          </a>
        </form>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard label="Beklenen iş günü" value={String(workingDays)} />
        <MetricCard label="Personel" value={String(summary.length)} />
        <MetricCard label="Toplam saat" value={totalHours.toFixed(1)} />
        <MetricCard label="Fazla mesai" value={totalOvertime.toFixed(1)} />
      </div>

      <Card className="overflow-hidden p-0 rounded-lg">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border-default)] bg-[var(--surface-1)]">
            <tr>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Personel</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Çalışılan gün</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Toplam saat</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Fazla mesai</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Geç giriş</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Eksik çıkış</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {summary.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--text-muted)]">
                  Bu ayda kayıt yok.
                </td>
              </tr>
            )}
            {summary.map((s) => (
              <tr key={s.personnelId} className="hover:bg-[var(--surface-1)]">
                <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{s.personnelName}</td>
                <td className="px-4 py-3 tabular-nums text-[var(--text-secondary)]">
                  {s.days}
                  {workingDays > 0 && <span className="text-[var(--text-muted)]"> / {workingDays}</span>}
                </td>
                <td className="px-4 py-3 tabular-nums text-[var(--text-secondary)]">{s.totalHours.toFixed(1)} s</td>
                <td className="px-4 py-3 tabular-nums text-[var(--text-secondary)]">
                  {s.overtimeHours > 0 ? `${s.overtimeHours.toFixed(1)} s` : "—"}
                </td>
                <td className="px-4 py-3 tabular-nums text-[var(--text-secondary)]">{s.lateCount || "—"}</td>
                <td className="px-4 py-3 tabular-nums text-[var(--text-secondary)]">{s.missingCheckoutCount || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="text-xs text-[var(--text-muted)]">
        Not: &quot;Çalışılan gün / beklenen iş günü&quot; oranında izin/rapor günleri henüz
        ayrı tutulmuyor (izin & resmi tatil modülüyle iyileştirilecek).
      </p>
    </div>
  );
}

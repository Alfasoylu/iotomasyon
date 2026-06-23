import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { runWithPdksAdmin } from "@/lib/pdks/admin";
import { prismaPdks } from "@/lib/pdks/prisma";
import { fetchTimesheet, parseRange, buildTimesheetSummary } from "@/lib/pdks/timesheet";
import { TimesheetTable } from "@/components/admin/pdks/timesheet-table";

export const dynamic = "force-dynamic";

function trDate(d: Date): string {
  return d.toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
}
function trTime(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  });
}
/** Düzenleme inputu için "HH:MM" | "" (null → boş). */
function trTimeOrEmpty(d: Date | null): string {
  return d ? trTime(d) : "";
}

const inputCls =
  "rounded-lg border border-[var(--border-default)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:outline-none";

export default async function PdksTimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const user = await requirePermission(PERMISSIONS.PDKS_MANAGE);
  const sp = await searchParams;
  const { from, to, fromYmd, toYmd } = parseRange(sp.from, sp.to);

  const { rows, personnel } = await runWithPdksAdmin(user, async () => {
    const [rows, personnel] = await Promise.all([
      fetchTimesheet(from, to),
      prismaPdks.pdksPersonnel.findMany({
        where: { isActive: true, role: "employee" },
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true },
      }),
    ]);
    return { rows, personnel };
  });

  const totalHours = rows.reduce((acc, r) => acc + (r.hours ?? 0), 0);
  const distinctPersonnel = new Set(rows.map((r) => r.personnelId)).size;
  const lateCount = rows.filter((r) => r.late).length;
  const missingCount = rows.filter((r) => r.missingCheckout).length;
  const summary = buildTimesheetSummary(rows);

  const editableRows = rows.map((r) => ({
    id: r.id,
    personnelName: r.personnelName,
    workDateYmd: r.workDate.toISOString().slice(0, 10),
    workDateLabel: trDate(r.workDate),
    checkInTR: trTimeOrEmpty(r.checkInAt),
    checkOutTR: trTimeOrEmpty(r.checkOutAt),
    worksiteName: r.worksiteName,
    hours: r.hours,
    late: r.late,
    missingCheckout: r.missingCheckout,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Devam Takip
          </p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
            Puantaj
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Seçilen tarih aralığındaki giriş/çıkış kayıtları. CSV olarak dışa aktarabilirsiniz.
          </p>
        </div>
        <Link href="/admin/pdks">
          <Button variant="secondary">← Pano</Button>
        </Link>
      </div>

      <Card className="p-5">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Başlangıç</label>
            <input type="date" name="from" defaultValue={fromYmd} className={inputCls} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Bitiş</label>
            <input type="date" name="to" defaultValue={toYmd} className={inputCls} />
          </div>
          <Button type="submit">Filtrele</Button>
          <a
            href={`/api/pdks/admin/export?from=${fromYmd}&to=${toYmd}`}
            className="inline-flex h-9 items-center rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3.5 text-[13px] text-[var(--text-primary)] hover:border-[var(--border-strong)]"
          >
            ⬇ CSV indir
          </a>
        </form>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <MetricCard label="Kayıt sayısı" value={String(rows.length)} />
        <MetricCard label="Personel" value={String(distinctPersonnel)} />
        <MetricCard label="Toplam saat" value={totalHours.toFixed(1)} />
        <MetricCard label="Geç giriş" value={String(lateCount)} />
        <MetricCard label="Eksik çıkış" value={String(missingCount)} />
      </div>

      {summary.length > 0 && (
        <Card className="overflow-hidden p-0 rounded-lg">
          <div className="border-b border-[var(--border-default)] bg-[var(--surface-1)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--text-primary)]">
              Personel özeti
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Seçili dönemde personel başına gün, toplam mesai, geç giriş ve eksik çıkış.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)]">
              <tr>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Personel</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Gün</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Toplam saat</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Geç giriş</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Eksik çıkış</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {summary.map((s) => (
                <tr key={s.personnelId} className="hover:bg-[var(--surface-1)]">
                  <td className="px-4 py-2.5 font-medium text-[var(--text-primary)]">{s.personnelName}</td>
                  <td className="px-4 py-2.5 tabular-nums text-[var(--text-secondary)]">{s.days}</td>
                  <td className="px-4 py-2.5 tabular-nums text-[var(--text-secondary)]">{s.totalHours.toFixed(1)} s</td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {s.lateCount > 0 ? <Badge tone="warning">{s.lateCount}</Badge> : <span className="text-[var(--text-muted)]">—</span>}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">
                    {s.missingCheckoutCount > 0 ? <Badge tone="danger">{s.missingCheckoutCount}</Badge> : <span className="text-[var(--text-muted)]">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <TimesheetTable rows={editableRows} personnel={personnel} defaultYmd={toYmd} />
    </div>
  );
}

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { runWithPdksAdmin } from "@/lib/pdks/admin";
import { fetchTimesheet, parseRange } from "@/lib/pdks/timesheet";

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

  const rows = await runWithPdksAdmin(user, () => fetchTimesheet(from, to));

  const totalHours = rows.reduce((acc, r) => acc + (r.hours ?? 0), 0);
  const distinctPersonnel = new Set(rows.map((r) => r.personnelId)).size;

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

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <MetricCard label="Kayıt sayısı" value={String(rows.length)} />
        <MetricCard label="Personel" value={String(distinctPersonnel)} />
        <MetricCard label="Toplam saat" value={totalHours.toFixed(1)} />
      </div>

      <Card className="overflow-hidden p-0 rounded-lg">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border-default)] bg-[var(--surface-1)]">
            <tr>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Personel</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Tarih</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Giriş</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Çıkış</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Süre</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Şantiye</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Mesafe (g/ç)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)]">
                  Bu aralıkta kayıt yok.
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr key={`${r.personnelId}-${i}`} className="hover:bg-[var(--surface-1)]">
                <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{r.personnelName}</td>
                <td className="px-4 py-3 text-[var(--text-secondary)] tabular-nums">{trDate(r.workDate)}</td>
                <td className="px-4 py-3 text-[var(--text-secondary)] tabular-nums font-mono">{trTime(r.checkInAt)}</td>
                <td className="px-4 py-3 text-[var(--text-secondary)] tabular-nums font-mono">{trTime(r.checkOutAt)}</td>
                <td className="px-4 py-3 text-[var(--text-secondary)] tabular-nums">
                  {r.hours != null ? `${r.hours.toFixed(2)} s` : "—"}
                </td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">{r.worksiteName ?? "—"}</td>
                <td className="px-4 py-3 text-[var(--text-muted)] tabular-nums font-mono">
                  {r.checkInDistanceM ?? "—"} / {r.checkOutDistanceM ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

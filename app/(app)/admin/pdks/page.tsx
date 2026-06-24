import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/ui/metric-card";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { runWithPdksAdmin } from "@/lib/pdks/admin";
import { prismaPdks } from "@/lib/pdks/prisma";
import { workDateTR } from "@/lib/pdks/geo";
import { isPushConfigured } from "@/lib/pdks/push";

export const dynamic = "force-dynamic";

function fmtTime(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  });
}

export default async function PdksAdminPage() {
  const user = await requirePermission(PERMISSIONS.PDKS_MANAGE);

  const { employees, byPersonnel } = await runWithPdksAdmin(user, async () => {
    const today = workDateTR();
    const [emps, records] = await Promise.all([
      prismaPdks.pdksPersonnel.findMany({
        where: { isActive: true, role: "employee" },
        orderBy: { fullName: "asc" },
      }),
      prismaPdks.pdksAttendanceRecord.findMany({
        where: { workDate: today },
        include: { worksite: true },
      }),
    ]);
    const map = new Map<string, (typeof records)[number]>();
    for (const r of records) {
      // Aynı gün birden fazla kayıt olursa en sonuncuyu göster.
      const prev = map.get(r.personnelId);
      if (!prev || r.createdAt > prev.createdAt) map.set(r.personnelId, r);
    }
    return { employees: emps, byPersonnel: map };
  });

  const rows = employees.map((e) => {
    const rec = byPersonnel.get(e.id) ?? null;
    const state = !rec || !rec.checkInAt ? "absent" : rec.checkOutAt ? "out" : "in";
    return { e, rec, state };
  });

  const counts = {
    total: rows.length,
    in: rows.filter((r) => r.state === "in").length,
    out: rows.filter((r) => r.state === "out").length,
    absent: rows.filter((r) => r.state === "absent").length,
  };

  const todayLabel = new Intl.DateTimeFormat("tr-TR", {
    dateStyle: "full",
    timeZone: "Europe/Istanbul",
  }).format(new Date());

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Yönetim
          </p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
            Devam Takip (PDKS)
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            {todayLabel} — bugünün canlı durumu.
          </p>
          <div className="mt-2">
            {isPushConfigured() ? (
              <Badge tone="success">🔔 Bildirimler aktif</Badge>
            ) : (
              <Badge tone="warning">
                🔕 Bildirimler kapalı — Vercel&apos;de PDKS_VAPID_* ekleyin
              </Badge>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/pdks/personel">
            <Button variant="secondary">Personel</Button>
          </Link>
          <Link href="/admin/pdks/santiye">
            <Button variant="secondary">Şantiyeler</Button>
          </Link>
          <Link href="/admin/pdks/calisma-saatleri">
            <Button variant="secondary">Çalışma Saatleri</Button>
          </Link>
          <Link href="/admin/pdks/puantaj">
            <Button variant="secondary">Puantaj</Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard label="Aktif personel" value={String(counts.total)} />
        <MetricCard label="İçeride" value={String(counts.in)} />
        <MetricCard label="Çıkış yaptı" value={String(counts.out)} />
        <MetricCard label="Gelmedi" value={String(counts.absent)} />
      </div>

      <Card className="overflow-hidden p-0 rounded-lg">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border-default)] bg-[var(--surface-1)]">
            <tr>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Personel</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Durum</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Giriş</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Çıkış</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Şantiye</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--text-muted)]">
                  Henüz aktif personel yok.{" "}
                  <Link href="/admin/pdks/personel" className="underline">
                    Personel ekleyin
                  </Link>
                  .
                </td>
              </tr>
            )}
            {rows.map(({ e, rec, state }) => (
              <tr key={e.id} className="hover:bg-[var(--surface-1)]">
                <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{e.fullName}</td>
                <td className="px-4 py-3">
                  {state === "in" && <Badge tone="success">İçeride</Badge>}
                  {state === "out" && <Badge tone="default">Çıktı</Badge>}
                  {state === "absent" && <Badge tone="warning">Gelmedi</Badge>}
                </td>
                <td className="px-4 py-3 tabular-nums font-mono text-[var(--text-secondary)]">
                  {fmtTime(rec?.checkInAt ?? null)}
                </td>
                <td className="px-4 py-3 tabular-nums font-mono text-[var(--text-secondary)]">
                  {fmtTime(rec?.checkOutAt ?? null)}
                </td>
                <td className="px-4 py-3 text-[var(--text-secondary)]">
                  {rec?.worksite?.name ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

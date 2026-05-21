import { BarChart3, Phone, FileText, Trophy, AlertCircle, Medal } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/layout/empty-state";
import { getTeamPerformance } from "@/services/team-performance-service";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function fmtTry(n: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(d: Date): string {
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short" }).format(d);
}

export default async function SalesPerformancePage() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  const team = await getTeamPerformance();
  const sortedReps = [...team.reps].sort((a, b) => {
    if (b.dealsWonAmountThisWeek !== a.dealsWonAmountThisWeek) {
      return b.dealsWonAmountThisWeek - a.dealsWonAmountThisWeek;
    }
    return b.callsLoggedThisWeek - a.callsLoggedThisWeek;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        icon={BarChart3}
        breadcrumb={[{ label: "Yönetim" }, { label: "Satış Performansı" }]}
        title="Ekip Satış Performansı"
        subtitle={`Bu hafta — ${fmtDate(team.weekStart)} → ${fmtDate(
          new Date(team.weekEnd.getTime() - 1),
        )} arası ekibin görüşme/teklif/kazanılan performansı.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="p-4 rounded-lg">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            <Phone size={14} strokeWidth={1.5} />
            <span>Görüşme</span>
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums font-mono text-[var(--text-primary)]">
            {team.totals.calls.toLocaleString("tr-TR")}
          </div>
        </Card>
        <Card className="p-4 rounded-lg">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            <FileText size={14} strokeWidth={1.5} />
            <span>Teklif</span>
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums font-mono text-[var(--text-primary)]">
            {team.totals.quotes.toLocaleString("tr-TR")}
          </div>
          <div className="mt-0.5 text-xs tabular-nums font-mono text-[var(--text-muted)]">{fmtTry(team.totals.quotesAmount)}</div>
        </Card>
        <Card className="p-4 rounded-lg">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            <Trophy size={14} strokeWidth={1.5} />
            <span>Kazanılan</span>
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums font-mono text-[var(--ok)]">
            {team.totals.deals.toLocaleString("tr-TR")}
          </div>
          <div className="mt-0.5 text-xs tabular-nums font-mono text-[var(--ok)]">{fmtTry(team.totals.dealsAmount)}</div>
        </Card>
        <Card className="p-4 rounded-lg">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            <BarChart3 size={14} strokeWidth={1.5} />
            <span>Win Rate</span>
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums font-mono text-[var(--text-primary)]">
            %
            {team.totals.quotes > 0
              ? Math.round((team.totals.deals / team.totals.quotes) * 100)
              : 0}
          </div>
        </Card>
        <Card className="p-4 rounded-lg">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            <AlertCircle size={14} strokeWidth={1.5} />
            <span>Aktif Sales</span>
          </div>
          <div className="mt-2 text-2xl font-semibold tabular-nums font-mono text-[var(--text-primary)]">{team.reps.length}</div>
        </Card>
      </div>

      <Card className="overflow-hidden p-0 rounded-lg">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-3">
          <h3 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-secondary)]">Leaderboard — Bu Hafta</h3>
          <span className="text-xs text-[var(--text-muted)]">
            Sıralama: kazanılan teklif tutarı → görüşme sayısı
          </span>
        </div>

        {sortedReps.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="Henüz aktif sales rep yok"
            hint="Ekip eklendiğinde performans burada görünecek."
            className="m-4"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--surface-1)] text-left text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
                <tr>
                  <th className="px-4 py-2 font-medium">#</th>
                  <th className="px-4 py-2 font-medium">Sales Rep</th>
                  <th className="px-4 py-2 text-right font-medium">Görüşme</th>
                  <th className="px-4 py-2 text-right font-medium">Teklif</th>
                  <th className="px-4 py-2 text-right font-medium">Teklif ₺</th>
                  <th className="px-4 py-2 text-right font-medium">Kazanılan</th>
                  <th className="px-4 py-2 text-right font-medium">Kazanılan ₺</th>
                  <th className="px-4 py-2 text-right font-medium">Win %</th>
                  <th className="px-4 py-2 text-right font-medium">Portföy</th>
                  <th className="px-4 py-2 text-right font-medium">Gecikmiş</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {sortedReps.map((rep, idx) => (
                  <tr key={rep.userId} className="hover:bg-[var(--surface-1)]">
                    <td className="px-4 py-3 tabular-nums font-mono text-[var(--text-muted)]">
                      {idx === 0 ? (
                        <Medal size={14} strokeWidth={1.5} className="text-[var(--accent)]" />
                      ) : idx === 1 ? (
                        <Medal size={14} strokeWidth={1.5} className="text-[var(--text-secondary)]" />
                      ) : idx === 2 ? (
                        <Medal size={14} strokeWidth={1.5} className="text-[var(--warn)]" />
                      ) : (
                        idx + 1
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-[var(--text-primary)]">{rep.name}</div>
                      <div className="text-xs text-[var(--text-muted)]">{rep.email}</div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-mono">
                      {rep.callsLoggedThisWeek}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-mono">
                      {rep.quotesSentThisWeek}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-mono text-[var(--text-secondary)]">
                      {fmtTry(rep.quotesSentAmountThisWeek)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums font-mono text-[var(--ok)]">
                      {rep.dealsWonThisWeek}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-mono font-medium text-[var(--ok)]">
                      {fmtTry(rep.dealsWonAmountThisWeek)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-mono">
                      <span
                        className={
                          rep.winRatePct >= 30
                            ? "rounded-md border border-[var(--ok-border)] bg-[var(--ok-dim)] px-2 py-0.5 text-xs font-medium text-[var(--ok)]"
                            : rep.winRatePct > 0
                              ? "rounded-md border border-[var(--warn-border)] bg-[var(--warn-dim)] px-2 py-0.5 text-xs font-medium text-[var(--warn)]"
                              : "text-[var(--text-muted)]"
                        }
                      >
                        %{rep.winRatePct}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-mono text-[var(--text-muted)]">
                      {rep.activePortfolioCount}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-mono">
                      {rep.overdueTaskCount > 0 ? (
                        <span className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-dim)] px-2 py-0.5 text-xs font-medium text-[var(--danger)]">
                          {rep.overdueTaskCount}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-4 rounded-lg">
        <p className="text-xs text-[var(--text-muted)]">
          <strong className="text-[var(--text-secondary)]">Görüşme</strong> = bu hafta CALL tipinde Note (logla telefon).{" "}
          <strong className="text-[var(--text-secondary)]">Teklif</strong> = sentAt bu hafta olan teklifler.{" "}
          <strong className="text-[var(--text-secondary)]">Kazanılan</strong> = status WON ve updatedAt bu hafta.{" "}
          <strong className="text-[var(--text-secondary)]">Win %</strong> = kazanılan / teklif.
        </p>
      </Card>
    </div>
  );
}

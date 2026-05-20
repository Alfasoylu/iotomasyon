import { BarChart3, Phone, FileText, Trophy, AlertCircle } from "lucide-react";
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
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Phone className="h-4 w-4" />
            <span>Görüşme</span>
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900">
            {team.totals.calls.toLocaleString("tr-TR")}
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <FileText className="h-4 w-4" />
            <span>Teklif</span>
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900">
            {team.totals.quotes.toLocaleString("tr-TR")}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">{fmtTry(team.totals.quotesAmount)}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Trophy className="h-4 w-4" />
            <span>Kazanılan</span>
          </div>
          <div className="mt-1 text-2xl font-bold text-emerald-700">
            {team.totals.deals.toLocaleString("tr-TR")}
          </div>
          <div className="mt-0.5 text-xs text-emerald-600">{fmtTry(team.totals.dealsAmount)}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <BarChart3 className="h-4 w-4" />
            <span>Win Rate</span>
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900">
            %
            {team.totals.quotes > 0
              ? Math.round((team.totals.deals / team.totals.quotes) * 100)
              : 0}
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <AlertCircle className="h-4 w-4" />
            <span>Aktif Sales</span>
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-900">{team.reps.length}</div>
        </Card>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Leaderboard — Bu Hafta</h3>
          <span className="text-xs text-slate-500">
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
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-2">#</th>
                  <th className="px-4 py-2">Sales Rep</th>
                  <th className="px-4 py-2 text-right">Görüşme</th>
                  <th className="px-4 py-2 text-right">Teklif</th>
                  <th className="px-4 py-2 text-right">Teklif ₺</th>
                  <th className="px-4 py-2 text-right">Kazanılan</th>
                  <th className="px-4 py-2 text-right">Kazanılan ₺</th>
                  <th className="px-4 py-2 text-right">Win %</th>
                  <th className="px-4 py-2 text-right">Portföy</th>
                  <th className="px-4 py-2 text-right">Gecikmiş</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedReps.map((rep, idx) => (
                  <tr key={rep.userId} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-400">
                      {idx === 0 ? (
                        <span title="Lider">🏆</span>
                      ) : idx === 1 ? (
                        <span title="2.">🥈</span>
                      ) : idx === 2 ? (
                        <span title="3.">🥉</span>
                      ) : (
                        idx + 1
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{rep.name}</div>
                      <div className="text-xs text-slate-500">{rep.email}</div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {rep.callsLoggedThisWeek}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {rep.quotesSentThisWeek}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {fmtTry(rep.quotesSentAmountThisWeek)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-emerald-700">
                      {rep.dealsWonThisWeek}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-emerald-700">
                      {fmtTry(rep.dealsWonAmountThisWeek)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <span
                        className={
                          rep.winRatePct >= 30
                            ? "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                            : rep.winRatePct > 0
                              ? "rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                              : "text-slate-400"
                        }
                      >
                        %{rep.winRatePct}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                      {rep.activePortfolioCount}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {rep.overdueTaskCount > 0 ? (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">
                          {rep.overdueTaskCount}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-4">
        <p className="text-xs text-slate-500">
          <strong>Görüşme</strong> = bu hafta CALL tipinde Note (logla telefon).{" "}
          <strong>Teklif</strong> = sentAt bu hafta olan teklifler.{" "}
          <strong>Kazanılan</strong> = status WON ve updatedAt bu hafta.{" "}
          <strong>Win %</strong> = kazanılan / teklif.
        </p>
      </Card>
    </div>
  );
}

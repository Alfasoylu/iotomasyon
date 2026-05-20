import { Phone, FileText, Trophy, Clock } from "lucide-react";

import type { SalesRepKPIs } from "@/services/sales-rep-kpi-service";

function fmtTry(n: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Sales rep'in günlük performans göstergesi.
 *
 * Bugün: 12/30 görüşme (progress bar) · ₺8,400 quoted · 2 kazanılan · 3 gecikmiş
 */
export function SalesRepKpiBar({ kpis, userName }: { kpis: SalesRepKPIs; userName: string }) {
  const progressPct = Math.min(100, Math.round((kpis.todayCallsLogged / kpis.dailyCallTarget) * 100));
  const isOnTrack = progressPct >= 60;

  return (
    <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-white via-violet-50/40 to-white p-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-slate-500">
            {userName.split(" ")[0]} bugün
          </span>
        </div>

        {/* Görüşme progress */}
        <div className="flex items-center gap-2">
          <Phone className={`h-3.5 w-3.5 ${isOnTrack ? "text-emerald-600" : "text-amber-600"}`} />
          <span className="font-mono font-semibold text-slate-900 tabular-nums">
            {kpis.todayCallsLogged}/{kpis.dailyCallTarget}
          </span>
          <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${isOnTrack ? "bg-emerald-500" : "bg-amber-500"}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-[10px] text-slate-500">görüşme</span>
        </div>

        {/* Quote tutarı */}
        <div className="flex items-center gap-1.5 text-slate-600">
          <FileText className="h-3.5 w-3.5 text-blue-600" />
          <span className="font-mono font-semibold text-slate-900">{fmtTry(kpis.todayQuotesAmountTry)}</span>
          <span className="text-[10px] text-slate-500">teklif</span>
        </div>

        {/* Bu hafta kazanılan */}
        <div className="flex items-center gap-1.5 text-slate-600">
          <Trophy className="h-3.5 w-3.5 text-emerald-600" />
          <span className="font-mono font-semibold text-slate-900">{kpis.thisWeekDealsWon}</span>
          <span className="text-[10px] text-slate-500">bu hafta kazanıldı</span>
        </div>

        {/* Gecikmiş görev */}
        {kpis.overdueTaskCount > 0 && (
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-rose-600" />
            <span className="font-mono font-semibold text-rose-700">{kpis.overdueTaskCount}</span>
            <span className="text-[10px] text-rose-600">gecikmiş görev</span>
          </div>
        )}
      </div>
    </div>
  );
}

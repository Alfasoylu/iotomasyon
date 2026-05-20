import Link from "next/link";
import { Phone, MessageCircle, Zap, Target, FileText, Trophy, Clock, AlertTriangle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CustomerAvatar } from "@/components/customers/customer-avatar";
import { telLink, whatsappLink } from "@/lib/customer-contact";
import type { SalesRepKPIs } from "@/services/sales-rep-kpi-service";
import type { CohortCounts } from "@/services/customer-cohort-service";

interface NowCallCustomer {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  whatsapp: string | null;
  city: string | null;
  district: string | null;
  status: string;
  lastContactedAt: Date | null;
  segmentLabel: string | null;
  industryLabel: string | null;
  daysSinceContact: number | null;
}

interface MyTask {
  id: string;
  title: string;
  dueDate: Date | null;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  customerId: string | null;
  customerName: string | null;
  isOverdue: boolean;
}

interface Props {
  userName: string;
  kpis: SalesRepKPIs;
  cohortCounts: CohortCounts;
  nowCallCustomer: NowCallCustomer | null;
  myTasks: MyTask[];
  weeklyTarget: { calls: number; quotes: number; deals: number };
}

function fmtTry(n: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(n);
}

const PRIORITY_LABELS: Record<string, string> = {
  URGENT: "🔴",
  HIGH: "🟠",
  MEDIUM: "🟡",
  LOW: "🟢",
};

export function SalesRepDashboard({
  userName,
  kpis,
  cohortCounts,
  nowCallCustomer,
  myTasks,
  weeklyTarget,
}: Props) {
  const callsProgress = Math.min(100, Math.round((kpis.todayCallsLogged / kpis.dailyCallTarget) * 100));
  const phoneHref = nowCallCustomer ? telLink(nowCallCustomer.phone || nowCallCustomer.whatsapp) : null;
  const waHref = nowCallCustomer ? whatsappLink(nowCallCustomer.whatsapp || nowCallCustomer.phone) : null;

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Hero başlık */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-blue-600">SATIŞ PANOSU</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
          Günaydın, {userName.split(" ")[0]} 👋
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Bugün ne yapacaksın? Aşağıdaki müşteriyi ara, görevini bitir, hedefe ilerle.
        </p>
      </div>

      {/* Bugün KPI manşet bandı */}
      <Card className="p-5 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-blue-700">
              <Phone className="h-3.5 w-3.5" />
              Bugün görüşme
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
              {kpis.todayCallsLogged}<span className="text-base text-slate-400">/{kpis.dailyCallTarget}</span>
            </p>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500"
                style={{ width: `${callsProgress}%` }}
              />
            </div>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
              <FileText className="h-3.5 w-3.5" />
              Bugün teklif
            </p>
            <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
              {fmtTry(kpis.todayQuotesAmountTry)}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
              <Trophy className="h-3.5 w-3.5" />
              Bu hafta kazandın
            </p>
            <p className="mt-1 text-2xl font-bold text-emerald-700 tabular-nums">
              {kpis.thisWeekDealsWon}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-xs font-medium text-rose-700">
              <AlertTriangle className="h-3.5 w-3.5" />
              Gecikmiş görev
            </p>
            <p className={`mt-1 text-2xl font-bold tabular-nums ${kpis.overdueTaskCount > 0 ? "text-rose-700" : "text-slate-900"}`}>
              {kpis.overdueTaskCount}
            </p>
          </div>
        </div>
      </Card>

      {/* Şimdi bunu ara hero */}
      {nowCallCustomer ? (
        <Card className="p-6 border-2 border-emerald-300 bg-gradient-to-br from-emerald-50 to-white shadow-md">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4 min-w-0 flex-1">
              <CustomerAvatar name={nowCallCustomer.name} avatarUrl={null} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-emerald-700">
                  ⚡ Şimdi bunu ara
                </p>
                <Link
                  href={`/customers/${nowCallCustomer.id}`}
                  className="mt-1 block text-xl font-bold text-slate-900 hover:text-slate-700"
                >
                  {nowCallCustomer.name}
                </Link>
                {nowCallCustomer.company && (
                  <p className="text-sm text-slate-600 truncate">{nowCallCustomer.company}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                  {nowCallCustomer.phone && (
                    <span className="font-mono font-semibold text-slate-900">
                      {nowCallCustomer.phone}
                    </span>
                  )}
                  {nowCallCustomer.city && (
                    <span>📍 {nowCallCustomer.city}{nowCallCustomer.district ? ` / ${nowCallCustomer.district}` : ""}</span>
                  )}
                  {nowCallCustomer.industryLabel && (
                    <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-slate-200">
                      {nowCallCustomer.industryLabel}
                    </span>
                  )}
                  {nowCallCustomer.segmentLabel && (
                    <Badge tone="success">{nowCallCustomer.segmentLabel}</Badge>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {nowCallCustomer.lastContactedAt
                    ? `Son temas ${nowCallCustomer.daysSinceContact} gün önce`
                    : "Hiç temas yok — soğuk müşteri"}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-shrink-0">
              {phoneHref && (
                <a
                  href={phoneHref}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-base font-bold text-white shadow-md transition hover:bg-emerald-700"
                >
                  <Phone className="h-5 w-5" />
                  ARA
                </a>
              )}
              {waHref && (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-green-700"
                >
                  <MessageCircle className="h-4 w-4" />
                  WhatsApp
                </a>
              )}
              <Link
                href="/customers?cohort=queue"
                className="text-center text-xs text-slate-500 hover:text-slate-700"
              >
                Tüm kuyruğa git →
              </Link>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-6 text-center">
          <Zap className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-2 text-sm font-semibold text-slate-700">Sıralı aramaya hazır müşteri yok</p>
          <p className="mt-1 text-xs text-slate-500">Tüm müşteriler aranmış veya kuyruk boş.</p>
        </Card>
      )}

      {/* 3'lü cohort kartı */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/customers?cohort=queue"
          className="rounded-xl border border-violet-200 bg-violet-50 p-4 transition hover:bg-violet-100"
        >
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-violet-600" />
            <span className="text-xs font-medium text-violet-700">Sıralı Arama</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-violet-900 tabular-nums">
            {Math.min(30, cohortCounts.totalActive)}
          </p>
          <p className="text-xs text-violet-700">akıllı sıralı — telefonu olan</p>
        </Link>
        <Link
          href="/customers?cohort=todayCall"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 transition hover:bg-rose-100"
        >
          <div className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-rose-600" />
            <span className="text-xs font-medium text-rose-700">Bugün Görev</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-rose-900 tabular-nums">
            {cohortCounts.todayCall}
          </p>
          <p className="text-xs text-rose-700">vadesi gelen müşteri</p>
        </Link>
        <Link
          href="/customers?cohort=openQuotes"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 transition hover:bg-amber-100"
        >
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-amber-600" />
            <span className="text-xs font-medium text-amber-700">Açık Teklif</span>
          </div>
          <p className="mt-2 text-2xl font-bold text-amber-900 tabular-nums">
            {cohortCounts.openQuotes}
          </p>
          <p className="text-xs text-amber-700">7g+ hareketsiz, takip et</p>
        </Link>
      </div>

      {/* Görevlerim + Bu hafta */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Görevlerim */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
              Görevlerim
            </p>
            <Link href="/tasks" className="text-xs font-medium text-blue-600 hover:text-blue-800">
              Tümü →
            </Link>
          </div>
          {myTasks.length === 0 ? (
            <p className="mt-4 text-center text-sm text-slate-400 py-6">
              ✨ Sana atanmış açık görev yok.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {myTasks.slice(0, 5).map((task) => (
                <li key={task.id} className="py-2.5">
                  <Link
                    href={task.customerId ? `/customers/${task.customerId}` : "/tasks"}
                    className="flex items-start gap-2 hover:bg-slate-50 -mx-2 px-2 py-1 rounded"
                  >
                    <span className="flex-shrink-0 text-base mt-0.5">
                      {PRIORITY_LABELS[task.priority]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 truncate">{task.title}</p>
                      {task.customerName && (
                        <p className="text-xs text-slate-500 truncate">{task.customerName}</p>
                      )}
                    </div>
                    <span
                      className={`flex-shrink-0 text-[10px] font-semibold whitespace-nowrap ${
                        task.isOverdue ? "text-rose-700" : "text-slate-500"
                      }`}
                    >
                      {task.dueDate
                        ? new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short" }).format(task.dueDate)
                        : "—"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Bu hafta hedef */}
        <Card className="p-5">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Bu Hafta Hedef
          </p>
          <div className="mt-4 space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">📞 Görüşme</span>
                <span className="font-semibold text-slate-900 tabular-nums">
                  {kpis.todayCallsLogged} / {weeklyTarget.calls}
                </span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-blue-500"
                  style={{ width: `${Math.min(100, Math.round((kpis.todayCallsLogged / weeklyTarget.calls) * 100))}%` }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">📄 Teklif</span>
                <span className="font-semibold text-slate-900 tabular-nums">
                  {fmtTry(kpis.todayQuotesAmountTry)}
                </span>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">🏆 Kazanılan teklif</span>
                <span className="font-semibold text-slate-900 tabular-nums">
                  {kpis.thisWeekDealsWon} / {weeklyTarget.deals}
                </span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-emerald-500"
                  style={{ width: `${Math.min(100, Math.round((kpis.thisWeekDealsWon / Math.max(1, weeklyTarget.deals)) * 100))}%` }}
                />
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-4 bg-slate-50">
        <p className="text-xs text-slate-500">
          <Clock className="mr-1 inline h-3 w-3 align-text-bottom" />
          Sıralı arama akıllı sıraya göre: telefonu olan + sıcak fırsat + uyuyan müşteri rotasyonu.
          Bir müşteri arandığında otomatik sonraki gelir.
        </p>
      </Card>
    </div>
  );
}

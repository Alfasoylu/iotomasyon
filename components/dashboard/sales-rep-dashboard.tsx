import Link from "next/link";
import {
  Phone,
  MessageCircle,
  Zap,
  FileText,
  Trophy,
  Clock,
  AlertTriangle,
  MapPin,
  Sparkles,
  PhoneCall,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CustomerAvatar } from "@/components/customers/customer-avatar";
import { SalesRepFirstTimeBanner } from "@/components/dashboard/sales-rep-first-time-banner";
import { telLink, whatsappLink } from "@/lib/customer-contact";
import { shortenCustomerName } from "@/lib/display-helpers";
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

const PRIORITY_DOT: Record<string, string> = {
  URGENT: "bg-[var(--danger)]",
  HIGH: "bg-[var(--warn)]",
  MEDIUM: "bg-[var(--accent)]",
  LOW: "bg-[var(--ok)]",
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
    <div className="max-w-6xl space-y-6">
      {/* Hero başlık */}
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          Satış Panosu
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
          Günaydın, {userName.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Bugün ne yapacaksın? Aşağıdaki müşteriyi ara, görevini bitir, hedefe ilerle.
        </p>
      </div>

      {/* P5 — İlk giriş onboarding banner (LS hatırlar, bir kez gösterir) */}
      <SalesRepFirstTimeBanner />

      {/* Bugün KPI manşet bandı */}
      <Card className="p-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          Bugün
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              <Phone size={14} strokeWidth={1.5} />
              Görüşme
            </p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
              {kpis.todayCallsLogged}
              <span className="font-mono text-base text-[var(--text-muted)]">/{kpis.dailyCallTarget}</span>
            </p>
            <div className="mt-1.5 h-1 w-full overflow-hidden rounded-md bg-[var(--surface-3)]">
              <div
                className="h-full bg-[var(--accent)]"
                style={{ width: `${callsProgress}%` }}
              />
            </div>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              <FileText size={14} strokeWidth={1.5} />
              Teklif
            </p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[var(--text-primary)]">
              {fmtTry(kpis.todayQuotesAmountTry)}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              <Trophy size={14} strokeWidth={1.5} />
              Bu hafta kazanılan
            </p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[var(--ok)]">
              {kpis.thisWeekDealsWon}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              <AlertTriangle size={14} strokeWidth={1.5} />
              Gecikmiş görev
            </p>
            <p
              className={`mt-1 font-mono text-2xl font-semibold tabular-nums ${
                kpis.overdueTaskCount > 0 ? "text-[var(--danger)]" : "text-[var(--text-primary)]"
              }`}
            >
              {kpis.overdueTaskCount}
            </p>
          </div>
        </div>
      </Card>

      {/* Şimdi bunu ara hero */}
      {nowCallCustomer ? (
        <Card className="border-[var(--accent-border)] bg-[var(--accent-dim)] p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <CustomerAvatar name={nowCallCustomer.name} avatarUrl={null} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--accent)]">
                  <Sparkles size={14} strokeWidth={1.5} />
                  Şimdi bunu ara
                </p>
                <Link
                  href={`/customers/${nowCallCustomer.id}`}
                  className="mt-1 block text-xl font-semibold text-[var(--text-primary)] transition hover:text-[var(--accent)]"
                  title={nowCallCustomer.name}
                >
                  {shortenCustomerName(nowCallCustomer.name, 50)}
                </Link>
                {nowCallCustomer.company && nowCallCustomer.company.trim() !== nowCallCustomer.name.trim() && (
                  <p className="truncate text-sm text-[var(--text-secondary)]">
                    {shortenCustomerName(nowCallCustomer.company, 60)}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-secondary)]">
                  {nowCallCustomer.phone && (
                    <span className="font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                      {nowCallCustomer.phone}
                    </span>
                  )}
                  {nowCallCustomer.city && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />
                      {nowCallCustomer.city}
                      {nowCallCustomer.district ? ` / ${nowCallCustomer.district}` : ""}
                    </span>
                  )}
                  {nowCallCustomer.industryLabel && (
                    <span className="rounded border border-[var(--border-subtle)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                      {nowCallCustomer.industryLabel}
                    </span>
                  )}
                  {nowCallCustomer.segmentLabel && (
                    <Badge variant="ok">{nowCallCustomer.segmentLabel}</Badge>
                  )}
                </div>
                <p className="mt-2 text-xs text-[var(--text-muted)]">
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
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-6 py-3 text-base font-semibold text-[var(--accent-fg)] transition hover:opacity-90"
                >
                  <Phone size={18} strokeWidth={1.5} />
                  ARA
                </a>
              )}
              {waHref && (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-md border border-[var(--ok-border)] bg-[var(--ok-dim)] px-6 py-3 text-sm font-semibold text-[var(--ok)] transition hover:bg-[var(--surface-3)]"
                >
                  <MessageCircle size={14} strokeWidth={1.5} />
                  WhatsApp
                </a>
              )}
              <Link
                href="/customers?cohort=queue"
                className="text-center text-xs text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
              >
                Tüm kuyruğa git →
              </Link>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-6 text-center">
          <Zap size={28} strokeWidth={1.5} className="mx-auto text-[var(--text-muted)]" />
          <p className="mt-2 text-sm font-semibold text-[var(--text-primary)]">
            Sıralı aramaya hazır müşteri yok
          </p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Tüm müşteriler aranmış veya kuyruk boş.
          </p>
        </Card>
      )}

      {/* 3'lü cohort kartı */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/customers?cohort=queue"
          className="block rounded-lg border border-[var(--accent-border)] bg-[var(--accent-dim)] p-4 transition hover:bg-[var(--surface-3)]"
        >
          <div className="flex items-center gap-2">
            <Zap size={14} strokeWidth={1.5} className="text-[var(--accent)]" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Sıralı Arama
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[var(--accent)]">
            {Math.min(30, cohortCounts.totalActive)}
          </p>
          <p className="text-[11px] text-[var(--text-secondary)]">
            akıllı sıralı — telefonu olan
          </p>
        </Link>
        <Link
          href="/customers?cohort=todayCall"
          className="block rounded-lg border border-[var(--danger-border)] bg-[var(--danger-dim)] p-4 transition hover:bg-[var(--surface-3)]"
        >
          <div className="flex items-center gap-2">
            <Phone size={14} strokeWidth={1.5} className="text-[var(--danger)]" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Bugün Görev
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[var(--danger)]">
            {cohortCounts.todayCall}
          </p>
          <p className="text-[11px] text-[var(--text-secondary)]">vadesi gelen müşteri</p>
        </Link>
        <Link
          href="/customers?cohort=openQuotes"
          className="block rounded-lg border border-[var(--warn-border)] bg-[var(--warn-dim)] p-4 transition hover:bg-[var(--surface-3)]"
        >
          <div className="flex items-center gap-2">
            <FileText size={14} strokeWidth={1.5} className="text-[var(--warn)]" />
            <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Açık Teklif
            </span>
          </div>
          <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[var(--warn)]">
            {cohortCounts.openQuotes}
          </p>
          <p className="text-[11px] text-[var(--text-secondary)]">7g+ hareketsiz, takip et</p>
        </Link>
      </div>

      {/* Görevlerim + Bu hafta */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Görevlerim */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Görevlerim
            </p>
            <Link
              href="/tasks"
              className="text-xs font-medium text-[var(--accent)] transition hover:text-[var(--text-primary)]"
            >
              Tümü →
            </Link>
          </div>
          {myTasks.length === 0 ? (
            <p className="mt-4 py-6 text-center text-sm text-[var(--text-muted)]">
              Sana atanmış açık görev yok.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-[var(--border-subtle)]">
              {myTasks.slice(0, 5).map((task) => (
                <li key={task.id} className="py-2.5">
                  <Link
                    href={task.customerId ? `/customers/${task.customerId}` : "/tasks"}
                    className="-mx-2 flex items-start gap-2 rounded-md px-2 py-1 transition hover:bg-[var(--surface-3)]"
                  >
                    <span
                      className={`mt-1.5 inline-block h-2 w-2 flex-shrink-0 rounded-full ${PRIORITY_DOT[task.priority]}`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                        {task.title}
                      </p>
                      {task.customerName && (
                        <p className="truncate text-xs text-[var(--text-secondary)]">
                          {task.customerName}
                        </p>
                      )}
                    </div>
                    <span
                      className={`flex-shrink-0 whitespace-nowrap font-mono text-[11px] font-semibold tabular-nums ${
                        task.isOverdue ? "text-[var(--danger)]" : "text-[var(--text-muted)]"
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
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            Bu Hafta Hedef
          </p>
          <div className="mt-4 space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                  <PhoneCall size={14} strokeWidth={1.5} />
                  Görüşme
                </span>
                <span className="font-mono font-semibold tabular-nums text-[var(--text-primary)]">
                  {kpis.todayCallsLogged} / {weeklyTarget.calls}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-md bg-[var(--surface-3)]">
                <div
                  className="h-full bg-[var(--info)]"
                  style={{
                    width: `${Math.min(100, Math.round((kpis.todayCallsLogged / weeklyTarget.calls) * 100))}%`,
                  }}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                  <FileText size={14} strokeWidth={1.5} />
                  Teklif
                </span>
                <span className="font-mono font-semibold tabular-nums text-[var(--text-primary)]">
                  {fmtTry(kpis.todayQuotesAmountTry)}
                </span>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                  <Trophy size={14} strokeWidth={1.5} />
                  Kazanılan teklif
                </span>
                <span className="font-mono font-semibold tabular-nums text-[var(--text-primary)]">
                  {kpis.thisWeekDealsWon} / {weeklyTarget.deals}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-md bg-[var(--surface-3)]">
                <div
                  className="h-full bg-[var(--ok)]"
                  style={{
                    width: `${Math.min(100, Math.round((kpis.thisWeekDealsWon / Math.max(1, weeklyTarget.deals)) * 100))}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="bg-[var(--surface-1)] p-4">
        <p className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
          <Clock size={14} strokeWidth={1.5} className="mt-0.5 flex-shrink-0" />
          <span>
            Sıralı arama akıllı sıraya göre: telefonu olan + sıcak fırsat + uyuyan müşteri rotasyonu.
            Bir müşteri arandığında otomatik sonraki gelir.
          </span>
        </p>
      </Card>
    </div>
  );
}

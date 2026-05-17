import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import { StatCard } from "./shared/stat-card";
import type { SalesPipelineData } from "@/services/dashboard-service";

const STATUS_LABELS: Record<string, string> = {
  NEW: "Yeni",
  WAITING_STOCK: "Stok Bekleniyor",
  CONTACTED: "İletişim Kuruldu",
  QUOTED: "Teklif Verildi",
  WON: "Kazanıldı",
  LOST: "Kaybedildi",
  CANCELLED: "İptal",
};

const STATUS_TONES: Record<string, string> = {
  QUOTED: "bg-amber-100 text-amber-800",
  CONTACTED: "bg-blue-100 text-blue-800",
  WON: "bg-emerald-100 text-emerald-800",
  NEW: "bg-slate-100 text-slate-700",
  WAITING_STOCK: "bg-violet-100 text-violet-800",
  CANCELLED: "bg-red-100 text-red-700",
};

const CUSTOMER_STATUS_TONES: Record<string, string> = {
  QUOTED: "text-amber-700",
  NEGOTIATING: "text-blue-700",
  WON: "text-emerald-700",
  NEW: "text-slate-500",
  LOST: "text-red-500",
};

const PRIORITY_LABELS: Record<string, string> = {
  URGENT: "🔴 Acil",
  HIGH: "🟠 Yüksek",
  NORMAL: "🟡 Normal",
  LOW: "🟢 Düşük",
};

const STAGE_LABELS: Record<string, string> = {
  INTERESTED: "İlgileniyor",
  PRICE_SENT: "Fiyat Gönderildi",
  NEGOTIATING: "Müzakerede",
  WAITING: "Bekliyor",
  ORDERED: "Sipariş Verdi",
  CANCELLED: "İptal",
};

const STAGE_COLORS: Record<string, string> = {
  INTERESTED: "bg-blue-50 text-blue-700",
  PRICE_SENT: "bg-amber-50 text-amber-700",
  NEGOTIATING: "bg-violet-50 text-violet-700",
  WAITING: "bg-slate-100 text-slate-600",
  ORDERED: "bg-emerald-50 text-emerald-700",
  CANCELLED: "bg-red-50 text-red-600",
};

export function SalesWorkspace({ data }: { data: SalesPipelineData }) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-[2rem] border border-slate-200 bg-white px-6 py-8 shadow-sm md:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge tone="success">Satış</Badge>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
              Satış Panosu
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
              Aktif fırsatlar, bugünkü takipler ve müşteri aktiviteleri.
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/customers">
              <Button>Müşteri Listesi</Button>
            </Link>
            <Link href="/tasks">
              <Button variant="secondary">Tüm Görevler</Button>
            </Link>
          </div>
        </div>
      </section>

      {!data.databaseAvailable && (
        <Card className="border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900">
          Veritabanı bağlantısı şu anda kullanılamıyor.
        </Card>
      )}

      {/* KPI tiles */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          Benim İçin
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Aktif Fırsat"
            value={data.activeInterests.length}
          />
          <StatCard
            label="Bugün Takip"
            value={data.dueTodayTasks.length}
            tone={data.dueTodayTasks.length > 0 ? "warning" : "default"}
          />
          <StatCard
            label="Açık Görev"
            value={data.openTasksCount}
          />
          <StatCard
            label="Geciken Görev"
            value={data.overdueTasksCount}
            tone={data.overdueTasksCount > 0 ? "danger" : "default"}
          />
        </div>
      </section>

      {/* Active interests + today tasks */}
      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        {/* Active pipeline */}
        <Card className="p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Aktif Fırsatlar
          </p>
          {data.activeInterests.length === 0 ? (
            <p className="mt-5 text-sm text-slate-400">
              Atanmış aktif fırsat bulunmuyor.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {data.activeInterests.map((interest) => (
                <li key={interest.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {interest.customer.name}
                        </p>
                        {(interest.priority === "URGENT" || interest.priority === "HIGH") && (
                          <span className="flex-shrink-0 text-[10px]">
                            {interest.priority === "URGENT" ? "🔴" : "🟠"}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {interest.product.name}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {interest.stage && (
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STAGE_COLORS[interest.stage] ?? "bg-slate-100 text-slate-600"}`}>
                            {STAGE_LABELS[interest.stage] ?? interest.stage}
                          </span>
                        )}
                        {interest.lastContactedAt && (
                          <span className="text-[10px] text-slate-400">
                            Son temas: {formatDateTime(interest.lastContactedAt)}
                          </span>
                        )}
                        {interest.followUpAt && !interest.lastContactedAt && (
                          <span className="text-[10px] text-slate-400">
                            Takip: {formatDateTime(interest.followUpAt)}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_TONES[interest.status] ?? "bg-slate-100 text-slate-600"}`}
                    >
                      {STATUS_LABELS[interest.status] ?? interest.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <Link href="/customers" className="text-xs font-medium text-slate-500 hover:text-slate-900">
              Tüm müşteriler →
            </Link>
          </div>
        </Card>

        {/* Today's tasks */}
        <Card className="p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Bugün Yapılacaklar
          </p>
          {data.dueTodayTasks.length === 0 ? (
            <p className="mt-5 text-sm text-slate-400">
              Bugün için takip görevi yok.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {data.dueTodayTasks.map((task) => (
                <li key={task.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {task.title}
                      </p>
                      {task.customer && (
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {task.customer.name}
                        </p>
                      )}
                    </div>
                    <span className="flex-shrink-0 text-[10px] text-slate-400">
                      {PRIORITY_LABELS[task.priority] ?? task.priority}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <Link href="/tasks" className="text-xs font-medium text-slate-500 hover:text-slate-900">
              Tüm görevler →
            </Link>
          </div>
        </Card>
      </section>

      {/* Önerilen Fırsatlar — high/urgent priority team-wide */}
      {data.topOpportunities.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Önerilen Fırsatlar
          </h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.topOpportunities.map((opp) => (
              <Link
                key={opp.id}
                href={`/customers/${opp.customer.id}`}
                className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm hover:shadow-md transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900 truncate">{opp.customer.name}</p>
                  <span className="flex-shrink-0 text-xs font-medium">
                    {PRIORITY_LABELS[opp.priority] ?? opp.priority}
                  </span>
                </div>
                <p className="text-xs text-slate-500 truncate">{opp.product.name}</p>
                <div className="flex items-center gap-2">
                  {opp.stage && (
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STAGE_COLORS[opp.stage] ?? "bg-slate-100 text-slate-600"}`}>
                      {STAGE_LABELS[opp.stage] ?? opp.stage}
                    </span>
                  )}
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${STATUS_TONES[opp.status] ?? "bg-slate-100 text-slate-600"}`}>
                    {STATUS_LABELS[opp.status] ?? opp.status}
                  </span>
                </div>
                {opp.assignedTo && (
                  <p className="text-[10px] text-slate-400">Temsilci: {opp.assignedTo.name}</p>
                )}
                {opp.lastContactedAt && (
                  <p className="text-[10px] text-slate-400">Son temas: {formatDateTime(opp.lastContactedAt)}</p>
                )}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Recent customer activity */}
      {data.recentCustomers.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Son 7 Günde Aktif Müşteriler
          </h2>
          <Card className="divide-y divide-slate-100">
            {data.recentCustomers.map((customer) => (
              <div key={customer.id} className="flex items-center justify-between gap-4 px-6 py-4">
                <Link
                  href={`/customers/${customer.id}`}
                  className="min-w-0 flex-1 text-sm font-medium text-slate-900 hover:text-slate-600"
                >
                  {customer.name}
                </Link>
                <span
                  className={`flex-shrink-0 text-xs font-medium ${CUSTOMER_STATUS_TONES[customer.status] ?? "text-slate-500"}`}
                >
                  {STATUS_LABELS[customer.status] ?? customer.status}
                </span>
                <span className="flex-shrink-0 text-xs text-slate-400">
                  {formatDateTime(customer.updatedAt)}
                </span>
              </div>
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}

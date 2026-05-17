import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import { StatCard, LinkedStatCard } from "./shared/stat-card";
import type { OperationsDashboardData } from "@/services/dashboard-service";

const PRIORITY_LABELS: Record<string, string> = {
  HIGH: "🔴 Yüksek",
  MEDIUM: "🟡 Orta",
  LOW: "🟢 Düşük",
};

export function OperationsWorkspace({
  data,
}: {
  data: OperationsDashboardData;
}) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-[2rem] border border-slate-200 bg-white px-6 py-8 shadow-sm md:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge tone="warning">Operasyon</Badge>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
              Operasyon Panosu
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
              Açık görevler, stok uyarıları ve günlük operasyon sinyalleri.
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/tasks">
              <Button>Görev Listesi</Button>
            </Link>
            <Link href="/admin/stock-health">
              <Button variant="secondary">Stok Sağlığı</Button>
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
          Görev Durumu
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Açık Görev" value={data.openTasksCount} />
          <StatCard
            label="Geciken Görev"
            value={data.overdueTasksCount}
            tone={data.overdueTasksCount > 0 ? "danger" : "default"}
          />
          <StatCard
            label="Bugün Yapılacak"
            value={data.dueTodayTasks.length}
            tone={data.dueTodayTasks.length > 0 ? "warning" : "default"}
          />
          <StatCard
            label="Kritik Stok"
            value={data.criticalStockCount}
            tone={data.criticalStockCount > 0 ? "danger" : "default"}
          />
        </div>
      </section>

      {/* Stock + Orders */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          Stok &amp; Sipariş
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <LinkedStatCard
            label="Düşük Stok Ürün"
            value={data.lowStockCount}
            tone={data.lowStockCount > 0 ? "warning" : "default"}
            href="/admin/stock-health"
          />
          <LinkedStatCard
            label="Eşleşmemiş Sipariş"
            value={data.unmatchedOrdersCount}
            tone={data.unmatchedOrdersCount > 100 ? "warning" : "default"}
            href="/admin/marketplace-mappings"
          />
          <LinkedStatCard
            label="Son 7 Gün Sipariş (Adet)"
            value={data.recentOrderQty7d}
            href="/orders"
          />
        </div>
      </section>

      {/* Today's tasks */}
      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
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
                      {task.assignedTo && (
                        <p className="mt-0.5 truncate text-xs text-slate-400">
                          → {task.assignedTo.name}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-shrink-0 flex-col items-end gap-1">
                      <span className="text-[10px] text-slate-400">
                        {PRIORITY_LABELS[task.priority] ?? task.priority}
                      </span>
                      {task.dueDate && (
                        <span className="text-[10px] text-slate-400">
                          {formatDateTime(task.dueDate)}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4">
            <Link
              href="/tasks"
              className="text-xs font-medium text-slate-500 hover:text-slate-900"
            >
              Tüm görevler →
            </Link>
          </div>
        </Card>

        {/* Stock alerts summary */}
        <Card className="p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Stok Durumu
          </p>
          <div className="mt-5 space-y-4">
            <div className="flex items-center justify-between rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-red-800">
                  Kritik Stok
                </p>
                <p className="mt-0.5 text-xs text-red-600">
                  Stok adedi sıfır veya altında
                </p>
              </div>
              <p className="text-2xl font-bold text-red-700">
                {data.criticalStockCount}
              </p>
            </div>
            <div
              className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${data.lowStockCount > 0 ? "border-amber-100 bg-amber-50" : "border-slate-100 bg-slate-50"}`}
            >
              <div>
                <p
                  className={`text-sm font-semibold ${data.lowStockCount > 0 ? "text-amber-800" : "text-slate-600"}`}
                >
                  Düşük Stok
                </p>
                <p
                  className={`mt-0.5 text-xs ${data.lowStockCount > 0 ? "text-amber-600" : "text-slate-400"}`}
                >
                  Minimum stok seviyesinde veya altında
                </p>
              </div>
              <p
                className={`text-2xl font-bold ${data.lowStockCount > 0 ? "text-amber-700" : "text-slate-500"}`}
              >
                {data.lowStockCount}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <Link
              href="/admin/stock-health"
              className="text-xs font-medium text-slate-500 hover:text-slate-900"
            >
              Stok sağlığı →
            </Link>
          </div>
        </Card>
      </section>
    </div>
  );
}

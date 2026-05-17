import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatCard, LinkedStatCard } from "./shared/stat-card";
import type { OperationsDashboardData } from "@/services/dashboard-service";

/**
 * Phase 55 — Warehouse Workspace
 *
 * Mobile-first dashboard for WAREHOUSE role.
 * Reuses OperationsDashboardData (same operational signals — no financial data).
 * NEVER shows cost, revenue, margin or financial context.
 */
export function WarehouseWorkspace({
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
            <Badge tone="warning">Depo</Badge>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
              Depo Panosu
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
              Stok durumu, kritik uyarılar ve günlük sayım görevleri.
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/warehouse">
              <Button>Ürün Ara</Button>
            </Link>
            <Link href="/warehouse/count">
              <Button variant="secondary">Stok Sayımı</Button>
            </Link>
          </div>
        </div>
      </section>

      {!data.databaseAvailable && (
        <Card className="border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900">
          Veritabanı bağlantısı şu anda kullanılamıyor.
        </Card>
      )}

      {/* Stock KPIs */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          Stok Durumu
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <LinkedStatCard
            label="Kritik Stok (0 Adet)"
            value={data.criticalStockCount}
            tone={data.criticalStockCount > 0 ? "danger" : "default"}
            href="/admin/stock-health"
          />
          <LinkedStatCard
            label="Düşük Stok"
            value={data.lowStockCount}
            tone={data.lowStockCount > 0 ? "warning" : "default"}
            href="/admin/stock-health"
          />
          <LinkedStatCard
            label="Son 7 Gün Sipariş"
            value={data.recentOrderQty7d}
            href="/orders"
          />
        </div>
      </section>

      {/* Task KPIs */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          Görevler
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
        </div>
      </section>

      {/* Quick actions */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          Hızlı İşlemler
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Link
            href="/warehouse"
            className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm hover:shadow-md"
          >
            <span className="text-3xl">🔍</span>
            <div>
              <p className="font-semibold text-slate-900">Ürün Ara</p>
              <p className="text-sm text-slate-500">Barkod, SKU veya ad ile ara</p>
            </div>
          </Link>
          <Link
            href="/warehouse/count"
            className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm hover:shadow-md"
          >
            <span className="text-3xl">📦</span>
            <div>
              <p className="font-semibold text-slate-900">Stok Sayımı</p>
              <p className="text-sm text-slate-500">Sayım girişi yap ve kaydet</p>
            </div>
          </Link>
        </div>
      </section>

      {/* Today's tasks */}
      {data.dueTodayTasks.length > 0 && (
        <section>
          <Card className="p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
              Bugün Yapılacaklar
            </p>
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
                  </div>
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <Link
                href="/tasks"
                className="text-xs font-medium text-slate-500 hover:text-slate-900"
              >
                Tüm görevler →
              </Link>
            </div>
          </Card>
        </section>
      )}
    </div>
  );
}

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatCard, LinkedStatCard } from "./shared/stat-card";
import type { MarketplaceDashboardData } from "@/services/dashboard-service";

/**
 * Phase 54 Faz F — Marketplace Workspace
 *
 * Mobile-first dashboard for MARKETPLACE_OPERATOR role.
 * Shows marketplace operational signals only.
 * NEVER shows cost, margin, or import financial context.
 */
export function MarketplaceWorkspace({
  data,
}: {
  data: MarketplaceDashboardData;
}) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="rounded-[2rem] border border-slate-200 bg-white px-6 py-8 shadow-sm md:px-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <Badge>Pazar Yeri</Badge>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
              Pazar Yeri Panosu
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
              Aktif listeleme durumu, sipariş sinyalleri ve iade uyarıları.
            </p>
          </div>
          <div className="flex gap-3">
            <Link href="/marketplace/trendyol">
              <Button>Trendyol Paneli</Button>
            </Link>
            <Link href="/marketplace/trendyol/questions">
              <Button variant="secondary">Müşteri Soruları</Button>
            </Link>
          </div>
        </div>
      </section>

      {!data.databaseAvailable && (
        <Card className="border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900">
          Veritabanı bağlantısı şu anda kullanılamıyor.
        </Card>
      )}

      {/* Listing & Order KPIs */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          Listeleme & Sipariş
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <LinkedStatCard
            label="Aktif Listeleme"
            value={data.activeListingsCount}
            href="/marketplace"
          />
          <LinkedStatCard
            label="Son 7 Gün Sipariş Adedi"
            value={data.recentOrders7d}
            href="/orders"
          />
          <LinkedStatCard
            label="Eşleşmemiş Sipariş"
            value={data.unmatchedOrdersCount}
            tone={data.unmatchedOrdersCount > 0 ? "warning" : "default"}
            href="/admin/marketplace-mappings"
          />
        </div>
      </section>

      {/* Return & Task KPIs */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          İade & Görevler
        </h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <LinkedStatCard
            label="Son 7 Gün İade"
            value={data.recentReturnCount7d}
            tone={data.recentReturnCount7d > 0 ? "warning" : "default"}
            href="/marketplace/trendyol/returns"
          />
          <StatCard
            label="Açık Görev"
            value={data.openTasksCount}
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
            href="/marketplace/trendyol/questions"
            className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm hover:shadow-md"
          >
            <span className="text-3xl">💬</span>
            <div>
              <p className="font-semibold text-slate-900">Müşteri Soruları</p>
              <p className="text-sm text-slate-500">Bekleyen soruları yanıtla</p>
            </div>
          </Link>
          <Link
            href="/marketplace/trendyol/returns"
            className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm hover:shadow-md"
          >
            <span className="text-3xl">↩️</span>
            <div>
              <p className="font-semibold text-slate-900">İade Merkezi</p>
              <p className="text-sm text-slate-500">Açık iade taleplerini yönet</p>
            </div>
          </Link>
          <Link
            href="/marketplace/trendyol"
            className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm hover:shadow-md"
          >
            <span className="text-3xl">🛒</span>
            <div>
              <p className="font-semibold text-slate-900">Trendyol Paneli</p>
              <p className="text-sm text-slate-500">Son siparişler ve durum</p>
            </div>
          </Link>
          <Link
            href="/admin/marketplace-mappings"
            className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm hover:shadow-md"
          >
            <span className="text-3xl">🔗</span>
            <div>
              <p className="font-semibold text-slate-900">Ürün Eşleştirme</p>
              <p className="text-sm text-slate-500">Eşleşmemiş siparişleri çöz</p>
            </div>
          </Link>
        </div>
      </section>
    </div>
  );
}

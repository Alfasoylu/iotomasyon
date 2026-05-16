/**
 * Phase 13 — Marketplace Monitoring Dashboard
 *
 * Three alert categories (all computed server-side, no new schema):
 *   1. Listeleme boşluğu — active products with zero marketplace listings
 *   2. Sorunlu listelemeler — listings with SUSPENDED or UNKNOWN status
 *   3. Takip edilmemiş listelemeler — listings where lastCheckedAt is null
 */

import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreateMonitoringTaskButton } from "@/components/marketplace/create-monitoring-task-button";

export const dynamic = "force-dynamic";

const PLATFORM_LABELS: Record<string, string> = {
  TRENDYOL: "Trendyol", HEPSIBURADA: "Hepsiburada", N11: "N11",
  PTTAVM: "PTT AVM", KOCTAS: "Koçtaş", TEKNOSA: "Teknosa", TEMU: "Temu", CUSTOM: "Diğer",
};
const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  INACTIVE: "bg-slate-100 text-slate-500",
  SUSPENDED: "bg-red-100 text-red-700",
  UNKNOWN: "bg-amber-100 text-amber-700",
};
const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Aktif", INACTIVE: "Pasif", SUSPENDED: "Askıya alındı", UNKNOWN: "Bilinmiyor",
};

function AlertBadge({ count, color }: { count: number; color: string }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}>
      {count}
    </span>
  );
}

export default async function MarketplaceMonitoringPage() {
  await requirePermission(PERMISSIONS.MARKETPLACE_LISTINGS_READ);

  // 1. Products with zero marketplace listings (active products only)
  const [allActiveProducts, listingCounts] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, sku: true, name: true, _count: { select: { marketplaceListings: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.marketplaceListing.groupBy({
      by: ["productId"],
      _count: { id: true },
    }),
  ]);

  const listedProductIds = new Set(listingCounts.map((l) => l.productId));
  const gapProducts = allActiveProducts.filter((p) => !listedProductIds.has(p.id));

  // 2. Problem listings — SUSPENDED or UNKNOWN status
  const problemListings = await prisma.marketplaceListing.findMany({
    where: { status: { in: ["SUSPENDED", "UNKNOWN"] } },
    include: {
      product: { select: { id: true, sku: true, name: true } },
      responsible: { select: { id: true, name: true } },
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });

  // 3. Stale listings — never checked (lastCheckedAt is null)
  const staleListings = await prisma.marketplaceListing.findMany({
    where: { lastCheckedAt: null, status: "ACTIVE" },
    include: {
      product: { select: { id: true, sku: true, name: true } },
      responsible: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const totalAlerts = gapProducts.length + problemListings.length + staleListings.length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Pazar Yerleri</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">İzleme Merkezi</h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Listeleme boşluklarını ve sorunlu listelemelerini takip edin.{" "}
            {totalAlerts > 0 ? (
              <span className="font-semibold text-amber-700">{totalAlerts} uyarı tespit edildi.</span>
            ) : (
              <span className="text-emerald-700 font-semibold">Tüm kontroller temiz.</span>
            )}
          </p>
        </div>
        <Link href="/marketplace">
          <Button variant="secondary">← Listeleme Kaydı</Button>
        </Link>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card className="p-4 flex items-center gap-4">
          <div className="rounded-xl bg-amber-100 p-3">
            <svg className="h-5 w-5 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-semibold text-slate-900">{gapProducts.length}</p>
            <p className="text-xs text-slate-500">Listelenmemiş ürün</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="rounded-xl bg-red-100 p-3">
            <svg className="h-5 w-5 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-semibold text-slate-900">{problemListings.length}</p>
            <p className="text-xs text-slate-500">Sorunlu listeleme</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="rounded-xl bg-slate-100 p-3">
            <svg className="h-5 w-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-2xl font-semibold text-slate-900">{staleListings.length}</p>
            <p className="text-xs text-slate-500">Hiç kontrol edilmemiş (aktif)</p>
          </div>
        </Card>
      </div>

      {/* 1. Gap alerts */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-900">Listeleme Boşluğu</h2>
          <AlertBadge count={gapProducts.length} color="bg-amber-100 text-amber-700" />
        </div>
        <p className="text-xs text-slate-500">
          Aktif olup henüz hiçbir pazar yerinde listelenmemiş ürünler.
        </p>
        {gapProducts.length === 0 ? (
          <Card className="p-4">
            <p className="text-sm text-emerald-600 font-medium">✓ Tüm aktif ürünler en az bir pazar yerinde listelendi.</p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-slate-700 border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">SKU</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Ürün Adı</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {gapProducts.map((p) => (
                    <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-3 px-4">
                        <Link href={`/products/${p.id}`} className="font-mono text-xs text-slate-500 hover:text-slate-800 hover:underline">
                          {p.sku}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-sm text-slate-700 max-w-[240px] truncate">{p.name}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link href={`/marketplace/new?productId=${p.id}`}>
                            <Button variant="secondary" className="text-xs h-7 px-2">+ Listeleme ekle</Button>
                          </Link>
                          <CreateMonitoringTaskButton
                            productId={p.id}
                            title={`${p.sku} — Pazar yeri listelemeleri eksik`}
                            description={`${p.name} (${p.sku}) aktif bir ürün ancak hiçbir pazar yerinde listelenmemiş. Uygun platform(lar)a listeleme eklenmesi gerekiyor.`}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {/* 2. Problem listings */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-900">Sorunlu Listelemeler</h2>
          <AlertBadge count={problemListings.length} color="bg-red-100 text-red-700" />
        </div>
        <p className="text-xs text-slate-500">
          Durumu Askıya alındı veya Bilinmiyor olan listelemeler — inceleme ve durum güncellemesi gerekir.
        </p>
        {problemListings.length === 0 ? (
          <Card className="p-4">
            <p className="text-sm text-emerald-600 font-medium">✓ Sorunlu listeleme yok.</p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-slate-700 border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Platform</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Ürün</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Durum</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Sorumlu</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {problemListings.map((l) => (
                    <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-3 px-4">
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                          {PLATFORM_LABELS[l.platform] ?? l.platform}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <Link href={`/products/${l.product.id}`} className="font-mono text-xs text-slate-500 hover:text-slate-800 hover:underline">
                          {l.product.sku}
                        </Link>
                        <p className="text-xs text-slate-500 mt-0.5 max-w-[160px] truncate">{l.product.name}</p>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[l.status] ?? ""}`}>
                          {STATUS_LABELS[l.status] ?? l.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500">
                        {l.responsible?.name ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link href={`/marketplace/${l.id}/edit`}>
                            <Button variant="secondary" className="text-xs h-7 px-2">Güncelle</Button>
                          </Link>
                          <CreateMonitoringTaskButton
                            productId={l.product.id}
                            title={`${l.product.sku} — ${PLATFORM_LABELS[l.platform] ?? l.platform} listeleması sorunlu`}
                            description={`${l.product.name} ürününün ${PLATFORM_LABELS[l.platform] ?? l.platform} listeleması "${STATUS_LABELS[l.status] ?? l.status}" durumunda. İnceleme ve durum güncellemesi gerekiyor.`}
                            assignedToId={l.responsible?.id}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {/* 3. Stale / never-checked listings */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-900">Hiç Kontrol Edilmemiş Aktif Listelemeler</h2>
          <AlertBadge count={staleListings.length} color="bg-slate-200 text-slate-600" />
        </div>
        <p className="text-xs text-slate-500">
          Durumu Aktif fakat hiç kontrol tarihi girilmemiş listelemeler — URL ve listeleme durumu doğrulanmalı.
        </p>
        {staleListings.length === 0 ? (
          <Card className="p-4">
            <p className="text-sm text-emerald-600 font-medium">✓ Tüm aktif listelemeler kontrol edildi.</p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-slate-700 border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Platform</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Ürün</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Başlık</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Sorumlu</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {staleListings.map((l) => (
                    <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-3 px-4">
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                          {PLATFORM_LABELS[l.platform] ?? l.platform}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <Link href={`/products/${l.product.id}`} className="font-mono text-xs text-slate-500 hover:text-slate-800 hover:underline">
                          {l.product.sku}
                        </Link>
                        <p className="text-xs text-slate-500 mt-0.5 max-w-[160px] truncate">{l.product.name}</p>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 max-w-[160px] truncate">
                        {l.listingTitle ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500">
                        {l.responsible?.name ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link href={`/marketplace/${l.id}/edit`}>
                            <Button variant="secondary" className="text-xs h-7 px-2">Kontrol tarihi gir</Button>
                          </Link>
                          <CreateMonitoringTaskButton
                            productId={l.product.id}
                            title={`${l.product.sku} — ${PLATFORM_LABELS[l.platform] ?? l.platform} listeleması kontrol edilmedi`}
                            description={`${l.product.name} ürününün ${PLATFORM_LABELS[l.platform] ?? l.platform} listeleması aktif görünüyor ancak hiç kontrol edilmedi. URL ve listeleme durumu doğrulanmalı.`}
                            assignedToId={l.responsible?.id}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>
    </div>
  );
}

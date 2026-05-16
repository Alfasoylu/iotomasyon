/**
 * Phase 12 — Marketplace Listing Registry
 * Lists all marketplace listings across all platforms.
 */

import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const PLATFORM_LABELS: Record<string, string> = {
  TRENDYOL: "Trendyol",
  HEPSIBURADA: "Hepsiburada",
  N11: "N11",
  PTTAVM: "PTT AVM",
  KOCTAS: "Koçtaş",
  TEKNOSA: "Teknosa",
  TEMU: "Temu",
  CUSTOM: "Diğer",
};

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Aktif",
  INACTIVE: "Pasif",
  SUSPENDED: "Askıya alındı",
  UNKNOWN: "Bilinmiyor",
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700",
  INACTIVE: "bg-slate-100 text-slate-500",
  SUSPENDED: "bg-red-100 text-red-700",
  UNKNOWN: "bg-amber-100 text-amber-700",
};

export default async function MarketplacePage() {
  await requirePermission(PERMISSIONS.MARKETPLACE_LISTINGS_READ);

  const listings = await prisma.marketplaceListing.findMany({
    orderBy: [{ platform: "asc" }, { createdAt: "desc" }],
    include: {
      product: { select: { id: true, sku: true, name: true } },
      responsible: { select: { name: true } },
    },
  });

  // Group by platform
  const byPlatform = listings.reduce<Record<string, typeof listings>>((acc, l) => {
    if (!acc[l.platform]) acc[l.platform] = [];
    acc[l.platform].push(l);
    return acc;
  }, {});

  const platforms = Object.keys(byPlatform).sort();

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Pazar Yerleri</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Listeleme Kaydı</h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Ürünlerin hangi pazar yerlerinde listelendiğini takip edin. Toplam {listings.length} listeleme kayıtlı.
          </p>
        </div>
        <Link href="/marketplace/new">
          <Button>+ Yeni listeleme</Button>
        </Link>
      </div>

      {listings.length === 0 ? (
        <Card className="p-12 text-center space-y-3">
          <p className="text-slate-500 text-sm">Henüz pazar yeri listlemesi eklenmemiş.</p>
          <p className="text-slate-400 text-xs">Ürünlerin hangi platformlarda aktif olduğunu kayıt altına alın.</p>
          <Link href="/marketplace/new">
            <Button className="mt-2">+ Yeni listeleme ekle</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Platform summary cards */}
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            {platforms.map((platform) => {
              const items = byPlatform[platform];
              const active = items.filter((l) => l.status === "ACTIVE").length;
              return (
                <Card key={platform} className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{PLATFORM_LABELS[platform] ?? platform}</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{items.length}</p>
                  <p className="text-xs text-slate-400">{active} aktif</p>
                </Card>
              );
            })}
          </div>

          {/* Full listing table */}
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-slate-700 border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Platform</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Ürün</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Başlık</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Durum</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Sorumlu</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {listings.map((l) => (
                    <tr key={l.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4">
                        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                          {PLATFORM_LABELS[l.platform] ?? l.platform}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <Link href={`/products/${l.product.id}`} className="font-mono text-xs text-slate-500 hover:text-slate-800">
                          {l.product.sku}
                        </Link>
                        <p className="text-xs text-slate-600 mt-0.5 max-w-[180px] truncate">{l.product.name}</p>
                      </td>
                      <td className="py-3 px-4 max-w-[200px] truncate text-sm text-slate-600">
                        {l.listingTitle ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[l.status] ?? "bg-slate-100 text-slate-500"}`}>
                          {STATUS_LABELS[l.status] ?? l.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500">
                        {l.responsible?.name ?? <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-3 px-4">
                        <Link href={`/marketplace/${l.id}`} className="text-xs text-slate-500 hover:text-slate-800 underline-offset-2 hover:underline">
                          Görüntüle
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

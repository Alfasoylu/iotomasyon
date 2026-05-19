/**
 * Phase 12 — Marketplace Listing Registry
 * Lists all marketplace listings across all platforms.
 */

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { requirePermission, requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { PageHelp } from "@/components/layout/page-help";

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

// 14 kanal display adları (MarketplaceSalesRecord.channel için)
const CHANNEL_NAMES: Record<string, string> = {
  TRENDYOL: "Trendyol",
  HEPSIBURADA: "Hepsiburada",
  N11: "N11",
  IDEASOFT: "Ideasoft",
  GG: "GittiGidiyor",
  PAZARAMA: "Pazarama",
  EPTT: "EPTT",
  MIRAKL_KOCTAS: "Koçtaş",
  IDEFIX: "İdefix",
  AMAZON: "Amazon",
  CICEKSEPETI: "Çiçeksepeti",
  TEMU: "Temu",
  MIRAKL_TEKNOSA: "Teknosa",
  SHOPPHP: "ShopPHP",
  MANUAL: "Manuel",
};

function fmtTry(n: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function MarketplacePage() {
  await requirePermission(PERMISSIONS.MARKETPLACE_LISTINGS_READ);
  const user = await requireUser();
  const [canSeeProfit, canWrite] = await Promise.all([
    checkPermission(user, PERMISSIONS.EXECUTIVE_READ),
    checkPermission(user, PERMISSIONS.MARKETPLACE_LISTINGS_WRITE),
  ]);

  // ── Bu ay kanal performansı (MarketplaceSalesRecord + TrendyolSalesRecord union) ──
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  type ChannelStats = { channel: string; orders: number; revenueTry: number; quantity: number };
  const channelStatsRaw = await prisma.$queryRaw<
    Array<{ channel: string; orders: bigint; revenue: number; qty: bigint }>
  >`
    SELECT
      channel,
      COUNT(DISTINCT "orderNumber")::bigint AS orders,
      COALESCE(SUM("totalAmountTry"), 0)::numeric AS revenue,
      SUM(quantity)::bigint AS qty
    FROM (
      SELECT channel, "orderNumber", "totalAmountTry", quantity, status, "orderDate"
        FROM "MarketplaceSalesRecord"
      UNION ALL
      SELECT 'TRENDYOL' AS channel, "orderId" AS "orderNumber", "totalPriceTry" AS "totalAmountTry",
        quantity, status, "orderDate"
        FROM "TrendyolSalesRecord"
      UNION ALL
      SELECT 'HEPSIBURADA' AS channel, "orderId" AS "orderNumber", "totalPriceTry" AS "totalAmountTry",
        quantity, status, "orderDate"
        FROM "HepsiburadaSalesRecord"
    ) c
    WHERE "orderDate" >= ${startOfMonth}
      AND (status IS NULL OR (status NOT ILIKE '%iptal%' AND status NOT ILIKE '%iade%' AND status NOT ILIKE '%cancel%'))
    GROUP BY channel
    ORDER BY revenue DESC NULLS LAST
  `;

  const channelStats: ChannelStats[] = channelStatsRaw.map((r) => ({
    channel: r.channel,
    orders: Number(r.orders),
    revenueTry: Number(r.revenue),
    quantity: Number(r.qty),
  }));

  const totalOrdersThisMonth = channelStats.reduce((s, c) => s + c.orders, 0);
  const totalRevenueThisMonth = channelStats.reduce((s, c) => s + c.revenueTry, 0);

  // ── Listings (eski davranış) ──
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
      <PageHeader
        icon={ShoppingCart}
        breadcrumb={[{ label: "Pazaryerleri" }]}
        title="Pazaryerleri Genel Bakış"
        subtitle={`14 kanaldaki bu ay satış performansı + listeleme kaydı. Toplam ${listings.length} listeleme aktif.`}
        actions={
          <>
            <PageHelp pageKey="marketplace" />
            {canSeeProfit && (
              <Link href="/marketplace/profit">
                <Button variant="secondary">Kârlılık</Button>
              </Link>
            )}
            <Link href="/marketplace/monitoring">
              <Button variant="secondary">İzleme</Button>
            </Link>
            {canWrite && (
              <Link href="/marketplace/new">
                <Button>Yeni listeleme</Button>
              </Link>
            )}
          </>
        }
      />

      {/* ── Bu Ay Kanal Performansı ─────────────────────────────────────── */}
      {channelStats.length > 0 && (
        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Bu Ay Kanal Performansı
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {totalOrdersThisMonth.toLocaleString("tr-TR")} sipariş · {fmtTry(totalRevenueThisMonth)} ciro · {channelStats.length} aktif kanal
              </p>
            </div>
          </div>

          <Card className="overflow-hidden p-0">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-[0.2em] text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Kanal</th>
                  <th className="px-5 py-3 text-right font-semibold">Sipariş</th>
                  <th className="px-5 py-3 text-right font-semibold">Adet</th>
                  <th className="px-5 py-3 text-right font-semibold">Ciro</th>
                  <th className="px-5 py-3 text-right font-semibold">Pay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 bg-white">
                {channelStats.map((c) => {
                  const pct = totalRevenueThisMonth > 0 ? (c.revenueTry / totalRevenueThisMonth) * 100 : 0;
                  const channelHref =
                    c.channel === "TRENDYOL" ? "/marketplace/trendyol" :
                    c.channel === "HEPSIBURADA" ? "/admin/hepsiburada" :
                    "/marketplace/profit";
                  return (
                    <tr key={c.channel} className="hover:bg-slate-50/50">
                      <td className="px-5 py-3">
                        <Link
                          href={channelHref}
                          className="text-sm font-medium text-slate-900 hover:text-slate-600 hover:underline"
                        >
                          {CHANNEL_NAMES[c.channel] ?? c.channel}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-sm text-slate-700 tabular-nums">
                        {c.orders.toLocaleString("tr-TR")}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-sm text-slate-500 tabular-nums">
                        {c.quantity.toLocaleString("tr-TR")}
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-sm font-semibold text-slate-900 tabular-nums">
                        {fmtTry(c.revenueTry)}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <div className="h-1.5 w-16 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full bg-emerald-500"
                              style={{ width: `${Math.min(100, pct).toFixed(1)}%` }}
                            />
                          </div>
                          <span className="font-mono text-[11px] text-slate-600 tabular-nums w-10 text-right">
                            %{pct.toFixed(0)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 text-sm font-semibold">
                <tr>
                  <td className="px-5 py-2.5 text-slate-700">Toplam</td>
                  <td className="px-5 py-2.5 text-right font-mono tabular-nums">
                    {totalOrdersThisMonth.toLocaleString("tr-TR")}
                  </td>
                  <td className="px-5 py-2.5 text-right font-mono tabular-nums text-slate-500">
                    {channelStats.reduce((s, c) => s + c.quantity, 0).toLocaleString("tr-TR")}
                  </td>
                  <td className="px-5 py-2.5 text-right font-mono tabular-nums">
                    {fmtTry(totalRevenueThisMonth)}
                  </td>
                  <td className="px-5 py-2.5 text-right text-xs text-slate-400">%100</td>
                </tr>
              </tfoot>
            </table>
          </Card>
          <p className="mt-2 text-[10px] text-slate-400">
            Veri kaynağı: MarketplaceSalesRecord + TrendyolSalesRecord + HepsiburadaSalesRecord birleşik. İptal/iade hariç. Tarih ≥ {startOfMonth.toLocaleDateString("tr-TR")}.
          </p>
        </section>
      )}

      {/* ── Listeleme Kaydı (eski davranış) ─────────────────────────────── */}
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

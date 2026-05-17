/**
 * Phase 26 — Product Performance Ranking
 *
 * Reads TrendyolSalesRecord rows (synced via SalesSyncButton) and shows:
 * - Sync summary: total records, matched products, last sync date
 * - Top 20 by 30-day sales quantity
 * - Top 20 by 30-day revenue (TRY)
 * - Top 20 by all-time revenue
 * - Performance signals: high revenue/low stock, high stock/weak sales
 */

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { SalesSyncButton } from "@/components/products/sales-sync-button";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

// Statuses considered "cancelled" — excluded from revenue/qty aggregation
const CANCELLED_STATUSES = new Set([
  "cancelled",
  "iptal",
  "rejected",
  "returned",
]);

function isCancelled(status: string): boolean {
  const s = status.toLowerCase();
  return CANCELLED_STATUSES.has(s) || s.includes("iptal") || s.includes("cancel");
}

type AggRow = {
  productId: string;
  qty30d: number;
  revenue30d: number;
  qtyAll: number;
  revenueAll: number;
};

type ProductInfo = {
  id: string;
  sku: string;
  name: string;
  stockQuantity: number;
  unitCostTry: number | null;
  sellingPriceTry: number | null;
  imageUrl: string | null;
  images: { url: string }[];
};

type RankedProduct = ProductInfo & AggRow;

function realizedMarginPct(unitCost: number | null, avgRevenuePerUnit: number | null): number | null {
  if (!unitCost || !avgRevenuePerUnit || avgRevenuePerUnit <= 0) return null;
  return ((avgRevenuePerUnit - unitCost) / avgRevenuePerUnit) * 100;
}

function fmtTry(n: number): string {
  return "₺" + n.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function MarginBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-slate-300 text-xs">—</span>;
  const tone = pct >= 25 ? "success" : pct >= 10 ? "warning" : "danger";
  return <Badge tone={tone}>{pct.toFixed(1)}%</Badge>;
}

function RankTable({
  rows,
  label,
  valueKey,
  valueLabel,
}: {
  rows: RankedProduct[];
  label: string;
  valueKey: "qty30d" | "revenue30d" | "revenueAll";
  valueLabel: string;
}) {
  if (rows.length === 0) {
    return (
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-2">{label}</h3>
        <p className="text-xs text-slate-400">
          Henüz senkronize edilmiş satış verisi yok.{" "}
          Yukarıdaki &quot;Trendyol Siparişleri Senkronize Et&quot; butonunu kullanın.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="px-5 py-3 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-700">{label}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-50 text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-[0.2em] text-slate-400 text-left">
            <tr>
              <th className="w-8 px-3 py-3">#</th>
              <th className="px-4 py-3">Ürün</th>
              <th className="px-4 py-3 text-right">{valueLabel}</th>
              <th className="px-4 py-3 text-right">Stok</th>
              <th className="px-4 py-3 text-right">Gerçekleşen Marj</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 bg-white">
            {rows.map((r, i) => {
              const value = r[valueKey];
              const avgPrice = r.qtyAll > 0 ? r.revenueAll / r.qtyAll : null;
              const margin = realizedMarginPct(r.unitCostTry, avgPrice);
              const isLowStock = r.stockQuantity <= 0;

              return (
                <tr key={r.id} className="hover:bg-slate-50/60 transition">
                  <td className="px-3 py-2 text-xs text-slate-400 font-mono">{i + 1}</td>
                  <td className="px-4 py-3">
                    <Link href={`/products/${r.id}`} className="group">
                      <p className="font-medium text-slate-900 group-hover:text-slate-600 leading-tight">
                        {r.name}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-slate-400">{r.sku}</p>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-semibold text-slate-800">
                    {valueKey === "qty30d"
                      ? `${value} adet`
                      : fmtTry(value as number)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-mono text-sm font-semibold ${isLowStock ? "text-red-600" : "text-slate-700"}`}>
                      {r.stockQuantity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <MarginBadge pct={margin} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default async function ProductPerformancePage() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Load all records with product link (including cancelled for count, then filter)
  const allRecords = await prisma.trendyolSalesRecord.findMany({
    where: { productId: { not: null } },
    select: {
      productId: true,
      orderDate: true,
      status: true,
      quantity: true,
      totalPriceTry: true,
    },
  });

  // Count totals for summary
  const totalRecords = await prisma.trendyolSalesRecord.count();
  const matchedRecords = await prisma.trendyolSalesRecord.count({ where: { productId: { not: null } } });
  const lastRecord = await prisma.trendyolSalesRecord.findFirst({
    orderBy: { syncedAt: "desc" },
    select: { syncedAt: true },
  });

  // Aggregate per product
  const byProduct = new Map<string, AggRow>();

  for (const r of allRecords) {
    const key = r.productId!;
    if (!byProduct.has(key)) {
      byProduct.set(key, { productId: key, qty30d: 0, revenue30d: 0, qtyAll: 0, revenueAll: 0 });
    }
    const agg = byProduct.get(key)!;
    if (!isCancelled(r.status)) {
      const rev = Number(r.totalPriceTry);
      agg.qtyAll += r.quantity;
      agg.revenueAll += rev;
      if (r.orderDate >= thirtyDaysAgo) {
        agg.qty30d += r.quantity;
        agg.revenue30d += rev;
      }
    }
  }

  // Fetch product details for all aggregated product IDs
  const productIds = Array.from(byProduct.keys());
  const productRows = productIds.length > 0
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true, sku: true, name: true, stockQuantity: true,
          unitCostTry: true, sellingPriceTry: true, imageUrl: true,
          images: { take: 1, orderBy: { sortOrder: "asc" }, select: { url: true } },
        },
      })
    : [];

  // Merge product info + aggregates
  const merged: RankedProduct[] = productRows.map((p) => {
    const agg = byProduct.get(p.id)!;
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      stockQuantity: p.stockQuantity,
      unitCostTry: p.unitCostTry ? Number(p.unitCostTry) : null,
      sellingPriceTry: p.sellingPriceTry ? Number(p.sellingPriceTry) : null,
      imageUrl: p.imageUrl,
      images: p.images,
      ...agg,
    };
  });

  // Sort variants
  const byQty30d = [...merged].sort((a, b) => b.qty30d - a.qty30d).slice(0, 20);
  const byRevenue30d = [...merged].sort((a, b) => b.revenue30d - a.revenue30d).slice(0, 20);
  const byRevenueAll = [...merged].sort((a, b) => b.revenueAll - a.revenueAll).slice(0, 20);

  // Performance signals
  const highRevenueLoStock = merged.filter(
    (p) => p.revenue30d > 0 && p.stockQuantity <= 0,
  );
  const highStockWeakSales = merged.filter(
    (p) => p.stockQuantity > 10 && p.qty30d === 0,
  );
  // Low margin / high sales: margin < 15% AND qty30d >= 5
  const lowMarginHighSales = merged.filter((p) => {
    if (p.qty30d < 5 || !p.unitCostTry) return false;
    const avgPrice = p.qtyAll > 0 ? p.revenueAll / p.qtyAll : null;
    const margin = realizedMarginPct(p.unitCostTry, avgPrice);
    return margin !== null && margin < 15;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Yönetim / Satış İstihbaratı
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Ürün Performans Sıralaması
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Trendyol siparişlerine göre ürün bazlı satış adedi, ciro ve gerçekleşen marj.
          </p>
        </div>
        <Link href="/admin/executive" className="text-xs text-slate-400 hover:text-slate-700 transition">
          ← Yönetici Paneli
        </Link>
      </div>

      {/* Sync card */}
      <Card className="p-5 space-y-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold text-slate-700">Trendyol Satış Senkronizasyonu</h2>
          <p className="text-xs text-slate-500">
            Son 365 günlük siparişleri çeker, barkod / SKU üzerinden ürünlerle eşleştirir.
          </p>
        </div>

        <div className="flex flex-wrap gap-6 text-xs text-slate-500">
          <span>Toplam kayıt: <strong className="text-slate-700">{totalRecords}</strong></span>
          <span>Eşleşen: <strong className="text-slate-700">{matchedRecords}</strong></span>
          <span>
            Son senkronizasyon:{" "}
            <strong className="text-slate-700">
              {lastRecord
                ? lastRecord.syncedAt.toLocaleDateString("tr-TR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                : "—"}
            </strong>
          </span>
        </div>

        <SalesSyncButton />
      </Card>

      {/* Performance signals */}
      {(highRevenueLoStock.length > 0 || highStockWeakSales.length > 0 || lowMarginHighSales.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {highRevenueLoStock.length > 0 && (
            <Card className="p-4 border-red-200 bg-red-50">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-600 mb-1">
                Yüksek Ciro / Sıfır Stok
              </p>
              <p className="text-2xl font-bold text-red-700">{highRevenueLoStock.length}</p>
              <p className="text-xs text-red-500 mt-1">Son 30 günde satış yapan ama stoku tükenmiş ürün.</p>
              <div className="mt-2 space-y-0.5">
                {highRevenueLoStock.slice(0, 3).map((p) => (
                  <Link key={p.id} href={`/products/${p.id}`} className="block text-xs text-red-700 hover:underline truncate">
                    {p.name}
                  </Link>
                ))}
                {highRevenueLoStock.length > 3 && (
                  <span className="text-xs text-red-400">+{highRevenueLoStock.length - 3} daha</span>
                )}
              </div>
            </Card>
          )}

          {lowMarginHighSales.length > 0 && (
            <Card className="p-4 border-amber-200 bg-amber-50">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 mb-1">
                Düşük Marj / Yüksek Satış
              </p>
              <p className="text-2xl font-bold text-amber-700">{lowMarginHighSales.length}</p>
              <p className="text-xs text-amber-600 mt-1">Son 30 günde ≥5 adet satılan ama marjı %15 altı ürün.</p>
              <div className="mt-2 space-y-0.5">
                {lowMarginHighSales.slice(0, 3).map((p) => (
                  <Link key={p.id} href={`/products/${p.id}`} className="block text-xs text-amber-700 hover:underline truncate">
                    {p.name}
                  </Link>
                ))}
                {lowMarginHighSales.length > 3 && (
                  <span className="text-xs text-amber-500">+{lowMarginHighSales.length - 3} daha</span>
                )}
              </div>
            </Card>
          )}

          {highStockWeakSales.length > 0 && (
            <Card className="p-4 border-slate-200 bg-slate-50">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                Yüksek Stok / Zayıf Satış
              </p>
              <p className="text-2xl font-bold text-slate-700">{highStockWeakSales.length}</p>
              <p className="text-xs text-slate-400 mt-1">Stok &gt;10 ama son 30 günde sıfır satış yapan ürün.</p>
              <div className="mt-2 space-y-0.5">
                {highStockWeakSales.slice(0, 3).map((p) => (
                  <Link key={p.id} href={`/products/${p.id}`} className="block text-xs text-slate-600 hover:underline truncate">
                    {p.name}
                  </Link>
                ))}
                {highStockWeakSales.length > 3 && (
                  <span className="text-xs text-slate-400">+{highStockWeakSales.length - 3} daha</span>
                )}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Ranking tables */}
      <div className="space-y-4">
        <RankTable
          rows={byQty30d}
          label="Son 30 Gün — Satış Adedi Sıralaması"
          valueKey="qty30d"
          valueLabel="30G Satış"
        />
        <RankTable
          rows={byRevenue30d}
          label="Son 30 Gün — Ciro Sıralaması (TRY)"
          valueKey="revenue30d"
          valueLabel="30G Ciro"
        />
        <RankTable
          rows={byRevenueAll}
          label="Toplam Ciro Sıralaması (Tüm Zamanlar)"
          valueKey="revenueAll"
          valueLabel="Toplam Ciro"
        />
      </div>

      {/* Footer */}
      <div className="text-xs text-slate-400 flex gap-4 pt-2">
        <Link href="/products" className="hover:text-slate-600 transition">← Ürünler</Link>
        <Link href="/admin/executive" className="hover:text-slate-600 transition">Yönetici Paneli →</Link>
        <Link href="/admin/data-hygiene" className="hover:text-slate-600 transition">Veri Hijyeni →</Link>
      </div>
    </div>
  );
}

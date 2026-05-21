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
export const maxDuration = 300; // sync action sweeps 4×90-day windows — needs up to 5 min

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
  if (pct === null) return <span className="text-[var(--text-muted)] text-xs">—</span>;
  const variant = pct >= 25 ? "ok" : pct >= 10 ? "warn" : "danger";
  return <Badge variant={variant}>{pct.toFixed(1)}%</Badge>;
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
        <h3 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)] mb-2">{label}</h3>
        <p className="text-xs text-[var(--text-muted)]">
          Henüz senkronize edilmiş satış verisi yok.{" "}
          Yukarıdaki &quot;Trendyol Siparişleri Senkronize Et&quot; butonunu kullanın.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="px-5 py-3 border-b border-[var(--border-subtle)]">
        <h3 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">{label}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-[var(--border-subtle)] text-sm">
          <thead className="bg-[var(--surface-1)] text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)] text-left">
            <tr>
              <th className="w-8 px-3 py-3">#</th>
              <th className="px-4 py-3">Ürün</th>
              <th className="px-4 py-3 text-right">{valueLabel}</th>
              <th className="px-4 py-3 text-right">Stok</th>
              <th className="px-4 py-3 text-right">Gerçekleşen Marj</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {rows.map((r, i) => {
              const value = r[valueKey];
              const avgPrice = r.qtyAll > 0 ? r.revenueAll / r.qtyAll : null;
              const margin = realizedMarginPct(r.unitCostTry, avgPrice);
              const isLowStock = r.stockQuantity <= 0;

              return (
                <tr key={r.id} className="hover:bg-[var(--surface-3)] transition">
                  <td className="px-3 py-2.5 text-xs tabular-nums text-[var(--text-muted)] font-mono">{i + 1}</td>
                  <td className="px-4 py-3">
                    <Link href={`/products/${r.id}`} className="group">
                      <p className="font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)] leading-tight">
                        {r.name}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-[var(--text-muted)]">{r.sku}</p>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-sm font-semibold tabular-nums text-[var(--text-primary)]">
                    {valueKey === "qty30d"
                      ? `${value} adet`
                      : fmtTry(value as number)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-mono text-sm font-semibold tabular-nums ${isLowStock ? "text-[var(--danger)]" : "text-[var(--text-secondary)]"}`}>
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

  // eslint-disable-next-line react-hooks/purity
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
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Yönetim / Satış İstihbaratı
          </p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
            Ürün Performans Sıralaması
          </h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Trendyol siparişlerine göre ürün bazlı satış adedi, ciro ve gerçekleşen marj.
          </p>
        </div>
        <Link href="/admin/executive" className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition">
          ← Yönetici Paneli
        </Link>
      </div>

      {/* Sync card */}
      <Card className="p-5 space-y-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Trendyol Satış Senkronizasyonu</h2>
          <p className="text-xs text-[var(--text-secondary)]">
            Son 365 günlük siparişleri çeker, barkod / SKU üzerinden ürünlerle eşleştirir.
          </p>
        </div>

        <div className="flex flex-wrap gap-6 text-xs text-[var(--text-muted)]">
          <span>Toplam kayıt: <strong className="tabular-nums font-mono text-[var(--text-primary)]">{totalRecords}</strong></span>
          <span>Eşleşen: <strong className="tabular-nums font-mono text-[var(--text-primary)]">{matchedRecords}</strong></span>
          <span>
            Son senkronizasyon:{" "}
            <strong className="tabular-nums font-mono text-[var(--text-primary)]">
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
            <Card className="p-4 border-[var(--danger-border)] bg-[var(--danger-dim)]">
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--danger)] mb-1">
                Yüksek Ciro / Sıfır Stok
              </p>
              <p className="text-xl font-semibold tabular-nums font-mono text-[var(--danger)]">{highRevenueLoStock.length}</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Son 30 günde satış yapan ama stoku tükenmiş ürün.</p>
              <div className="mt-2 space-y-0.5">
                {highRevenueLoStock.slice(0, 3).map((p) => (
                  <Link key={p.id} href={`/products/${p.id}`} className="block text-xs text-[var(--danger)] hover:underline truncate">
                    {p.name}
                  </Link>
                ))}
                {highRevenueLoStock.length > 3 && (
                  <span className="text-xs text-[var(--text-muted)]">+{highRevenueLoStock.length - 3} daha</span>
                )}
              </div>
            </Card>
          )}

          {lowMarginHighSales.length > 0 && (
            <Card className="p-4 border-[var(--warn-border)] bg-[var(--warn-dim)]">
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--warn)] mb-1">
                Düşük Marj / Yüksek Satış
              </p>
              <p className="text-xl font-semibold tabular-nums font-mono text-[var(--warn)]">{lowMarginHighSales.length}</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Son 30 günde ≥5 adet satılan ama marjı %15 altı ürün.</p>
              <div className="mt-2 space-y-0.5">
                {lowMarginHighSales.slice(0, 3).map((p) => (
                  <Link key={p.id} href={`/products/${p.id}`} className="block text-xs text-[var(--warn)] hover:underline truncate">
                    {p.name}
                  </Link>
                ))}
                {lowMarginHighSales.length > 3 && (
                  <span className="text-xs text-[var(--text-muted)]">+{lowMarginHighSales.length - 3} daha</span>
                )}
              </div>
            </Card>
          )}

          {highStockWeakSales.length > 0 && (
            <Card className="p-4">
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)] mb-1">
                Yüksek Stok / Zayıf Satış
              </p>
              <p className="text-xl font-semibold tabular-nums font-mono text-[var(--text-primary)]">{highStockWeakSales.length}</p>
              <p className="text-xs text-[var(--text-muted)] mt-1">Stok &gt;10 ama son 30 günde sıfır satış yapan ürün.</p>
              <div className="mt-2 space-y-0.5">
                {highStockWeakSales.slice(0, 3).map((p) => (
                  <Link key={p.id} href={`/products/${p.id}`} className="block text-xs text-[var(--text-secondary)] hover:underline truncate">
                    {p.name}
                  </Link>
                ))}
                {highStockWeakSales.length > 3 && (
                  <span className="text-xs text-[var(--text-muted)]">+{highStockWeakSales.length - 3} daha</span>
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
      <div className="text-xs text-[var(--text-muted)] flex gap-4 pt-2">
        <Link href="/products" className="hover:text-[var(--text-primary)] transition">← Ürünler</Link>
        <Link href="/admin/executive" className="hover:text-[var(--text-primary)] transition">Yönetici Paneli →</Link>
        <Link href="/admin/data-hygiene" className="hover:text-[var(--text-primary)] transition">Veri Hijyeni →</Link>
      </div>
    </div>
  );
}

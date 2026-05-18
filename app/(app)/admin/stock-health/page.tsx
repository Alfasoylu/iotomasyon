/**
 * Phase 44 — Stock Health Dashboard
 *
 * Aggregates inventory health signals in one place:
 *   - Critical: stockQuantity = 0
 *   - Low: stockQuantity > 0 but ≤ 30-day Trendyol demand (coverage < 1 month)
 *   - Healthy: coverage ≥ 1 month or no sales data
 * Also shows the last 15 stock movements across all products.
 * No schema change — reads Product, TrendyolSalesRecord, StockAdjustmentLog.
 */

import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { Card } from "@/components/ui/card";
import { StockAdjustmentType } from "@prisma/client";

export const dynamic = "force-dynamic";

function isCancelledStatus(s: string | null): boolean {
  if (!s) return false;
  const lower = s.toLowerCase();
  return lower.includes("iptal") || lower.includes("cancel");
}

const ADJ_LABEL: Record<StockAdjustmentType, string> = {
  RESTOCK:    "Stok Girişi",
  CORRECTION: "Sayım Düzeltme",
  DAMAGE:     "Hasar / Fire",
  RETURN:     "Müşteri İadesi",
  SALE:       "Manuel Satış",
  OTHER:      "Diğer",
};

const ADJ_COLOR: Record<StockAdjustmentType, string> = {
  RESTOCK:    "bg-emerald-100 text-emerald-800",
  CORRECTION: "bg-blue-100 text-blue-800",
  DAMAGE:     "bg-red-100 text-red-700",
  RETURN:     "bg-amber-100 text-amber-800",
  SALE:       "bg-slate-100 text-slate-700",
  OTHER:      "bg-slate-100 text-slate-500",
};

export default async function StockHealthPage() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  // eslint-disable-next-line react-hooks/purity
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [products, salesRecords, recentAdjustments] = await Promise.all([
    prisma.product.findMany({
      select: {
        id: true,
        name: true,
        sku: true,
        stockQuantity: true,
        // Phase 89 — physical count for variance reporting
        physicalCountQuantity: true,
      },
      orderBy: { stockQuantity: "asc" },
    }),
    prisma.trendyolSalesRecord.findMany({
      where: {
        productId: { not: null },
        orderDate: { gte: since30 },
      },
      select: { productId: true, quantity: true, status: true },
    }),
    prisma.stockAdjustmentLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 15,
      include: {
        product: { select: { name: true, sku: true } },
        createdBy: { select: { name: true } },
      },
    }),
  ]);

  // Build 30-day actual sales map
  const sales30d = new Map<string, number>();
  for (const r of salesRecords) {
    if (!r.productId || isCancelledStatus(r.status)) continue;
    sales30d.set(r.productId, (sales30d.get(r.productId) ?? 0) + r.quantity);
  }

  // Classify products
  const critical: typeof products = [];
  const low: (typeof products[number] & { sales30d: number; coverageDays: number })[] = [];
  const healthy: typeof products = [];

  for (const p of products) {
    const s = sales30d.get(p.id) ?? 0;

    if (p.stockQuantity <= 0) {
      critical.push(p);
    } else if (s > 0) {
      // Coverage = stock / (sales30d / 30) days
      const dailyRate = s / 30;
      const coverageDays = Math.floor(p.stockQuantity / dailyRate);
      if (coverageDays < 30) {
        low.push({ ...p, sales30d: s, coverageDays });
      } else {
        healthy.push(p);
      }
    } else {
      healthy.push(p);
    }
  }

  low.sort((a, b) => a.coverageDays - b.coverageDays);

  function fmt(d: Date) {
    return new Intl.DateTimeFormat("tr-TR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }).format(d);
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Faz 44 — Stok Sağlığı
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Stok Sağlığı Paneli
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Stok kritikliği, günlük tüketim hızı ve son stok hareketleri.
          </p>
        </div>
        <Link
          href="/admin/procurement"
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
        >
          Tedarik Asistanı →
        </Link>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-red-500">Kritik (sıfır stok)</p>
          <p className="mt-2 text-4xl font-bold text-red-600 tabular-nums">{critical.length}</p>
          <p className="mt-1 text-xs text-slate-400">ürün</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-500">Düşük (&lt;30 gün kapsam)</p>
          <p className="mt-2 text-4xl font-bold text-amber-600 tabular-nums">{low.length}</p>
          <p className="mt-1 text-xs text-slate-400">ürün</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Sağlıklı</p>
          <p className="mt-2 text-4xl font-bold text-emerald-700 tabular-nums">{healthy.length}</p>
          <p className="mt-1 text-xs text-slate-400">ürün</p>
        </Card>
      </div>

      {/* Critical — zero stock */}
      {critical.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
            <h2 className="text-base font-semibold text-slate-950">Kritik — Sıfır Stok</h2>
            <span className="ml-auto rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">{critical.length} ürün</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-6 py-3 text-left">Ürün</th>
                  <th className="px-4 py-3 text-left">SKU</th>
                  <th className="px-4 py-3 text-right">Stok</th>
                  <th className="px-4 py-3 text-right">30G Trendyol Satışı</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {critical.map((p) => (
                  <tr key={p.id} className="bg-red-50/40 hover:bg-red-50">
                    <td className="px-6 py-3 font-medium text-slate-900">
                      <Link href={`/products/${p.id}`} className="hover:underline text-slate-900">{p.name}</Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{p.sku}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-red-600">{p.stockQuantity}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">{sales30d.get(p.id) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Low — coverage < 30 days */}
      {low.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
            <h2 className="text-base font-semibold text-slate-950">Düşük Stok — 30 Günden Az Kapsam</h2>
            <span className="ml-auto rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">{low.length} ürün</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-6 py-3 text-left">Ürün</th>
                  <th className="px-4 py-3 text-left">SKU</th>
                  <th className="px-4 py-3 text-right">Stok</th>
                  <th className="px-4 py-3 text-right">30G Satış</th>
                  <th className="px-4 py-3 text-right">Kapsam (gün)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {low.map((p) => (
                  <tr key={p.id} className="bg-amber-50/30 hover:bg-amber-50">
                    <td className="px-6 py-3 font-medium text-slate-900">
                      <Link href={`/products/${p.id}`} className="hover:underline text-slate-900">{p.name}</Link>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{p.sku}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-amber-700">{p.stockQuantity}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">{p.sales30d}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${
                        p.coverageDays <= 7 ? "bg-red-100 text-red-700" :
                        p.coverageDays <= 14 ? "bg-amber-100 text-amber-700" :
                        "bg-yellow-100 text-yellow-700"
                      }`}>
                        {p.coverageDays}g
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Healthy — empty state for critical/low */}
      {critical.length === 0 && low.length === 0 && (
        <Card className="p-8 text-center text-sm text-slate-400">
          Tüm ürünler sağlıklı stok seviyesinde. Kritik veya düşük stoklu ürün yok.
        </Card>
      )}

      {/* Recent adjustments */}
      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-950">Son Stok Hareketleri</h2>
          <p className="mt-0.5 text-xs text-slate-500">Tüm ürünlerdeki son 15 hareket</p>
        </div>
        {recentAdjustments.length === 0 ? (
          <div className="px-6 py-6 text-center text-sm text-slate-400">Henüz stok hareketi yok.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-6 py-3 text-left">Ürün</th>
                  <th className="px-4 py-3 text-left">Tür</th>
                  <th className="px-4 py-3 text-right">Değişim</th>
                  <th className="px-4 py-3 text-right">Yeni Stok</th>
                  <th className="px-4 py-3 text-left">Not</th>
                  <th className="px-4 py-3 text-left">Tarih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentAdjustments.map((a, i) => (
                  <tr key={a.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                    <td className="px-6 py-3 font-medium text-slate-900 max-w-[200px] truncate">
                      {a.product ? (
                        <Link href={`/products/${a.productId}`} className="hover:underline text-slate-900">
                          {a.product.name}
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${ADJ_COLOR[a.adjustmentType]}`}>
                        {ADJ_LABEL[a.adjustmentType]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">
                      <span className={a.quantityChange >= 0 ? "text-emerald-700" : "text-red-600"}>
                        {a.quantityChange >= 0 ? "+" : ""}{a.quantityChange}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-800">{a.newQty}</td>
                    <td className="px-4 py-3 max-w-[180px] truncate text-xs text-slate-400">{a.notes ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">{fmt(a.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

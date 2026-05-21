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
import { Badge } from "@/components/ui/badge";
import { StockAdjustmentType } from "@prisma/client";

export const dynamic = "force-dynamic";

function isCancelledStatus(s: string | null): boolean {
  if (!s) return false;
  const lower = s.toLowerCase();
  return lower.includes("iptal") || lower.includes("cancel");
}

const ADJ_LABEL: Record<StockAdjustmentType, string> = {
  RESTOCK: "Stok Girişi",
  CORRECTION: "Sayım Düzeltme",
  DAMAGE: "Hasar / Fire",
  RETURN: "Müşteri İadesi",
  SALE: "Manuel Satış",
  OTHER: "Diğer",
};

const ADJ_VARIANT: Record<StockAdjustmentType, "ok" | "info" | "danger" | "warn" | "neutral"> = {
  RESTOCK: "ok",
  CORRECTION: "info",
  DAMAGE: "danger",
  RETURN: "warn",
  SALE: "neutral",
  OTHER: "neutral",
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
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Faz 44 — Stok Sağlığı
          </p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
            Stok Sağlığı Paneli
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
            Stok kritikliği, günlük tüketim hızı ve son stok hareketleri.
          </p>
        </div>
        <Link
          href="/admin/procurement"
          className="inline-flex h-8 items-center rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)]"
        >
          Tedarik Asistanı →
        </Link>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Kritik (sıfır stok)
          </p>
          <p className="mt-2 text-[28px] font-semibold leading-tight tabular-nums text-[var(--danger)]">
            {critical.length}
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">ürün</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Düşük (&lt;30 gün kapsam)
          </p>
          <p className="mt-2 text-[28px] font-semibold leading-tight tabular-nums text-[var(--warn)]">
            {low.length}
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">ürün</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Sağlıklı
          </p>
          <p className="mt-2 text-[28px] font-semibold leading-tight tabular-nums text-[var(--ok)]">
            {healthy.length}
          </p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">ürün</p>
        </Card>
      </div>

      {/* Critical — zero stock */}
      {critical.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-6 py-4">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--danger)]" />
            <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
              Kritik — Sıfır Stok
            </h2>
            <span className="ml-auto inline-flex items-center rounded-md border border-[var(--danger-border)] bg-[var(--danger-dim)] px-2 py-0.5 text-[11px] font-medium text-[var(--danger)]">
              {critical.length} ürün
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)] text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                  <th className="px-6 py-3 text-left">Ürün</th>
                  <th className="px-4 py-3 text-left">SKU</th>
                  <th className="px-4 py-3 text-right">Stok</th>
                  <th className="px-4 py-3 text-right">30G Trendyol Satışı</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {critical.map((p) => (
                  <tr key={p.id} className="hover:bg-[var(--surface-3)]">
                    <td className="px-6 py-3 font-medium text-[var(--text-primary)]">
                      <Link href={`/products/${p.id}`} className="hover:text-[var(--accent)]">
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs tabular-nums text-[var(--text-muted)]">{p.sku}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-[var(--danger)]">
                      {p.stockQuantity}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--text-muted)]">
                      {sales30d.get(p.id) ?? "—"}
                    </td>
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
          <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] px-6 py-4">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--warn)]" />
            <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
              Düşük Stok — 30 Günden Az Kapsam
            </h2>
            <span className="ml-auto inline-flex items-center rounded-md border border-[var(--warn-border)] bg-[var(--warn-dim)] px-2 py-0.5 text-[11px] font-medium text-[var(--warn)]">
              {low.length} ürün
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)] text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                  <th className="px-6 py-3 text-left">Ürün</th>
                  <th className="px-4 py-3 text-left">SKU</th>
                  <th className="px-4 py-3 text-right">Stok</th>
                  <th className="px-4 py-3 text-right">30G Satış</th>
                  <th className="px-4 py-3 text-right">Kapsam (gün)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {low.map((p) => (
                  <tr key={p.id} className="hover:bg-[var(--surface-3)]">
                    <td className="px-6 py-3 font-medium text-[var(--text-primary)]">
                      <Link href={`/products/${p.id}`} className="hover:text-[var(--accent)]">
                        {p.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs tabular-nums text-[var(--text-muted)]">{p.sku}</td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-[var(--warn)]">
                      {p.stockQuantity}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--text-muted)]">{p.sales30d}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums ${
                        p.coverageDays <= 7
                          ? "border-[var(--danger-border)] bg-[var(--danger-dim)] text-[var(--danger)]"
                          : p.coverageDays <= 14
                          ? "border-[var(--warn-border)] bg-[var(--warn-dim)] text-[var(--warn)]"
                          : "border-[var(--warn-border)] bg-[var(--warn-dim)] text-[var(--warn)]"
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
        <Card className="p-8 text-center text-sm text-[var(--text-muted)]">
          Tüm ürünler sağlıklı stok seviyesinde. Kritik veya düşük stoklu ürün yok.
        </Card>
      )}

      {/* Recent adjustments */}
      <Card className="overflow-hidden p-0">
        <div className="border-b border-[var(--border-subtle)] px-6 py-4">
          <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Son Stok Hareketleri
          </h2>
          <p className="mt-1.5 text-xs text-[var(--text-secondary)]">Tüm ürünlerdeki son 15 hareket</p>
        </div>
        {recentAdjustments.length === 0 ? (
          <div className="px-6 py-6 text-center text-sm text-[var(--text-muted)]">
            Henüz stok hareketi yok.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)] text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                  <th className="px-6 py-3 text-left">Ürün</th>
                  <th className="px-4 py-3 text-left">Tür</th>
                  <th className="px-4 py-3 text-right">Değişim</th>
                  <th className="px-4 py-3 text-right">Yeni Stok</th>
                  <th className="px-4 py-3 text-left">Not</th>
                  <th className="px-4 py-3 text-left">Tarih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {recentAdjustments.map((a) => (
                  <tr key={a.id} className="hover:bg-[var(--surface-3)]">
                    <td className="max-w-[200px] truncate px-6 py-3 font-medium text-[var(--text-primary)]">
                      {a.product ? (
                        <Link href={`/products/${a.productId}`} className="hover:text-[var(--accent)]">
                          {a.product.name}
                        </Link>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={ADJ_VARIANT[a.adjustmentType]}>{ADJ_LABEL[a.adjustmentType]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums">
                      <span className={a.quantityChange >= 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"}>
                        {a.quantityChange >= 0 ? "+" : ""}{a.quantityChange}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-[var(--text-primary)]">
                      {a.newQty}
                    </td>
                    <td className="max-w-[180px] truncate px-4 py-3 text-xs text-[var(--text-muted)]">
                      {a.notes ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs tabular-nums text-[var(--text-muted)]">
                      {fmt(a.createdAt)}
                    </td>
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

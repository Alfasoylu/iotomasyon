/**
 * Phase 38 — Return Rate Analysis
 *
 * Aggregates TrendyolReturnRecord (matched) vs TrendyolSalesRecord (matched, non-cancelled)
 * to compute per-product return rate. Surfaces high-return-rate products and top reasons.
 *
 * Permission: MARKETPLACE_RETURNS_READ
 * No schema change — reads existing Phase 26 + Phase 29 tables.
 */

import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function fmtPct(n: number) {
  return `%${n.toFixed(1)}`;
}

function isCancelledStatus(s: string | null) {
  if (!s) return false;
  const lower = s.toLowerCase();
  return lower.includes("iptal") || lower.includes("cancel");
}

interface ProductReturn {
  productId: string;
  name: string;
  sku: string | null;
  claimCount: number;
  soldQty: number;
  returnRate: number | null;
}

function rateColor(rate: number | null) {
  if (rate == null) return "text-slate-400";
  if (rate >= 10) return "font-semibold text-red-700";
  if (rate >= 5) return "font-semibold text-amber-700";
  return "text-emerald-700";
}

function KpiCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "red" | "amber" | "green" | "dark";
}) {
  const bg =
    tone === "dark"
      ? "border-slate-900 bg-slate-900"
      : tone === "red"
        ? "border-red-200 bg-red-50"
        : tone === "amber"
          ? "border-amber-200 bg-amber-50"
          : tone === "green"
            ? "border-emerald-200 bg-emerald-50"
            : "border-slate-200 bg-white";
  const labelColor =
    tone === "dark"
      ? "text-slate-400"
      : tone === "red"
        ? "text-red-700"
        : tone === "amber"
          ? "text-amber-700"
          : tone === "green"
            ? "text-emerald-700"
            : "text-slate-500";
  const valueColor =
    tone === "dark"
      ? "text-white"
      : tone === "red"
        ? "text-red-900"
        : tone === "amber"
          ? "text-amber-900"
          : tone === "green"
            ? "text-emerald-900"
            : "text-slate-900";
  return (
    <div className={`rounded-2xl border p-4 ${bg}`}>
      <p className={`text-xs font-semibold uppercase tracking-widest ${labelColor}`}>{label}</p>
      <p className={`mt-2 text-xl font-bold tabular-nums ${valueColor}`}>{value}</p>
      {sub && <p className={`mt-0.5 text-xs ${labelColor}`}>{sub}</p>}
    </div>
  );
}

function ProductTable({ rows, emptyLabel }: { rows: ProductReturn[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return (
      <div className="px-6 py-6 text-center text-sm text-slate-400">{emptyLabel}</div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-widest text-slate-500">
            <th className="px-6 py-3 text-left">Ürün</th>
            <th className="px-4 py-3 text-right">İade Talebi</th>
            <th className="px-4 py-3 text-right">Satış Adedi</th>
            <th className="px-4 py-3 text-right">İade Oranı</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((p, i) => (
            <tr key={p.productId} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
              <td className="px-6 py-3">
                <Link
                  href={`/products/${p.productId}`}
                  className="font-medium text-slate-900 underline decoration-dotted hover:text-slate-600"
                >
                  {p.name}
                </Link>
                {p.sku && <p className="font-mono text-xs text-slate-400">{p.sku}</p>}
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-700">{p.claimCount}</td>
              <td className="px-4 py-3 text-right tabular-nums text-slate-500">{p.soldQty || "—"}</td>
              <td className={`px-4 py-3 text-right tabular-nums ${rateColor(p.returnRate)}`}>
                {p.returnRate != null ? fmtPct(p.returnRate) : "Satış kaydı yok"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ReturnAnalysisPage() {
  await requirePermission(PERMISSIONS.MARKETPLACE_RETURNS_READ);

  // Fetch matched return records + matched non-cancelled sales in parallel
  const [returnRecords, salesRecords, unmatchedReturnCount] = await Promise.all([
    prisma.trendyolReturnRecord.findMany({
      where: { productId: { not: null } },
      select: {
        productId: true,
        status: true,
        reasonName: true,
        product: { select: { id: true, name: true, sku: true } },
      },
    }),
    prisma.trendyolSalesRecord.findMany({
      where: { productId: { not: null } },
      select: { productId: true, quantity: true, status: true },
    }),
    prisma.trendyolReturnRecord.count({ where: { productId: null } }),
  ]);

  // ── Aggregate sold qty per product (non-cancelled) ────────────────────────
  const soldByProduct = new Map<string, number>();
  for (const r of salesRecords) {
    if (!r.productId || isCancelledStatus(r.status)) continue;
    soldByProduct.set(r.productId, (soldByProduct.get(r.productId) ?? 0) + (r.quantity ?? 1));
  }

  // ── Aggregate return claims per product ───────────────────────────────────
  const returnByProduct = new Map<
    string,
    { name: string; sku: string | null; claimCount: number }
  >();
  for (const r of returnRecords) {
    if (!r.productId || !r.product) continue;
    const cur = returnByProduct.get(r.productId);
    if (cur) {
      cur.claimCount++;
    } else {
      returnByProduct.set(r.productId, {
        name: r.product.name,
        sku: r.product.sku ?? null,
        claimCount: 1,
      });
    }
  }

  const productRows: ProductReturn[] = [...returnByProduct.entries()].map(
    ([productId, data]) => {
      const soldQty = soldByProduct.get(productId) ?? 0;
      const returnRate = soldQty > 0 ? (data.claimCount / soldQty) * 100 : null;
      return { productId, ...data, soldQty, returnRate };
    },
  );

  // Sort: products with returnRate first (high to low), then null-rate ones
  productRows.sort((a, b) => {
    if (a.returnRate == null && b.returnRate == null) return b.claimCount - a.claimCount;
    if (a.returnRate == null) return 1;
    if (b.returnRate == null) return -1;
    return b.returnRate - a.returnRate;
  });

  // ── Top return reasons ─────────────────────────────────────────────────────
  const reasonCounts = new Map<string, number>();
  for (const r of returnRecords) {
    const key = r.reasonName ?? "Belirtilmemiş";
    reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1);
  }
  const topReasons = [...reasonCounts.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  // ── Summary stats ─────────────────────────────────────────────────────────
  const totalMatchedClaims = returnRecords.length;
  const productsWithReturns = returnByProduct.size;
  const highReturnRateCount = productRows.filter(
    (p) => p.returnRate != null && p.returnRate >= 5,
  ).length;

  const highRiskRows = productRows.filter((p) => p.returnRate != null && p.returnRate >= 5);
  const normalRows = productRows.filter((p) => p.returnRate != null && p.returnRate < 5);
  const noSalesRows = productRows.filter((p) => p.returnRate == null);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Pazar Yerleri / İade Analizi
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            İade Oranı Analizi
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Trendyol iade kayıtlarından hesaplanan ürün bazlı iade oranı.
            Yüksek iade oranı, fiyat, kalite veya listeleme sorununa işaret eder.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/marketplace/realized-margin"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            ← Gerçekleşen Marj
          </Link>
          <Link
            href="/marketplace/trendyol/returns"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            İade Merkezi →
          </Link>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Eşleşen İade Talebi"
          value={String(totalMatchedClaims)}
          sub="productId bağlı kayıtlar"
          tone="dark"
        />
        <KpiCard
          label="İadesi Olan Ürün"
          value={String(productsWithReturns)}
          sub="en az 1 iade talebi"
          tone="neutral"
        />
        <KpiCard
          label="Yüksek İade Riski (≥%5)"
          value={String(highReturnRateCount)}
          sub="iade oranı ≥ %5 ürün sayısı"
          tone={highReturnRateCount > 0 ? "red" : "green"}
        />
        <KpiCard
          label="Eşleşmemiş İade Talebi"
          value={String(unmatchedReturnCount)}
          sub="ürün bağlantısı olmayan"
          tone={unmatchedReturnCount > 50 ? "amber" : "neutral"}
        />
      </div>

      {/* High return risk */}
      {highRiskRows.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-red-200 bg-white shadow-sm">
          <div className="border-b border-red-100 bg-red-50 px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-red-600">
              Yüksek Risk
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">
              Yüksek İade Oranı — ≥%5 ({highRiskRows.length} ürün)
            </h2>
            <p className="mt-0.5 text-xs text-red-700">
              Bu ürünler için listeleme, fiyat ve ürün kalitesini gözden geçirin.
            </p>
          </div>
          <ProductTable rows={highRiskRows} emptyLabel="" />
        </div>
      )}

      {/* Normal return rate */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
            Normal
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">
            Düşük İade Oranı ({normalRows.length} ürün)
          </h2>
        </div>
        <ProductTable
          rows={normalRows}
          emptyLabel="İade oranı hesaplanabilen ürün yok."
        />
      </div>

      {/* No sales data */}
      {noSalesRows.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
              Satış Kaydı Yok
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">
              Satış Verisi Eksik ({noSalesRows.length} ürün)
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              İade talebi var ancak eşleşen satış kaydı bulunamadı. Senkronize edilmemiş olabilir.
            </p>
          </div>
          <ProductTable rows={noSalesRows} emptyLabel="" />
        </div>
      )}

      {/* Top return reasons */}
      {topReasons.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
              İade Nedenleri
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">
              En Sık İade Nedenleri (Top 10)
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-widest text-slate-500">
                  <th className="px-6 py-3 text-left">Neden</th>
                  <th className="px-4 py-3 text-right">Adet</th>
                  <th className="px-4 py-3 text-right">Oran</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topReasons.map(([reason, count], i) => (
                  <tr key={reason} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                    <td className="px-6 py-3 text-slate-700">{reason}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-800">
                      {count}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                      {totalMatchedClaims > 0
                        ? fmtPct((count / totalMatchedClaims) * 100)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state */}
      {totalMatchedClaims === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center">
          <p className="text-slate-500">
            Henüz eşleşmiş iade kaydı yok.{" "}
            <Link href="/marketplace/trendyol/returns" className="underline">
              İade Merkezi
            </Link>{" "}
            sayfasından senkronize edin.
          </p>
        </div>
      )}
    </div>
  );
}

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
  if (rate == null) return "text-[var(--text-muted)]";
  if (rate >= 10) return "font-semibold text-[var(--danger)]";
  if (rate >= 5) return "font-semibold text-[var(--warn)]";
  return "text-[var(--ok)]";
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
  const borderClass =
    tone === "red"
      ? "border-[var(--danger-border)] bg-[var(--danger-dim)]"
      : tone === "amber"
        ? "border-[var(--warn-border)] bg-[var(--warn-dim)]"
        : tone === "green"
          ? "border-[var(--ok-border)] bg-[var(--ok-dim)]"
          : tone === "dark"
            ? "border-[var(--border-strong)] bg-[var(--surface-1)]"
            : "border-[var(--border-default)] bg-[var(--surface-2)]";
  const labelColor =
    tone === "red"
      ? "text-[var(--danger)]"
      : tone === "amber"
        ? "text-[var(--warn)]"
        : tone === "green"
          ? "text-[var(--ok)]"
          : tone === "dark"
            ? "text-[var(--text-muted)]"
            : "text-[var(--text-muted)]";
  const valueColor =
    tone === "red"
      ? "text-[var(--danger)]"
      : tone === "amber"
        ? "text-[var(--warn)]"
        : tone === "green"
          ? "text-[var(--ok)]"
          : "text-[var(--text-primary)]";
  return (
    <div className={`rounded-lg border p-4 ${borderClass}`}>
      <p className={`text-[11px] font-medium uppercase tracking-widest ${labelColor}`}>{label}</p>
      <p className={`mt-2 text-xl font-semibold tabular-nums font-mono ${valueColor}`}>{value}</p>
      {sub && <p className={`mt-0.5 text-xs ${labelColor}`}>{sub}</p>}
    </div>
  );
}

function ProductTable({ rows, emptyLabel }: { rows: ProductReturn[]; emptyLabel: string }) {
  if (rows.length === 0) {
    return (
      <div className="px-6 py-6 text-center text-sm text-[var(--text-muted)]">{emptyLabel}</div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)] text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            <th className="px-6 py-3 text-left">Ürün</th>
            <th className="px-4 py-3 text-right">İade Talebi</th>
            <th className="px-4 py-3 text-right">Satış Adedi</th>
            <th className="px-4 py-3 text-right">İade Oranı</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {rows.map((p) => (
            <tr key={p.productId} className="hover:bg-[var(--surface-3)]">
              <td className="px-6 py-3">
                <Link
                  href={`/products/${p.productId}`}
                  className="font-medium text-[var(--text-primary)] underline decoration-dotted hover:text-[var(--text-secondary)]"
                >
                  {p.name}
                </Link>
                {p.sku && <p className="font-mono text-xs text-[var(--text-muted)]">{p.sku}</p>}
              </td>
              <td className="px-4 py-3 text-right tabular-nums font-mono text-[var(--text-secondary)]">{p.claimCount}</td>
              <td className="px-4 py-3 text-right tabular-nums font-mono text-[var(--text-muted)]">{p.soldQty || "—"}</td>
              <td className={`px-4 py-3 text-right tabular-nums font-mono ${rateColor(p.returnRate)}`}>
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
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Pazar Yerleri / İade Analizi
          </p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
            İade Oranı Analizi
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Trendyol iade kayıtlarından hesaplanan ürün bazlı iade oranı.
            Yüksek iade oranı, fiyat, kalite veya listeleme sorununa işaret eder.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/marketplace/realized-margin"
            className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-3)]"
          >
            ← Gerçekleşen Marj
          </Link>
          <Link
            href="/marketplace/trendyol/returns"
            className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-3)]"
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
        <div className="overflow-hidden rounded-lg border border-[var(--danger-border)] bg-[var(--surface-2)]">
          <div className="border-b border-[var(--danger-border)] bg-[var(--danger-dim)] px-6 py-4">
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--danger)]">
              Yüksek Risk
            </p>
            <h2 className="mt-1 text-base font-semibold text-[var(--text-primary)]">
              Yüksek İade Oranı — ≥%5 ({highRiskRows.length} ürün)
            </h2>
            <p className="mt-0.5 text-xs text-[var(--danger)]">
              Bu ürünler için listeleme, fiyat ve ürün kalitesini gözden geçirin.
            </p>
          </div>
          <ProductTable rows={highRiskRows} emptyLabel="" />
        </div>
      )}

      {/* Normal return rate */}
      <div className="overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)]">
        <div className="border-b border-[var(--border-subtle)] px-6 py-4">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Normal
          </p>
          <h2 className="mt-1 text-base font-semibold text-[var(--text-primary)]">
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
        <div className="overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)]">
          <div className="border-b border-[var(--border-subtle)] px-6 py-4">
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
              Satış Kaydı Yok
            </p>
            <h2 className="mt-1 text-base font-semibold text-[var(--text-primary)]">
              Satış Verisi Eksik ({noSalesRows.length} ürün)
            </h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              İade talebi var ancak eşleşen satış kaydı bulunamadı. Senkronize edilmemiş olabilir.
            </p>
          </div>
          <ProductTable rows={noSalesRows} emptyLabel="" />
        </div>
      )}

      {/* Top return reasons */}
      {topReasons.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)]">
          <div className="border-b border-[var(--border-subtle)] px-6 py-4">
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
              İade Nedenleri
            </p>
            <h2 className="mt-1 text-base font-semibold text-[var(--text-primary)]">
              En Sık İade Nedenleri (Top 10)
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)] text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                  <th className="px-6 py-3 text-left">Neden</th>
                  <th className="px-4 py-3 text-right">Adet</th>
                  <th className="px-4 py-3 text-right">Oran</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {topReasons.map(([reason, count]) => (
                  <tr key={reason} className="hover:bg-[var(--surface-3)]">
                    <td className="px-6 py-3 text-[var(--text-secondary)]">{reason}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-mono font-semibold text-[var(--text-primary)]">
                      {count}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-mono text-[var(--text-muted)]">
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
        <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] px-6 py-12 text-center">
          <p className="text-[var(--text-secondary)]">
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

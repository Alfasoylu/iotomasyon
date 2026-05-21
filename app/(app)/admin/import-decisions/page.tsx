/**
 * Phase 11C — Import Decision Cockpit
 *
 * Shows every active product's air/sea freight economics and buy recommendation.
 * Replaces the manual Excel workbook (docs/urunler.xlsx) import decision workflow.
 *
 * URL filters:
 *   ?decision=ALWAYS_STOCK | BUY_SMALL | DO_NOT_BUY | MISSING_DATA
 *   ?method=AIR | SEA
 */

import Link from "next/link";
import { Plane, Ship } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  calculateImportDecision,
  RECOMMENDATION_LABELS,
  DEFAULT_USD_TRY_RATE,
  type ImportRecommendation,
} from "@/lib/import-decision";
import { ImportSnapshotButton } from "@/components/products/import-snapshot-button";

export const dynamic = "force-dynamic";

function fmt(n: number, decimals = 2) {
  return n.toFixed(decimals);
}

function fmtUsd(n: number) {
  return `$${n.toFixed(2)}`;
}

const DECISION_TONE: Record<ImportRecommendation, "success" | "warning" | "danger" | "default"> = {
  ALWAYS_STOCK: "success",
  BUY_SMALL: "warning",
  DO_NOT_BUY: "danger",
  MISSING_DATA: "default",
};

export default async function ImportDecisionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  const sp = await searchParams;
  const filterDecision = sp.decision as ImportRecommendation | undefined;
  const filterMethod = sp.method as "AIR" | "SEA" | undefined;

  // Phase 59: 90-day Trendyol velocity window
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // Fetch exchange rate, products, and Trendyol 90d sales in parallel
  const [latestRate, products, trendyolSales90d] = await Promise.all([
    prisma.monthlyExchangeRate.findFirst({
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
    prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        sku: true,
        stockQuantity: true,
        importUnitCostUsd: true,
        unitCostUsd: true,
        weightKg: true,
        customsRatePct: true,
        shippingMethodPref: true,
        sellingPriceTry: true,
        marketplacePriceTry: true,
        shippingCost: true,
        shippingCostOverride: true,
        marketplaceCommission: true,
        marketplaceCommissionOverride: true,
        onlineSalesPotential: true,
        wholesaleSalesPotential: true,
        installerSalesPotential: true,
        // Phase 31 — RMB-first import economics
        sourceCostRmb: true,
        importPaymentFeePct: true,
      },
      orderBy: { name: "asc" },
    }),
    // Phase 59: query TrendyolSalesRecord for last 90 days, non-cancelled, matched products only
    prisma.trendyolSalesRecord.findMany({
      where: {
        productId: { not: null },
        orderDate: { gte: ninetyDaysAgo },
        status: { not: "Cancelled" },
      },
      select: { productId: true, quantity: true, status: true },
    }),
  ]);

  // Phase 59: build productId → { qty90d, monthlyVelocity } map
  const velocityByProduct = new Map<string, { qty90d: number; monthlyVelocity: number }>();
  for (const rec of trendyolSales90d) {
    if (!rec.productId) continue;
    // Filter out common cancelled status variations
    const statusLower = rec.status.toLowerCase();
    if (statusLower.includes("cancel") || statusLower.includes("iptal")) continue;
    const current = velocityByProduct.get(rec.productId);
    if (current) {
      current.qty90d += rec.quantity;
      current.monthlyVelocity = Math.round(current.qty90d / 3);
    } else {
      velocityByProduct.set(rec.productId, {
        qty90d: rec.quantity,
        monthlyVelocity: Math.round(rec.quantity / 3),
      });
    }
  }

  const usdTryRate = latestRate ? Number(latestRate.usdTryRate) : DEFAULT_USD_TRY_RATE;
  // Latest RMB/USD rate from exchange rate table
  const rmbUsdRate = latestRate?.rmbUsdRate != null ? Number(latestRate.rmbUsdRate) : null;

  // Compute decisions for all products
  const rows = products.map((p) => {
    // Source price: prefer importUnitCostUsd, fall back to unitCostUsd
    const sourcePriceUsd =
      p.importUnitCostUsd != null
        ? Number(p.importUnitCostUsd)
        : p.unitCostUsd != null
          ? Number(p.unitCostUsd)
          : null;

    const manualMonthlyUnits =
      (p.onlineSalesPotential ?? 0) +
      (p.wholesaleSalesPotential ?? 0) +
      (p.installerSalesPotential ?? 0);

    // Phase 60: incorporate Trendyol real velocity as demand signal
    const trendyolMonthly = velocityByProduct.get(p.id)?.monthlyVelocity ?? 0;
    const effectiveMonthlyUnits = Math.max(manualMonthlyUnits, trendyolMonthly) || null;

    // Source tracking for display
    type UnitsSource = "trendyol" | "manual" | "combined" | "none";
    const monthlyUnitsSource: UnitsSource =
      manualMonthlyUnits > 0 && trendyolMonthly > 0
        ? "combined"
        : trendyolMonthly > 0
          ? "trendyol"
          : manualMonthlyUnits > 0
            ? "manual"
            : "none";

    // Use marketplace price for the import profitability calculation
    const sellingPriceTry =
      p.marketplacePriceTry != null
        ? Number(p.marketplacePriceTry)
        : p.sellingPriceTry != null
          ? Number(p.sellingPriceTry)
          : null;

    const commissionPct =
      p.marketplaceCommissionOverride != null
        ? Number(p.marketplaceCommissionOverride)
        : p.marketplaceCommission != null
          ? Number(p.marketplaceCommission)
          : null;

    const domesticShippingTry =
      p.shippingCostOverride != null
        ? Number(p.shippingCostOverride)
        : p.shippingCost != null
          ? Number(p.shippingCost)
          : null;

    const decision = calculateImportDecision({
      sourcePriceUsd,
      // Phase 31 — RMB-first path
      sourceCostRmb: p.sourceCostRmb != null ? Number(p.sourceCostRmb) : null,
      rmbUsdRate,
      importPaymentFeePct: p.importPaymentFeePct != null ? Number(p.importPaymentFeePct) : null,
      weightKg: p.weightKg != null ? Number(p.weightKg) : null,
      customsRatePct: p.customsRatePct != null ? Number(p.customsRatePct) : null,
      shippingMethodPref: p.shippingMethodPref,
      sellingPriceTry,
      commissionPct,
      domesticShippingTry,
      usdTryRate,
      monthlyUnits: effectiveMonthlyUnits,
      airFreightPerKgOverride: null,
      seaFreightPerKgOverride: null,
    });

    const trendyolVelocity = velocityByProduct.get(p.id) ?? null;

    return { product: p, decision, monthlyUnits: manualMonthlyUnits, trendyolVelocity, monthlyUnitsSource };
  });

  // Summary counts
  const counts = {
    ALWAYS_STOCK: rows.filter((r) => r.decision.decision === "ALWAYS_STOCK").length,
    BUY_SMALL: rows.filter((r) => r.decision.decision === "BUY_SMALL").length,
    DO_NOT_BUY: rows.filter((r) => r.decision.decision === "DO_NOT_BUY").length,
    MISSING_DATA: rows.filter((r) => r.decision.decision === "MISSING_DATA").length,
  };

  // Apply URL filters
  const filtered = rows.filter((r) => {
    if (filterDecision && r.decision.decision !== filterDecision) return false;
    if (filterMethod && r.decision.effectiveMethod !== filterMethod) return false;
    return true;
  });

  // Sort: ALWAYS_STOCK first, then by score desc, MISSING_DATA last
  const sorted = [...filtered].sort((a, b) => {
    const order: Record<ImportRecommendation, number> = {
      ALWAYS_STOCK: 0,
      BUY_SMALL: 1,
      DO_NOT_BUY: 2,
      MISSING_DATA: 3,
    };
    const diff = order[a.decision.decision] - order[b.decision.decision];
    if (diff !== 0) return diff;
    return b.decision.score - a.decision.score;
  });

  const hasFilters = filterDecision || filterMethod;

  function filterLink(params: Record<string, string | undefined>) {
    const p = new URLSearchParams();
    if (params.decision) p.set("decision", params.decision);
    if (params.method) p.set("method", params.method);
    const q = p.toString();
    return `/admin/import-decisions${q ? `?${q}` : ""}`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
          Yönetici paneli
        </p>
        <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
          İthalat Kararları
        </h1>
        <p className="mt-1 text-sm leading-7 text-[var(--text-secondary)]">
          Her aktif ürün için hava/deniz kargo ekonomisi ve satın alma önerisi.
          Kur: <span className="font-semibold font-mono tabular-nums">1 USD = ₺{usdTryRate.toFixed(2)}</span>
          {latestRate
            ? ` (${latestRate.month}/${latestRate.year})`
            : " (varsayılan — kur tablosu boş)"}
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="HEP STOKTA OLMALI"
          count={counts.ALWAYS_STOCK}
          tone="success"
          href={filterLink({ decision: "ALWAYS_STOCK" })}
          active={filterDecision === "ALWAYS_STOCK"}
        />
        <SummaryCard
          label="AZ AL"
          count={counts.BUY_SMALL}
          tone="warning"
          href={filterLink({ decision: "BUY_SMALL" })}
          active={filterDecision === "BUY_SMALL"}
        />
        <SummaryCard
          label="ALMA"
          count={counts.DO_NOT_BUY}
          tone="danger"
          href={filterLink({ decision: "DO_NOT_BUY" })}
          active={filterDecision === "DO_NOT_BUY"}
        />
        <SummaryCard
          label="VERİ EKSİK"
          count={counts.MISSING_DATA}
          tone="default"
          href={filterLink({ decision: "MISSING_DATA" })}
          active={filterDecision === "MISSING_DATA"}
        />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-widest text-[var(--text-muted)]">Filtrele:</span>
        <Link
          href={filterLink({})}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition border ${!hasFilters ? "bg-[var(--accent-dim)] text-[var(--accent)] border-[var(--accent-border)]" : "bg-[var(--surface-2)] text-[var(--text-secondary)] border-[var(--border-default)] hover:bg-[var(--surface-3)]"}`}
        >
          Tümü ({rows.length})
        </Link>
        <Link
          href={filterLink({ ...Object.fromEntries(new URLSearchParams(hasFilters ? `` : ``)), method: "AIR" })}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition border ${filterMethod === "AIR" ? "bg-[var(--accent-dim)] text-[var(--accent)] border-[var(--accent-border)]" : "bg-[var(--surface-2)] text-[var(--text-secondary)] border-[var(--border-default)] hover:bg-[var(--surface-3)]"}`}
        >
          Hava yolu
        </Link>
        <Link
          href={filterLink({ decision: filterDecision, method: "SEA" })}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition border ${filterMethod === "SEA" ? "bg-[var(--accent-dim)] text-[var(--accent)] border-[var(--accent-border)]" : "bg-[var(--surface-2)] text-[var(--text-secondary)] border-[var(--border-default)] hover:bg-[var(--surface-3)]"}`}
        >
          Deniz yolu
        </Link>
        {hasFilters && (
          <Link
            href="/admin/import-decisions"
            className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-dim)] px-3 py-1.5 text-xs font-medium text-[var(--danger)] transition hover:brightness-110"
          >
            Filtreyi temizle
          </Link>
        )}
        <span className="ml-auto text-xs text-[var(--text-muted)] tabular-nums">
          {sorted.length} ürün gösteriliyor
        </span>
      </div>

      {/* Products table */}
      {sorted.length === 0 ? (
        <Card className="p-8 text-center text-sm text-[var(--text-muted)]">
          Bu filtreyle eşleşen ürün bulunamadı.
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)]">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                    Ürün
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                    Karar
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                    Skor
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                    Yöntem
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                    İniş Maliyeti
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                    Kâr Oranı
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                    Aylık Kâr
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                    Yıllık Kâr
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                    Gerekli Sermaye
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                    Trendyol 90g
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                    Talep/ay
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                    Stok
                  </th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                    Kaydet
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {sorted.map(({ product: p, decision: d, monthlyUnits, trendyolVelocity, monthlyUnitsSource }) => (
                  <tr key={p.id} className="hover:bg-[var(--surface-3)]">
                    <td className="px-4 py-3">
                      <Link
                        href={`/products/${p.id}`}
                        className="font-medium text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors"
                      >
                        {p.name}
                      </Link>
                      <p className="mt-0.5 font-mono tabular-nums text-xs text-[var(--text-muted)]">{p.sku}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={DECISION_TONE[d.decision]}>
                        {RECOMMENDATION_LABELS[d.decision]}
                      </Badge>
                      {d.decision === "MISSING_DATA" && d.missingFields.length > 0 && (
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          Eksik: {d.missingFields.join(", ")}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {d.hasData ? fmt(d.score, 3) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {d.effectiveMethod ? (
                        <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${d.effectiveMethod === "AIR" ? "border-[var(--info-border)] bg-[var(--info-dim)] text-[var(--info)]" : "border-[var(--ok-border)] bg-[var(--ok-dim)] text-[var(--ok)]"}`}>
                          {d.effectiveMethod === "AIR" ? <Plane size={14} strokeWidth={1.5} /> : <Ship size={14} strokeWidth={1.5} />}
                          {d.effectiveMethod === "AIR" ? "Hava" : "Deniz"}
                          {p.shippingMethodPref ? " (manuel)" : ""}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {d.effectiveScenario ? fmtUsd(d.effectiveScenario.landedCostUsd) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {d.effectiveScenario ? (
                        <span className={d.effectiveScenario.profitRatio >= 1 ? "text-[var(--ok)]" : "text-[var(--danger)]"}>
                          {fmt(d.effectiveScenario.profitRatio, 3)}×
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {d.effectiveScenario ? fmtUsd(d.effectiveScenario.monthlyProfitUsd) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {d.effectiveScenario ? fmtUsd(d.effectiveScenario.annualProfitUsd) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {d.effectiveScenario ? fmtUsd(d.effectiveScenario.requiredCapitalUsd) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {trendyolVelocity ? (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-mono tabular-nums text-xs font-semibold text-[var(--ok)]">
                            {trendyolVelocity.qty90d} adet
                          </span>
                          <span className="text-[10px] text-[var(--ok)] opacity-70 font-mono tabular-nums">
                            ~{trendyolVelocity.monthlyVelocity}/ay
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {monthlyUnitsSource === "none" ? (
                        <span className="text-xs text-[var(--text-muted)]">—</span>
                      ) : (
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="text-sm text-[var(--text-secondary)] font-mono tabular-nums">
                            {Math.max(monthlyUnits, trendyolVelocity?.monthlyVelocity ?? 0)}
                          </span>
                          <span className={`text-[10px] font-medium ${
                            monthlyUnitsSource === "trendyol"
                              ? "text-[var(--ok)]"
                              : monthlyUnitsSource === "combined"
                                ? "text-[var(--info)]"
                                : "text-[var(--text-muted)]"
                          }`}>
                            {monthlyUnitsSource === "trendyol"
                              ? "Trendyol"
                              : monthlyUnitsSource === "combined"
                                ? "İkisi de"
                                : "Manuel"}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-[var(--text-secondary)] font-mono tabular-nums">
                      {p.stockQuantity}
                    </td>
                    <td className="px-4 py-3">
                      <ImportSnapshotButton productId={p.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Air vs Sea explanation */}
      <Card className="p-5 text-xs leading-6 text-[var(--text-secondary)]">
        <p className="font-semibold text-[var(--text-primary)]">Formül kaynağı: Top.ürünler çalışma sayfası</p>
        <p className="mt-1 font-mono tabular-nums">
          İniş maliyeti = (Kaynak USD + Kargo$/kg × Ağırlık) × (1 + Gümrük%)
          | Hava: {8}$/kg, {120} gün döngü
          | Deniz: {2}$/kg, {210} gün döngü
        </p>
        <p className="font-mono tabular-nums">
          Kâr oranı = Net gelir USD / İniş maliyeti
          | Yıllık ROI = oran^(365/döngü)
          | Deniz kazanır: deniz ROI / hava ROI ≥ 1.1
        </p>
        <p className="font-mono tabular-nums">
          Karar: Yıllık kâr / sermaye &gt; 2 → HEP STOKTA OLMALI | &gt; 1.4 → AZ AL | diğer → ALMA
        </p>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  count,
  tone,
  href,
  active,
}: {
  label: string;
  count: number;
  tone: "success" | "warning" | "danger" | "default";
  href: string;
  active?: boolean;
}) {
  const bg = {
    success: active
      ? "border-[var(--ok-border)] bg-[var(--ok-dim)]"
      : "border-[var(--border-default)] bg-[var(--surface-2)] hover:border-[var(--ok-border)]",
    warning: active
      ? "border-[var(--warn-border)] bg-[var(--warn-dim)]"
      : "border-[var(--border-default)] bg-[var(--surface-2)] hover:border-[var(--warn-border)]",
    danger: active
      ? "border-[var(--danger-border)] bg-[var(--danger-dim)]"
      : "border-[var(--border-default)] bg-[var(--surface-2)] hover:border-[var(--danger-border)]",
    default: active
      ? "border-[var(--accent-border)] bg-[var(--accent-dim)]"
      : "border-[var(--border-default)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]",
  }[tone];

  const countColor = {
    success: "text-[var(--ok)]",
    warning: "text-[var(--warn)]",
    danger: "text-[var(--danger)]",
    default: active ? "text-[var(--accent)]" : "text-[var(--text-primary)]",
  }[tone];

  return (
    <Link href={href} className={`rounded-lg border p-4 transition ${bg}`}>
      <p className={`text-2xl font-semibold font-mono tabular-nums ${countColor}`}>{count}</p>
      <p className={`mt-1 text-[11px] font-medium uppercase tracking-widest ${active ? "text-[var(--text-secondary)]" : "text-[var(--text-muted)]"}`}>
        {label}
      </p>
    </Link>
  );
}

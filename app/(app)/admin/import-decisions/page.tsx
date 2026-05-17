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

  // Fetch exchange rate and products in parallel
  const [latestRate, products] = await Promise.all([
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
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const usdTryRate = latestRate ? Number(latestRate.usdTryRate) : DEFAULT_USD_TRY_RATE;

  // Compute decisions for all products
  const rows = products.map((p) => {
    // Source price: prefer importUnitCostUsd, fall back to unitCostUsd
    const sourcePriceUsd =
      p.importUnitCostUsd != null
        ? Number(p.importUnitCostUsd)
        : p.unitCostUsd != null
          ? Number(p.unitCostUsd)
          : null;

    const monthlyUnits =
      (p.onlineSalesPotential ?? 0) +
      (p.wholesaleSalesPotential ?? 0) +
      (p.installerSalesPotential ?? 0);

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
      weightKg: p.weightKg != null ? Number(p.weightKg) : null,
      customsRatePct: p.customsRatePct != null ? Number(p.customsRatePct) : null,
      shippingMethodPref: p.shippingMethodPref,
      sellingPriceTry,
      commissionPct,
      domesticShippingTry,
      usdTryRate,
      monthlyUnits: monthlyUnits > 0 ? monthlyUnits : null,
    });

    return { product: p, decision, monthlyUnits };
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
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
          Yönetici paneli
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          İthalat Kararları
        </h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          Her aktif ürün için hava/deniz kargo ekonomisi ve satın alma önerisi.
          Kur: <span className="font-semibold">1 USD = ₺{usdTryRate.toFixed(2)}</span>
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
        <span className="text-xs uppercase tracking-wide text-slate-400">Filtrele:</span>
        <Link
          href={filterLink({})}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${!hasFilters ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
        >
          Tümü ({rows.length})
        </Link>
        <Link
          href={filterLink({ ...Object.fromEntries(new URLSearchParams(hasFilters ? `` : ``)), method: "AIR" })}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${filterMethod === "AIR" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
        >
          Hava yolu
        </Link>
        <Link
          href={filterLink({ decision: filterDecision, method: "SEA" })}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${filterMethod === "SEA" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
        >
          Deniz yolu
        </Link>
        {hasFilters && (
          <Link
            href="/admin/import-decisions"
            className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100"
          >
            Filtreyi temizle
          </Link>
        )}
        <span className="ml-auto text-xs text-slate-400">
          {sorted.length} ürün gösteriliyor
        </span>
      </div>

      {/* Products table */}
      {sorted.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          Bu filtreyle eşleşen ürün bulunamadı.
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Ürün
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Karar
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Skor
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Yöntem
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    İniş Maliyeti
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Kâr Oranı
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Aylık Kâr
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Yıllık Kâr
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Gerekli Sermaye
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Talep/ay
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Stok
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sorted.map(({ product: p, decision: d, monthlyUnits }) => (
                  <tr key={p.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3">
                      <Link
                        href={`/products/${p.id}`}
                        className="font-medium text-slate-900 hover:text-slate-600"
                      >
                        {p.name}
                      </Link>
                      <p className="mt-0.5 font-mono text-xs text-slate-400">{p.sku}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={DECISION_TONE[d.decision]}>
                        {RECOMMENDATION_LABELS[d.decision]}
                      </Badge>
                      {d.decision === "MISSING_DATA" && d.missingFields.length > 0 && (
                        <p className="mt-1 text-xs text-slate-400">
                          Eksik: {d.missingFields.join(", ")}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">
                      {d.hasData ? fmt(d.score, 3) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {d.effectiveMethod ? (
                        <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${d.effectiveMethod === "AIR" ? "bg-blue-50 text-blue-700" : "bg-teal-50 text-teal-700"}`}>
                          {d.effectiveMethod === "AIR" ? "✈ Hava" : "🚢 Deniz"}
                          {p.shippingMethodPref ? " (manuel)" : ""}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">
                      {d.effectiveScenario ? fmtUsd(d.effectiveScenario.landedCostUsd) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {d.effectiveScenario ? (
                        <span className={d.effectiveScenario.profitRatio >= 1 ? "text-emerald-700" : "text-red-600"}>
                          {fmt(d.effectiveScenario.profitRatio, 3)}×
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">
                      {d.effectiveScenario ? fmtUsd(d.effectiveScenario.monthlyProfitUsd) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">
                      {d.effectiveScenario ? fmtUsd(d.effectiveScenario.annualProfitUsd) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">
                      {d.effectiveScenario ? fmtUsd(d.effectiveScenario.requiredCapitalUsd) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {monthlyUnits > 0 ? monthlyUnits : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {p.stockQuantity}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Air vs Sea explanation */}
      <Card className="p-5 text-xs leading-6 text-slate-500">
        <p className="font-semibold text-slate-700">Formül kaynağı: Top.ürünler çalışma sayfası</p>
        <p className="mt-1">
          İniş maliyeti = (Kaynak USD + Kargo$/kg × Ağırlık) × (1 + Gümrük%)
          | Hava: {8}$/kg, {120} gün döngü
          | Deniz: {2}$/kg, {210} gün döngü
        </p>
        <p>
          Kâr oranı = Net gelir USD / İniş maliyeti
          | Yıllık ROI = oran^(365/döngü)
          | Deniz kazanır: deniz ROI / hava ROI ≥ 1.1
        </p>
        <p>
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
    success: active ? "bg-emerald-700 text-white" : "bg-white border border-emerald-200 hover:border-emerald-400",
    warning: active ? "bg-amber-600 text-white" : "bg-white border border-amber-200 hover:border-amber-400",
    danger: active ? "bg-red-700 text-white" : "bg-white border border-red-200 hover:border-red-400",
    default: active ? "bg-slate-700 text-white" : "bg-white border border-slate-200 hover:border-slate-400",
  }[tone];

  const countColor = {
    success: active ? "text-emerald-100" : "text-emerald-700",
    warning: active ? "text-amber-100" : "text-amber-700",
    danger: active ? "text-red-100" : "text-red-700",
    default: active ? "text-slate-300" : "text-slate-700",
  }[tone];

  return (
    <Link href={href} className={`rounded-2xl p-4 transition ${bg}`}>
      <p className={`text-3xl font-bold ${countColor}`}>{count}</p>
      <p className={`mt-1 text-xs font-semibold ${active ? "opacity-80" : "text-slate-600"}`}>
        {label}
      </p>
    </Link>
  );
}

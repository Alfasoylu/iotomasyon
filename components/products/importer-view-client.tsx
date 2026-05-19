"use client";

/**
 * Phase 79+80 — İthalatçı Görünümü Client Component
 *
 * Fetches from /api/products/importer-view (admin-only).
 * Runs budget allocation in useMemo.
 * Renders: summary cards + budget params panel + filter bar + data table.
 * Phase 80: edit-pencil button → ImportQuickEdit modal → PATCH /api/products/[id]/import-fields
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  allocateBudget,
  calcDecisionLabel,
  calcImportCost,
  calcRevenue,
  calcProfit,
  calcStockDays,
  calcHealthScore,
  type BudgetParams,
  DEFAULT_BUDGET_PARAMS,
  type DecisionLabel,
  type AllocationResult,
} from "@/lib/importer-cost";
import type { ImporterProduct } from "@/app/api/products/importer-view/route";
import { ImportQuickEdit } from "@/components/products/import-quick-edit";

// ── Formatting helpers ──────────────────────────────────────────────────────────

function fmtUsd(v: number | null, digits = 2): string {
  if (v == null) return "—";
  return "$" + v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtTry(v: number | null): string {
  if (v == null) return "—";
  return "₺" + v.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(v: number | null, digits = 1): string {
  if (v == null) return "—";
  return "%" + v.toFixed(digits);
}

function fmtRmb(v: number | null): string {
  if (v == null) return "—";
  return "¥" + v.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Decision label styles ───────────────────────────────────────────────────────

const DECISION_STYLES: Record<DecisionLabel, string> = {
  "Al":                 "bg-emerald-100 text-emerald-800 border border-emerald-200",
  "Yüksek ROI":         "bg-emerald-50 text-emerald-700 border border-emerald-100",
  "Nakit Dönüş Hızlı":  "bg-teal-100 text-teal-800 border border-teal-200",
  "Bekle":              "bg-blue-50 text-blue-700 border border-blue-100",
  "Stok Fazla":         "bg-amber-100 text-amber-800 border border-amber-200",
  "Zarar":              "bg-red-100 text-red-800 border border-red-200",
  "Fiyat Yok":          "bg-slate-100 text-slate-600 border border-slate-200",
  "Maliyet Yok":        "bg-slate-100 text-slate-600 border border-slate-200",
  "Veri Eksik":         "bg-slate-100 text-slate-400 border border-slate-100",
};

// ── Missing field chips ─────────────────────────────────────────────────────────
// Returns a list of human-readable labels for every missing input field.
// Shown as small red/amber chips below the decision badge.

type MissingField = { label: string; tone: "red" | "amber" };

function getMissingFields(p: {
  sourceCostRmb: number | null;
  weightKg: number | null;
  hasTrendyolPrice: boolean;
  t30g: number;
  netProfitUsd?: number | null;
}): MissingField[] {
  const missing: MissingField[] = [];
  if (!p.sourceCostRmb) missing.push({ label: "Alış RMB", tone: "red" });
  if (!p.weightKg) missing.push({ label: "Ağırlık", tone: "red" });
  if (!p.hasTrendyolPrice) missing.push({ label: "T. Fiyat", tone: "red" });
  if (p.t30g === 0) missing.push({ label: "Satış Yok", tone: "amber" });
  return missing;
}

function roiColor(roi: number | null): string {
  if (roi == null) return "text-slate-400";
  if (roi >= 100) return "text-emerald-600 font-semibold";
  if (roi >= 50) return "text-emerald-500";
  if (roi >= 30) return "text-amber-500";
  return "text-red-500";
}

function marginColor(m: number | null): string {
  if (m == null) return "text-slate-400";
  if (m >= 40) return "text-emerald-600 font-semibold";
  if (m >= 20) return "text-emerald-500";
  if (m >= 10) return "text-amber-500";
  return "text-red-500";
}

function profitColor(p: number | null): string {
  if (p == null) return "text-slate-400";
  if (p > 0) return "text-emerald-600";
  return "text-red-600 font-semibold";
}

// ── Client-side recalculation after inline edit ─────────────────────────────────
// Re-runs the same formulas as the API, so computed fields stay fresh after saves.

function recalcProduct(
  p: ImporterProduct,
  patch: Partial<Pick<ImporterProduct, "sourceCostRmb" | "weightKg" | "customsRatePct" | "importPaymentFeePct" | "shippingMethodPref" | "onlineSalesPotential">>,
  rates: { rmbUsdRate: number; usdTryRate: number },
): ImporterProduct {
  const m = { ...p, ...patch };
  const costResult = calcImportCost({
    sourceCostRmb: m.sourceCostRmb,
    weightKg: m.weightKg,
    customsRatePct: m.customsRatePct,
    importPaymentFeePct: m.importPaymentFeePct,
    shippingMethodPref: m.shippingMethodPref,
    rmbUsdRate: rates.rmbUsdRate,
  });
  const revenueResult = calcRevenue({ trendyolPriceTry: m.trendyolPriceTry, usdTryRate: rates.usdTryRate });
  const profitResult = costResult && revenueResult ? calcProfit(costResult, revenueResult) : null;
  // Phase 90: demand = max(t30g, manuel onlineSalesPotential)
  const manualOnline = m.onlineSalesPotential ?? 0;
  const effectiveT30g = Math.max(m.t30g, manualOnline);
  const stockDays = calcStockDays(m.stockQuantity, effectiveT30g);
  const healthScore = calcHealthScore({
    hasRmb: m.sourceCostRmb != null,
    hasWeight: m.weightKg != null,
    hasTrendyolPrice: m.trendyolPriceTry != null,
    netProfitUsd: profitResult?.netProfitUsd ?? null,
    marginPct: profitResult?.marginPct ?? null,
    t30g: effectiveT30g,
    stockDays,
  });
  return {
    ...m,
    shippingMethod: costResult?.shippingMethod ?? null,
    productUsd: costResult?.productUsd ?? null,
    freightUsd: costResult?.freightUsd ?? null,
    customsUsd: costResult?.customsUsd ?? null,
    totalCostUsd: costResult?.totalCostUsd ?? null,
    netRevenueTry: revenueResult?.netRevenueTry ?? null,
    netRevenueUsd: revenueResult?.netRevenueUsd ?? null,
    netProfitUsd: profitResult?.netProfitUsd ?? null,
    marginPct: profitResult?.marginPct ?? null,
    annualRoiPct: profitResult?.annualRoiPct ?? null,
    stockDays,
    healthScore,
    effectiveMonthlyUnits: effectiveT30g,
    hasCost: costResult !== null,
  };
}

// ── Inline edit number cell ─────────────────────────────────────────────────────
// Click → input; Enter/blur → save. Shows current value or placeholder when null.

type InlineEditState = { id: string; field: string; value: string } | null;

function InlineEditNumber({
  value,
  productId,
  field,
  suffix,
  placeholder,
  decimals = 2,
  editState,
  setEditState,
  onSave,
  isSaving,
}: {
  value: number | null;
  productId: string;
  field: string;
  suffix?: string;
  placeholder?: string;
  decimals?: number;
  editState: InlineEditState;
  setEditState: (v: InlineEditState) => void;
  onSave: (id: string, field: string, value: number | null) => void;
  isSaving: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isEditing = editState?.id === productId && editState?.field === field;

  useEffect(() => {
    if (isEditing) inputRef.current?.select();
  }, [isEditing]);

  const commit = useCallback(() => {
    if (!editState || editState.id !== productId || editState.field !== field) return;
    const raw = editState.value.trim();
    const n = parseFloat(raw);
    onSave(productId, field, raw === "" || isNaN(n) ? null : n);
  }, [editState, productId, field, onSave]);

  if (isSaving) {
    return <span className="text-[10px] text-slate-400 animate-pulse">…</span>;
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="number"
        step="any"
        value={editState.value}
        onChange={(e) => setEditState({ id: productId, field, value: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") setEditState(null);
        }}
        onBlur={commit}
        className="w-16 text-right text-xs border border-blue-400 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
      />
    );
  }

  return (
    <button
      onClick={() => setEditState({ id: productId, field, value: value != null ? String(value) : "" })}
      className="group text-left font-mono hover:bg-blue-50 hover:text-blue-700 rounded px-1 transition cursor-pointer w-full"
      title="Tıkla ve düzenle (Enter = kaydet)"
    >
      {value != null
        ? <span className="text-xs">{value.toFixed(decimals)}{suffix}</span>
        : <span className="text-[10px] text-red-400 group-hover:text-blue-500">{placeholder ?? "—"}</span>
      }
    </button>
  );
}

// ── Sort options ────────────────────────────────────────────────────────────────

type SortKey =
  | "roi" | "margin" | "profit" | "t30g" | "order" | "health"
  | "cost" | "stock_days" | "stock" | "weight"
  | "lifetime" | "monthly_profit" | "price";

type FilterKey =
  | "all" | "order" | "missing_cost" | "no_trendyol" | "no_bayi"
  | "loss" | "high_roi" | "low_stock";

// ── Component ────────────────────────────────────────────────────────────────────

export function ImporterViewClient() {
  const [products, setProducts] = useState<ImporterProduct[]>([]);
  const [rates, setRates] = useState({ usdTryRate: 45, rmbUsdRate: 7.2 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<BudgetParams>(DEFAULT_BUDGET_PARAMS);
  const [showParams, setShowParams] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("roi");
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [editingProduct, setEditingProduct] = useState<ImporterProduct | null>(null);
  const [inlineEdit, setInlineEdit] = useState<InlineEditState>(null);
  const [inlineSaving, setInlineSaving] = useState<string | null>(null); // "id:field" being saved

  // Inline field save — calls PATCH then recalculates locally
  const saveInlineField = useCallback(async (id: string, field: string, value: number | null) => {
    setInlineEdit(null);
    const key = `${id}:${field}`;
    setInlineSaving(key);

    // Map field name to API payload key
    const fieldMap: Record<string, string> = {
      rmb: "sourceCostRmb",
      weight: "weightKg",
      customs: "customsRatePct",
      payFee: "importPaymentFeePct",
      monthly: "onlineSalesPotential",
    };
    const apiField = fieldMap[field] ?? field;

    try {
      const res = await fetch(`/api/products/${id}/import-fields`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [apiField]: value }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Optimistic update with full recalculation
      setProducts((prev) =>
        prev.map((p) =>
          p.id === id
            ? recalcProduct(p, { [apiField as keyof ImporterProduct]: value } as Parameters<typeof recalcProduct>[1], rates)
            : p
        )
      );
    } catch {
      // silently ignore — user can retry
    } finally {
      setInlineSaving(null);
    }
  }, [rates]);

  // Optimistic update after modal quick-edit save
  // NOT: onlineSalesPotential modal'dan çıkarıldı — tabloda inline edit
  const handleQuickSave = useCallback((
    id: string,
    updated: {
      sourceCostRmb: number | null;
      weightKg: number | null;
      customsRatePct: number | null;
      shippingMethodPref: string | null;
      importPaymentFeePct: number | null;
    },
  ) => {
    setProducts((prev) =>
      prev.map((p) => (p.id !== id ? p : recalcProduct(p, updated, rates))),
    );
  }, [rates]);

  // Fetch data
  useEffect(() => {
    fetch("/api/products/importer-view")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { products: ImporterProduct[]; usdTryRate: number; rmbUsdRate: number }) => {
        setProducts(data.products);
        setRates({ usdTryRate: data.usdTryRate, rmbUsdRate: data.rmbUsdRate });
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  // Budget allocation (runs when products or params change).
  // Phase 90: demand signal = max(Trendyol 30g, manuel onlineSalesPotential).
  // Manuel tahmin Trendyol satışından büyükse devre dışı kalmaz.
  const allocationMap = useMemo(() => {
    if (products.length === 0) return new Map();
    return allocateBudget(
      products.map((p) => ({
        id: p.id,
        stockQuantity: p.stockQuantity,
        t30g: p.effectiveMonthlyUnits,
        totalCostUsd: p.totalCostUsd,
        netProfitUsd: p.netProfitUsd,
        annualRoiPct: p.annualRoiPct,
        score: p.healthScore,
      })),
      params,
    );
  }, [products, params]);

  // Enrich products with allocation results + decision labels
  // decisionLabel ("Stok Fazla" / "Veri Eksik" vs.) Phase 90: effectiveMonthlyUnits ile hesaplanır
  type EnrichedProduct = ImporterProduct & AllocationResult & { decisionLabel: DecisionLabel };
  const enriched: EnrichedProduct[] = useMemo(() => {
    return products.map((p) => {
      const alloc = allocationMap.get(p.id) ?? { recommendedQty: 0, neededQty: 0, budgetCost: 0 };
      const decisionLabel = calcDecisionLabel({
        hasCost: p.hasCost,
        hasTrendyolPrice: p.hasTrendyolPrice,
        netProfitUsd: p.netProfitUsd,
        annualRoiPct: p.annualRoiPct,
        stockDays: p.stockDays,
        targetStockDays: params.targetStockDays,
        recommendedQty: alloc.recommendedQty,
        t30g: p.effectiveMonthlyUnits,
      });
      return { ...p, ...alloc, decisionLabel };
    });
  }, [products, allocationMap, params.targetStockDays]);

  // Summary stats
  // Phase 90: Aylık talep sinyali = effectiveMonthlyUnits = max(Trendyol t30g, manuel onlineSalesPotential).
  // sipariş hesaplayıcı (allocateBudget) ile aynı semantik; özet kartı da aynı kaynağı kullanmalı.
  const summary = useMemo(() => {
    const withCost = enriched.filter((p) => p.totalCostUsd != null);
    const totalStockCostUsd = withCost.reduce((s, p) => s + (p.totalCostUsd ?? 0) * p.stockQuantity, 0);
    const totalPotentialProfit = enriched.reduce(
      (s, p) => s + Math.max(0, (p.netProfitUsd ?? 0) * p.effectiveMonthlyUnits),
      0,
    );
    const orderedItems = enriched.filter((p) => p.recommendedQty > 0);
    const recommendedBudget = orderedItems.reduce((s, p) => s + p.budgetCost, 0);
    const top10Profit = enriched
      .filter((p) => (p.netProfitUsd ?? 0) > 0 && p.effectiveMonthlyUnits > 0)
      .sort(
        (a, b) =>
          (b.netProfitUsd ?? 0) * b.effectiveMonthlyUnits -
          (a.netProfitUsd ?? 0) * a.effectiveMonthlyUnits,
      )
      .slice(0, 10)
      .reduce((s, p) => s + (p.netProfitUsd ?? 0) * p.effectiveMonthlyUnits, 0);
    const missingData = enriched.filter((p) => !p.hasCost || !p.hasTrendyolPrice).length;
    const losing = enriched.filter((p) => p.hasCost && p.hasTrendyolPrice && (p.netProfitUsd ?? 0) <= 0).length;
    return { totalStockCostUsd, totalPotentialProfit, recommendedBudget, top10Profit, missingData, losing };
  }, [enriched]);

  // Filter + sort
  const filtered = useMemo(() => {
    let rows = [...enriched];

    switch (filter) {
      case "order":       rows = rows.filter((p) => p.recommendedQty > 0); break;
      case "missing_cost": rows = rows.filter((p) => !p.hasCost); break;
      case "no_trendyol": rows = rows.filter((p) => !p.hasTrendyolPrice); break;
      case "no_bayi":     rows = rows.filter((p) => !p.hasBayiPrice); break;
      case "loss":        rows = rows.filter((p) => p.hasCost && p.hasTrendyolPrice && (p.netProfitUsd ?? 0) <= 0); break;
      case "high_roi":    rows = rows.filter((p) => (p.annualRoiPct ?? 0) >= 100); break;
      case "low_stock":   rows = rows.filter((p) => p.stockQuantity <= p.minimumStock); break;
    }

    rows.sort((a, b) => {
      let diff = 0;
      switch (sortKey) {
        case "roi":        diff = (a.annualRoiPct ?? -Infinity) - (b.annualRoiPct ?? -Infinity); break;
        case "margin":     diff = (a.marginPct ?? -Infinity) - (b.marginPct ?? -Infinity); break;
        case "profit":     diff = (a.netProfitUsd ?? -Infinity) - (b.netProfitUsd ?? -Infinity); break;
        case "t30g":       diff = a.t30g - b.t30g; break;
        case "order":      diff = a.recommendedQty - b.recommendedQty; break;
        case "health":     diff = a.healthScore - b.healthScore; break;
        case "cost":       diff = (a.totalCostUsd ?? -Infinity) - (b.totalCostUsd ?? -Infinity); break;
        case "stock_days": diff = (a.stockDays ?? Infinity) - (b.stockDays ?? Infinity); break;
        case "stock":      diff = a.stockQuantity - b.stockQuantity; break;
        case "weight":     diff = (a.weightKg ?? -Infinity) - (b.weightKg ?? -Infinity); break;
        case "lifetime":   diff = a.lifetimeTotalQty - b.lifetimeTotalQty; break;
        case "monthly_profit": {
          const ap = (a.netProfitUsd ?? 0) * a.effectiveMonthlyUnits;
          const bp = (b.netProfitUsd ?? 0) * b.effectiveMonthlyUnits;
          diff = ap - bp;
          break;
        }
        case "price":      diff = (a.trendyolPriceTry ?? -Infinity) - (b.trendyolPriceTry ?? -Infinity); break;
      }
      return sortAsc ? diff : -diff;
    });

    return rows;
  }, [enriched, filter, sortKey, sortAsc]);

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortAsc((v) => !v);
    else { setSortKey(key); setSortAsc(false); }
  }, [sortKey]);

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      onClick={() => handleSort(k)}
      className={`text-xs px-2 py-1 rounded transition ${sortKey === k ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
    >
      {label} {sortKey === k ? (sortAsc ? "↑" : "↓") : ""}
    </button>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <div className="text-center">
          <div className="mb-3 text-3xl animate-pulse">📊</div>
          <p className="text-sm">İthalatçı verileri hesaplanıyor…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
        <p className="text-sm font-semibold text-red-700">Veri yüklenemedi</p>
        <p className="mt-1 text-xs text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Stok Maliyeti", value: fmtUsd(summary.totalStockCostUsd, 0), sub: "toplam envanter", color: "slate" },
          { label: "Aylık Potansiyel Kâr", value: fmtUsd(summary.totalPotentialProfit, 0), sub: "max(T30G, manuel aylık)", color: "emerald" },
          { label: "Önerilen Bütçe", value: fmtUsd(summary.recommendedBudget, 0), sub: "sipariş için", color: "blue" },
          { label: "İlk 10 Ürün Kârı", value: fmtUsd(summary.top10Profit, 0), sub: "aylık · max(T30G, manuel)", color: "teal" },
          { label: "Veri Eksik", value: String(summary.missingData), sub: "ürün", color: summary.missingData > 0 ? "amber" : "slate" },
          { label: "Zarar Eden", value: String(summary.losing), sub: "ürün", color: summary.losing > 0 ? "red" : "slate" },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className={`rounded-xl border p-4 ${
            color === "emerald" ? "bg-emerald-50 border-emerald-200" :
            color === "blue"    ? "bg-blue-50 border-blue-200" :
            color === "teal"    ? "bg-teal-50 border-teal-200" :
            color === "amber"   ? "bg-amber-50 border-amber-200" :
            color === "red"     ? "bg-red-50 border-red-200" :
            "bg-white border-slate-200"
          }`}>
            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p className={`mt-1 text-lg font-bold ${
              color === "emerald" ? "text-emerald-800" :
              color === "blue"    ? "text-blue-800" :
              color === "teal"    ? "text-teal-800" :
              color === "amber"   ? "text-amber-800" :
              color === "red"     ? "text-red-700" :
              "text-slate-900"
            }`}>{value}</p>
            <p className="text-[10px] text-slate-400">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Budget params panel ────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <button
          onClick={() => setShowParams((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition rounded-xl"
        >
          <span>⚙ Bütçe & Sipariş Parametreleri</span>
          <span className="text-xs text-slate-400">{showParams ? "Kapat ▲" : "Düzenle ▼"}</span>
        </button>
        {showParams && (
          <div className="border-t border-slate-100 p-5">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {[
                { key: "totalBudgetUsd", label: "Toplam Bütçe (USD)", min: 0, step: 500 },
                { key: "minRoiPct", label: "Min. ROI % Eşiği", min: 0, step: 5 },
                { key: "targetStockDays", label: "Hedef Stok Günü", min: 1, step: 5 },
                { key: "maxBudgetSharePct", label: "Tek Ürün Maks. %", min: 1, step: 5 },
                { key: "minOrderQty", label: "Min. Sipariş Adedi", min: 1, step: 1 },
              ].map(({ key, label, min, step }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
                  <input
                    type="number"
                    min={min}
                    step={step}
                    value={params[key as keyof BudgetParams]}
                    onChange={(e) =>
                      setParams((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400"
                  />
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Parametreleri değiştirdiğinizde sipariş önerileri anında güncellenir. Bütçe sınırına göre en yüksek ROI&apos;li ürünler önce doldurulur.
            </p>
          </div>
        )}
      </div>

      {/* ── Filter bar + sort ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {([
          ["all",          "Tümü"],
          ["order",        "Sipariş Önerisi"],
          ["high_roi",     "Yüksek ROI"],
          ["loss",         "Zarar Edenler"],
          ["missing_cost", "Maliyet Eksik"],
          ["no_trendyol",  "T. Fiyat Yok"],
          ["low_stock",    "Düşük Stok"],
        ] as [FilterKey, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              filter === key
                ? "bg-slate-900 border-slate-900 text-white"
                : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"
            }`}
          >
            {label}
            {key !== "all" && (
              <span className="ml-1 text-[10px] opacity-70">
                ({
                  key === "order"        ? enriched.filter(p => p.recommendedQty > 0).length :
                  key === "high_roi"     ? enriched.filter(p => (p.annualRoiPct ?? 0) >= 100).length :
                  key === "loss"         ? summary.losing :
                  key === "missing_cost" ? enriched.filter(p => !p.hasCost).length :
                  key === "no_trendyol"  ? enriched.filter(p => !p.hasTrendyolPrice).length :
                  enriched.filter(p => p.stockQuantity <= p.minimumStock).length
                })
              </span>
            )}
          </button>
        ))}

        {/* Phase 81 — Sipariş Oluştur button */}
        {(() => {
          const orderItems = enriched.filter((p) => p.recommendedQty > 0);
          if (orderItems.length === 0) return null;
          const itemsParam = orderItems
            .map((p) => `${p.id}:${p.recommendedQty}`)
            .join(",");
          const href = `/admin/purchase-orders/new?from=importer&items=${encodeURIComponent(itemsParam)}`;
          return (
            <Link
              href={href}
              className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition"
            >
              📦 Sipariş Oluştur ({orderItems.length})
            </Link>
          );
        })()}

        <div className="ml-auto flex flex-wrap gap-1">
          <SortBtn k="roi" label="ROI" />
          <SortBtn k="margin" label="Marj" />
          <SortBtn k="profit" label="Kâr" />
          <SortBtn k="monthly_profit" label="Aylık Kâr" />
          <SortBtn k="t30g" label="T30G" />
          <SortBtn k="lifetime" label="Toplam Satış" />
          <SortBtn k="order" label="Sipariş" />
          <SortBtn k="stock" label="Stok" />
          <SortBtn k="stock_days" label="Stok Gün" />
          <SortBtn k="weight" label="Ağırlık" />
          <SortBtn k="price" label="T. Fiyat" />
          <SortBtn k="cost" label="Maliyet" />
          <SortBtn k="health" label="Skor" />
        </div>
      </div>

      <p className="text-xs text-slate-400">{filtered.length} / {enriched.length} ürün gösteriliyor</p>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-auto max-h-[calc(100vh-260px)]">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="sticky top-0 z-20 bg-slate-900 text-left text-[10px] uppercase tracking-[0.2em] text-slate-300 [&_th]:bg-slate-900">
              <tr>
                <th className="w-12 px-2 py-3" />
                <th className="px-3 py-3 min-w-[200px]">Ürün</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">T. Fiyat (₺)</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Bayi ($)</th>
                <th className="px-3 py-3 text-right">Stok</th>
                <th
                  className="px-3 py-3 text-right whitespace-nowrap cursor-pointer hover:text-white"
                  onClick={() => handleSort("lifetime")}
                  title="Tüm zamanlar Trendyol toplam satış adedi (iptaller hariç)"
                >
                  Toplam {sortKey === "lifetime" ? (sortAsc ? "↑" : "↓") : "↕"}
                </th>
                <th
                  className="px-3 py-3 text-right cursor-pointer hover:text-white"
                  onClick={() => handleSort("t30g")}
                  title="Son 30 gün Trendyol satış adedi"
                >
                  T30G {sortKey === "t30g" ? (sortAsc ? "↑" : "↓") : "↕"}
                </th>
                <th
                  className="px-3 py-3 text-right whitespace-nowrap text-blue-300"
                  title="Pazaryeri Aylık Satış Potansiyeli (manuel tahmin) — tıkla → düzenle"
                >
                  Aylık Pot. ✎
                </th>
                {/* Editable import input columns */}
                <th className="px-3 py-3 text-right whitespace-nowrap text-blue-300" title="Tıkla → düzenle">Alış (¥) ✎</th>
                <th className="px-3 py-3 text-right whitespace-nowrap text-blue-300" title="Tıkla → düzenle">Ağırlık (kg) ✎</th>
                <th className="px-3 py-3 text-right whitespace-nowrap text-blue-300" title="Tıkla → düzenle">Gümrük % ✎</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Freight ($)</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Maliyet ($)</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Net Kâr ($)</th>
                <th className="px-3 py-3 text-right">Marj %</th>
                <th className="px-3 py-3 text-right">ROI %</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Stok Gün</th>
                <th
                  className="px-3 py-3 text-right whitespace-nowrap cursor-pointer hover:text-white"
                  onClick={() => handleSort("order")}
                  title="Sipariş adedi'ne göre sırala"
                >
                  Sipariş (Adet) {sortKey === "order" ? (sortAsc ? "↑" : "↓") : "↕"}
                </th>
                <th
                  className="px-3 py-3 text-right whitespace-nowrap cursor-pointer hover:text-white"
                  onClick={() => handleSort("monthly_profit")}
                  title="Net Kâr × Aylık Satış (= effectiveMonthlyUnits × netProfitUsd)"
                >
                  Aylık Kâr ($) {sortKey === "monthly_profit" ? (sortAsc ? "↑" : "↓") : "↕"}
                </th>
                <th className="px-3 py-3 text-center">Durum</th>
                <th className="px-3 py-3 text-center whitespace-nowrap cursor-pointer hover:text-white" onClick={() => handleSort("health")} title="Skor'a göre sırala">
                  Skor {sortKey === "health" ? (sortAsc ? "↑" : "↓") : "↕"}
                </th>
                <th className="w-10 px-2 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 bg-white">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={22} className="px-4 py-12 text-center text-slate-400 text-sm">
                    Bu filtre için ürün bulunamadı.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => {
                  const isLoss = p.hasCost && p.hasTrendyolPrice && (p.netProfitUsd ?? 0) <= 0;
                  const isOrder = p.recommendedQty > 0;

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-slate-50/60 transition ${isLoss ? "bg-red-50/30" : isOrder ? "bg-emerald-50/20" : ""}`}
                    >
                      {/* Thumbnail */}
                      <td className="px-2 py-2">
                        <Link href={`/products/${p.id}`} tabIndex={-1}>
                          {p.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.imageUrl}
                              alt={p.name}
                              className="h-10 w-10 rounded-lg object-contain bg-slate-50 border border-slate-100"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-300 border border-slate-100 text-sm">
                              📦
                            </div>
                          )}
                        </Link>
                      </td>

                      {/* Product */}
                      <td className="px-3 py-2">
                        <Link href={`/products/${p.id}`} className="group">
                          <p className="font-medium text-slate-900 group-hover:text-slate-600 leading-tight text-xs">
                            {p.name}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="font-mono text-[10px] text-slate-400">{p.sku}</span>
                            {p.productKind === "LISTING_PACKAGE" && (
                              <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[9px] text-violet-600">Paket</span>
                            )}
                            {p.brand && (
                              <span className="text-[10px] text-slate-400">{p.brand}</span>
                            )}
                          </div>
                        </Link>
                      </td>

                      {/* Trendyol price TRY */}
                      <td className="px-3 py-2 text-right">
                        {p.trendyolPriceTry != null ? (
                          <span className="font-mono text-xs font-medium text-slate-700">
                            {fmtTry(p.trendyolPriceTry)}
                          </span>
                        ) : (
                          <span className="text-[10px] text-red-400">Fiyat yok</span>
                        )}
                      </td>

                      {/* Bayi price USD */}
                      <td className="px-3 py-2 text-right">
                        {p.bayiPriceUsd != null ? (
                          <span className="font-mono text-xs text-slate-600">
                            {fmtUsd(p.bayiPriceUsd)}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-300">Bayi fiyat yok</span>
                        )}
                      </td>

                      {/* Stock */}
                      <td className="px-3 py-2 text-right">
                        <span className={`font-mono text-xs font-semibold ${p.stockQuantity <= p.minimumStock ? "text-amber-600" : "text-slate-800"}`}>
                          {p.stockQuantity}
                        </span>
                      </td>

                      {/* Lifetime total satış (Trendyol) */}
                      <td className="px-3 py-2 text-right">
                        <span
                          className={`font-mono text-xs ${p.lifetimeTotalQty > 0 ? "text-slate-700 font-semibold" : "text-slate-300"}`}
                          title="Trendyol'da tüm zamanlardaki toplam satış adedi (iptaller hariç)"
                        >
                          {p.lifetimeTotalQty > 0 ? p.lifetimeTotalQty : "—"}
                        </span>
                      </td>

                      {/* T30G */}
                      <td className="px-3 py-2 text-right">
                        <span className={`font-mono text-xs ${p.t30g > 0 ? "text-emerald-600 font-semibold" : "text-slate-300"}`}>
                          {p.t30g > 0 ? p.t30g : "—"}
                        </span>
                      </td>

                      {/* Pazaryeri Aylık Satış Potansiyeli — inline editable */}
                      <td className="px-3 py-2 text-right">
                        <InlineEditNumber
                          value={p.onlineSalesPotential}
                          productId={p.id}
                          field="monthly"
                          placeholder="—"
                          decimals={0}
                          editState={inlineEdit}
                          setEditState={setInlineEdit}
                          onSave={saveInlineField}
                          isSaving={inlineSaving === `${p.id}:monthly`}
                        />
                      </td>

                      {/* RMB cost — inline editable */}
                      <td className="px-3 py-2 text-right">
                        <InlineEditNumber
                          value={p.sourceCostRmb}
                          productId={p.id}
                          field="rmb"
                          suffix="¥"
                          placeholder="Alış yok"
                          decimals={2}
                          editState={inlineEdit}
                          setEditState={setInlineEdit}
                          onSave={saveInlineField}
                          isSaving={inlineSaving === `${p.id}:rmb`}
                        />
                      </td>

                      {/* Weight (kg) — inline editable */}
                      <td className="px-3 py-2 text-right">
                        <InlineEditNumber
                          value={p.weightKg}
                          productId={p.id}
                          field="weight"
                          suffix="kg"
                          placeholder="Ağırlık yok"
                          decimals={3}
                          editState={inlineEdit}
                          setEditState={setInlineEdit}
                          onSave={saveInlineField}
                          isSaving={inlineSaving === `${p.id}:weight`}
                        />
                      </td>

                      {/* Customs % — inline editable */}
                      <td className="px-3 py-2 text-right">
                        <InlineEditNumber
                          value={p.customsRatePct}
                          productId={p.id}
                          field="customs"
                          suffix="%"
                          placeholder="30%"
                          decimals={0}
                          editState={inlineEdit}
                          setEditState={setInlineEdit}
                          onSave={saveInlineField}
                          isSaving={inlineSaving === `${p.id}:customs`}
                        />
                      </td>

                      {/* Freight USD */}
                      <td className="px-3 py-2 text-right">
                        {p.freightUsd != null ? (
                          <div className="text-right">
                            <span className="font-mono text-xs text-slate-600">{fmtUsd(p.freightUsd)}</span>
                            <p className={`text-[9px] ${p.shippingMethod === "SEA" ? "text-blue-500" : "text-orange-400"}`}>
                              {p.shippingMethod === "SEA" ? "🚢 Deniz" : "✈ Hava"}
                            </p>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-300">Ağırlık yok</span>
                        )}
                      </td>

                      {/* Total cost USD */}
                      <td className="px-3 py-2 text-right">
                        {p.totalCostUsd != null ? (
                          <span className="font-mono text-xs font-semibold text-slate-700">
                            {fmtUsd(p.totalCostUsd)}
                          </span>
                        ) : (
                          <span className="text-[10px] text-red-400">Yok</span>
                        )}
                      </td>

                      {/* Net profit USD */}
                      <td className="px-3 py-2 text-right">
                        <span className={`font-mono text-xs ${profitColor(p.netProfitUsd)}`}>
                          {fmtUsd(p.netProfitUsd)}
                        </span>
                      </td>

                      {/* Margin % */}
                      <td className="px-3 py-2 text-right">
                        <span className={`text-xs ${marginColor(p.marginPct)}`}>
                          {fmtPct(p.marginPct)}
                        </span>
                      </td>

                      {/* Annual ROI % */}
                      <td className="px-3 py-2 text-right">
                        <span className={`text-xs ${roiColor(p.annualRoiPct)}`}>
                          {p.annualRoiPct != null ? fmtPct(p.annualRoiPct, 0) : "—"}
                        </span>
                      </td>

                      {/* Stock days */}
                      <td className="px-3 py-2 text-right">
                        {p.stockDays != null ? (
                          <span className={`text-xs font-mono ${
                            p.stockDays < 10 ? "text-red-600 font-semibold" :
                            p.stockDays < 20 ? "text-amber-600" :
                            p.stockDays > 90 ? "text-slate-400" :
                            "text-slate-700"
                          }`}>
                            {p.stockDays}g
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-300">Satış yok</span>
                        )}
                      </td>

                      {/* Order recommendation */}
                      <td className="px-3 py-2 text-right">
                        {p.recommendedQty > 0 ? (
                          <div className="text-right">
                            <span className="font-mono text-xs font-bold text-emerald-700">{p.recommendedQty}</span>
                            <p className="text-[9px] text-slate-400">{fmtUsd(p.budgetCost, 0)}</p>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-300">—</span>
                        )}
                      </td>

                      {/* Aylık Kâr ($) = effectiveMonthlyUnits × netProfitUsd */}
                      <td className="px-3 py-2 text-right">
                        {(() => {
                          const m = (p.netProfitUsd ?? 0) * p.effectiveMonthlyUnits;
                          if (p.netProfitUsd == null || p.effectiveMonthlyUnits === 0) {
                            return <span className="text-[10px] text-slate-300">—</span>;
                          }
                          return (
                            <span
                              className={`font-mono text-xs font-semibold ${m > 0 ? "text-emerald-700" : m < 0 ? "text-red-500" : "text-slate-500"}`}
                              title={`Net kâr ${fmtUsd(p.netProfitUsd)} × ${p.effectiveMonthlyUnits} aylık satış`}
                            >
                              {fmtUsd(m, 0)}
                            </span>
                          );
                        })()}
                      </td>

                      {/* Decision label + missing field detail */}
                      <td className="px-3 py-2 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${DECISION_STYLES[p.decisionLabel]}`}>
                            {p.decisionLabel}
                          </span>
                          {/* Show which fields are missing — always, not only when "Veri Eksik" */}
                          {getMissingFields(p).map((f) => (
                            <span
                              key={f.label}
                              className={`inline-block rounded px-1.5 py-0 text-[9px] font-medium leading-4 ${
                                f.tone === "red"
                                  ? "bg-red-50 text-red-500 border border-red-100"
                                  : "bg-amber-50 text-amber-600 border border-amber-100"
                              }`}
                            >
                              {f.label}
                            </span>
                          ))}
                        </div>
                      </td>

                      {/* Skor (health score) — prominent number + mini bar */}
                      <td className="px-3 py-2 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={`text-sm font-bold tabular-nums ${
                            p.healthScore >= 70 ? "text-emerald-600" :
                            p.healthScore >= 40 ? "text-amber-500" :
                            "text-red-400"
                          }`}>
                            {p.healthScore}
                          </span>
                          <div className="w-10 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                p.healthScore >= 70 ? "bg-emerald-400" :
                                p.healthScore >= 40 ? "bg-amber-400" :
                                "bg-red-400"
                              }`}
                              style={{ width: `${p.healthScore}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Edit button */}
                      <td className="px-2 py-2 text-center">
                        <button
                          onClick={() => setEditingProduct(products.find((q) => q.id === p.id) ?? null)}
                          className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-100 hover:text-slate-600 transition"
                          title="İthalat alanlarını düzenle"
                        >
                          ✏
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
      </div>

      {/* Quick-edit modal */}
      {editingProduct && (
        <ImportQuickEdit
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSave={handleQuickSave}
        />
      )}

      {/* Footer note */}
      <p className="text-[10px] text-slate-400 text-center">
        Kur: Veritabanındaki en son aylık kur · Komisyon %20 · Kargo dilimi (Pazaryeri kanonik): &lt;$5→$1.2, $5–7.5→$2, &gt;$7.5→$3.3
        · Aylık talep: max(T30G, manuel onlineSalesPotential)
        · AIR döngüsü 120g · SEA döngüsü 210g · ≥{5}kg → Otomatik Deniz
      </p>
    </div>
  );
}

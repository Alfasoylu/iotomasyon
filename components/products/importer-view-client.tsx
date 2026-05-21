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
  BarChart3,
  Settings2,
  Package,
  Ship,
  Plane,
  Pencil,
} from "lucide-react";
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
import { Badge } from "@/components/ui/badge";

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

// ── Decision label variants (mapped to Badge component) ─────────────────────────

const DECISION_VARIANTS: Record<DecisionLabel, "ok" | "info" | "warn" | "danger" | "neutral" | "accent"> = {
  "Al":                "ok",
  "Yüksek ROI":        "ok",
  "Nakit Dönüş Hızlı": "accent",
  "Bekle":             "info",
  "Stok Fazla":        "warn",
  "Zarar":             "danger",
  "Fiyat Yok":         "neutral",
  "Maliyet Yok":       "neutral",
  "Veri Eksik":        "neutral",
};

// ── Missing field chips ─────────────────────────────────────────────────────────
// Returns a list of human-readable labels for every missing input field.
// Shown as small dim+border chips below the decision badge.

type MissingField = { label: string; tone: "danger" | "warn" };

function getMissingFields(p: {
  sourceCostRmb: number | null;
  weightKg: number | null;
  hasTrendyolPrice: boolean;
  t30g: number;
  netProfitUsd?: number | null;
}): MissingField[] {
  const missing: MissingField[] = [];
  if (!p.sourceCostRmb) missing.push({ label: "Alış RMB", tone: "danger" });
  if (!p.weightKg) missing.push({ label: "Ağırlık", tone: "danger" });
  if (!p.hasTrendyolPrice) missing.push({ label: "T. Fiyat", tone: "danger" });
  if (p.t30g === 0) missing.push({ label: "Satış Yok", tone: "warn" });
  return missing;
}

function roiColor(roi: number | null): string {
  if (roi == null) return "text-[var(--text-muted)]";
  if (roi >= 100) return "text-[var(--ok)] font-semibold";
  if (roi >= 50) return "text-[var(--ok)]";
  if (roi >= 30) return "text-[var(--warn)]";
  return "text-[var(--danger)]";
}

function marginColor(m: number | null): string {
  if (m == null) return "text-[var(--text-muted)]";
  if (m >= 40) return "text-[var(--ok)] font-semibold";
  if (m >= 20) return "text-[var(--ok)]";
  if (m >= 10) return "text-[var(--warn)]";
  return "text-[var(--danger)]";
}

function profitColor(p: number | null): string {
  if (p == null) return "text-[var(--text-muted)]";
  if (p > 0) return "text-[var(--ok)]";
  return "text-[var(--danger)] font-semibold";
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
  // Phase 92: demand = max(system forecast, manuel onlineSalesPotential).
  // forecast client-side recalc'da değişmez (DB sorgusu lazım) — server'dan gelen
  // forecastMonthlyUnits'i baz alır, sadece manual override değişirse onunla karşılaştır.
  const manualOnline = m.onlineSalesPotential ?? 0;
  const effectiveT30g = Math.max(m.forecastMonthlyUnits, manualOnline);
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
    return <span className="animate-pulse text-[10px] text-[var(--text-muted)]">…</span>;
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
        className="w-16 rounded border border-[var(--accent-border)] bg-[var(--surface-3)] px-1 py-0.5 text-right font-mono text-xs tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
      />
    );
  }

  return (
    <button
      onClick={() => setEditState({ id: productId, field, value: value != null ? String(value) : "" })}
      className="group w-full rounded px-1 text-left font-mono tabular-nums transition hover:bg-[var(--accent-dim)] hover:text-[var(--accent)]"
      title="Tıkla ve düzenle (Enter = kaydet)"
    >
      {value != null
        ? <span className="text-xs">{value.toFixed(decimals)}{suffix}</span>
        : <span className="text-[10px] text-[var(--danger)] group-hover:text-[var(--accent)]">{placeholder ?? "—"}</span>
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
      className={`rounded-md px-2 py-1 text-xs font-medium transition ${
        sortKey === k
          ? "bg-[var(--accent)] text-[var(--accent-fg)]"
          : "border border-[var(--border-default)] bg-[var(--surface-3)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
      }`}
    >
      {label} {sortKey === k ? (sortAsc ? "↑" : "↓") : ""}
    </button>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-[var(--text-muted)]">
        <div className="text-center">
          <BarChart3 size={28} strokeWidth={1.5} className="mx-auto mb-3 animate-pulse" />
          <p className="text-sm">İthalatçı verileri hesaplanıyor…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-[var(--danger-border)] bg-[var(--danger-dim)] p-8 text-center">
        <p className="text-sm font-semibold text-[var(--danger)]">Veri yüklenemedi</p>
        <p className="mt-1 text-xs text-[var(--danger)] opacity-80">{error}</p>
      </div>
    );
  }

  const summaryCards = [
    { label: "Stok Maliyeti", value: fmtUsd(summary.totalStockCostUsd, 0), sub: "toplam envanter", tone: "neutral" as const },
    { label: "Aylık Potansiyel Kâr", value: fmtUsd(summary.totalPotentialProfit, 0), sub: "max(T30G, manuel aylık)", tone: "ok" as const },
    { label: "Önerilen Bütçe", value: fmtUsd(summary.recommendedBudget, 0), sub: "sipariş için", tone: "info" as const },
    { label: "İlk 10 Ürün Kârı", value: fmtUsd(summary.top10Profit, 0), sub: "aylık · max(T30G, manuel)", tone: "accent" as const },
    { label: "Veri Eksik", value: String(summary.missingData), sub: "ürün", tone: summary.missingData > 0 ? ("warn" as const) : ("neutral" as const) },
    { label: "Zarar Eden", value: String(summary.losing), sub: "ürün", tone: summary.losing > 0 ? ("danger" as const) : ("neutral" as const) },
  ];

  const cardBgFor = (tone: "ok" | "info" | "accent" | "warn" | "danger" | "neutral") => {
    switch (tone) {
      case "ok": return "bg-[var(--ok-dim)] border-[var(--ok-border)]";
      case "info": return "bg-[var(--info-dim)] border-[var(--info-border)]";
      case "accent": return "bg-[var(--accent-dim)] border-[var(--accent-border)]";
      case "warn": return "bg-[var(--warn-dim)] border-[var(--warn-border)]";
      case "danger": return "bg-[var(--danger-dim)] border-[var(--danger-border)]";
      default: return "bg-[var(--surface-2)] border-[var(--border-default)]";
    }
  };

  const cardTextFor = (tone: "ok" | "info" | "accent" | "warn" | "danger" | "neutral") => {
    switch (tone) {
      case "ok": return "text-[var(--ok)]";
      case "info": return "text-[var(--info)]";
      case "accent": return "text-[var(--accent)]";
      case "warn": return "text-[var(--warn)]";
      case "danger": return "text-[var(--danger)]";
      default: return "text-[var(--text-primary)]";
    }
  };

  return (
    <div className="space-y-5">
      {/* ── Summary cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {summaryCards.map(({ label, value, sub, tone }) => (
          <div key={label} className={`rounded-lg border p-4 ${cardBgFor(tone)}`}>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              {label}
            </p>
            <p className={`mt-1 font-mono text-lg font-bold tabular-nums ${cardTextFor(tone)}`}>
              {value}
            </p>
            <p className="text-[10px] text-[var(--text-muted)]">{sub}</p>
          </div>
        ))}
      </div>

      {/* ── Budget params panel ────────────────────────────────────────────── */}
      <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)]">
        <button
          onClick={() => setShowParams((v) => !v)}
          className="flex w-full items-center justify-between rounded-lg px-5 py-3 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-3)]"
        >
          <span className="inline-flex items-center gap-2">
            <Settings2 size={14} strokeWidth={1.5} />
            Bütçe & Sipariş Parametreleri
          </span>
          <span className="text-xs text-[var(--text-muted)]">
            {showParams ? "Kapat ▲" : "Düzenle ▼"}
          </span>
        </button>
        {showParams && (
          <div className="border-t border-[var(--border-subtle)] p-5">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {[
                { key: "totalBudgetUsd", label: "Toplam Bütçe (USD)", min: 0, step: 500 },
                { key: "minRoiPct", label: "Min. ROI % Eşiği", min: 0, step: 5 },
                { key: "targetStockDays", label: "Hedef Stok Günü", min: 1, step: 5 },
                { key: "maxBudgetSharePct", label: "Tek Ürün Maks. %", min: 1, step: 5 },
                { key: "minOrderQty", label: "Min. Sipariş Adedi", min: 1, step: 1 },
              ].map(({ key, label, min, step }) => (
                <div key={key}>
                  <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                    {label}
                  </label>
                  <input
                    type="number"
                    min={min}
                    step={step}
                    value={params[key as keyof BudgetParams]}
                    onChange={(e) =>
                      setParams((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                    }
                    className="w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 py-1.5 font-mono text-sm tabular-nums text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-border)]"
                  />
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-[var(--text-muted)]">
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
            className={`rounded-md border px-3 py-1 text-xs font-medium transition ${
              filter === key
                ? "border-[var(--accent-border)] bg-[var(--accent)] text-[var(--accent-fg)]"
                : "border-[var(--border-default)] bg-[var(--surface-3)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
            }`}
          >
            {label}
            {key !== "all" && (
              <span className="ml-1 font-mono text-[10px] tabular-nums opacity-70">
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
              className="inline-flex items-center gap-1 rounded-md border border-[var(--ok-border)] bg-[var(--ok-dim)] px-3 py-1 text-xs font-semibold text-[var(--ok)] transition hover:brightness-110"
            >
              <Package size={14} strokeWidth={1.5} />
              Sipariş Oluştur ({orderItems.length})
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

      <p className="font-mono text-xs tabular-nums text-[var(--text-muted)]">
        {filtered.length} / {enriched.length} ürün gösteriliyor
      </p>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="max-h-[calc(100vh-260px)] overflow-auto rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)]">
          <table className="min-w-full divide-y divide-[var(--border-subtle)] text-sm">
            <thead className="sticky top-0 z-20 bg-[var(--surface-1)] text-left text-[11px] uppercase tracking-widest text-[var(--text-muted)] [&_th]:bg-[var(--surface-1)]">
              <tr>
                <th className="w-12 px-2 py-3" />
                <th className="min-w-[200px] px-3 py-3 font-semibold">Ürün</th>
                <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">T. Fiyat (₺)</th>
                <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Bayi ($)</th>
                <th className="px-3 py-3 text-right font-semibold">Stok</th>
                <th
                  className="cursor-pointer whitespace-nowrap px-3 py-3 text-right font-semibold hover:text-[var(--text-primary)]"
                  onClick={() => handleSort("lifetime")}
                  title="Tüm zamanlar Trendyol toplam satış adedi (iptaller hariç)"
                >
                  Toplam {sortKey === "lifetime" ? (sortAsc ? "↑" : "↓") : "↕"}
                </th>
                <th
                  className="cursor-pointer px-3 py-3 text-right font-semibold hover:text-[var(--text-primary)]"
                  onClick={() => handleSort("t30g")}
                  title="T30G = Son 30 Gün. Tüm 14 kanaldan satış adedi (iptaller hariç)."
                >
                  <abbr title="Son 30 Gün satışı" className="cursor-pointer no-underline">T30G</abbr>{" "}
                  {sortKey === "t30g" ? (sortAsc ? "↑" : "↓") : "↕"}
                </th>
                <th
                  className="whitespace-nowrap px-3 py-3 text-right font-semibold text-[var(--ok)]"
                  title="Sistem tahmini aylık satış: tüm 14 kanal × 5 yıllık tarihçe, recency-weighted + mevsimsel düzeltme (lib/sales-forecast.ts). İthalat kararında max(forecast, manuel) kullanılır."
                >
                  Tahmin
                </th>
                <th
                  className="whitespace-nowrap px-3 py-3 text-right font-semibold text-[var(--accent)]"
                  title="Manuel aylık satış tahmini — tıkla → düzenle. İthalat kararında max(sistem tahmini, manuel) kullanılır."
                >
                  Manuel ✎
                </th>
                {/* Editable import input columns */}
                <th className="whitespace-nowrap px-3 py-3 text-right font-semibold text-[var(--accent)]" title="Tıkla → düzenle">Alış (¥) ✎</th>
                <th className="whitespace-nowrap px-3 py-3 text-right font-semibold text-[var(--accent)]" title="Tıkla → düzenle">Ağırlık (kg) ✎</th>
                <th className="whitespace-nowrap px-3 py-3 text-right font-semibold text-[var(--accent)]" title="Tıkla → düzenle">Gümrük % ✎</th>
                <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Freight ($)</th>
                <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Maliyet ($)</th>
                <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Net Kâr ($)</th>
                <th className="px-3 py-3 text-right font-semibold">Marj %</th>
                <th className="px-3 py-3 text-right font-semibold">ROI %</th>
                <th className="whitespace-nowrap px-3 py-3 text-right font-semibold">Stok Gün</th>
                <th
                  className="cursor-pointer whitespace-nowrap px-3 py-3 text-right font-semibold hover:text-[var(--text-primary)]"
                  onClick={() => handleSort("order")}
                  title="Sipariş adedi'ne göre sırala"
                >
                  Sipariş (Adet) {sortKey === "order" ? (sortAsc ? "↑" : "↓") : "↕"}
                </th>
                <th
                  className="cursor-pointer whitespace-nowrap px-3 py-3 text-right font-semibold hover:text-[var(--text-primary)]"
                  onClick={() => handleSort("monthly_profit")}
                  title="Net Kâr × Aylık Satış (= effectiveMonthlyUnits × netProfitUsd)"
                >
                  Aylık Kâr ($) {sortKey === "monthly_profit" ? (sortAsc ? "↑" : "↓") : "↕"}
                </th>
                <th className="px-3 py-3 text-center font-semibold">Durum</th>
                <th
                  className="cursor-pointer whitespace-nowrap px-3 py-3 text-center font-semibold hover:text-[var(--text-primary)]"
                  onClick={() => handleSort("health")}
                  title="Skor'a göre sırala"
                >
                  Skor {sortKey === "health" ? (sortAsc ? "↑" : "↓") : "↕"}
                </th>
                <th className="w-10 px-2 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)] bg-[var(--surface-2)]">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={23} className="px-4 py-12 text-center text-sm text-[var(--text-muted)]">
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
                      className={`transition hover:bg-[var(--surface-3)] ${
                        isLoss
                          ? "bg-[var(--danger-dim)]"
                          : isOrder
                            ? "bg-[var(--ok-dim)]"
                            : ""
                      }`}
                    >
                      {/* Thumbnail */}
                      <td className="px-2 py-2">
                        <Link href={`/products/${p.id}`} tabIndex={-1}>
                          {p.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.imageUrl}
                              alt={p.name}
                              className="h-10 w-10 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] object-contain"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-muted)]">
                              <Package size={14} strokeWidth={1.5} />
                            </div>
                          )}
                        </Link>
                      </td>

                      {/* Product */}
                      <td className="px-3 py-2">
                        <Link href={`/products/${p.id}`} className="group">
                          <p className="text-xs font-medium leading-tight text-[var(--text-primary)] group-hover:text-[var(--accent)]">
                            {p.name}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="font-mono text-[10px] text-[var(--text-muted)]">{p.sku}</span>
                            {p.productKind === "LISTING_PACKAGE" && (
                              <Badge variant="info" className="text-[9px]">Paket</Badge>
                            )}
                            {p.brand && (
                              <span className="text-[10px] text-[var(--text-muted)]">{p.brand}</span>
                            )}
                          </div>
                        </Link>
                      </td>

                      {/* Trendyol price TRY */}
                      <td className="px-3 py-2 text-right">
                        {p.trendyolPriceTry != null ? (
                          <span className="font-mono text-xs font-medium tabular-nums text-[var(--text-secondary)]">
                            {fmtTry(p.trendyolPriceTry)}
                          </span>
                        ) : (
                          <span className="text-[10px] text-[var(--danger)]">Fiyat yok</span>
                        )}
                      </td>

                      {/* Bayi price USD */}
                      <td className="px-3 py-2 text-right">
                        {p.bayiPriceUsd != null ? (
                          <span className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                            {fmtUsd(p.bayiPriceUsd)}
                          </span>
                        ) : (
                          <span className="text-[10px] text-[var(--text-muted)]">Bayi fiyat yok</span>
                        )}
                      </td>

                      {/* Stock */}
                      <td className="px-3 py-2 text-right">
                        <span className={`font-mono text-xs font-semibold tabular-nums ${
                          p.stockQuantity <= p.minimumStock
                            ? "text-[var(--warn)]"
                            : "text-[var(--text-primary)]"
                        }`}>
                          {p.stockQuantity}
                        </span>
                      </td>

                      {/* Lifetime total satış (Trendyol) */}
                      <td className="px-3 py-2 text-right">
                        <span
                          className={`font-mono text-xs tabular-nums ${
                            p.lifetimeTotalQty > 0
                              ? "font-semibold text-[var(--text-secondary)]"
                              : "text-[var(--text-muted)]"
                          }`}
                          title="Trendyol'da tüm zamanlardaki toplam satış adedi (iptaller hariç)"
                        >
                          {p.lifetimeTotalQty > 0 ? p.lifetimeTotalQty : "—"}
                        </span>
                      </td>

                      {/* T30G */}
                      <td className="px-3 py-2 text-right">
                        <span className={`font-mono text-xs tabular-nums ${
                          p.t30g > 0
                            ? "font-semibold text-[var(--ok)]"
                            : "text-[var(--text-muted)]"
                        }`}>
                          {p.t30g > 0 ? p.t30g : "—"}
                        </span>
                      </td>

                      {/* Phase 92: Sistem tahmini (forecast) */}
                      <td className="px-3 py-2 text-right">
                        <span
                          className={`font-mono text-xs tabular-nums ${
                            p.forecastMonthlyUnits > 0
                              ? "font-semibold text-[var(--ok)]"
                              : "text-[var(--text-muted)]"
                          }`}
                          title={`Sistem tahmini (formül: ${p.forecastFormula})`}
                        >
                          {p.forecastMonthlyUnits > 0 ? p.forecastMonthlyUnits : "—"}
                        </span>
                      </td>

                      {/* Manuel Aylık Satış Potansiyeli — inline editable */}
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
                            <span className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                              {fmtUsd(p.freightUsd)}
                            </span>
                            <p className={`inline-flex items-center gap-0.5 text-[9px] ${
                              p.shippingMethod === "SEA" ? "text-[var(--info)]" : "text-[var(--warn)]"
                            }`}>
                              {p.shippingMethod === "SEA" ? (
                                <><Ship size={14} strokeWidth={1.5} /> Deniz</>
                              ) : (
                                <><Plane size={14} strokeWidth={1.5} /> Hava</>
                              )}
                            </p>
                          </div>
                        ) : (
                          <span className="text-[10px] text-[var(--text-muted)]">Ağırlık yok</span>
                        )}
                      </td>

                      {/* Total cost USD */}
                      <td className="px-3 py-2 text-right">
                        {p.totalCostUsd != null ? (
                          <span className="font-mono text-xs font-semibold tabular-nums text-[var(--text-secondary)]">
                            {fmtUsd(p.totalCostUsd)}
                          </span>
                        ) : (
                          <span className="text-[10px] text-[var(--danger)]">Yok</span>
                        )}
                      </td>

                      {/* Net profit USD */}
                      <td className="px-3 py-2 text-right">
                        <span className={`font-mono text-xs tabular-nums ${profitColor(p.netProfitUsd)}`}>
                          {fmtUsd(p.netProfitUsd)}
                        </span>
                      </td>

                      {/* Margin % */}
                      <td className="px-3 py-2 text-right">
                        <span className={`font-mono text-xs tabular-nums ${marginColor(p.marginPct)}`}>
                          {fmtPct(p.marginPct)}
                        </span>
                      </td>

                      {/* Annual ROI % */}
                      <td className="px-3 py-2 text-right">
                        <span className={`font-mono text-xs tabular-nums ${roiColor(p.annualRoiPct)}`}>
                          {p.annualRoiPct != null ? fmtPct(p.annualRoiPct, 0) : "—"}
                        </span>
                      </td>

                      {/* Stock days */}
                      <td className="px-3 py-2 text-right">
                        {p.stockDays != null ? (
                          <span className={`font-mono text-xs tabular-nums ${
                            p.stockDays < 10 ? "font-semibold text-[var(--danger)]" :
                            p.stockDays < 20 ? "text-[var(--warn)]" :
                            p.stockDays > 90 ? "text-[var(--text-muted)]" :
                            "text-[var(--text-secondary)]"
                          }`}>
                            {p.stockDays}g
                          </span>
                        ) : (
                          <span className="text-[10px] text-[var(--text-muted)]">Satış yok</span>
                        )}
                      </td>

                      {/* Order recommendation */}
                      <td className="px-3 py-2 text-right">
                        {p.recommendedQty > 0 ? (
                          <div className="text-right">
                            <span className="font-mono text-xs font-bold tabular-nums text-[var(--ok)]">
                              {p.recommendedQty}
                            </span>
                            <p className="font-mono text-[9px] tabular-nums text-[var(--text-muted)]">
                              {fmtUsd(p.budgetCost, 0)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-[10px] text-[var(--text-muted)]">—</span>
                        )}
                      </td>

                      {/* Aylık Kâr ($) = effectiveMonthlyUnits × netProfitUsd */}
                      <td className="px-3 py-2 text-right">
                        {(() => {
                          const m = (p.netProfitUsd ?? 0) * p.effectiveMonthlyUnits;
                          if (p.netProfitUsd == null || p.effectiveMonthlyUnits === 0) {
                            return <span className="text-[10px] text-[var(--text-muted)]">—</span>;
                          }
                          return (
                            <span
                              className={`font-mono text-xs font-semibold tabular-nums ${
                                m > 0
                                  ? "text-[var(--ok)]"
                                  : m < 0
                                    ? "text-[var(--danger)]"
                                    : "text-[var(--text-secondary)]"
                              }`}
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
                          <Badge variant={DECISION_VARIANTS[p.decisionLabel]}>
                            {p.decisionLabel}
                          </Badge>
                          {/* Show which fields are missing — always, not only when "Veri Eksik" */}
                          {getMissingFields(p).map((f) => (
                            <Badge key={f.label} variant={f.tone} className="text-[9px]">
                              {f.label}
                            </Badge>
                          ))}
                        </div>
                      </td>

                      {/* Skor (health score) — prominent number + mini bar */}
                      <td className="px-3 py-2 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={`font-mono text-sm font-bold tabular-nums ${
                            p.healthScore >= 70 ? "text-[var(--ok)]" :
                            p.healthScore >= 40 ? "text-[var(--warn)]" :
                            "text-[var(--danger)]"
                          }`}>
                            {p.healthScore}
                          </span>
                          <div className="h-1.5 w-10 overflow-hidden rounded-md bg-[var(--surface-3)]">
                            <div
                              className={`h-full rounded-md transition-all ${
                                p.healthScore >= 70 ? "bg-[var(--ok)]" :
                                p.healthScore >= 40 ? "bg-[var(--warn)]" :
                                "bg-[var(--danger)]"
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
                          className="rounded-md p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
                          title="İthalat alanlarını düzenle"
                        >
                          <Pencil size={14} strokeWidth={1.5} />
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
      <p className="text-center text-[10px] text-[var(--text-muted)]">
        Kur: Veritabanındaki en son aylık kur · Komisyon %20 · Kargo dilimi (Pazaryeri kanonik): &lt;$5→$1.2, $5–7.5→$2, &gt;$7.5→$3.3
        · Aylık talep: max(Sistem tahmini, manuel). Tahmin = recency-weighted (90d×0.5 + 365d×0.3 + lifetime×0.2) × mevsimsel. Tüm 14 kanal × 5 yıl.
        · AIR döngüsü 150g · SEA döngüsü 210g · Kargo seçimi ROI bazlı
      </p>
    </div>
  );
}

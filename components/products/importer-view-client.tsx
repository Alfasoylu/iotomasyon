"use client";

/**
 * Phase 79+80 — İthalatçı Görünümü Client Component
 *
 * Fetches from /api/products/importer-view (admin-only).
 * Runs budget allocation in useMemo.
 * Renders: summary cards + budget params panel + filter bar + data table.
 * Phase 80: edit-pencil button → ImportQuickEdit modal → PATCH /api/products/[id]/import-fields
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  allocateBudget,
  calcDecisionLabel,
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

// ── Sort options ────────────────────────────────────────────────────────────────

type SortKey = "roi" | "margin" | "profit" | "t30g" | "order" | "health" | "cost" | "stock_days";

type FilterKey =
  | "all" | "order" | "missing_cost" | "no_trendyol" | "no_bayi"
  | "loss" | "high_roi" | "low_stock";

// ── Component ────────────────────────────────────────────────────────────────────

export function ImporterViewClient() {
  const [products, setProducts] = useState<ImporterProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<BudgetParams>(DEFAULT_BUDGET_PARAMS);
  const [showParams, setShowParams] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("roi");
  const [sortAsc, setSortAsc] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [editingProduct, setEditingProduct] = useState<ImporterProduct | null>(null);

  // Optimistic update after quick-edit save
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
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              sourceCostRmb: updated.sourceCostRmb,
              weightKg: updated.weightKg,
              customsRatePct: updated.customsRatePct,
              shippingMethodPref: updated.shippingMethodPref,
              importPaymentFeePct: updated.importPaymentFeePct,
              // Mark hasCost based on whether we now have RMB cost
              hasCost: updated.sourceCostRmb != null && updated.weightKg != null,
            }
          : p,
      ),
    );
  }, []);

  // Fetch data
  useEffect(() => {
    fetch("/api/products/importer-view")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: ImporterProduct[]) => {
        setProducts(data);
        setLoading(false);
      })
      .catch((e: Error) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  // Budget allocation (runs when products or params change)
  const allocationMap = useMemo(() => {
    if (products.length === 0) return new Map();
    return allocateBudget(
      products.map((p) => ({
        id: p.id,
        stockQuantity: p.stockQuantity,
        t30g: p.t30g,
        totalCostUsd: p.totalCostUsd,
        netProfitUsd: p.netProfitUsd,
        annualRoiPct: p.annualRoiPct,
        score: p.healthScore,
      })),
      params,
    );
  }, [products, params]);

  // Enrich products with allocation results + decision labels
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
        t30g: p.t30g,
      });
      return { ...p, ...alloc, decisionLabel };
    });
  }, [products, allocationMap, params.targetStockDays]);

  // Summary stats
  const summary = useMemo(() => {
    const withCost = enriched.filter((p) => p.totalCostUsd != null);
    const totalStockCostUsd = withCost.reduce((s, p) => s + (p.totalCostUsd ?? 0) * p.stockQuantity, 0);
    const totalPotentialProfit = enriched.reduce((s, p) => s + Math.max(0, (p.netProfitUsd ?? 0) * p.t30g), 0);
    const orderedItems = enriched.filter((p) => p.recommendedQty > 0);
    const recommendedBudget = orderedItems.reduce((s, p) => s + p.budgetCost, 0);
    const top10Profit = enriched
      .filter((p) => (p.netProfitUsd ?? 0) > 0 && p.t30g > 0)
      .sort((a, b) => (b.netProfitUsd ?? 0) * b.t30g - (a.netProfitUsd ?? 0) * a.t30g)
      .slice(0, 10)
      .reduce((s, p) => s + (p.netProfitUsd ?? 0) * p.t30g, 0);
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
          { label: "Aylık Potansiyel Kâr", value: fmtUsd(summary.totalPotentialProfit, 0), sub: "T30G bazlı", color: "emerald" },
          { label: "Önerilen Bütçe", value: fmtUsd(summary.recommendedBudget, 0), sub: "sipariş için", color: "blue" },
          { label: "İlk 10 Ürün Kârı", value: fmtUsd(summary.top10Profit, 0), sub: "aylık", color: "teal" },
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
        <div className="ml-auto flex flex-wrap gap-1">
          <SortBtn k="roi" label="ROI" />
          <SortBtn k="margin" label="Marj" />
          <SortBtn k="profit" label="Kâr" />
          <SortBtn k="t30g" label="T30G" />
          <SortBtn k="order" label="Sipariş" />
          <SortBtn k="stock_days" label="Stok Gün" />
          <SortBtn k="health" label="Sağlık" />
        </div>
      </div>

      <p className="text-xs text-slate-400">{filtered.length} / {enriched.length} ürün gösteriliyor</p>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-900 text-left text-[10px] uppercase tracking-[0.2em] text-slate-300">
              <tr>
                <th className="w-12 px-2 py-3" />
                <th className="px-3 py-3 min-w-[200px]">Ürün</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">T. Fiyat (₺)</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Bayi ($)</th>
                <th className="px-3 py-3 text-right">Stok</th>
                <th className="px-3 py-3 text-right">T30G</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Alış (¥)</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Freight ($)</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Maliyet ($)</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Net Kâr ($)</th>
                <th className="px-3 py-3 text-right">Marj %</th>
                <th className="px-3 py-3 text-right">ROI %</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Stok Gün</th>
                <th className="px-3 py-3 text-right whitespace-nowrap">Sipariş (Adet)</th>
                <th className="px-3 py-3 text-center">Durum</th>
                <th className="px-3 py-3 text-center whitespace-nowrap">Sağlık</th>
                <th className="w-10 px-2 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 bg-white">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={17} className="px-4 py-12 text-center text-slate-400 text-sm">
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

                      {/* T30G */}
                      <td className="px-3 py-2 text-right">
                        <span className={`font-mono text-xs ${p.t30g > 0 ? "text-emerald-600 font-semibold" : "text-slate-300"}`}>
                          {p.t30g > 0 ? p.t30g : "—"}
                        </span>
                      </td>

                      {/* RMB cost */}
                      <td className="px-3 py-2 text-right">
                        {p.sourceCostRmb != null ? (
                          <span className="font-mono text-xs text-slate-600">{fmtRmb(p.sourceCostRmb)}</span>
                        ) : (
                          <span className="text-[10px] text-red-400">Alış yok</span>
                        )}
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

                      {/* Decision label */}
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${DECISION_STYLES[p.decisionLabel]}`}>
                          {p.decisionLabel}
                        </span>
                      </td>

                      {/* Health score */}
                      <td className="px-3 py-2 text-center">
                        <div className="flex flex-col items-center gap-0.5">
                          <span className={`text-xs font-bold ${
                            p.healthScore >= 70 ? "text-emerald-600" :
                            p.healthScore >= 40 ? "text-amber-500" :
                            "text-red-400"
                          }`}>
                            {p.healthScore}
                          </span>
                          <div className="w-10 h-1 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
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
        Kur: Veritabanındaki en son aylık kur kullanılır · Komisyon: %20 + 250₺ üzeri siparişte 150₺
        · AIR döngüsü: 120g · SEA döngüsü: 210g · ≥{5}kg → Otomatik Deniz
      </p>
    </div>
  );
}

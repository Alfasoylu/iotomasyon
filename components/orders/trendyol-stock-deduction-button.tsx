"use client";

/**
 * Phase 43 — Trendyol Stock Deduction Button
 *
 * Shows how many order lines are pending deduction.
 * One click processes all pending lines, creates StockAdjustmentLog entries,
 * and marks TrendyolSalesRecord.stockDeducted = true.
 */

import { useState, useTransition } from "react";
import { applyTrendyolStockDeductionAction } from "@/lib/actions/trendyol-stock-deduction-actions";

interface Props {
  pendingCount: number;
}

export function TrendyolStockDeductionButton({ pendingCount: initialCount }: Props) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [applied, setApplied] = useState(false);

  function handleClick() {
    startTransition(async () => {
      const res = await applyTrendyolStockDeductionAction();
      setResult(res);
      if (res.ok) {
        setApplied(true);
        setTimeout(() => window.location.reload(), 1800);
      }
    });
  }

  if (initialCount === 0 && !applied) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {!applied && initialCount > 0 && (
        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
          {initialCount} satır bekliyor
        </span>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending || applied}
        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
      >
        {isPending ? "Uygulanıyor…" : applied ? "Tamamlandı" : "Stoktan Düş"}
      </button>
      {result && (
        <span className={`text-xs font-medium ${result.ok ? "text-emerald-600" : "text-red-600"}`}>
          {result.message}
        </span>
      )}
    </div>
  );
}

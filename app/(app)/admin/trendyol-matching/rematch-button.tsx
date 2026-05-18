"use client";

/**
 * Phase 83 — RematchButton
 * Client component — calls rematchTrendyolSalesAction() and shows result.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { rematchTrendyolSalesAction } from "@/lib/actions/trendyol-rematch-action";

export function RematchButton({ fixableCount }: { fixableCount: number }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    totalFixed: number;
    fixedBySku: number;
    fixedByBarcode: number;
    remainingUnmatched: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    if (loading) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await rematchTrendyolSalesAction();
      if (res.success) {
        setResult({
          totalFixed: res.totalFixed,
          fixedBySku: res.fixedBySku,
          fixedByBarcode: res.fixedByBarcode,
          remainingUnmatched: res.remainingUnmatched,
        });
        // Reload to refresh stats table
        if (res.totalFixed > 0) {
          setTimeout(() => window.location.reload(), 2000);
        }
      } else {
        setError(res.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hata oluştu");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="text-sm space-y-1 min-w-[180px]">
        <p className="font-semibold text-emerald-700">
          ✓ {result.totalFixed} kayıt eşleştirildi
        </p>
        {result.fixedBySku > 0 && (
          <p className="text-xs text-slate-500">SKU: {result.fixedBySku} kayıt</p>
        )}
        {result.fixedByBarcode > 0 && (
          <p className="text-xs text-slate-500">Barkod: {result.fixedByBarcode} kayıt</p>
        )}
        <p className="text-xs text-slate-400">
          Kalan eşleşmeyen: {result.remainingUnmatched}
        </p>
        <p className="text-xs text-slate-400 italic">Sayfa yenileniyor…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2 min-w-[180px]">
      <Button
        onClick={handleClick}
        disabled={loading || fixableCount === 0}
        className="bg-emerald-600 hover:bg-emerald-700 text-white whitespace-nowrap"
      >
        {loading ? "Eşleştiriliyor…" : `Otomatik Eşleştir (${fixableCount})`}
      </Button>
      {fixableCount === 0 && (
        <p className="text-xs text-slate-400">Otomatik düzeltilebilir kayıt yok</p>
      )}
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}

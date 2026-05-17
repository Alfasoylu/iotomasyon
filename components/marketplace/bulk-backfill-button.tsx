"use client";

/**
 * Phase 41 — Bulk Mapping Backfill Button.
 * One-click trigger to run backfillMappingProductId for ALL existing
 * MarketplaceProductMapping entries. Surfaces the count of newly-linked
 * TrendyolSalesRecord and TrendyolReturnRecord rows in the success message.
 *
 * Use case: historical mappings created before the per-save backfill was
 * added, or after a large batch of new mappings has been imported.
 */

import { useState, useTransition } from "react";
import { bulkBackfillAllMappingsAction } from "@/lib/actions/marketplace-mapping-actions";
import { Button } from "@/components/ui/button";

export function BulkBackfillButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      const res = await bulkBackfillAllMappingsAction();
      setResult(res);
      if (res.ok) {
        // Reload so the unmatched inbox count updates
        setTimeout(() => window.location.reload(), 1500);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" onClick={handleClick} disabled={isPending}>
        {isPending ? "İşleniyor…" : "Tüm Eşleştirmeleri Uygula"}
      </Button>
      {result && (
        <span
          className={`text-xs font-medium ${result.ok ? "text-emerald-700" : "text-red-600"}`}
        >
          {result.message}
        </span>
      )}
      {!result && !isPending && (
        <span className="text-xs text-slate-400">
          Tüm kayıtlı eşleştirmeleri geçmiş satış/iade verilerine uygular.
        </span>
      )}
    </div>
  );
}

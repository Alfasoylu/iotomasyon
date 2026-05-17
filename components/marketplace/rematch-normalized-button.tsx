"use client";

/**
 * Phase 61 — Normalized Barcode Re-Match Button.
 * Scans all null-productId TrendyolSalesRecord rows and tries to match
 * them via normalized barcode comparison (strips dashes, spaces, etc.).
 * Complements BulkBackfillButton which requires a manual mapping entry.
 */

import { useState, useTransition } from "react";
import { rematchNormalizedBarcodesAction } from "@/lib/actions/marketplace-mapping-actions";
import { Button } from "@/components/ui/button";

export function RematchNormalizedButton() {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);

  function handleClick() {
    setResult(null);
    startTransition(async () => {
      const res = await rematchNormalizedBarcodesAction();
      setResult(res);
      if (res.ok) {
        setTimeout(() => window.location.reload(), 1500);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" onClick={handleClick} disabled={isPending}>
        {isPending ? "İşleniyor…" : "Barkodları Normalize Et & Eşleştir"}
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
          Manuel eşleştirme gerektirmeden barkod benzerliğiyle eşleştirir (tire, boşluk vb. yok sayılır).
        </span>
      )}
    </div>
  );
}

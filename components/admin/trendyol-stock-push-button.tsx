"use client";

import { useTransition, useState } from "react";
import { pushTrendyolStockAction } from "@/lib/actions/trendyol-product-actions";

interface Props {
  readyCount: number;
}

export function TrendyolStockPushButton({ readyCount }: Props) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    ok: boolean;
    message?: string;
    pushed?: number;
    batchIds?: string[];
  } | null>(null);

  function handlePush() {
    startTransition(async () => {
      const res = await pushTrendyolStockAction();
      setResult(res);
    });
  }

  if (readyCount === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={handlePush}
        disabled={isPending || result?.ok === true}
        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-60 ${
          result?.ok === true
            ? "bg-emerald-600 text-white"
            : "bg-blue-600 text-white hover:bg-blue-700"
        }`}
      >
        {isPending
          ? "Gönderiliyor…"
          : result?.ok === true
          ? "✓ Tamamlandı"
          : `Trendyol'a ${readyCount} Ürün Gönder`}
      </button>

      {result && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            result.ok
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          <p className="font-medium">{result.message}</p>
          {result.batchIds && result.batchIds.length > 0 && (
            <div className="mt-2 space-y-1">
              {result.batchIds.map((id) => (
                <p key={id} className="text-xs text-emerald-600 font-mono">
                  Batch ID: {id}
                </p>
              ))}
              <p className="text-xs text-emerald-600 mt-1">
                Trendyol&apos;da işlem asenkron gerçekleşir — sonuçlar birkaç dakika içinde görünür.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

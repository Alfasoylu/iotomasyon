"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { syncTrendyolSalesAction } from "@/lib/actions/sales-sync-actions";
import { syncTrendyolReturnsAction } from "@/lib/actions/returns-sync-actions";

type SyncState =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "success"; orders: number; returns: number; newOrders: number; newReturns: number }
  | { type: "error"; message: string };

export function OrdersSyncButton() {
  const [status, setStatus] = useState<SyncState>({ type: "idle" });

  async function handleSync() {
    setStatus({ type: "loading" });
    try {
      const [ordersResult, returnsResult] = await Promise.all([
        syncTrendyolSalesAction(),
        syncTrendyolReturnsAction(),
      ]);

      if (!ordersResult.success) {
        setStatus({ type: "error", message: `Sipariş senkronizasyon hatası: ${ordersResult.error}` });
        return;
      }
      if (!returnsResult.success) {
        setStatus({ type: "error", message: `İade senkronizasyon hatası: ${returnsResult.error}` });
        return;
      }

      setStatus({
        type: "success",
        orders: ordersResult.totalLines,
        returns: returnsResult.totalLines,
        newOrders: ordersResult.newRecords,
        newReturns: returnsResult.newRecords,
      });
    } catch {
      setStatus({ type: "error", message: "Senkronizasyon sırasında beklenmeyen hata oluştu." });
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button onClick={handleSync} disabled={status.type === "loading"} size="sm">
        {status.type === "loading" ? "Senkronize ediliyor…" : "Trendyol Senkronize Et"}
      </Button>
      {status.type === "success" && (
        <p className="text-xs text-emerald-600">
          ✓ {status.orders} sipariş satırı ({status.newOrders} yeni), {status.returns} iade satırı ({status.newReturns} yeni) senkronize edildi.
        </p>
      )}
      {status.type === "error" && (
        <p className="text-xs text-red-500">✗ {status.message}</p>
      )}
    </div>
  );
}

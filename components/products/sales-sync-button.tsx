"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { syncTrendyolSalesAction } from "@/lib/actions/sales-sync-actions";

export function SalesSyncButton() {
  const [status, setStatus] = useState<
    | { type: "idle" }
    | { type: "loading" }
    | { type: "success"; totalOrders: number; totalLines: number; matched: number; newRecords: number }
    | { type: "error"; message: string }
  >({ type: "idle" });

  async function handleSync() {
    setStatus({ type: "loading" });
    try {
      const result = await syncTrendyolSalesAction();
      if (result.success) {
        setStatus({
          type: "success",
          totalOrders: result.totalOrders,
          totalLines: result.totalLines,
          matched: result.matched,
          newRecords: result.newRecords,
        });
      } else {
        setStatus({ type: "error", message: result.error });
      }
    } catch {
      setStatus({ type: "error", message: "Senkronizasyon sırasında beklenmeyen hata oluştu." });
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        onClick={handleSync}
        disabled={status.type === "loading"}
        size="sm"
      >
        {status.type === "loading" ? "Senkronize ediliyor…" : "Trendyol Siparişleri Senkronize Et"}
      </Button>

      {status.type === "success" && (
        <p className="text-xs text-emerald-600">
          ✓ {status.totalOrders} sipariş, {status.totalLines} satır senkronize edildi —{" "}
          {status.matched} ürün eşleşti, {status.newRecords} yeni kayıt eklendi.
        </p>
      )}
      {status.type === "error" && (
        <p className="text-xs text-red-500">✗ {status.message}</p>
      )}
    </div>
  );
}

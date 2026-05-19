"use client";

/**
 * Phase 42 — Stock Adjustment Card
 * Phase 89 — Renamed to "Fiziksel Sayım Hareketleri" (Entegra source-of-truth fix)
 *
 * Renders on the product detail page.
 * - Shows the last 20 physical-count movements in a table (newest first).
 * - Inline form to add a new movement (type, qty, notes).
 * - Uses createStockAdjustmentAction; updates Product.physicalCountQuantity.
 * - Does NOT mutate Product.stockQuantity (Entegra XML sync is the only writer).
 * - Header shows: "Entegra: N  ·  Sayım: M  ·  Fark: ±X" for clarity.
 */

import { useState, useTransition } from "react";
import { StockAdjustmentType } from "@prisma/client";
import {
  createStockAdjustmentAction,
  type StockAdjustmentFormValues,
} from "@/lib/actions/stock-adjustment-actions";
import { Card } from "@/components/ui/card";

const TYPE_LABELS: Record<StockAdjustmentType, string> = {
  RESTOCK:    "Stok Girişi",
  CORRECTION: "Sayım Düzeltme",
  DAMAGE:     "Hasar / Fire",
  RETURN:     "Müşteri İadesi",
  SALE:       "Manuel Satış",
  OTHER:      "Diğer",
};

const TYPE_COLORS: Record<StockAdjustmentType, string> = {
  RESTOCK:    "bg-emerald-100 text-emerald-800",
  CORRECTION: "bg-blue-100 text-blue-800",
  DAMAGE:     "bg-red-100 text-red-700",
  RETURN:     "bg-amber-100 text-amber-800",
  SALE:       "bg-slate-100 text-slate-700",
  OTHER:      "bg-slate-100 text-slate-500",
};

interface AdjustmentRow {
  id: string;
  adjustmentType: StockAdjustmentType;
  quantityChange: number;
  previousQty: number;
  newQty: number;
  notes: string | null;
  createdAt: Date;
  createdBy: { name: string } | null;
}

interface Props {
  productId: string;
  /** Entegra (XML sync) stock — source of truth, never mutated by this card. */
  entegraStock: number;
  /** Last recorded physical count, or null if no count has been performed. */
  physicalCount: number | null;
  physicalCountAt: Date | null;
  physicalCountByName: string | null;
  initialAdjustments: AdjustmentRow[];
}

export function StockAdjustmentCard({
  productId,
  entegraStock,
  physicalCount,
  physicalCountAt,
  physicalCountByName,
  initialAdjustments,
}: Props) {
  const [adjustments, setAdjustments] = useState<AdjustmentRow[]>(initialAdjustments);
  const [latestPhysical, setLatestPhysical] = useState<number | null>(physicalCount);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);

  // Form state
  const [adjType, setAdjType] = useState<StockAdjustmentType>(StockAdjustmentType.RESTOCK);
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const [direction, setDirection] = useState<"in" | "out">("in");

  function handleSubmit() {
    const parsed = parseInt(qty, 10);
    if (!qty || isNaN(parsed) || parsed <= 0) {
      setResult({ ok: false, message: "Geçerli bir adet girin." });
      return;
    }
    const quantityChange = direction === "in" ? parsed : -parsed;

    const values: StockAdjustmentFormValues = {
      productId,
      adjustmentType: adjType,
      quantityChange,
      notes: notes || undefined,
    };

    startTransition(async () => {
      const res = await createStockAdjustmentAction(values);
      setResult(res);
      if (res.ok) {
        // Optimistic update: baseline is current physical count or Entegra stock
        const prevQty = latestPhysical ?? entegraStock;
        const newQty = prevQty + quantityChange;
        const newRow: AdjustmentRow = {
          id: crypto.randomUUID(),
          adjustmentType: adjType,
          quantityChange,
          previousQty: prevQty,
          newQty,
          notes: notes || null,
          createdAt: new Date(),
          createdBy: null,
        };
        setAdjustments([newRow, ...adjustments]);
        setLatestPhysical(newQty);
        setQty("");
        setNotes("");
      }
    });
  }

  const variance = latestPhysical != null ? entegraStock - latestPhysical : null;
  const varianceTone =
    variance == null
      ? "text-slate-400"
      : variance === 0
        ? "text-emerald-600"
        : variance > 0
          ? "text-amber-600"  // Entegra has more than physical count
          : "text-red-600";   // Entegra has less than physical count (oversell risk)

  return (
    <Card className="overflow-hidden p-0">
      <div className="border-b border-slate-100 px-6 py-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Fiziksel Sayım Hareketleri</h2>
          <p className="mt-0.5 text-xs text-slate-500 max-w-md">
            Fiziksel sayım kayıtları. Entegra stoğunu (XML sync) etkilemez —
            yalnızca depo sayımı ve variance raporu için saklanır.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs tabular-nums">
          <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-slate-700">
            Entegra: <span className="font-bold text-slate-900">{entegraStock}</span>
          </span>
          <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700">
            Sayım: <span className="font-bold text-slate-900">{latestPhysical ?? "—"}</span>
          </span>
          <span className={`rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium ${varianceTone}`}>
            Fark: <span className="font-bold">
              {variance == null ? "—" : variance > 0 ? `+${variance}` : variance}
            </span>
          </span>
        </div>
      </div>

      {physicalCountAt && (
        <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-2 text-[11px] text-slate-500">
          Son sayım: {new Date(physicalCountAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}
          {physicalCountByName ? ` — ${physicalCountByName}` : ""}
        </div>
      )}

      {/* Add form */}
      <div className="border-b border-slate-100 bg-slate-50 px-6 py-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
          Yeni Hareket Ekle
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Type */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Hareket Türü</label>
            <select
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
              value={adjType}
              onChange={(e) => setAdjType(e.target.value as StockAdjustmentType)}
            >
              {Object.values(StockAdjustmentType).map((t) => (
                <option key={t} value={t}>{TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>

          {/* Direction */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Yön</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDirection("in")}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition ${
                  direction === "in"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                + Giriş
              </button>
              <button
                type="button"
                onClick={() => setDirection("out")}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition ${
                  direction === "out"
                    ? "border-red-400 bg-red-50 text-red-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                − Çıkış
              </button>
            </div>
          </div>

          {/* Quantity */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Adet</label>
            <input
              type="number"
              min="1"
              placeholder="0"
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Not (isteğe bağlı)</label>
            <input
              type="text"
              maxLength={200}
              placeholder="ör. Tedarikçi teslimi"
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
          >
            {isPending ? "Kaydediliyor…" : "Hareketi Kaydet"}
          </button>
          {result && (
            <span className={`text-xs font-medium ${result.ok ? "text-emerald-600" : "text-red-600"}`}>
              {result.message}
            </span>
          )}
        </div>
      </div>

      {/* History table */}
      {adjustments.length === 0 ? (
        <div className="px-6 py-8 text-center text-sm text-slate-400">
          Henüz fiziksel sayım hareketi kaydedilmedi.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-widest text-slate-500">
                <th className="px-6 py-3 text-left">Tür</th>
                <th className="px-4 py-3 text-right">Değişim</th>
                <th className="px-4 py-3 text-right">Önceki</th>
                <th className="px-4 py-3 text-right">Sonraki</th>
                <th className="px-4 py-3 text-left">Not</th>
                <th className="px-4 py-3 text-left">Kaydeden</th>
                <th className="px-4 py-3 text-left">Tarih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {adjustments.map((row, i) => (
                <tr key={row.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${TYPE_COLORS[row.adjustmentType]}`}>
                      {TYPE_LABELS[row.adjustmentType]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-bold tabular-nums">
                    <span className={row.quantityChange >= 0 ? "text-emerald-700" : "text-red-600"}>
                      {row.quantityChange >= 0 ? "+" : ""}{row.quantityChange}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-500">{row.previousQty}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-800">{row.newQty}</td>
                  <td className="px-4 py-3 max-w-[200px] truncate text-xs text-slate-500">{row.notes ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{row.createdBy?.name ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                    {new Date(row.createdAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

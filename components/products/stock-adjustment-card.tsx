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
import { Plus, Minus } from "lucide-react";
import {
  createStockAdjustmentAction,
  type StockAdjustmentFormValues,
} from "@/lib/actions/stock-adjustment-actions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const TYPE_LABELS: Record<StockAdjustmentType, string> = {
  RESTOCK:    "Stok Girişi",
  CORRECTION: "Sayım Düzeltme",
  DAMAGE:     "Hasar / Fire",
  RETURN:     "Müşteri İadesi",
  SALE:       "Manuel Satış",
  OTHER:      "Diğer",
};

const TYPE_VARIANTS: Record<StockAdjustmentType, "ok" | "info" | "danger" | "warn" | "neutral"> = {
  RESTOCK:    "ok",
  CORRECTION: "info",
  DAMAGE:     "danger",
  RETURN:     "warn",
  SALE:       "neutral",
  OTHER:      "neutral",
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
      ? "text-[var(--text-muted)]"
      : variance === 0
        ? "text-[var(--ok)]"
        : variance > 0
          ? "text-[var(--warn)]"  // Entegra has more than physical count
          : "text-[var(--danger)]"; // Entegra has less than physical count (oversell risk)

  const inputCls =
    "w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent-border)]";

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-col gap-2 border-b border-[var(--border-default)] px-6 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">
            Fiziksel Sayım Hareketleri
          </h2>
          <p className="mt-0.5 max-w-md text-xs text-[var(--text-secondary)]">
            Fiziksel sayım kayıtları. Entegra stoğunu (XML sync) etkilemez —
            yalnızca depo sayımı ve variance raporu için saklanır.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs tabular-nums">
          <span className="rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 py-1.5 font-medium text-[var(--text-secondary)]">
            Entegra: <span className="font-bold text-[var(--text-primary)]">{entegraStock}</span>
          </span>
          <span className="rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 py-1.5 font-medium text-[var(--text-secondary)]">
            Sayım: <span className="font-bold text-[var(--text-primary)]">{latestPhysical ?? "—"}</span>
          </span>
          <span className={`rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 py-1.5 font-medium ${varianceTone}`}>
            Fark: <span className="font-bold">
              {variance == null ? "—" : variance > 0 ? `+${variance}` : variance}
            </span>
          </span>
        </div>
      </div>

      {physicalCountAt && (
        <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)] px-6 py-2 text-[11px] text-[var(--text-muted)]">
          Son sayım: {new Date(physicalCountAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}
          {physicalCountByName ? ` — ${physicalCountByName}` : ""}
        </div>
      )}

      {/* Add form */}
      <div className="border-b border-[var(--border-default)] bg-[var(--surface-1)] px-6 py-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          Yeni Hareket Ekle
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* Type */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              Hareket Türü
            </label>
            <select
              className={inputCls}
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
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              Yön
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDirection("in")}
                className={`flex flex-1 items-center justify-center gap-1 rounded-md border px-3 py-2 text-sm font-medium transition ${
                  direction === "in"
                    ? "border-[var(--ok-border)] bg-[var(--ok-dim)] text-[var(--ok)]"
                    : "border-[var(--border-default)] bg-[var(--surface-3)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                }`}
              >
                <Plus size={14} strokeWidth={1.5} />
                Giriş
              </button>
              <button
                type="button"
                onClick={() => setDirection("out")}
                className={`flex flex-1 items-center justify-center gap-1 rounded-md border px-3 py-2 text-sm font-medium transition ${
                  direction === "out"
                    ? "border-[var(--danger-border)] bg-[var(--danger-dim)] text-[var(--danger)]"
                    : "border-[var(--border-default)] bg-[var(--surface-3)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                }`}
              >
                <Minus size={14} strokeWidth={1.5} />
                Çıkış
              </button>
            </div>
          </div>

          {/* Quantity */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              Adet
            </label>
            <input
              type="number"
              min="1"
              placeholder="0"
              className={`${inputCls} font-mono tabular-nums`}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              Not (isteğe bağlı)
            </label>
            <input
              type="text"
              maxLength={200}
              placeholder="ör. Tedarikçi teslimi"
              className={inputCls}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <Button onClick={handleSubmit} disabled={isPending}>
            {isPending ? "Kaydediliyor…" : "Hareketi Kaydet"}
          </Button>
          {result && (
            <span className={`text-xs font-medium ${result.ok ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}>
              {result.message}
            </span>
          )}
        </div>
      </div>

      {/* History table */}
      {adjustments.length === 0 ? (
        <div className="px-6 py-8 text-center text-sm text-[var(--text-muted)]">
          Henüz fiziksel sayım hareketi kaydedilmedi.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)] bg-[var(--surface-1)] text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
                <th className="px-6 py-3 text-left font-semibold">Tür</th>
                <th className="px-4 py-3 text-right font-semibold">Değişim</th>
                <th className="px-4 py-3 text-right font-semibold">Önceki</th>
                <th className="px-4 py-3 text-right font-semibold">Sonraki</th>
                <th className="px-4 py-3 text-left font-semibold">Not</th>
                <th className="px-4 py-3 text-left font-semibold">Kaydeden</th>
                <th className="px-4 py-3 text-left font-semibold">Tarih</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {adjustments.map((row) => (
                <tr key={row.id} className="transition hover:bg-[var(--surface-3)]">
                  <td className="px-6 py-3">
                    <Badge variant={TYPE_VARIANTS[row.adjustmentType]}>
                      {TYPE_LABELS[row.adjustmentType]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-bold tabular-nums">
                    <span className={row.quantityChange >= 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"}>
                      {row.quantityChange >= 0 ? "+" : ""}{row.quantityChange}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                    {row.previousQty}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-[var(--text-primary)]">
                    {row.newQty}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-3 text-xs text-[var(--text-secondary)]">
                    {row.notes ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--text-muted)]">
                    {row.createdBy?.name ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-[var(--text-muted)]">
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

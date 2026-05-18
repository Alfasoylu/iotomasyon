"use client";

/**
 * Phase 80 — İthalat Alanı Hızlı Düzenleme Modalı
 *
 * Opens when the user clicks the edit button on an importer-view table row.
 * PATCHes /api/products/[id]/import-fields with the five import economics
 * fields. After a successful save, calls onSave() with the updated fields so
 * the parent can do an optimistic update without a full re-fetch.
 */

import { useState } from "react";
import type { ImporterProduct } from "@/app/api/products/importer-view/route";

type UpdatedFields = {
  sourceCostRmb: number | null;
  weightKg: number | null;
  customsRatePct: number | null;
  shippingMethodPref: string | null;
  importPaymentFeePct: number | null;
};

type Props = {
  product: ImporterProduct;
  onClose: () => void;
  onSave: (id: string, updated: UpdatedFields) => void;
};

function numStr(v: number | null): string {
  return v != null ? String(v) : "";
}

export function ImportQuickEdit({ product, onClose, onSave }: Props) {
  const [sourceCostRmb, setSourceCostRmb] = useState(numStr(product.sourceCostRmb));
  const [weightKg, setWeightKg] = useState(numStr(product.weightKg));
  const [customsRatePct, setCustomsRatePct] = useState(numStr(product.customsRatePct));
  const [shippingMethodPref, setShippingMethodPref] = useState(
    product.shippingMethodPref?.toUpperCase() ?? "",
  );
  const [importPaymentFeePct, setImportPaymentFeePct] = useState(
    numStr(product.importPaymentFeePct),
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function parseNum(s: string): number | null {
    if (s.trim() === "") return null;
    const n = parseFloat(s.replace(",", "."));
    return isFinite(n) ? n : null;
  }

  async function handleSave() {
    setLoading(true);
    setError(null);

    const body: Record<string, unknown> = {
      sourceCostRmb: parseNum(sourceCostRmb),
      weightKg: parseNum(weightKg),
      customsRatePct: parseNum(customsRatePct),
      importPaymentFeePct: parseNum(importPaymentFeePct),
      shippingMethodPref: shippingMethodPref.trim().toUpperCase() || null,
    };

    try {
      const res = await fetch(`/api/products/${product.id}/import-fields`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok) {
        setError(json.error ?? "Bilinmeyen hata");
        return;
      }

      onSave(product.id, {
        sourceCostRmb: json.sourceCostRmb,
        weightKg: json.weightKg,
        customsRatePct: json.customsRatePct,
        shippingMethodPref: json.shippingMethodPref,
        importPaymentFeePct: json.importPaymentFeePct,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ağ hatası");
    } finally {
      setLoading(false);
    }
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              İthalat Alanı Düzenle
            </p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900 leading-tight">
              {product.name}
            </p>
            {product.sku && (
              <p className="text-xs text-slate-400 font-mono mt-0.5">{product.sku}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="mt-0.5 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          {/* Row 1 — Cost + Weight */}
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Kaynak Maliyet (¥)"
              placeholder="örn. 45.00"
              value={sourceCostRmb}
              onChange={setSourceCostRmb}
              hint="RMB cinsinden birim alış fiyatı"
            />
            <Field
              label="Ağırlık (kg)"
              placeholder="örn. 0.35"
              value={weightKg}
              onChange={setWeightKg}
              hint="Birim ürün ağırlığı"
            />
          </div>

          {/* Row 2 — Customs + Payment fee */}
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Gümrük Oranı (%)"
              placeholder="örn. 30"
              value={customsRatePct}
              onChange={setCustomsRatePct}
              hint="Gümrük vergisi oranı"
            />
            <Field
              label="Ödeme Komisyonu (%)"
              placeholder="örn. 3"
              value={importPaymentFeePct}
              onChange={setImportPaymentFeePct}
              hint="Havale/komisyon masrafı"
            />
          </div>

          {/* Shipping method */}
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Kargo Tercihi
            </label>
            <div className="flex gap-2">
              {(["", "AIR", "SEA"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setShippingMethodPref(v)}
                  className={`flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                    shippingMethodPref === v
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {v === "" ? "Otomatik" : v === "AIR" ? "✈ Hava" : "⛵ Deniz"}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              Otomatik: ≥5 kg → Deniz, &lt;5 kg → Hava
            </p>
          </div>

          {/* Current values hint */}
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-[10px] text-slate-400 space-y-0.5">
            <p className="font-medium text-slate-500 mb-1">Mevcut değerler:</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              <span>Maliyet: {product.sourceCostRmb != null ? `¥${product.sourceCostRmb}` : "—"}</span>
              <span>Ağırlık: {product.weightKg != null ? `${product.weightKg} kg` : "—"}</span>
              <span>Gümrük: {product.customsRatePct != null ? `%${product.customsRatePct}` : "—"}</span>
              <span>Ödeme: {product.importPaymentFeePct != null ? `%${product.importPaymentFeePct}` : "—"}</span>
              <span>Kargo: {product.shippingMethodPref ?? "Otomatik"}</span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
          >
            İptal
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition"
          >
            {loading ? "Kaydediliyor…" : "💾 Kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Field helper ──────────────────────────────────────────────────────────────

function Field({
  label,
  placeholder,
  value,
  onChange,
  hint,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-700 mb-1">{label}</label>
      <input
        type="number"
        step="any"
        min="0"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 placeholder:text-slate-300 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 transition"
      />
      {hint && <p className="mt-0.5 text-[10px] text-slate-400">{hint}</p>}
    </div>
  );
}

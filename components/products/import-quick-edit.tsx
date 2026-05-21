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
import { X, Plane, Ship, Save } from "lucide-react";
import type { ImporterProduct } from "@/app/api/products/importer-view/route";
import { Button } from "@/components/ui/button";

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
  // NOT: onlineSalesPotential modal'dan kaldırıldı (tablo satırında inline edit)

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <div className="w-full max-w-md rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-default)] px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              İthalat Alanı Düzenle
            </p>
            <p className="mt-0.5 text-sm font-semibold leading-tight text-[var(--text-primary)]">
              {product.name}
            </p>
            {product.sku && (
              <p className="mt-0.5 font-mono text-xs text-[var(--text-muted)]">{product.sku}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="mt-0.5 rounded-md p-1 text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-4 px-6 py-5">
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

          {/* NOT: "Aylık Satış (Pazar Yeri)" alanı tablodaki Aylık Pot. sütununa
              taşındı (inline editable). Buradan çıkarıldı. */}

          {/* Shipping method */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
              Kargo Tercihi
            </label>
            <div className="flex gap-2">
              {(["", "AIR", "SEA"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setShippingMethodPref(v)}
                  className={`flex flex-1 items-center justify-center gap-1 rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
                    shippingMethodPref === v
                      ? "border-[var(--accent-border)] bg-[var(--accent)] text-[var(--accent-fg)]"
                      : "border-[var(--border-default)] bg-[var(--surface-3)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  {v === "" ? (
                    "Otomatik"
                  ) : v === "AIR" ? (
                    <>
                      <Plane size={14} strokeWidth={1.5} /> Hava
                    </>
                  ) : (
                    <>
                      <Ship size={14} strokeWidth={1.5} /> Deniz
                    </>
                  )}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">
              Otomatik: ≥5 kg → Deniz, &lt;5 kg → Hava
            </p>
          </div>

          {/* Current values hint */}
          <div className="space-y-0.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] px-3 py-2 text-[10px] text-[var(--text-muted)]">
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Mevcut değerler:
            </p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 font-mono tabular-nums">
              <span>Maliyet: {product.sourceCostRmb != null ? `¥${product.sourceCostRmb}` : "—"}</span>
              <span>Ağırlık: {product.weightKg != null ? `${product.weightKg} kg` : "—"}</span>
              <span>Gümrük: {product.customsRatePct != null ? `%${product.customsRatePct}` : "—"}</span>
              <span>Ödeme: {product.importPaymentFeePct != null ? `%${product.importPaymentFeePct}` : "—"}</span>
              <span>Kargo: {product.shippingMethodPref ?? "Otomatik"}</span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-dim)] px-3 py-2 text-xs text-[var(--danger)]">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-[var(--border-default)] px-6 py-4">
          <Button variant="secondary" onClick={onClose}>
            İptal
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            <Save size={14} strokeWidth={1.5} />
            {loading ? "Kaydediliyor…" : "Kaydet"}
          </Button>
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
      <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
        {label}
      </label>
      <input
        type="number"
        step="any"
        min="0"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 py-1.5 font-mono text-sm tabular-nums text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent-border)]"
      />
      {hint && <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{hint}</p>}
    </div>
  );
}

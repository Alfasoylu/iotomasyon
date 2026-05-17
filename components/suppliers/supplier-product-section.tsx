"use client";

import { useState, useTransition } from "react";
import {
  upsertSupplierProductAction,
  deleteSupplierProductAction,
} from "@/lib/actions/supplier-actions";
import { Button } from "@/components/ui/button";

interface SupplierOption {
  id: string;
  name: string;
}

interface SupplierLink {
  supplierId: string;
  supplierName: string;
  unitCostUsd: number | null;
  moq: number | null;
  leadDays: number | null;
  isPreferred: boolean;
  notes: string | null;
}

interface SupplierProductSectionProps {
  productId: string;
  suppliers: SupplierOption[];
  existingLinks: SupplierLink[];
  canWrite: boolean;
}

const EMPTY_LINK_FORM = {
  supplierId: "",
  unitCostUsd: "",
  moq: "",
  leadDays: "",
  isPreferred: false,
  notes: "",
};

export function SupplierProductSection({
  productId,
  suppliers,
  existingLinks: initialLinks,
  canWrite,
}: SupplierProductSectionProps) {
  const [links, setLinks] = useState(initialLinks);
  const [form, setForm] = useState(EMPTY_LINK_FORM);
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [startDeleting] = [useTransition()[1]];

  const availableSuppliers = suppliers.filter(
    (s) => !links.some((l) => l.supplierId === s.id),
  );

  function handleAdd() {
    if (!form.supplierId) {
      setResult({ ok: false, message: "Tedarikçi seçin." });
      return;
    }
    setResult(null);
    startTransition(async () => {
      const res = await upsertSupplierProductAction(form.supplierId, productId, {
        unitCostUsd: form.unitCostUsd,
        moq: form.moq,
        leadDays: form.leadDays,
        isPreferred: form.isPreferred,
        notes: form.notes,
      });
      setResult(res);
      if (res.ok) {
        // Reload to fetch fresh data
        window.location.reload();
      }
    });
  }

  function handleDelete(supplierId: string, supplierName: string) {
    if (!confirm(`${supplierName} bağlantısını kaldırmak istiyor musunuz?`)) return;
    setDeletingId(supplierId);
    setResult(null);
    // Use a fresh transition-like approach with a raw async call
    deleteSupplierProductAction(supplierId, productId).then((res) => {
      setResult(res);
      setDeletingId(null);
      if (res.ok) {
        setLinks((prev) => prev.filter((l) => l.supplierId !== supplierId));
      }
    });
  }

  const fieldClass =
    "w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400";
  const labelClass = "block text-xs font-medium text-slate-600 mb-1";

  return (
    <div className="space-y-6">
      {/* Existing links */}
      {links.length === 0 ? (
        <p className="text-sm text-slate-400">Bu ürüne bağlı tedarikçi yok.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Tedarikçi
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Birim Maliyet (USD)
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Min. Sipariş
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Tedarik Süresi
                </th>
                <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Tercihli
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Not
                </th>
                {canWrite && <th className="px-3 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {links.map((link) => (
                <tr key={link.supplierId} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-900">
                    {link.supplierName}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-700">
                    {link.unitCostUsd != null ? `$${link.unitCostUsd.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700">
                    {link.moq != null ? `${link.moq} adet` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700">
                    {link.leadDays != null ? `${link.leadDays} gün` : "—"}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {link.isPreferred ? (
                      <span className="text-emerald-600 font-semibold text-xs">✓ Evet</span>
                    ) : (
                      <span className="text-slate-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {link.notes ?? "—"}
                  </td>
                  {canWrite && (
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleDelete(link.supplierId, link.supplierName)}
                        disabled={deletingId === link.supplierId}
                        className="text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-40"
                      >
                        {deletingId === link.supplierId ? "..." : "Kaldır"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add link form (write only) */}
      {canWrite && (
        <div className="border-t border-slate-100 pt-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Tedarikçi Bağla
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={labelClass}>Tedarikçi</label>
              <select
                className={`${fieldClass} bg-white`}
                value={form.supplierId}
                onChange={(e) => setForm((f) => ({ ...f, supplierId: e.target.value }))}
              >
                <option value="">— Seçin —</option>
                {availableSuppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Birim Maliyet (USD)</label>
              <input
                type="number"
                className={fieldClass}
                value={form.unitCostUsd}
                onChange={(e) => setForm((f) => ({ ...f, unitCostUsd: e.target.value }))}
                placeholder="12.50"
                min={0}
                step="0.01"
              />
            </div>
            <div>
              <label className={labelClass}>Min. Sipariş Adedi</label>
              <input
                type="number"
                className={fieldClass}
                value={form.moq}
                onChange={(e) => setForm((f) => ({ ...f, moq: e.target.value }))}
                placeholder="10"
                min={1}
              />
            </div>
            <div>
              <label className={labelClass}>Tedarik Süresi (gün)</label>
              <input
                type="number"
                className={fieldClass}
                value={form.leadDays}
                onChange={(e) => setForm((f) => ({ ...f, leadDays: e.target.value }))}
                placeholder="7"
                min={1}
              />
            </div>
            <div>
              <label className={labelClass}>Not</label>
              <input
                type="text"
                className={fieldClass}
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="İsteğe bağlı not"
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer select-none pb-1">
                <input
                  type="checkbox"
                  checked={form.isPreferred}
                  onChange={(e) => setForm((f) => ({ ...f, isPreferred: e.target.checked }))}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span className="text-sm text-slate-700">Tercihli tedarikçi</span>
              </label>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleAdd} disabled={isPending}>
              {isPending ? "Kaydediliyor..." : "Bağlantı Ekle"}
            </Button>
            {result && (
              <span
                className={`text-xs font-medium ${result.ok ? "text-emerald-600" : "text-red-600"}`}
              >
                {result.ok ? "Kaydedildi." : result.message}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

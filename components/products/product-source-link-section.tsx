"use client";

import { useState, useTransition } from "react";

import {
  deleteProductSourceLinkAction,
  saveProductSourceLinkAction,
} from "@/lib/actions/product-source-link-actions";
import { Button } from "@/components/ui/button";

type SourceLink = {
  id: string;
  sourceName: string;
  label: string | null;
  url: string;
  notes: string | null;
  sortOrder: number;
};

type ProductSourceLinkSectionProps = {
  productId: string;
  initialLinks: SourceLink[];
  canWrite: boolean;
};

const EMPTY_FORM = {
  linkId: "",
  sourceName: "1688",
  label: "",
  url: "",
  notes: "",
};

export function ProductSourceLinkSection({
  productId,
  initialLinks,
  canWrite,
}: ProductSourceLinkSectionProps) {
  const [links, setLinks] = useState(initialLinks);
  const [form, setForm] = useState(EMPTY_FORM);
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const fieldClass =
    "w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400";
  const labelClass = "mb-1 block text-xs font-medium text-slate-600";

  function resetForm() {
    setForm(EMPTY_FORM);
  }

  function handleEdit(link: SourceLink) {
    setForm({
      linkId: link.id,
      sourceName: link.sourceName,
      label: link.label ?? "",
      url: link.url,
      notes: link.notes ?? "",
    });
    setResult(null);
  }

  function handleSave() {
    if (!form.url.trim()) {
      setResult({ ok: false, message: "Link adresi zorunlu." });
      return;
    }

    setResult(null);
    startTransition(async () => {
      const res = await saveProductSourceLinkAction(productId, form);
      setResult(res);
      if (!res.ok) return;

      window.location.reload();
    });
  }

  function handleDelete(link: SourceLink) {
    if (!confirm(`${link.label ?? link.sourceName} linkini kaldırmak istiyor musunuz?`)) {
      return;
    }

    setDeletingId(link.id);
    setResult(null);
    deleteProductSourceLinkAction(productId, link.id).then((res) => {
      setDeletingId(null);
      setResult(res);
      if (res.ok) {
        setLinks((prev) => prev.filter((item) => item.id !== link.id));
        if (form.linkId === link.id) {
          resetForm();
        }
      }
    });
  }

  const sortedLinks = [...links].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-6">
      {sortedLinks.length === 0 ? (
        <p className="text-sm text-slate-400">Bu ürüne bağlı kaynak link yok.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Kaynak
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Etiket
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Link
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Not
                </th>
                {canWrite ? <th className="px-3 py-2" /> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedLinks.map((link, index) => (
                <tr key={link.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-900">{link.sourceName}</td>
                  <td className="px-3 py-2 text-slate-700">
                    {link.label ?? `${link.sourceName} Link${index + 1}`}
                  </td>
                  <td className="px-3 py-2">
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block max-w-[420px] truncate text-blue-600 underline-offset-2 hover:underline"
                    >
                      {link.url}
                    </a>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{link.notes ?? "—"}</td>
                  {canWrite ? (
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => handleEdit(link)}
                          className="text-xs font-medium text-slate-600 hover:text-slate-900"
                        >
                          Düzenle
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(link)}
                          disabled={deletingId === link.id}
                          className="text-xs font-medium text-red-500 hover:text-red-700 disabled:opacity-40"
                        >
                          {deletingId === link.id ? "..." : "Kaldır"}
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canWrite && (
        <div className="space-y-3 border-t border-slate-100 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            {form.linkId ? "Kaynak Link Düzenle" : "Kaynak Link Ekle"}
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Kaynak Adı</label>
              <input
                type="text"
                className={fieldClass}
                value={form.sourceName}
                onChange={(e) => setForm((prev) => ({ ...prev, sourceName: e.target.value }))}
                placeholder="1688"
              />
            </div>
            <div>
              <label className={labelClass}>Etiket</label>
              <input
                type="text"
                className={fieldClass}
                value={form.label}
                onChange={(e) => setForm((prev) => ({ ...prev, label: e.target.value }))}
                placeholder="1688 Link1"
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Link</label>
              <input
                type="url"
                className={fieldClass}
                value={form.url}
                onChange={(e) => setForm((prev) => ({ ...prev, url: e.target.value }))}
                placeholder="https://detail.1688.com/offer/..."
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelClass}>Not</label>
              <input
                type="text"
                className={fieldClass}
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="İsteğe bağlı not"
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button type="button" onClick={handleSave} disabled={isPending}>
              {isPending ? "Kaydediliyor..." : form.linkId ? "Güncelle" : "Link Ekle"}
            </Button>
            {form.linkId ? (
              <Button type="button" variant="secondary" onClick={resetForm} disabled={isPending}>
                Vazgeç
              </Button>
            ) : null}
            {result ? (
              <span className={`text-xs font-medium ${result.ok ? "text-emerald-600" : "text-red-600"}`}>
                {result.ok ? "Kaydedildi." : result.message}
              </span>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

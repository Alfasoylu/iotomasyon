"use client";

/**
 * Phase 78 — Toplu Veri Girişi butonları (ürünler listesi header'ında)
 *
 * - CSV İndir: /api/products/bulk-export (doğrudan link)
 * - CSV Yükle: file input → POST /api/products/bulk-import → toast-benzeri sonuç
 */

import { useRef, useState } from "react";

type ImportResult = {
  updated: number;
  skipped: number;
  errors: string[];
};

export function ProductBulkButtons() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/products/bulk-import", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Hata");
      } else {
        setResult(json as ImportResult);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ağ hatası");
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {/* Download */}
        <a
          href="/api/products/bulk-export"
          download
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
        >
          ⬇ CSV İndir
        </a>

        {/* Upload */}
        <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${loading ? "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={loading}
            onChange={handleFile}
          />
          {loading ? "Yükleniyor…" : "⬆ CSV Yükle"}
        </label>
      </div>

      {/* Inline feedback */}
      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
      {result && (
        <p className={`text-xs font-medium ${result.errors.length > 0 ? "text-amber-600" : "text-emerald-600"}`}>
          {result.updated} güncellendi
          {result.skipped > 0 && `, ${result.skipped} atlandı`}
          {result.errors.length > 0 && ` · ${result.errors.length} hata`}
        </p>
      )}
    </div>
  );
}

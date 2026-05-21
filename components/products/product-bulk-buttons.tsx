"use client";

/**
 * Phase 78 — Toplu Veri Girişi butonları (ürünler listesi header'ında)
 *
 * - CSV İndir: /api/products/bulk-export (doğrudan link)
 * - CSV Yükle: file input → POST /api/products/bulk-import → toast-benzeri sonuç
 */

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";

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

  const btnBase =
    "inline-flex items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition hover:border-[var(--border-strong)]";

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        {/* Download */}
        <a href="/api/products/bulk-export" download className={btnBase}>
          <Download size={14} strokeWidth={1.5} />
          CSV İndir
        </a>

        {/* Upload */}
        <label
          className={`${btnBase} cursor-pointer ${
            loading
              ? "cursor-not-allowed text-[var(--text-muted)] opacity-60"
              : ""
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            className="sr-only"
            disabled={loading}
            onChange={handleFile}
          />
          <Upload size={14} strokeWidth={1.5} />
          {loading ? "Yükleniyor…" : "CSV Yükle"}
        </label>
      </div>

      {/* Inline feedback */}
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
      {result && (
        <p
          className={`font-mono text-xs font-medium tabular-nums ${
            result.errors.length > 0 ? "text-[var(--warn)]" : "text-[var(--ok)]"
          }`}
        >
          {result.updated} güncellendi
          {result.skipped > 0 && `, ${result.skipped} atlandı`}
          {result.errors.length > 0 && ` · ${result.errors.length} hata`}
        </p>
      )}
    </div>
  );
}

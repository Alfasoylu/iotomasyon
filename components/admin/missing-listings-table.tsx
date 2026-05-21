"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, X, AlertTriangle } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export interface MissingListingRow {
  productId: string;
  productName: string;
  sku: string;
  barcode: string | null;
  brand: string | null;
  stockQuantity: number;
  lifetimeSold: number;
}

const TR_MAP: Record<string, string> = {
  ş: "s", Ş: "s", ğ: "g", Ğ: "g", ç: "c", Ç: "c",
  ü: "u", Ü: "u", ö: "o", Ö: "o", ı: "i", İ: "i",
};
function norm(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/[şŞğĞçÇüÜöÖıİ]/g, (c) => TR_MAP[c] ?? c).toLowerCase();
}

export function MissingListingsTable({ rows }: { rows: MissingListingRow[] }) {
  const [query, setQuery] = useState("");
  const [onlyPreviouslySold, setOnlyPreviouslySold] = useState(false);
  const [brandFilter, setBrandFilter] = useState<string>("");

  // Tüm farklı markaları topla
  const brands = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) if (r.brand) s.add(r.brand);
    return Array.from(s).sort();
  }, [rows]);

  // Filtre + arama
  const filtered = useMemo(() => {
    const q = norm(query);
    return rows.filter((r) => {
      if (onlyPreviouslySold && r.lifetimeSold === 0) return false;
      if (brandFilter && r.brand !== brandFilter) return false;
      if (q) {
        const hay = `${norm(r.productName)} ${norm(r.sku)} ${norm(r.barcode)} ${norm(r.brand)}`;
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, query, onlyPreviouslySold, brandFilter]);

  const sortedFiltered = useMemo(
    () => [...filtered].sort((a, b) => b.lifetimeSold - a.lifetimeSold),
    [filtered],
  );

  return (
    <div className="overflow-hidden">
      {/* Filtre çubuğu */}
      <div className="border-b border-[var(--border-subtle)] bg-[var(--surface-2)] px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[280px] flex-1">
            <Search
              size={14}
              strokeWidth={1.5}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ürün adı, SKU, barkod veya marka ara…"
              className="w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] py-2 pl-9 pr-8 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--accent-border)]"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                aria-label="Aramayı temizle"
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            )}
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={onlyPreviouslySold}
              onChange={(e) => setOnlyPreviouslySold(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--border-default)] bg-[var(--surface-3)] text-[var(--warn)] focus:ring-[var(--warn-border)]"
            />
            Sadece daha önce satılmış olanlar
          </label>

          {brands.length > 0 && (
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-border)]"
            >
              <option value="">Tüm markalar ({brands.length})</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          )}

          <Badge variant="warn" className="ml-auto tabular-nums">
            {sortedFiltered.length} / {rows.length} gösteriliyor
          </Badge>
        </div>
      </div>

      {/* Tablo */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)] text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
              <th className="px-6 py-3 text-left">Ürün</th>
              <th className="px-4 py-3 text-left">SKU</th>
              <th className="px-4 py-3 text-left">Barkod</th>
              <th className="px-4 py-3 text-left">Marka</th>
              <th className="px-4 py-3 text-right">Stok</th>
              <th
                className="px-4 py-3 text-right"
                title="Tüm zamanlar Trendyol satış adedi (iptaller hariç)"
              >
                Lifetime Satış
              </th>
              <th className="px-4 py-3 text-left">Durum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {sortedFiltered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-sm text-[var(--text-muted)]">
                  Filtreye uyan ürün yok.
                </td>
              </tr>
            ) : (
              sortedFiltered.slice(0, 1000).map((r) => (
                <tr
                  key={r.productId}
                  className={
                    r.lifetimeSold > 0
                      ? "bg-[var(--danger-dim)] transition hover:bg-[var(--danger-dim)]"
                      : "transition hover:bg-[var(--surface-3)]"
                  }
                >
                  <td className="max-w-[300px] px-6 py-3">
                    <Link
                      href={`/products/${r.productId}`}
                      className="block truncate font-medium text-[var(--text-primary)] hover:underline"
                      title={r.productName}
                    >
                      {r.productName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs tabular-nums text-[var(--text-muted)]">{r.sku}</td>
                  <td className="px-4 py-3 font-mono text-xs tabular-nums text-[var(--text-muted)]">{r.barcode ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">{r.brand ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                    {r.stockQuantity}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono text-sm tabular-nums ${
                      r.lifetimeSold > 0 ? "font-bold text-[var(--danger)]" : "text-[var(--text-muted)]"
                    }`}
                  >
                    {r.lifetimeSold > 0 ? r.lifetimeSold : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {r.lifetimeSold > 0 ? (
                      <Badge variant="danger">
                        <AlertTriangle size={12} strokeWidth={1.5} className="mr-1" />
                        Daha önce satılmış
                      </Badge>
                    ) : (
                      <Badge variant="neutral">Listemeden eksik</Badge>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {sortedFiltered.length > 1000 && (
        <div className="border-t border-[var(--border-subtle)] bg-[var(--surface-1)] px-6 py-3 text-xs text-[var(--text-muted)]">
          İlk 1000 ürün gösteriliyor (filtreye uyan toplam{" "}
          <span className="tabular-nums">{sortedFiltered.length}</span>). Daha fazlasını görmek için arama veya filtre
          uygulayın.
        </div>
      )}
    </div>
  );
}

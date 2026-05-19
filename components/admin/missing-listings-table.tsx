"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

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
      <div className="border-b border-amber-100 bg-white px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[280px]">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="🔎 Ürün adı, SKU, barkod veya marka ara…"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-700"
                aria-label="Aramayı temizle"
              >
                ✕
              </button>
            )}
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
            <input
              type="checkbox"
              checked={onlyPreviouslySold}
              onChange={(e) => setOnlyPreviouslySold(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-400"
            />
            Sadece daha önce satılmış olanlar
          </label>

          {brands.length > 0 && (
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
            >
              <option value="">Tüm markalar ({brands.length})</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          )}

          <span className="ml-auto rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">
            {sortedFiltered.length} / {rows.length} gösteriliyor
          </span>
        </div>
      </div>

      {/* Tablo */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
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
          <tbody className="divide-y divide-slate-100">
            {sortedFiltered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-400">
                  Filtreye uyan ürün yok.
                </td>
              </tr>
            ) : (
              sortedFiltered.slice(0, 1000).map((r) => (
                <tr
                  key={r.productId}
                  className={r.lifetimeSold > 0 ? "bg-red-50/40 hover:bg-red-50" : "hover:bg-slate-50"}
                >
                  <td className="px-6 py-3 max-w-[300px]">
                    <Link
                      href={`/products/${r.productId}`}
                      className="font-medium text-slate-900 hover:underline truncate block"
                      title={r.productName}
                    >
                      {r.productName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-500">{r.sku}</td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-500">{r.barcode ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{r.brand ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{r.stockQuantity}</td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums text-sm ${
                      r.lifetimeSold > 0 ? "font-bold text-red-700" : "text-slate-400"
                    }`}
                  >
                    {r.lifetimeSold > 0 ? r.lifetimeSold : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {r.lifetimeSold > 0 ? (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 font-medium text-red-700">
                        ⚠ Daha önce satılmış
                      </span>
                    ) : (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
                        Listemeden eksik
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {sortedFiltered.length > 1000 && (
        <div className="border-t border-slate-100 px-6 py-3 text-xs text-slate-500 bg-slate-50/30">
          İlk 1000 ürün gösteriliyor (filtreye uyan toplam {sortedFiltered.length}). Daha
          fazlasını görmek için arama veya filtre uygulayın.
        </div>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export interface UnmatchedRow {
  barcode: string | null;
  trendyolTitle: string;
  trendyolQty: number;
  trendyolPrice: number;
  stockCode: string | null;
}

const TR_MAP: Record<string, string> = {
  ş: "s", Ş: "s", ğ: "g", Ğ: "g", ç: "c", Ç: "c",
  ü: "u", Ü: "u", ö: "o", Ö: "o", ı: "i", İ: "i",
};
function norm(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/[şŞğĞçÇüÜöÖıİ]/g, (c) => TR_MAP[c] ?? c).toLowerCase();
}

export function TrendyolUnmatchedTable({ rows }: { rows: UnmatchedRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = norm(query);
    if (!q) return rows;
    return rows.filter((r) =>
      `${norm(r.trendyolTitle)} ${norm(r.barcode)} ${norm(r.stockCode)}`.includes(q),
    );
  }, [rows, query]);

  return (
    <div>
      <div className="border-b border-slate-100 bg-white px-6 py-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[280px]">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="🔎 Trendyol ürün adı, barkod veya stok kodu ara…"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-700"
            >
              ✕
            </button>
          )}
        </div>
        <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
          {filtered.length} / {rows.length}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-6 py-3 text-left">Trendyol Ürünü</th>
              <th className="px-4 py-3 text-left">Barkod</th>
              <th className="px-4 py-3 text-left">Stok Kodu</th>
              <th className="px-4 py-3 text-right">Trendyol Stok</th>
              <th className="px-4 py-3 text-right">Fiyat (₺)</th>
              <th className="px-4 py-3 text-left">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-400">Aramaya uyan ürün yok.</td></tr>
            ) : filtered.slice(0, 1000).map((r, i) => {
              const mappingHref = r.barcode
                ? `/admin/marketplace-mappings?barcode=${encodeURIComponent(r.barcode)}&title=${encodeURIComponent(r.trendyolTitle)}#add-form`
                : "/admin/marketplace-mappings";
              return (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-6 py-3 text-slate-700 max-w-[220px] truncate" title={r.trendyolTitle}>
                    {r.trendyolTitle}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-slate-500">{r.barcode ?? "—"}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{r.stockCode ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{r.trendyolQty}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                    {r.trendyolPrice.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={mappingHref} className="text-xs text-blue-600 hover:underline">
                      Eşleştir →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length > 1000 && (
        <div className="border-t border-slate-100 px-6 py-3 text-xs text-slate-500 bg-slate-50/30">
          İlk 1000 gösteriliyor (toplam {filtered.length}).
        </div>
      )}
    </div>
  );
}

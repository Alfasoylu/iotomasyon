"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

export interface MatchedRow {
  barcode: string;
  trendyolTitle: string;
  trendyolQty: number;
  trendyolPrice: number;
  internalQty: number;
  productId: string;
  productName: string;
  sku: string | null;
  delta: number;
}

const TR_MAP: Record<string, string> = {
  ş: "s", Ş: "s", ğ: "g", Ğ: "g", ç: "c", Ç: "c",
  ü: "u", Ü: "u", ö: "o", Ö: "o", ı: "i", İ: "i",
};
function norm(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/[şŞğĞçÇüÜöÖıİ]/g, (c) => TR_MAP[c] ?? c).toLowerCase();
}

type Filter = "all" | "oversell" | "surplus" | "synced";

export function TrendyolMatchedTable({ rows }: { rows: MatchedRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(() => {
    const q = norm(query);
    return rows.filter((r) => {
      if (filter === "oversell" && r.delta >= 0) return false;
      if (filter === "surplus" && r.delta <= 0) return false;
      if (filter === "synced" && r.delta !== 0) return false;
      if (q) {
        const hay = `${norm(r.productName)} ${norm(r.sku)} ${norm(r.barcode)} ${norm(r.trendyolTitle)}`;
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, query, filter]);

  const counts = useMemo(() => ({
    all: rows.length,
    oversell: rows.filter((r) => r.delta < 0).length,
    surplus: rows.filter((r) => r.delta > 0).length,
    synced: rows.filter((r) => r.delta === 0).length,
  }), [rows]);

  return (
    <div>
      <div className="border-b border-slate-100 bg-white px-6 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[280px]">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="🔎 Ürün adı, SKU, barkod ara…"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
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

          <div className="flex gap-1">
            {(["all", "oversell", "surplus", "synced"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  filter === f
                    ? f === "oversell" ? "bg-red-600 text-white"
                    : f === "synced" ? "bg-emerald-600 text-white"
                    : f === "surplus" ? "bg-amber-500 text-white"
                    : "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {f === "all" ? `Tümü (${counts.all})`
                  : f === "oversell" ? `Aşım Riski (${counts.oversell})`
                  : f === "surplus" ? `İç Fazla (${counts.surplus})`
                  : `Senkron (${counts.synced})`}
              </button>
            ))}
          </div>

          <span className="ml-auto rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">
            {filtered.length} / {rows.length}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-6 py-3 text-left">Ürün (İç)</th>
              <th className="px-4 py-3 text-left">SKU</th>
              <th className="px-4 py-3 text-left">Barkod</th>
              <th className="px-4 py-3 text-right">İç Stok</th>
              <th className="px-4 py-3 text-right">Trendyol Stok</th>
              <th className="px-4 py-3 text-right">Fark</th>
              <th className="px-4 py-3 text-right">Trendyol Fiyat (₺)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-400">Filtreye uyan ürün yok.</td></tr>
            ) : filtered.slice(0, 1000).map((r) => (
              <tr key={r.barcode} className={r.delta < 0 ? "bg-red-50/40 hover:bg-red-50" : "hover:bg-slate-50"}>
                <td className="px-6 py-3 font-medium text-slate-900 max-w-[200px] truncate">
                  <Link href={`/products/${r.productId}`} className="hover:underline" title={r.productName}>
                    {r.productName}
                  </Link>
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{r.sku ?? "—"}</td>
                <td className="px-4 py-3 text-xs font-mono text-slate-600">{r.barcode}</td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-800">{r.internalQty}</td>
                <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-800">{r.trendyolQty}</td>
                <td className={`px-4 py-3 text-right tabular-nums text-xs ${
                  r.delta < 0 ? "text-red-600 font-bold" : r.delta > 0 ? "text-amber-600 font-semibold" : "text-emerald-600"
                }`}>
                  {r.delta === 0 ? "✓ Senkron" : r.delta > 0 ? `+${r.delta} iç fazla` : `${r.delta} Trendyol fazla`}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                  {r.trendyolPrice.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length > 1000 && (
        <div className="border-t border-slate-100 px-6 py-3 text-xs text-slate-500 bg-slate-50/30">
          İlk 1000 gösteriliyor (toplam {filtered.length}). Arama veya filtre kullanın.
        </div>
      )}
    </div>
  );
}

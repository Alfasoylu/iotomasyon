"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, X, ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";

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
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-2)] px-6 py-3">
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
            placeholder="Trendyol ürün adı, barkod veya stok kodu ara…"
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
        <Badge variant="neutral" className="ml-auto tabular-nums">
          {filtered.length} / {rows.length}
        </Badge>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)] text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
              <th className="px-6 py-3 text-left">Trendyol Ürünü</th>
              <th className="px-4 py-3 text-left">Barkod</th>
              <th className="px-4 py-3 text-left">Stok Kodu</th>
              <th className="px-4 py-3 text-right">Trendyol Stok</th>
              <th className="px-4 py-3 text-right">Fiyat (₺)</th>
              <th className="px-4 py-3 text-left">İşlem</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-sm text-[var(--text-muted)]">
                  Aramaya uyan ürün yok.
                </td>
              </tr>
            ) : (
              filtered.slice(0, 1000).map((r, i) => {
                const mappingHref = r.barcode
                  ? `/admin/marketplace-mappings?barcode=${encodeURIComponent(r.barcode)}&title=${encodeURIComponent(r.trendyolTitle)}#add-form`
                  : "/admin/marketplace-mappings";
                return (
                  <tr key={i} className="transition hover:bg-[var(--surface-3)]">
                    <td className="max-w-[220px] truncate px-6 py-3 text-[var(--text-secondary)]" title={r.trendyolTitle}>
                      {r.trendyolTitle}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs tabular-nums text-[var(--text-muted)]">
                      {r.barcode ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs tabular-nums text-[var(--text-muted)]">
                      {r.stockCode ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {r.trendyolQty}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                      {r.trendyolPrice.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={mappingHref}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--info)] hover:underline"
                      >
                        Eşleştir
                        <ArrowRight size={12} strokeWidth={1.5} />
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {filtered.length > 1000 && (
        <div className="border-t border-[var(--border-subtle)] bg-[var(--surface-1)] px-6 py-3 text-xs text-[var(--text-muted)]">
          İlk 1000 gösteriliyor (toplam <span className="tabular-nums">{filtered.length}</span>).
        </div>
      )}
    </div>
  );
}

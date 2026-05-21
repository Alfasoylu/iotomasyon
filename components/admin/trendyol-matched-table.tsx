"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, X, Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";

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

  function filterClasses(f: Filter) {
    const active = filter === f;
    if (!active) {
      return "border-[var(--border-subtle)] bg-[var(--surface-3)] text-[var(--text-secondary)] hover:border-[var(--border-default)] hover:text-[var(--text-primary)]";
    }
    if (f === "oversell") {
      return "border-[var(--danger-border)] bg-[var(--danger-dim)] text-[var(--danger)]";
    }
    if (f === "synced") {
      return "border-[var(--ok-border)] bg-[var(--ok-dim)] text-[var(--ok)]";
    }
    if (f === "surplus") {
      return "border-[var(--warn-border)] bg-[var(--warn-dim)] text-[var(--warn)]";
    }
    return "border-[var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]";
  }

  return (
    <div>
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
              placeholder="Ürün adı, SKU, barkod ara…"
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

          <div className="flex gap-1">
            {(["all", "oversell", "surplus", "synced"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-md border px-3 py-1.5 text-[11px] font-medium uppercase tracking-widest transition ${filterClasses(f)}`}
              >
                {f === "all"
                  ? `Tümü (${counts.all})`
                  : f === "oversell"
                  ? `Aşım Riski (${counts.oversell})`
                  : f === "surplus"
                  ? `İç Fazla (${counts.surplus})`
                  : `Senkron (${counts.synced})`}
              </button>
            ))}
          </div>

          <Badge variant="info" className="ml-auto tabular-nums">
            {filtered.length} / {rows.length}
          </Badge>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)] text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
              <th className="px-6 py-3 text-left">Ürün (İç)</th>
              <th className="px-4 py-3 text-left">SKU</th>
              <th className="px-4 py-3 text-left">Barkod</th>
              <th className="px-4 py-3 text-right">İç Stok</th>
              <th className="px-4 py-3 text-right">Trendyol Stok</th>
              <th className="px-4 py-3 text-right">Fark</th>
              <th className="px-4 py-3 text-right">Trendyol Fiyat (₺)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-sm text-[var(--text-muted)]">
                  Filtreye uyan ürün yok.
                </td>
              </tr>
            ) : (
              filtered.slice(0, 1000).map((r) => (
                <tr
                  key={r.barcode}
                  className={
                    r.delta < 0
                      ? "bg-[var(--danger-dim)] transition hover:bg-[var(--danger-dim)]"
                      : "transition hover:bg-[var(--surface-3)]"
                  }
                >
                  <td className="max-w-[200px] truncate px-6 py-3 font-medium text-[var(--text-primary)]">
                    <Link href={`/products/${r.productId}`} className="hover:underline" title={r.productName}>
                      {r.productName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs tabular-nums text-[var(--text-muted)]">
                    {r.sku ?? "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                    {r.barcode}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-[var(--text-primary)]">
                    {r.internalQty}
                  </td>
                  <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-[var(--text-primary)]">
                    {r.trendyolQty}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono text-xs tabular-nums ${
                      r.delta < 0
                        ? "font-bold text-[var(--danger)]"
                        : r.delta > 0
                        ? "font-semibold text-[var(--warn)]"
                        : "text-[var(--ok)]"
                    }`}
                  >
                    {r.delta === 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <Check size={12} strokeWidth={1.5} />
                        Senkron
                      </span>
                    ) : r.delta > 0 ? (
                      `+${r.delta} iç fazla`
                    ) : (
                      `${r.delta} Trendyol fazla`
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
                    {r.trendyolPrice.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 1000 && (
        <div className="border-t border-[var(--border-subtle)] bg-[var(--surface-1)] px-6 py-3 text-xs text-[var(--text-muted)]">
          İlk 1000 gösteriliyor (toplam <span className="tabular-nums">{filtered.length}</span>). Arama veya filtre kullanın.
        </div>
      )}
    </div>
  );
}

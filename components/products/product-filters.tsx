"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";

const SORT_OPTIONS = [
  { value: "updated_desc",   label: "Son güncellenen" },
  { value: "stock_desc",     label: "Stok ↓" },
  { value: "stock_asc",      label: "Stok ↑" },
  { value: "price_desc",     label: "Fiyat ↓" },
  { value: "price_asc",      label: "Fiyat ↑" },
  { value: "margin_desc",    label: "Marj ↓" },
  { value: "name_asc",       label: "İsim A–Z" },
  { value: "sales_30d_qty",  label: "30G Satış Adedi ↓" },
  { value: "sales_30d_rev",  label: "30G Ciro ↓" },
  { value: "sales_all_rev",  label: "Toplam Ciro ↓" },
];

export function ProductFilters({
  initialQuery,
  initialStatus,
  initialStock,
  initialSort,
  total,
}: {
  initialQuery: string;
  initialStatus: string;
  initialStock: string;
  initialSort: string;
  total?: number;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);
  const [stock, setStock] = useState(initialStock);
  const [sort, setSort] = useState(initialSort || "updated_desc");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Live-search: navigate after 300ms of inactivity, fire when query >= 2 chars or cleared
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams();
      if (query.length >= 2) params.set("q", query);
      if (status && status !== "all") params.set("status", status);
      if (stock && stock !== "all") params.set("stock", stock);
      if (sort && sort !== "updated_desc") params.set("sort", sort);
      router.push(`/products${params.size > 0 ? `?${params.toString()}` : ""}`);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Instant navigation for non-search filters
  function applyFilters(overrides: { status?: string; stock?: string; sort?: string }) {
    const s = overrides.status ?? status;
    const k = overrides.stock ?? stock;
    const o = overrides.sort ?? sort;
    const params = new URLSearchParams();
    if (query.length >= 2) params.set("q", query);
    if (s && s !== "all") params.set("status", s);
    if (k && k !== "all") params.set("stock", k);
    if (o && o !== "updated_desc") params.set("sort", o);
    router.push(`/products${params.size > 0 ? `?${params.toString()}` : ""}`);
  }

  const pillCls = (active: boolean) =>
    `inline-flex cursor-pointer select-none items-center rounded-md px-3 py-1.5 text-xs font-medium transition ${
      active
        ? "bg-[var(--accent)] text-[var(--accent-fg)]"
        : "bg-[var(--surface-3)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
    }`;

  const hasFilters = status !== "all" || stock !== "all" || query.length >= 2;

  return (
    <div className="space-y-3">
      {/* Search input */}
      <div className="relative">
        <Search
          size={14}
          strokeWidth={1.5}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="SKU, ad, marka veya barkod ara (en az 2 karakter)"
          className="pl-8"
        />
        {query.length > 0 && query.length < 2 && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)]">
            {2 - query.length} karakter daha…
          </span>
        )}
      </div>

      {/* Compact filter + sort row */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          Durum
        </span>
        <button
          type="button"
          className={pillCls(status === "all")}
          onClick={() => { setStatus("all"); applyFilters({ status: "all" }); }}
        >Tümü</button>
        <button
          type="button"
          className={pillCls(status === "active")}
          onClick={() => { setStatus("active"); applyFilters({ status: "active" }); }}
        >Aktif</button>
        <button
          type="button"
          className={pillCls(status === "inactive")}
          onClick={() => { setStatus("inactive"); applyFilters({ status: "inactive" }); }}
        >Pasif</button>

        <span className="ml-3 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
          Stok
        </span>
        <button
          type="button"
          className={pillCls(stock === "all")}
          onClick={() => { setStock("all"); applyFilters({ stock: "all" }); }}
        >Tümü</button>
        <button
          type="button"
          className={pillCls(stock === "has_stock")}
          onClick={() => { setStock("has_stock"); applyFilters({ stock: "has_stock" }); }}
        >Stokta var</button>
        <button
          type="button"
          className={pillCls(stock === "low")}
          onClick={() => { setStock("low"); applyFilters({ stock: "low" }); }}
        >Düşük stok</button>

        <div className="ml-auto flex items-center gap-2">
          {hasFilters && (
            <button
              type="button"
              className="text-xs text-[var(--danger)] transition hover:brightness-110"
              onClick={() => {
                setQuery(""); setStatus("all"); setStock("all"); setSort("updated_desc");
                router.push("/products");
              }}
            >
              Filtreyi temizle
            </button>
          )}
          <select
            value={sort}
            onChange={(e) => { setSort(e.target.value); applyFilters({ sort: e.target.value }); }}
            className="h-8 rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-2 text-xs text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-border)]"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {total != null && (
            <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">
              {total} ürün
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

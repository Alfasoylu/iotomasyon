"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Check } from "lucide-react";

export type ProductOption = {
  id: string;
  name: string;
  sku: string;
  brand?: string | null;
  stockQuantity?: number | null;
  sellingPriceTry?: number | null;
};

interface Props {
  value: string;
  onChange: (productId: string, product: ProductOption | null) => void;
  products: ProductOption[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

const MAX_RESULTS = 60;

/**
 * Searchable product combobox.
 *
 * UX:
 *   - Tıklanınca arama input açılır + ilk 60 ürün listelenir
 *   - Yazıldıkça SKU + ad + marka üzerinde case-insensitive filter
 *   - ↑/↓ ile navigate, Enter ile seç, Esc ile kapat
 *   - Seçili ürün gösteriliyorsa: SKU + ad chip + X (clear)
 *   - Her satırda: SKU (mono), ürün adı, stok badge (yeşil/sarı/gri), fiyat
 *
 * 1000+ ürünle bile akıcı (basit string filter, 60 result cap).
 */
export function ProductCombobox({
  value,
  onChange,
  products,
  disabled,
  placeholder = "SKU veya ürün adı ara…",
  className = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => (value ? products.find((p) => p.id === value) ?? null : null),
    [value, products],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, MAX_RESULTS);
    const results: ProductOption[] = [];
    for (const p of products) {
      if (results.length >= MAX_RESULTS) break;
      const hay = `${p.sku} ${p.name} ${p.brand ?? ""}`.toLowerCase();
      if (hay.includes(q)) results.push(p);
    }
    return results;
  }, [products, query]);

  // Reset highlighted index when filter changes
  useEffect(() => {
    setHighlighted(0);
  }, [query]);

  // Open animation: focus input
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Click-outside closes dropdown
  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Scroll highlighted into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${highlighted}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [highlighted, open]);

  function select(product: ProductOption) {
    onChange(product.id, product);
    setOpen(false);
    setQuery("");
  }

  function clear(e?: React.MouseEvent) {
    e?.stopPropagation();
    onChange("", null);
    setQuery("");
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const p = filtered[highlighted];
      if (p) select(p);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      {/* Trigger: seçili chip veya boş input */}
      {selected && !open ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="group flex h-10 w-full items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 text-left text-[13px] transition hover:border-[var(--accent-border)] disabled:opacity-50"
        >
          <span className="flex-shrink-0 rounded bg-[var(--surface-1)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-muted)]">
            {selected.sku}
          </span>
          <span className="flex-1 truncate text-[var(--text-primary)]">{selected.name}</span>
          {selected.stockQuantity != null && (
            <StockBadge qty={selected.stockQuantity} />
          )}
          <span
            role="button"
            tabIndex={0}
            onClick={clear}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                clear();
              }
            }}
            className="cursor-pointer rounded p-0.5 text-[var(--text-muted)] opacity-0 transition hover:bg-[var(--surface-1)] hover:text-[var(--text-primary)] group-hover:opacity-100"
            aria-label="Ürünü kaldır"
          >
            <X size={12} strokeWidth={1.5} />
          </span>
        </button>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="flex h-10 w-full items-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 text-left text-[13px] text-[var(--text-muted)] transition hover:border-[var(--accent-border)] disabled:opacity-50"
        >
          <Search size={14} strokeWidth={1.5} className="flex-shrink-0" />
          <span className="flex-1 truncate">{open ? "" : "Ürün seç (opsiyonel)…"}</span>
        </button>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] shadow-xl">
          {/* Search input */}
          <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-3 py-2.5">
            <Search size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKey}
              placeholder={placeholder}
              className="flex-1 bg-transparent text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
            <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
              {filtered.length === MAX_RESULTS ? `${MAX_RESULTS}+` : filtered.length}
            </span>
          </div>

          {/* Results */}
          <div ref={listRef} className="max-h-[320px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-[12px] text-[var(--text-muted)]">
                Sonuç yok. SKU veya ürün adıyla farklı bir arama deneyin.
              </div>
            ) : (
              filtered.map((p, idx) => {
                const isHighlighted = idx === highlighted;
                const isSelected = p.id === value;
                return (
                  <button
                    key={p.id}
                    type="button"
                    data-idx={idx}
                    onMouseEnter={() => setHighlighted(idx)}
                    onClick={() => select(p)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] transition ${
                      isHighlighted
                        ? "bg-[var(--accent-dim)] text-[var(--text-primary)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-3)]"
                    }`}
                  >
                    <span className="flex-shrink-0 rounded bg-[var(--surface-3)] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
                      {p.sku}
                    </span>
                    <span className="flex-1 truncate">{p.name}</span>
                    {p.brand && (
                      <span className="hidden text-[10px] uppercase tracking-wider text-[var(--text-muted)] sm:inline">
                        {p.brand}
                      </span>
                    )}
                    {p.stockQuantity != null && <StockBadge qty={p.stockQuantity} />}
                    {p.sellingPriceTry != null && p.sellingPriceTry > 0 && (
                      <span className="flex-shrink-0 font-mono text-[11px] tabular-nums text-[var(--text-primary)]">
                        ₺{p.sellingPriceTry.toLocaleString("tr-TR")}
                      </span>
                    )}
                    {isSelected && <Check size={12} strokeWidth={2} className="text-[var(--accent)]" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StockBadge({ qty }: { qty: number }) {
  const tone =
    qty <= 0 ? "stock-empty" : qty < 5 ? "stock-low" : "stock-ok";
  const palette: Record<string, { bg: string; fg: string; label: string }> = {
    "stock-empty": { bg: "var(--surface-3)", fg: "var(--text-muted)", label: "Stoksuz" },
    "stock-low": { bg: "rgba(245,158,11,0.15)", fg: "#f59e0b", label: `${qty} adet` },
    "stock-ok": { bg: "rgba(16,185,129,0.15)", fg: "#10b981", label: `${qty} adet` },
  };
  const p = palette[tone];
  return (
    <span
      className="flex-shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums"
      style={{ backgroundColor: p.bg, color: p.fg }}
    >
      {p.label}
    </span>
  );
}

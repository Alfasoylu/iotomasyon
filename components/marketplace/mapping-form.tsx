"use client";

import { useState, useTransition, useRef, useEffect, useCallback } from "react";
import { Search, X, Pencil, Check } from "lucide-react";
import {
  createMarketplaceMappingAction,
  deleteMarketplaceMappingAction,
  type MappingFormValues,
} from "@/lib/actions/marketplace-mapping-actions";
import { Button } from "@/components/ui/button";
import { MarketplacePlatform } from "@prisma/client";

const PLATFORM_LABELS: Record<string, string> = {
  TRENDYOL: "Trendyol",
  HEPSIBURADA: "Hepsiburada",
  N11: "N11",
  PTTAVM: "PttAVM",
  KOCTAS: "Koçtaş",
  TEKNOSA: "Teknosa",
  TEMU: "Temu",
  CUSTOM: "Diğer",
};

interface Product {
  id: string;
  name: string;
  sku: string | null;
}

const INPUT_CLS =
  "w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent-border)]";

const LABEL_CLS =
  "mb-1 block text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]";

// ── Product Combobox ──────────────────────────────────────────────────────────

interface ProductComboboxProps {
  products: Product[];
  value: string;          // selected productId
  onChange: (id: string) => void;
}

function highlight(text: string, query: string) {
  if (!query.trim()) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded-sm bg-[var(--accent-dim)] text-[var(--accent)]">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function ProductCombobox({ products, value, onChange }: ProductComboboxProps) {
  const selected = products.find((p) => p.id === value) ?? null;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter: match name OR sku
  const filtered = query.trim()
    ? products.filter((p) => {
        const q = query.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          (p.sku ?? "").toLowerCase().includes(q)
        );
      })
    : products;

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCursor(-1);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Scroll active item into view
  useEffect(() => {
    if (cursor >= 0 && listRef.current) {
      const item = listRef.current.children[cursor] as HTMLElement | undefined;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [cursor]);

  const selectProduct = useCallback(
    (p: Product) => {
      onChange(p.id);
      setQuery("");
      setOpen(false);
      setCursor(-1);
    },
    [onChange],
  );

  const clearSelection = useCallback(() => {
    onChange("");
    setQuery("");
    setCursor(-1);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [onChange]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true);
      setCursor(0);
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      setCursor(-1);
      return;
    }
    if (e.key === "ArrowDown") {
      setCursor((c) => Math.min(c + 1, filtered.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      setCursor((c) => Math.max(c - 1, 0));
      return;
    }
    if (e.key === "Enter" && cursor >= 0 && filtered[cursor]) {
      e.preventDefault();
      selectProduct(filtered[cursor]);
      return;
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Selected state */}
      {selected && !open ? (
        <div className="flex items-center gap-2 rounded-md border border-[var(--ok-border)] bg-[var(--ok-dim)] px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--text-primary)]">
              {selected.name}
            </p>
            {selected.sku && (
              <p className="font-mono text-[10px] text-[var(--text-muted)]">{selected.sku}</p>
            )}
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="rounded-md p-0.5 text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
            title="Seçimi temizle"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
            className="rounded-md p-0.5 text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
            title="Değiştir"
          >
            <Pencil size={14} strokeWidth={1.5} />
          </button>
        </div>
      ) : (
        /* Search input */
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
            <Search size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder="Ürün adı veya SKU ile ara..."
            className="w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent-border)]"
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setCursor(0);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); inputRef.current?.focus(); }}
              className="absolute inset-y-0 right-2 flex items-center px-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X size={14} strokeWidth={1.5} />
            </button>
          )}
        </div>
      )}

      {/* Dropdown list */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)]">
          {/* Stats bar */}
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-3 py-1.5">
            <span className="font-mono text-[10px] tabular-nums text-[var(--text-muted)]">
              {filtered.length === products.length
                ? `${products.length} ürün`
                : `${filtered.length} / ${products.length} ürün`}
            </span>
            {query && filtered.length === 0 && (
              <span className="text-[10px] text-[var(--warn)]">Sonuç bulunamadı</span>
            )}
          </div>

          {/* Results */}
          <ul
            ref={listRef}
            className="max-h-64 overflow-y-auto py-1"
            role="listbox"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-[var(--text-muted)]">
                &quot;{query}&quot; ile eşleşen ürün bulunamadı.
              </li>
            ) : (
              filtered.map((p, i) => (
                <li
                  key={p.id}
                  role="option"
                  aria-selected={i === cursor}
                  onMouseEnter={() => setCursor(i)}
                  onMouseDown={(e) => { e.preventDefault(); selectProduct(p); }}
                  className={`flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors ${
                    i === cursor
                      ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                      : "text-[var(--text-primary)] hover:bg-[var(--surface-3)]"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {highlight(p.name, query)}
                    </p>
                    {p.sku && (
                      <p
                        className={`font-mono text-[10px] ${
                          i === cursor ? "text-[var(--accent-fg)] opacity-70" : "text-[var(--text-muted)]"
                        }`}
                      >
                        {highlight(p.sku, query)}
                      </p>
                    )}
                  </div>
                  {i === cursor && (
                    <Check size={14} strokeWidth={1.5} className="flex-shrink-0" />
                  )}
                </li>
              ))
            )}
          </ul>

          {/* Footer hint */}
          <div className="border-t border-[var(--border-subtle)] px-3 py-1.5">
            <p className="text-[10px] text-[var(--text-muted)]">
              ↑↓ Gezin · Enter Seç · Esc Kapat
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── MappingForm ───────────────────────────────────────────────────────────────

interface Props {
  products: Product[];
  defaultBarcode?: string;
  defaultPlatformTitle?: string;
}

export function MappingForm({ products, defaultBarcode = "", defaultPlatformTitle = "" }: Props) {
  const [platform, setPlatform] = useState<MarketplacePlatform>(MarketplacePlatform.TRENDYOL);
  const [productId, setProductId] = useState("");
  const [platformBarcode, setPlatformBarcode] = useState(defaultBarcode);
  const [platformSku, setPlatformSku] = useState("");
  const [platformListingId, setPlatformListingId] = useState("");
  const [platformTitle, setPlatformTitle] = useState(defaultPlatformTitle);
  const [result, setResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    if (!productId) { setResult({ ok: false, message: "Ürün seçilmeli." }); return; }
    if (!platformBarcode && !platformSku && !platformListingId) {
      setResult({ ok: false, message: "Barkod, SKU veya listeleme ID'den en az biri gerekli." });
      return;
    }
    const values: MappingFormValues = {
      platform,
      productId,
      platformBarcode: platformBarcode || undefined,
      platformSku: platformSku || undefined,
      platformListingId: platformListingId || undefined,
      platformTitle: platformTitle || undefined,
    };
    startTransition(async () => {
      const res = await createMarketplaceMappingAction(values);
      setResult(res);
      if (res.ok) {
        setProductId(""); setPlatformBarcode(""); setPlatformSku("");
        setPlatformListingId(""); setPlatformTitle("");
        window.location.reload();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {/* Platform */}
        <div>
          <label className={LABEL_CLS}>Platform</label>
          <select
            className={INPUT_CLS}
            value={platform}
            onChange={(e) => setPlatform(e.target.value as MarketplacePlatform)}
          >
            {Object.values(MarketplacePlatform).map((p) => (
              <option key={p} value={p}>{PLATFORM_LABELS[p] ?? p}</option>
            ))}
          </select>
        </div>

        {/* İç Ürün — Combobox */}
        <div>
          <label className={LABEL_CLS}>
            İç Ürün
            {!productId && (
              <span className="ml-1 font-normal normal-case tracking-normal text-[var(--text-muted)]">
                (ad veya SKU ile ara)
              </span>
            )}
          </label>
          <ProductCombobox
            products={products}
            value={productId}
            onChange={setProductId}
          />
        </div>

        {/* Platform Barkod */}
        <div>
          <label className={LABEL_CLS}>Platform Barkod</label>
          <input
            type="text"
            className={`${INPUT_CLS} font-mono tabular-nums`}
            placeholder="ör. 8681234567890"
            value={platformBarcode}
            onChange={(e) => setPlatformBarcode(e.target.value)}
          />
        </div>

        {/* Platform SKU */}
        <div>
          <label className={LABEL_CLS}>Platform SKU</label>
          <input
            type="text"
            className={`${INPUT_CLS} font-mono`}
            placeholder="ör. TRN-00123"
            value={platformSku}
            onChange={(e) => setPlatformSku(e.target.value)}
          />
        </div>

        {/* Listeleme ID */}
        <div>
          <label className={LABEL_CLS}>Listeleme ID</label>
          <input
            type="text"
            className={`${INPUT_CLS} font-mono`}
            placeholder="Platform listeleme ID'si"
            value={platformListingId}
            onChange={(e) => setPlatformListingId(e.target.value)}
          />
        </div>

        {/* Platform Başlığı */}
        <div>
          <label className={LABEL_CLS}>
            Platform Başlığı{" "}
            <span className="font-normal normal-case tracking-normal text-[var(--text-muted)]">
              (isteğe bağlı)
            </span>
          </label>
          <input
            type="text"
            className={INPUT_CLS}
            placeholder="Platformdaki ürün adı"
            value={platformTitle}
            onChange={(e) => setPlatformTitle(e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSubmit} disabled={isPending}>
          {isPending ? "Kaydediliyor..." : "Eşleştirme Ekle"}
        </Button>
        {result && (
          <span className={`text-xs font-medium ${result.ok ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}>
            {result.ok ? (result.message ?? "Kaydedildi.") : result.message}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Delete button ─────────────────────────────────────────────────────────────

export function DeleteMappingButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();
  const [confirmed, setConfirmed] = useState(false);

  if (!confirmed) {
    return (
      <button
        className="text-xs text-[var(--danger)] underline transition hover:brightness-110"
        onClick={() => setConfirmed(true)}
      >
        Sil
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1 text-xs">
      <button
        className="font-semibold text-[var(--danger)] underline transition hover:brightness-110"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            await deleteMarketplaceMappingAction(id);
            window.location.reload();
          });
        }}
      >
        {isPending ? "..." : "Onayla"}
      </button>
      <span className="text-[var(--text-muted)]">|</span>
      <button
        className="text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
        onClick={() => setConfirmed(false)}
      >
        İptal
      </button>
    </span>
  );
}

"use client";

import { useState, useTransition, useRef, useEffect, useCallback } from "react";
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
      <mark className="bg-amber-100 text-amber-900 rounded-sm">{text.slice(idx, idx + query.length)}</mark>
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
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">{selected.name}</p>
            {selected.sku && (
              <p className="font-mono text-[10px] text-slate-400">{selected.sku}</p>
            )}
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="flex-shrink-0 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
            title="Seçimi temizle"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
          <button
            type="button"
            onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
            className="flex-shrink-0 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition"
            title="Değiştir"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
              <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086zM11.189 6.25 9.75 4.81l-6.286 6.287a.25.25 0 0 0-.064.108l-.558 1.953 1.953-.558a.25.25 0 0 0 .108-.064l6.286-6.286z"/>
            </svg>
          </button>
        </div>
      ) : (
        /* Search input */
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
            <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1 0 6.5 6.5a7.5 7.5 0 0 0 10.65 10.65z"/>
            </svg>
          </div>
          <input
            ref={inputRef}
            type="text"
            value={query}
            placeholder="Ürün adı veya SKU ile ara..."
            className="w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
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
              className="absolute inset-y-0 right-2 flex items-center px-1 text-slate-300 hover:text-slate-500"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Dropdown list */}
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-lg border border-slate-200 bg-white shadow-lg">
          {/* Stats bar */}
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-1.5">
            <span className="text-[10px] text-slate-400">
              {filtered.length === products.length
                ? `${products.length} ürün`
                : `${filtered.length} / ${products.length} ürün`}
            </span>
            {query && filtered.length === 0 && (
              <span className="text-[10px] text-amber-600">Sonuç bulunamadı</span>
            )}
          </div>

          {/* Results */}
          <ul
            ref={listRef}
            className="max-h-64 overflow-y-auto py-1"
            role="listbox"
          >
            {filtered.length === 0 ? (
              <li className="px-3 py-4 text-center text-xs text-slate-400">
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
                      ? "bg-slate-900 text-white"
                      : "text-slate-800 hover:bg-slate-50"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {highlight(p.name, query)}
                    </p>
                    {p.sku && (
                      <p className={`font-mono text-[10px] ${i === cursor ? "text-slate-300" : "text-slate-400"}`}>
                        {highlight(p.sku, query)}
                      </p>
                    )}
                  </div>
                  {i === cursor && (
                    <svg className="h-4 w-4 flex-shrink-0 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                    </svg>
                  )}
                </li>
              ))
            )}
          </ul>

          {/* Footer hint */}
          <div className="border-t border-slate-100 px-3 py-1.5">
            <p className="text-[10px] text-slate-300">
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
          <label className="text-xs font-medium text-slate-600 block mb-1">Platform</label>
          <select
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-slate-400"
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
          <label className="text-xs font-medium text-slate-600 block mb-1">
            İç Ürün
            {!productId && (
              <span className="ml-1 text-slate-400 font-normal">(ad veya SKU ile ara)</span>
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
          <label className="text-xs font-medium text-slate-600 block mb-1">Platform Barkod</label>
          <input
            type="text"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
            placeholder="ör. 8681234567890"
            value={platformBarcode}
            onChange={(e) => setPlatformBarcode(e.target.value)}
          />
        </div>

        {/* Platform SKU */}
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Platform SKU</label>
          <input
            type="text"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
            placeholder="ör. TRN-00123"
            value={platformSku}
            onChange={(e) => setPlatformSku(e.target.value)}
          />
        </div>

        {/* Listeleme ID */}
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Listeleme ID</label>
          <input
            type="text"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
            placeholder="Platform listeleme ID'si"
            value={platformListingId}
            onChange={(e) => setPlatformListingId(e.target.value)}
          />
        </div>

        {/* Platform Başlığı */}
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">
            Platform Başlığı <span className="text-slate-400 font-normal">(isteğe bağlı)</span>
          </label>
          <input
            type="text"
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400"
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
          <span className={`text-xs font-medium ${result.ok ? "text-emerald-600" : "text-red-600"}`}>
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
        className="text-xs text-red-500 hover:text-red-700 underline"
        onClick={() => setConfirmed(true)}
      >
        Sil
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1 text-xs">
      <button
        className="text-red-600 font-semibold hover:text-red-800 underline"
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
      <span className="text-slate-400">|</span>
      <button className="text-slate-500 hover:text-slate-700" onClick={() => setConfirmed(false)}>
        İptal
      </button>
    </span>
  );
}

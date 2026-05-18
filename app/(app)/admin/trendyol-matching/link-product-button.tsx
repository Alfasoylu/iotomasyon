"use client";

/**
 * Phase 84 — LinkProductButton
 *
 * In-page modal button for the trendyol-matching table.
 * Opens a search dialog, lets the user find a product by name/SKU/barcode,
 * then links all unmatched TrendyolSalesRecord rows for this
 * (merchantSku, barcode) group to the selected product.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { searchProductsAction, type ProductSearchResult } from "@/lib/actions/product-search-action";
import { linkTrendyolGroupAction } from "@/lib/actions/trendyol-link-action";

interface Props {
  merchantSku: string;
  barcode: string;
  sampleName: string;
}

export function LinkProductButton({ merchantSku, barcode, sampleName }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [linking, setLinking] = useState<string | null>(null); // productId being linked
  const [linked, setLinked] = useState<{ name: string; count: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Pre-fill query with first word of merchantSku when opening
  function openModal() {
    const prefill = merchantSku.replace(/[^a-zA-Z0-9\s-]/g, " ").trim().split(/\s+/)[0] ?? "";
    setQuery(prefill);
    setResults([]);
    setLinked(null);
    setError(null);
    setOpen(true);
  }

  // Auto-search when query changes
  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await searchProductsAction(q);
      if (res.success) setResults(res.products);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    // Focus input
    setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => runSearch(query), 300);
    return () => clearTimeout(timer);
  }, [query, open, runSearch]);

  async function handleLink(product: ProductSearchResult) {
    if (linking) return;
    setLinking(product.id);
    setError(null);
    try {
      const res = await linkTrendyolGroupAction({
        merchantSku,
        barcode,
        productId: product.id,
      });
      if (res.success) {
        setLinked({ name: product.name, count: res.linked });
        // Reload after short delay
        setTimeout(() => window.location.reload(), 1800);
      } else {
        setError(res.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Hata oluştu");
    } finally {
      setLinking(null);
    }
  }

  if (!open) {
    return (
      <button
        onClick={openModal}
        className="text-xs text-indigo-600 hover:text-indigo-800 font-medium whitespace-nowrap transition-colors"
      >
        Bağla →
      </button>
    );
  }

  return (
    <>
      {/* Overlay */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Modal */}
      <div className="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-slate-400 uppercase tracking-widest mb-0.5">Eşleştirme</p>
            <p className="text-sm font-semibold text-slate-800 truncate">{sampleName || merchantSku}</p>
            <p className="text-xs text-slate-400 mt-0.5 font-mono">{merchantSku}</p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="text-slate-300 hover:text-slate-600 text-lg leading-none flex-shrink-0 mt-0.5"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          {linked ? (
            <div className="py-6 text-center space-y-2">
              <p className="text-emerald-600 font-semibold text-sm">
                ✓ {linked.count} kayıt bağlandı
              </p>
              <p className="text-xs text-slate-500 truncate max-w-xs mx-auto">{linked.name}</p>
              <p className="text-xs text-slate-400 italic">Sayfa yenileniyor…</p>
            </div>
          ) : (
            <>
              {/* Search input */}
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ürün adı, SKU veya barkod ile ara…"
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 placeholder:text-slate-300"
              />

              {/* Results */}
              {searching && (
                <p className="text-xs text-slate-400 text-center py-2">Aranıyor…</p>
              )}

              {!searching && results.length > 0 && (
                <div className="max-h-56 overflow-y-auto divide-y divide-slate-50 border border-slate-100 rounded-lg">
                  {results.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleLink(p)}
                      disabled={!!linking}
                      className={`w-full text-left px-3 py-2.5 hover:bg-indigo-50 transition-colors ${
                        linking === p.id ? "opacity-50 cursor-wait" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-slate-700 truncate">{p.name}</p>
                          <p className="text-xs text-slate-400 font-mono mt-0.5">
                            {p.sku ?? "—"}
                            {p.barcode ? ` · ${p.barcode}` : ""}
                          </p>
                        </div>
                        <span className="text-xs text-slate-300 flex-shrink-0 mt-0.5">
                          {p.stockQuantity} adet
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {!searching && query.trim().length >= 2 && results.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-3">
                  Sonuç bulunamadı.
                </p>
              )}

              {error && (
                <p className="text-xs text-red-500 text-center">{error}</p>
              )}

              <p className="text-xs text-slate-300 text-center pt-1">
                Seçilen ürün bu SKU/barkod grubundaki tüm eşleşmemiş satış kayıtlarına bağlanır.
              </p>
            </>
          )}
        </div>
      </div>
    </>
  );
}

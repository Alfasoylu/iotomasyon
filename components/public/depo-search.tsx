"use client";

/**
 * Public Depo Arama (autofocus + debounced fetch).
 *
 * Anonim erişimde iotomasyon.com kökünde gösterilir. Stok kodu / barkod /
 * ürün adı ile arama yapar; sonuç kartlarında foto + ad + SKU + barkod +
 * stok adeti döner. Finansal alanlar response'a bile gelmez (server-side
 * /api/public/lookup endpoint sadece public alanları select eder).
 */

import { useEffect, useRef, useState } from "react";

type ProductRow = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  stockQuantity: number;
  minimumStock: number;
  imageUrl: string | null;
};

export function DepoSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setIsLoading(false);
      setError(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/public/lookup?q=${encodeURIComponent(query.trim())}`,
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setResults(data.products ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Arama hatası");
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const trimmed = query.trim();

  return (
    <div className="space-y-6">
      {/* Search input */}
      <div className="relative">
        <input
          ref={inputRef}
          type="search"
          inputMode="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Stok kodu, barkod veya ürün adı yaz..."
          className="w-full rounded-2xl border border-slate-300 bg-white px-5 py-4 text-base text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 sm:text-lg"
        />
        {isLoading && (
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-400">
            Aranıyor…
          </span>
        )}
      </div>

      {/* Hint / Empty / Error / Results */}
      {trimmed.length < 2 && (
        <p className="rounded-xl bg-slate-100 px-4 py-3 text-center text-sm text-slate-500">
          Aramaya başla — en az 2 karakter.
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {trimmed.length >= 2 && !isLoading && !error && results.length === 0 && (
        <p className="rounded-xl bg-slate-100 px-4 py-3 text-center text-sm text-slate-500">
          &quot;{trimmed}&quot; için sonuç bulunamadı.
        </p>
      )}

      {results.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {results.map((p) => {
            const isCritical = p.stockQuantity <= 0;
            const isLow =
              p.minimumStock > 0 && p.stockQuantity <= p.minimumStock;
            const stockColor = isCritical
              ? "text-red-600"
              : isLow
                ? "text-amber-600"
                : "text-emerald-600";
            return (
              <li
                key={p.id}
                className={`flex gap-3 rounded-2xl border bg-white p-3 shadow-sm transition hover:border-slate-300 ${
                  isCritical
                    ? "border-red-200"
                    : isLow
                      ? "border-amber-200"
                      : "border-slate-200"
                }`}
              >
                {/* Image */}
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imageUrl}
                    alt={p.name}
                    loading="lazy"
                    className="h-24 w-24 flex-shrink-0 rounded-xl object-contain bg-slate-50"
                  />
                ) : (
                  <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 text-3xl">
                    📦
                  </div>
                )}

                {/* Info */}
                <div className="flex min-w-0 flex-1 flex-col justify-between">
                  <div>
                    <p className="line-clamp-2 text-sm font-semibold leading-tight text-slate-900">
                      {p.name}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-slate-500">
                      {p.sku}
                      {p.barcode ? ` · ${p.barcode}` : ""}
                    </p>
                  </div>
                  <p className={`text-right text-xl font-bold tabular-nums ${stockColor}`}>
                    {p.stockQuantity}
                    <span className="ml-1 text-[10px] font-medium text-slate-400">
                      adet
                    </span>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

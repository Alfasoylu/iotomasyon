"use client";

/**
 * Public Depo Arama (autofocus + debounced fetch + 📷 görsel arama).
 *
 * - Metin: stok kodu / barkod / ürün adı ile debounced search (250ms).
 * - 📷 Görsel: telefon kamerası veya dosya seç → CLIP embedding → en yakın 20.
 *
 * Anonim erişim. Finans alanları endpoint'lerde select edilmez.
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
  similarity?: number; // image search'ten dönerse 0..1
};

export function DepoSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductRow[]>([]);
  const [mode, setMode] = useState<"text" | "image">("text");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ── Text search (debounced) ────────────────────────────────────────────────
  useEffect(() => {
    if (mode !== "text") return;
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
  }, [query, mode]);

  // ── Image search trigger ───────────────────────────────────────────────────
  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Lütfen bir görsel dosyası seçin.");
      return;
    }
    setMode("image");
    setQuery("");
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setIsLoading(true);
    setError(null);
    setResults([]);

    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/public/image-search", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResults(data.products ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Görsel arama hatası");
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }

  function clearImage() {
    setImageFile(null);
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    setMode("text");
    setResults([]);
    setError(null);
    inputRef.current?.focus();
  }

  const trimmed = query.trim();

  return (
    <div className="space-y-6">
      {/* Hidden file input (camera/gallery) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = ""; // reset so same file can be re-picked
        }}
      />

      {/* Search bar + camera */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (mode === "image") clearImage();
            }}
            placeholder="Stok kodu, barkod veya ürün adı yaz..."
            disabled={mode === "image"}
            className="w-full rounded-2xl border border-slate-300 bg-white px-5 py-4 text-base text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100 disabled:text-slate-400 sm:text-lg"
          />
          {isLoading && mode === "text" && (
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-400">
              Aranıyor…
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex shrink-0 items-center justify-center gap-2 rounded-2xl border border-slate-300 bg-white px-5 py-4 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-500 hover:bg-slate-50 sm:px-4"
        >
          <span className="text-xl leading-none">📷</span>
          <span className="sm:hidden">Görselle ara</span>
        </button>
      </div>

      {/* Image preview banner */}
      {mode === "image" && imagePreview && (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imagePreview}
            alt="Aranan görsel"
            className="h-16 w-16 rounded-lg object-cover"
          />
          <div className="flex-1 text-xs text-slate-600">
            <p className="font-medium text-slate-800">
              {isLoading ? "Görsel ile aranıyor…" : "Görsel sonuçları"}
            </p>
            {isLoading && (
              <p className="mt-0.5 text-amber-700">
                İlk arama 20-30 saniye sürebilir (model uyanıyor).
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={clearImage}
            className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            ✕ Kaldır
          </button>
        </div>
      )}

      {/* Hint / Empty / Error */}
      {mode === "text" && trimmed.length < 2 && !error && (
        <p className="rounded-xl bg-slate-100 px-4 py-3 text-center text-sm text-slate-500">
          Aramaya başla — en az 2 karakter veya 📷 ile görsel yükle.
        </p>
      )}

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {mode === "text" &&
        trimmed.length >= 2 &&
        !isLoading &&
        !error &&
        results.length === 0 && (
          <p className="rounded-xl bg-slate-100 px-4 py-3 text-center text-sm text-slate-500">
            &quot;{trimmed}&quot; için sonuç bulunamadı.
          </p>
        )}

      {mode === "image" &&
        !isLoading &&
        !error &&
        results.length === 0 &&
        imageFile && (
          <p className="rounded-xl bg-slate-100 px-4 py-3 text-center text-sm text-slate-500">
            Bu görsele benzer ürün bulunamadı.
          </p>
        )}

      {/* Results grid */}
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
                className={`relative flex gap-3 rounded-2xl border bg-white p-3 shadow-sm transition hover:border-slate-300 ${
                  isCritical
                    ? "border-red-200"
                    : isLow
                      ? "border-amber-200"
                      : "border-slate-200"
                }`}
              >
                {/* Similarity badge */}
                {p.similarity != null && (
                  <span className="absolute right-2 top-2 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                    %{Math.round(p.similarity * 100)}
                  </span>
                )}

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

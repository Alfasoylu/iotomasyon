"use client";

/**
 * Phase 27 — Product Media and Content Studio
 *
 * ProductImageManager: client component for multi-image management.
 * - Displays all ProductImage entries for a product
 * - Add by URL (clear input after enter)
 * - Upload local file to Supabase Storage
 * - Delete individual images
 * - Set primary (sortOrder 0)
 */

import { startTransition, useRef, useState } from "react";
import {
  addProductImageByUrlAction,
  deleteProductImageAction,
  setPrimaryImageAction,
  uploadProductImageAction,
} from "@/lib/actions/product-image-actions";

type ImageEntry = {
  id: string;
  url: string;
  sortOrder: number;
  source: string;
  altText: string | null;
};

type Props = {
  productId: string;
  initialImages: ImageEntry[];
  canUpload: boolean; // true when SUPABASE_URL is configured
};

export function ProductImageManager({ productId, initialImages, canUpload }: Props) {
  const [images, setImages] = useState<ImageEntry[]>(
    [...initialImages].sort((a, b) => a.sortOrder - b.sortOrder),
  );
  const [urlInput, setUrlInput] = useState("");
  const [status, setStatus] = useState<{ type: "idle" | "loading" | "success" | "error"; message?: string }>({ type: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);

  function applyResult(result: { ok: boolean; message?: string; error?: string }) {
    if (result.ok) {
      setStatus({ type: "success", message: result.message });
      setTimeout(() => setStatus({ type: "idle" }), 3000);
    } else {
      setStatus({ type: "error", message: result.error });
    }
  }

  function handleAddByUrl() {
    const url = urlInput.trim();
    if (!url) return;
    setStatus({ type: "loading" });
    startTransition(async () => {
      const result = await addProductImageByUrlAction(productId, url);
      if (result.ok) {
        // Optimistic update
        setImages((prev) => [
          ...prev,
          {
            id: `temp-${Date.now()}`,
            url,
            sortOrder: prev.length,
            source: "MANUAL",
            altText: null,
          },
        ]);
        setUrlInput("");
      }
      applyResult(result);
    });
  }

  function handleDelete(imageId: string) {
    setStatus({ type: "loading" });
    startTransition(async () => {
      const result = await deleteProductImageAction(imageId, productId);
      if (result.ok) {
        setImages((prev) => {
          const filtered = prev.filter((img) => img.id !== imageId);
          return filtered.map((img, i) => ({ ...img, sortOrder: i }));
        });
      }
      applyResult(result);
    });
  }

  function handleSetPrimary(imageId: string) {
    setStatus({ type: "loading" });
    startTransition(async () => {
      const result = await setPrimaryImageAction(imageId, productId);
      if (result.ok) {
        setImages((prev) => {
          const target = prev.find((img) => img.id === imageId);
          if (!target) return prev;
          const rest = prev.filter((img) => img.id !== imageId);
          return [{ ...target, sortOrder: 0 }, ...rest.map((img, i) => ({ ...img, sortOrder: i + 1 }))];
        });
      }
      applyResult(result);
    });
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    setStatus({ type: "loading" });
    startTransition(async () => {
      const result = await uploadProductImageAction(productId, fd);
      if (result.ok && "url" in result && result.url) {
        setImages((prev) => [
          ...prev,
          {
            id: `temp-${Date.now()}`,
            url: result.url!,
            sortOrder: prev.length,
            source: "MANUAL",
            altText: null,
          },
        ]);
      }
      if (fileRef.current) fileRef.current.value = "";
      applyResult(result);
    });
  }

  const primary = images.find((img) => img.sortOrder === 0);
  const secondary = images.filter((img) => img.sortOrder > 0);

  return (
    <div className="space-y-6">
      {/* Current images grid */}
      {images.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-8 text-center text-sm text-slate-500">
          Henüz görsel eklenmemiş. Aşağıdan URL girerek veya dosya yükleyerek görsel ekleyin.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {/* Primary image */}
          {primary && (
            <ImageCard
              image={primary}
              isPrimary
              onDelete={() => handleDelete(primary.id)}
              onSetPrimary={() => {}} // already primary
            />
          )}
          {/* Secondary images */}
          {secondary.map((img) => (
            <ImageCard
              key={img.id}
              image={img}
              isPrimary={false}
              onDelete={() => handleDelete(img.id)}
              onSetPrimary={() => handleSetPrimary(img.id)}
            />
          ))}
        </div>
      )}

      {/* Status feedback */}
      {status.type === "loading" && (
        <p className="text-sm text-slate-500">İşleniyor…</p>
      )}
      {status.type === "success" && (
        <p className="text-sm text-emerald-600">✓ {status.message}</p>
      )}
      {status.type === "error" && (
        <p className="text-sm text-red-600">✗ {status.message}</p>
      )}

      {/* Add by URL */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
          URL ile görsel ekle
        </p>
        <div className="flex gap-2">
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddByUrl();
              }
            }}
            placeholder="https://example.com/gorsel.jpg"
            className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100"
            disabled={status.type === "loading"}
          />
          <button
            type="button"
            onClick={handleAddByUrl}
            disabled={!urlInput.trim() || status.type === "loading"}
            className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-40"
          >
            Ekle
          </button>
        </div>
        <p className="text-xs text-slate-400">Enter tuşuna basarak veya "Ekle" butonuyla birden fazla URL ekleyebilirsiniz.</p>
      </div>

      {/* Local file upload */}
      {canUpload && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Bilgisayardan yükle
          </p>
          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-600 transition hover:border-slate-400 hover:bg-white">
            <span>📁</span>
            <span>Dosya seçin — JPEG, PNG, WebP, GIF · maks. 5 MB</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              onChange={handleFileUpload}
              disabled={status.type === "loading"}
            />
          </label>
        </div>
      )}

      {!canUpload && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Dosya yükleme için <code className="font-mono text-xs">SUPABASE_URL</code> ve{" "}
          <code className="font-mono text-xs">SUPABASE_SERVICE_ROLE_KEY</code> ortam değişkenleri gereklidir.
          Şu an sadece URL ile görsel ekleyebilirsiniz.
        </p>
      )}
    </div>
  );
}

// ── ImageCard ─────────────────────────────────────────────────────────────────

function ImageCard({
  image,
  isPrimary,
  onDelete,
  onSetPrimary,
}: {
  image: ImageEntry;
  isPrimary: boolean;
  onDelete: () => void;
  onSetPrimary: () => void;
}) {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-white shadow-sm transition ${
        isPrimary ? "border-slate-900 ring-2 ring-slate-900" : "border-slate-200"
      }`}
    >
      {/* Image */}
      <div className="relative aspect-square w-full bg-slate-100">
        {!imgError ? (
          <img
            src={image.url}
            alt={image.altText ?? "Ürün görseli"}
            className="h-full w-full object-contain"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-3xl text-slate-300">
            📦
          </div>
        )}
        {/* Source badge */}
        <span
          className={`absolute left-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
            image.source === "MANUAL"
              ? "bg-emerald-100 text-emerald-700"
              : "bg-blue-100 text-blue-700"
          }`}
        >
          {image.source === "MANUAL" ? "Manuel" : "XML"}
        </span>
        {/* Primary badge */}
        {isPrimary && (
          <span className="absolute right-1 top-1 rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            Birincil
          </span>
        )}
      </div>

      {/* URL (truncated) */}
      <div className="truncate border-t border-slate-100 px-2 py-1 text-[10px] text-slate-400">
        {image.url}
      </div>

      {/* Actions */}
      <div className="flex gap-1 border-t border-slate-100 p-2">
        {!isPrimary && (
          <button
            type="button"
            onClick={onSetPrimary}
            className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Birincil yap
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="flex-1 rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50"
        >
          Sil
        </button>
      </div>
    </div>
  );
}

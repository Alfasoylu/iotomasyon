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
import { Folder, Package, Check, X } from "lucide-react";
import {
  addProductImageByUrlAction,
  deleteProductImageAction,
  setPrimaryImageAction,
  uploadProductImageAction,
} from "@/lib/actions/product-image-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
        <div className="rounded-lg border border-dashed border-[var(--border-default)] bg-[var(--surface-1)] px-6 py-8 text-center text-sm text-[var(--text-secondary)]">
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
        <p className="text-sm text-[var(--text-secondary)]">İşleniyor…</p>
      )}
      {status.type === "success" && (
        <p className="inline-flex items-center gap-1 text-sm text-[var(--ok)]">
          <Check size={14} strokeWidth={1.5} /> {status.message}
        </p>
      )}
      {status.type === "error" && (
        <p className="inline-flex items-center gap-1 text-sm text-[var(--danger)]">
          <X size={14} strokeWidth={1.5} /> {status.message}
        </p>
      )}

      {/* Add by URL */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
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
            className="h-10 flex-1 rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-[var(--accent-border)]"
            disabled={status.type === "loading"}
          />
          <Button
            onClick={handleAddByUrl}
            disabled={!urlInput.trim() || status.type === "loading"}
          >
            Ekle
          </Button>
        </div>
        <p className="text-xs text-[var(--text-muted)]">
          Enter tuşuna basarak veya &quot;Ekle&quot; butonuyla birden fazla URL ekleyebilirsiniz.
        </p>
      </div>

      {/* Local file upload */}
      {canUpload && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            Bilgisayardan yükle
          </p>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-[var(--border-default)] bg-[var(--surface-1)] px-4 py-3 text-sm text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-3)]">
            <Folder size={14} strokeWidth={1.5} />
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
        <p className="rounded-lg border border-[var(--warn-border)] bg-[var(--warn-dim)] px-4 py-3 text-sm text-[var(--warn)]">
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
      className={`relative overflow-hidden rounded-lg border bg-[var(--surface-2)] transition ${
        isPrimary
          ? "border-[var(--accent-border)] ring-1 ring-[var(--accent-border)]"
          : "border-[var(--border-default)]"
      }`}
    >
      {/* Image */}
      <div className="relative aspect-square w-full bg-[var(--surface-1)]">
        {!imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.url}
            alt={image.altText ?? "Ürün görseli"}
            className="h-full w-full object-contain"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[var(--text-muted)]">
            <Package size={28} strokeWidth={1.5} />
          </div>
        )}
        {/* Source badge */}
        <span className="absolute left-1 top-1">
          <Badge variant={image.source === "MANUAL" ? "ok" : "info"}>
            {image.source === "MANUAL" ? "Manuel" : "XML"}
          </Badge>
        </span>
        {/* Primary badge */}
        {isPrimary && (
          <span className="absolute right-1 top-1">
            <Badge variant="accent">Birincil</Badge>
          </span>
        )}
      </div>

      {/* URL (truncated) */}
      <div className="truncate border-t border-[var(--border-subtle)] px-2 py-1 font-mono text-[10px] text-[var(--text-muted)]">
        {image.url}
      </div>

      {/* Actions */}
      <div className="flex gap-1 border-t border-[var(--border-subtle)] p-2">
        {!isPrimary && (
          <button
            type="button"
            onClick={onSetPrimary}
            className="flex-1 rounded-md border border-[var(--border-default)] px-2 py-1 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            Birincil yap
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="flex-1 rounded-md border border-[var(--danger-border)] px-2 py-1 text-xs font-medium text-[var(--danger)] transition hover:bg-[var(--danger-dim)]"
        >
          Sil
        </button>
      </div>
    </div>
  );
}

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useTransition } from "react";
import { ArrowLeft, Check } from "lucide-react";

import { createInventoryCountAction } from "@/lib/actions/inventory-count-actions";

function CountForm() {
  const router = useRouter();
  const params = useSearchParams();

  const productId = params.get("productId") ?? "";
  const productName = params.get("productName") ?? "";
  const sku = params.get("sku") ?? "";

  const [count, setCount] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const qty = parseInt(count, 10);
    if (isNaN(qty) || qty < 0) {
      setError("Geçerli bir adet girin (0 veya daha fazla).");
      return;
    }

    if (!productId) {
      setError("Ürün seçilmedi. Depo arama sayfasından tekrar deneyin.");
      return;
    }

    startTransition(async () => {
      const result = await createInventoryCountAction({
        productId,
        newQuantity: qty,
        notes: notes.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.message ?? "Bir hata oluştu.");
      } else {
        setSuccess(true);
        setTimeout(() => router.push("/warehouse"), 1800);
      }
    });
  }

  if (success) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[var(--ok-border)] bg-[var(--ok-dim)]">
          <Check size={32} strokeWidth={1.5} className="text-[var(--ok)]" />
        </div>
        <p className="text-lg font-semibold text-[var(--ok)]">
          Fiziksel sayım kaydedildi
        </p>
        <p className="text-sm text-[var(--text-muted)]">Depo sayfasına dönülüyor…</p>
      </div>
    );
  }

  const inputCls =
    "w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-4 py-4 text-center text-3xl font-bold tabular-nums text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-border)]";
  const textareaCls =
    "w-full resize-none rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--accent-border)]";

  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-6">
      <div>
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-4 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
          Geri
        </button>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
          Fiziksel Sayım
        </h1>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Bu sayım Entegra stoğunu değiştirmez. Yalnızca fiziksel sayım kaydı ve
          Entegra ile fark raporlamak için saklanır.
        </p>
      </div>

      {productId ? (
        <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] p-4">
          <p className="font-semibold text-[var(--text-primary)]">{productName}</p>
          <p className="mt-0.5 font-mono text-sm tabular-nums text-[var(--text-muted)]">SKU: {sku}</p>
        </div>
      ) : (
        <div className="rounded-md border border-[var(--warn-border)] bg-[var(--warn-dim)] p-4 text-sm text-[var(--warn)]">
          Ürün seçilmedi.{" "}
          <a href="/warehouse" className="underline">
            Depo sayfasına dön
          </a>
          .
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            Sayılan Adet
          </label>
          <input
            type="number"
            min="0"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            placeholder="0"
            autoFocus
            required
            className={inputCls}
          />
        </div>

        <div>
          <label className="mb-2 block text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            Not (isteğe bağlı)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Sayım notu..."
            className={textareaCls}
          />
        </div>

        {error && (
          <p className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-dim)] px-4 py-3 text-sm text-[var(--danger)]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending || !productId || !count}
          className="w-full rounded-md bg-[var(--accent)] px-6 py-4 text-base font-semibold text-[var(--accent-fg)] transition hover:brightness-110 disabled:opacity-50"
        >
          {isPending ? "Kaydediliyor…" : "Fiziksel Sayımı Kaydet"}
        </button>
      </form>
    </div>
  );
}

export default function WarehouseCountPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-[var(--text-muted)]">Yükleniyor…</div>}>
      <CountForm />
    </Suspense>
  );
}

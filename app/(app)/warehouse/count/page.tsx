"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useTransition } from "react";

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
        <div className="text-5xl">✅</div>
        <p className="text-lg font-semibold text-emerald-700">
          Stok sayımı kaydedildi!
        </p>
        <p className="text-sm text-slate-500">Depo sayfasına dönülüyor…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-6">
      <div>
        <button
          type="button"
          onClick={() => router.back()}
          className="mb-4 text-sm text-slate-500 hover:text-slate-800"
        >
          ← Geri
        </button>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Stok Sayımı
        </h1>
      </div>

      {productId ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="font-semibold text-slate-900">{productName}</p>
          <p className="mt-0.5 text-sm text-slate-500">SKU: {sku}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Ürün seçilmedi.{" "}
          <a href="/warehouse" className="underline">
            Depo sayfasına dön
          </a>
          .
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">
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
            className="w-full rounded-xl border border-slate-300 px-4 py-4 text-center text-3xl font-bold focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-semibold text-slate-700">
            Not (isteğe bağlı)
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Sayım notu..."
            className="w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
        </div>

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending || !productId || !count}
          className="w-full rounded-xl bg-slate-900 px-6 py-4 text-base font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {isPending ? "Kaydediliyor…" : "Sayımı Kaydet"}
        </button>
      </form>
    </div>
  );
}

export default function WarehouseCountPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400">Yükleniyor…</div>}>
      <CountForm />
    </Suspense>
  );
}

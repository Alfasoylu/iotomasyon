"use client";

import { useState, useTransition } from "react";
import { Check, Heart } from "lucide-react";

export function CatalogInterestButton({
  shareToken,
  productId,
  productName,
}: {
  shareToken: string;
  productId: string;
  productName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function click() {
    if (done || pending) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/c/${shareToken}/interest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId, action: "INTERESTED" }),
        });
        if (!res.ok) {
          setError("Kaydedilemedi");
          return;
        }
        setDone(true);
      } catch {
        setError("Bağlantı hatası");
      }
    });
  }

  if (done) {
    return (
      <button
        type="button"
        disabled
        className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200"
      >
        <Check className="h-3.5 w-3.5" />
        Bilgilendirildi · Sizi arayacağız
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={click}
      disabled={pending}
      title={`${productName} için ilgi bildir`}
      className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-orange-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-orange-600 disabled:opacity-60"
    >
      <Heart className="h-3.5 w-3.5" />
      {pending ? "Bildiriliyor…" : "İlgilendim"}
      {error && <span className="ml-2 text-red-200">({error})</span>}
    </button>
  );
}

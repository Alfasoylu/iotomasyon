"use client";

/**
 * Phase 28 — Product Governance and Private Intelligence
 *
 * PrivateNoteEditor: Owner-only private note field.
 * Renders only when canView=true (EXECUTIVE_READ permission).
 * Saves via updatePrivateNoteAction — a separate action from the main product
 * update so that non-owners cannot accidentally overwrite this field.
 */

import { useState, useTransition } from "react";
import { updatePrivateNoteAction } from "@/lib/actions/product-actions";

type Props = {
  productId: string;
  initialNote: string | null;
};

export function PrivateNoteEditor({ productId, initialNote }: Props) {
  const [note, setNote] = useState(initialNote ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updatePrivateNoteAction(productId, note);
      if (result.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(result.message ?? "Bir hata oluştu.");
      }
    });
  }

  return (
    <div className="space-y-3">
      {/* Header badge */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
          🔒 Sadece sahip görebilir
        </span>
        <span className="text-xs text-slate-500">
          Bu not diğer kullanıcılara görünmez.
        </span>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Tedarikçi bilgisi, fiyat müzakeresi, ithalat notu, özel satın alma stratejisi…"
        rows={5}
        maxLength={5000}
        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-700 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100 resize-none"
      />

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{note.length} / 5000</span>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-xs font-medium text-emerald-600">✓ Kaydedildi</span>
          )}
          {error && (
            <span className="text-xs font-medium text-red-600">{error}</span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-50 transition"
          >
            {isPending ? "Kaydediliyor…" : "Notu kaydet"}
          </button>
        </div>
      </div>
    </div>
  );
}

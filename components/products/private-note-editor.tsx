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
import { Lock, Check } from "lucide-react";
import { updatePrivateNoteAction } from "@/lib/actions/product-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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
        <Badge variant="warn" className="gap-1">
          <Lock size={14} strokeWidth={1.5} />
          Sadece sahip görebilir
        </Badge>
        <span className="text-xs text-[var(--text-muted)]">
          Bu not diğer kullanıcılara görünmez.
        </span>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Tedarikçi bilgisi, fiyat müzakeresi, ithalat notu, özel satın alma stratejisi…"
        rows={5}
        maxLength={5000}
        className="w-full resize-none rounded-lg border border-[var(--border-default)] bg-[var(--surface-3)] px-4 py-3 text-sm leading-7 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--accent-border)]"
      />

      <div className="flex items-center justify-between">
        <span className="font-mono text-xs tabular-nums text-[var(--text-muted)]">
          {note.length} / 5000
        </span>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--ok)]">
              <Check size={14} strokeWidth={1.5} /> Kaydedildi
            </span>
          )}
          {error && (
            <span className="text-xs font-medium text-[var(--danger)]">{error}</span>
          )}
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Kaydediliyor…" : "Notu kaydet"}
          </Button>
        </div>
      </div>
    </div>
  );
}

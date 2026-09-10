"use client";

/**
 * Ödeme takvimi satır aksiyonu — tek dokunuşla "gerçekleşti".
 * Onay istemez ama geri alınabilir; ikisi de deftere yazılır.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Undo2 } from "lucide-react";
import {
  markMovementSettledAction,
  undoMovementSettledAction,
} from "@/lib/actions/cfo-payment-actions";

const btn =
  "inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--border-default)] " +
  "px-2 py-1 text-[11px] text-[var(--text-secondary)] transition " +
  "hover:border-[var(--accent-border)] hover:text-[var(--accent)] disabled:opacity-50";

export function SettleButton({
  id,
  tur,
  aciklama,
  giris,
}: {
  id: string;
  tur: string;
  aciklama: string;
  giris: boolean;
}) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(geri: boolean) {
    start(async () => {
      const r = geri
        ? await undoMovementSettledAction(id, tur, aciklama)
        : await markMovementSettledAction(id, tur, aciklama);
      setMsg(r.ok ? null : (r.message ?? "Hata"));
      if (r.ok) {
        setDone(!geri);
        router.refresh();
      }
    });
  }

  if (done) {
    return (
      <button className={btn} disabled={pending} onClick={() => run(true)}>
        <Undo2 size={11} /> Geri al
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <button className={btn} disabled={pending} onClick={() => run(false)}>
        <Check size={11} /> {giris ? "Tahsil edildi" : "Ödendi"}
      </button>
      {msg && <span className="text-[11px] text-[var(--danger)]">{msg}</span>}
    </div>
  );
}

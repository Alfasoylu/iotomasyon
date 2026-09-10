"use client";

/**
 * Ödeme takvimi satır aksiyonu — tek dokunuşla "gerçekleşti", geri alınabilir.
 *
 * İşaretleme yürüyen bakiyeyi DEĞİŞTİRMEZ; sadece "bu hareket oldu" kaydıdır.
 * Bakiye yalnız gerçek banka bakiyesi güncellenince değişir. (Önceden işaretlenen
 * satır projeksiyondan siliniyordu ve para ortadan kayboluyordu.)
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
  islendi,
}: {
  id: string;
  tur: string;
  aciklama: string;
  giris: boolean;
  islendi: boolean;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function run(geri: boolean) {
    start(async () => {
      const r = geri
        ? await undoMovementSettledAction(id, tur, aciklama)
        : await markMovementSettledAction(id, tur, aciklama);
      setMsg(r.ok ? null : (r.message ?? "Hata"));
      if (r.ok) router.refresh();
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {islendi ? (
        <button className={btn} disabled={pending} onClick={() => run(true)}>
          <Undo2 size={11} /> Geri al
        </button>
      ) : (
        <button className={btn} disabled={pending} onClick={() => run(false)}>
          <Check size={11} /> {giris ? "Tahsil edildi" : "Ödendi"}
        </button>
      )}
      {msg && <span className="text-[11px] text-[var(--danger)]">{msg}</span>}
    </div>
  );
}

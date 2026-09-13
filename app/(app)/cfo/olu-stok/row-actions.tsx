"use client";

/**
 * Ölü stok satır aksiyonları. Üç buton, üçü de tek satır not alır ve deftere yazar.
 * Buton basıldıktan sonra listenin yeniden yüklenmesi için router.refresh().
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Wrench, X } from "lucide-react";
import {
  markCheckedAction,
  markActionTakenAction,
  closeFindingAction,
} from "@/lib/actions/cfo-dead-stock-actions";

type Mode = "kontrol" | "aksiyon" | "kapat";

const LABEL: Record<Mode, string> = {
  kontrol: "Kontrol ettim",
  aksiyon: "Aksiyon aldım",
  kapat: "Kapat",
};

const PLACEHOLDER: Record<Mode, string> = {
  kontrol: "İsteğe bağlı not — ne gördün?",
  aksiyon: "Ne yaptın? (fiyat indirimi, kampanya, ilan düzeltme, tasfiye…)",
  kapat: "İsteğe bağlı — nasıl kapandı?",
};

const btn =
  "inline-flex items-center gap-1 rounded-md border border-[var(--border-default)] px-2 py-1 " +
  "text-[11px] text-[var(--text-secondary)] transition hover:border-[var(--accent-border)] " +
  "hover:text-[var(--accent)] disabled:opacity-50";

export function RowActions({ id, tiedTry }: { id: string; tiedTry: number | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [note, setNote] = useState("");
  const [released, setReleased] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function run(m: Mode) {
    start(async () => {
      const r =
        m === "kontrol"
          ? await markCheckedAction(id, note)
          : m === "aksiyon"
            ? await markActionTakenAction(id, note)
            : await closeFindingAction(
                id,
                released.trim() === "" ? null : Number(released.replace(",", ".")),
                note,
              );
      setMsg({ ok: r.ok, text: r.message ?? (r.ok ? "Tamam" : "Hata") });
      if (r.ok) {
        setMode(null);
        setNote("");
        setReleased("");
        router.refresh();
      }
    });
  }

  if (!mode) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <button className={btn} onClick={() => { setMode("kontrol"); setMsg(null); }}>
          <Check size={11} /> {LABEL.kontrol}
        </button>
        <button className={btn} onClick={() => { setMode("aksiyon"); setMsg(null); }}>
          <Wrench size={11} /> {LABEL.aksiyon}
        </button>
        <button className={btn} onClick={() => { setMode("kapat"); setMsg(null); }}>
          <X size={11} /> {LABEL.kapat}
        </button>
        {msg && (
          <span className={`text-[11px] ${msg.ok ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}>
            {msg.text}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium text-[var(--text-primary)]">{LABEL[mode]}</p>
      <textarea
        className="w-full min-w-[220px] rounded-md border border-[var(--border-default)] bg-[var(--surface-0)] px-2 py-1.5 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-border)]"
        rows={2}
        placeholder={PLACEHOLDER[mode]}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {mode === "kapat" && (
        <input
          className="w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-0)] px-2 py-1 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--accent-border)]"
          placeholder={
            tiedTry != null
              ? `Serbest kalan ₺ — boş bırakırsan ${Math.round(tiedTry).toLocaleString("tr-TR")} sayılır`
              : "Serbest kalan ₺"
          }
          value={released}
          onChange={(e) => setReleased(e.target.value)}
          inputMode="decimal"
        />
      )}
      <div className="flex items-center gap-2">
        <button
          className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-[11px] font-medium text-[var(--accent-fg)] disabled:opacity-50"
          disabled={pending}
          onClick={() => run(mode)}
        >
          {pending ? "Kaydediliyor…" : "Kaydet"}
        </button>
        <button className="text-[11px] text-[var(--text-muted)]" onClick={() => setMode(null)}>
          Vazgeç
        </button>
        {msg && !msg.ok && <span className="text-[11px] text-[var(--danger)]">{msg.text}</span>}
      </div>
    </div>
  );
}

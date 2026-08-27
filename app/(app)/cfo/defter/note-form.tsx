"use client";

/**
 * Not Defteri istemci bileşenleri: yeni not formu, düzenleme formu ve
 * sabitle/arşivle butonları.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pin, PinOff, Archive, ArchiveRestore } from "lucide-react";
import {
  createNoteAction,
  updateNoteAction,
  archiveNoteAction,
  pinNoteAction,
} from "@/lib/actions/cfo-note-actions";
import { NOTE_CATEGORIES, NOTE_TAGS, NOTE_TAG_TR, CATEGORY_TR } from "@/lib/cfo/questions";

const input =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-0)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
const btn =
  "rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-fg)] disabled:opacity-50";

type Fields = {
  title: string;
  body: string;
  category: string;
  dataTag: string;
  source: string;
  pinned: boolean;
};

function Fieldset({
  v,
  set,
}: {
  v: Fields;
  set: (f: Partial<Fields>) => void;
}) {
  return (
    <>
      <input
        className={input}
        placeholder="Başlık — örn. Ziraat kart aylık faiz oranı"
        value={v.title}
        onChange={(e) => set({ title: e.target.value })}
      />
      <textarea
        className={`${input} min-h-[90px]`}
        placeholder="Bilginin kendisi + nereden geldiği. Rakam varsa hesabını da yaz."
        value={v.body}
        onChange={(e) => set({ body: e.target.value })}
      />
      <div className="flex flex-wrap gap-2">
        <select className={`${input} w-auto`} value={v.category} onChange={(e) => set({ category: e.target.value })}>
          {NOTE_CATEGORIES.map((c) => (
            <option key={c} value={c}>{CATEGORY_TR[c] ?? c}</option>
          ))}
        </select>
        <select className={`${input} w-auto`} value={v.dataTag} onChange={(e) => set({ dataTag: e.target.value })}>
          {NOTE_TAGS.map((t) => (
            <option key={t} value={t}>{NOTE_TAG_TR[t] ?? t}</option>
          ))}
        </select>
        <input
          className={`${input} w-auto flex-1`}
          placeholder="Kaynak — ekran, fatura, hesap hareketi…"
          value={v.source}
          onChange={(e) => set({ source: e.target.value })}
        />
        <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <input type="checkbox" checked={v.pinned} onChange={(e) => set({ pinned: e.target.checked })} />
          Üste sabitle
        </label>
      </div>
    </>
  );
}

const EMPTY: Fields = { title: "", body: "", category: "diger", dataTag: "KESIN", source: "", pinned: false };

export function NewNoteForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<Fields>(EMPTY);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button className={btn} onClick={() => setOpen(true)}>+ Yeni not</button>
    );
  }

  return (
    <div className="space-y-3">
      <Fieldset v={v} set={(f) => setV({ ...v, ...f })} />
      <div className="flex items-center gap-2">
        <button
          className={btn}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await createNoteAction(v);
              setMsg({ ok: r.ok, text: r.message ?? (r.ok ? "Eklendi" : "Hata") });
              if (r.ok) {
                setV(EMPTY);
                setOpen(false);
                router.refresh();
              }
            })
          }
        >
          {pending ? "Kaydediliyor…" : "Kaydet"}
        </button>
        <button className="text-xs text-[var(--text-muted)]" onClick={() => setOpen(false)}>
          Vazgeç
        </button>
        {msg && (
          <span className={`text-xs ${msg.ok ? "text-emerald-500" : "text-red-500"}`}>{msg.text}</span>
        )}
      </div>
    </div>
  );
}

export function EditNoteForm({
  id,
  initial,
}: {
  id: string;
  initial: Fields;
}) {
  const router = useRouter();
  const [v, setV] = useState<Fields>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="mt-2 space-y-3">
      <Fieldset v={v} set={(f) => setV({ ...v, ...f })} />
      <div className="flex items-center gap-2">
        <button
          className={btn}
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await updateNoteAction(id, v);
              setMsg({ ok: r.ok, text: r.message ?? (r.ok ? "Güncellendi" : "Hata") });
              if (r.ok) router.refresh();
            })
          }
        >
          {pending ? "Kaydediliyor…" : "Güncelle"}
        </button>
        {msg && (
          <span className={`text-xs ${msg.ok ? "text-emerald-500" : "text-red-500"}`}>{msg.text}</span>
        )}
      </div>
    </div>
  );
}

export function PinButton({ id, pinned }: { id: string; pinned: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const Icon = pinned ? PinOff : Pin;
  return (
    <button
      title={pinned ? "Sabitlemeyi kaldır" : "Üste sabitle"}
      disabled={pending}
      className="text-[var(--text-muted)] hover:text-[var(--accent)] disabled:opacity-50"
      onClick={() => start(async () => { await pinNoteAction(id, !pinned); router.refresh(); })}
    >
      <Icon size={14} />
    </button>
  );
}

export function ArchiveButton({ id, archived }: { id: string; archived: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const Icon = archived ? ArchiveRestore : Archive;
  return (
    <button
      title={archived ? "Arşivden çıkar" : "Arşivle (silinmez)"}
      disabled={pending}
      className="text-[var(--text-muted)] hover:text-[var(--accent)] disabled:opacity-50"
      onClick={() => start(async () => { await archiveNoteAction(id, !archived); router.refresh(); })}
    >
      <Icon size={14} />
    </button>
  );
}

"use client";

/**
 * CFO Sorular — cevap formu.
 * Metin + dosya birlikte gönderilir. Dosya Supabase Storage'a yüklenir,
 * kayıt CfoQuestionFile'a düşer. Cevap yazılmadan dosya da eklenebilir.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Send, Check, X } from "lucide-react";
import { answerQuestionAction, markQuestionProcessedAction, cancelQuestionAction } from "@/lib/actions/cfo-question-actions";

export function AnswerForm({ questionId, existingAnswer }: { questionId: string; existingAnswer?: string | null }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    fd.set("questionId", questionId);
    start(async () => {
      const r = await answerQuestionAction(fd);
      setMsg({ ok: r.ok, text: r.message ?? (r.ok ? "Kaydedildi" : "Hata") });
      if (r.ok) {
        formRef.current?.reset();
        setFileNames([]);
        router.refresh();
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={submit} className="mt-3 space-y-2">
      <textarea
        name="answer"
        rows={3}
        defaultValue={existingAnswer ?? ""}
        placeholder="Cevabını buraya yaz… (sadece dosya de ekleyebilirsin)"
        className="w-full rounded-md border border-[var(--border)] bg-[var(--surface-1)] p-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[var(--accent)]">
          <Paperclip size={13} />
          Dosya ekle
          <input
            type="file"
            name="files"
            multiple
            className="hidden"
            onChange={(e) => setFileNames(Array.from(e.target.files ?? []).map((f) => f.name))}
          />
        </label>
        {fileNames.map((n) => (
          <span key={n} className="rounded bg-[var(--surface-2)] px-2 py-1 text-xs text-[var(--text-muted)]">{n}</span>
        ))}
        <button
          type="submit"
          disabled={pending}
          className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          <Send size={13} />
          {pending ? "Kaydediliyor…" : "Cevabı kaydet"}
        </button>
      </div>
      {msg && (
        <p className={`text-xs ${msg.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{msg.text}</p>
      )}
      <p className="text-[11px] text-[var(--text-muted)]">Dosya başına en fazla 10 MB. Ekran görüntüsü, ekstre, Excel — hepsi olur.</p>
    </form>
  );
}

export function ProcessedButton({ questionId }: { questionId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(async () => { await markQuestionProcessedAction(questionId); router.refresh(); })}
      disabled={pending}
      className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:border-[var(--success)] disabled:opacity-50"
    >
      <Check size={12} /> İşlendi
    </button>
  );
}

export function CancelButton({ questionId }: { questionId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => { if (confirm("Soru iptal edilsin mi?")) start(async () => { await cancelQuestionAction(questionId); router.refresh(); }); }}
      disabled={pending}
      className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-muted)] hover:border-[var(--danger)] disabled:opacity-50"
    >
      <X size={12} /> İptal
    </button>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore } from "lucide-react";
import { uploadDocumentAction, archiveDocumentAction } from "@/lib/actions/cfo-document-actions";
import { DOCUMENT_CATEGORIES, MIN_DESCRIPTION_CHARS, validateDocument } from "@/lib/cfo/documents";

const input =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-0)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
const btn = "rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-fg)] disabled:opacity-50";

export function UploadDocumentForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [category, setCategory] = useState<string>(DOCUMENT_CATEGORIES[0].key);
  const [description, setDescription] = useState("");
  const reads = DOCUMENT_CATEGORIES.find(c => c.key === category)?.reads;

  return (
    <form
      className="space-y-3"
      onSubmit={e => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const file = fd.get("file");
        const errors = validateDocument(
          { category: String(fd.get("category") ?? ""), title: String(fd.get("title") ?? ""), description: String(fd.get("description") ?? ""),
            periodStart: String(fd.get("periodStart") ?? "") || null, periodEnd: String(fd.get("periodEnd") ?? "") || null, validUntil: String(fd.get("validUntil") ?? "") || null },
          file instanceof File && file.size > 0 ? { size: file.size, type: file.type, name: file.name } : null);
        if (errors.length) { setMsg({ ok: false, text: errors.join(" ") }); return; }
        start(async () => {
          const r = await uploadDocumentAction(fd);
          setMsg({ ok: r.ok, text: r.message ?? (r.ok ? "Yüklendi" : "Hata") });
          if (r.ok) { form.reset(); setDescription(""); router.refresh(); }
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-[var(--text-muted)]">Kategori
          <select name="category" className={input} value={category} onChange={e => setCategory(e.target.value)}>
            {DOCUMENT_CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-[var(--text-muted)]">Başlık
          <input name="title" className={input} placeholder="örn. Enpara kart ekstresi — Eylül 2026" required minLength={3} />
        </label>
      </div>
      {reads && <p className="text-[11px] text-[var(--text-muted)]">Bu kategoriyi okuyan kural: {reads}</p>}
      <label className="block text-xs text-[var(--text-muted)]">Açıklama (zorunlu — işin özü bu; AI özetiyle çelişirse SENİN açıklaman geçerli)
        <textarea name="description" className={`${input} min-h-[100px]`} value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Belgede ne var, hangi karar için yüklüyorsun, hangi sayı önemli? örn. 'Eylül ekstresi; KKDF ve BSMV ayrı satırda görünüyor, kart faizi çarpanı ×1,20 mi ×1,05 mi bunu teyit için.'" />
        <span className={description.trim().length >= MIN_DESCRIPTION_CHARS ? "text-[var(--text-muted)]" : "text-[var(--danger)]"}>
          {description.trim().length}/{MIN_DESCRIPTION_CHARS} karakter
        </span>
      </label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-[var(--text-muted)]">Dönem başı<input type="date" name="periodStart" className={input} /></label>
        <label className="text-xs text-[var(--text-muted)]">Dönem sonu<input type="date" name="periodEnd" className={input} /></label>
        <label className="text-xs text-[var(--text-muted)]">Geçerlilik bitişi<input type="date" name="validUntil" className={input} /></label>
      </div>
      <label className="block text-xs text-[var(--text-muted)]">Dosya (PDF, PNG, JPG, XLSX, XLS, CSV, TXT · en fazla 10 MB)
        <input type="file" name="file" className={input} accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.csv,.txt" required />
      </label>
      <div className="flex items-center gap-3">
        <button type="submit" className={btn} disabled={pending}>{pending ? "Yükleniyor…" : "Belgeyi yükle"}</button>
        {msg && <span className={`text-sm ${msg.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}

export function ArchiveDocumentButton({ id, archived }: { id: string; archived: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} title={archived ? "Arşivden çıkar" : "Arşivle"}
      className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-50"
      onClick={() => start(async () => { await archiveDocumentAction(id, !archived); router.refresh(); })}>
      {archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
    </button>
  );
}

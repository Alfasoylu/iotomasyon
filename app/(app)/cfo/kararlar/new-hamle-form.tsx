"use client";

/** CFO-012 — yeni karar formu: ölçülebilir metrik + başlangıç + beklenen SAYI + ölçüm tarihi zorunlu (sunucuda validateNewHamle). */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createHamleAction, type HamleFormInput } from "@/lib/actions/cfo-hamle-actions";

const input =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface-0)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
const btn = "rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-fg)] disabled:opacity-50";

export function NewHamleForm({ metrics, today, initial, buttonLabel = "+ Yeni karar (beklenen değerle)" }: {
  metrics: { key: string; label: string; current: number | null }[]; today: string;
  /** motor önerisi taslağı (CFO-012): onaylayan kişi görür, düzeltir, kaydeder */
  initial?: Partial<HamleFormInput>; buttonLabel?: string;
}) {
  const router = useRouter();
  const empty: HamleFormInput = { kod: "", baslik: "", kararTarihi: today, alan: "", neden: "", yapilan: "", metric: metrics[0]?.key ?? "",
    baslangicDeger: "", beklenenDeger: "", ilkOlcumTarihi: "", beklenenEtki: "", kaynak: "", ...initial };
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<HamleFormInput>(empty);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = (f: Partial<HamleFormInput>) => setV({ ...v, ...f });
  const cur = metrics.find(m => m.key === v.metric)?.current;

  if (!open) return <button className={btn} onClick={() => setOpen(true)}>{buttonLabel}</button>;
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <input className={input} placeholder="Kod — örn. H13-KMH-KAPAT" value={v.kod} onChange={e => set({ kod: e.target.value })} />
        <input className={`${input} sm:col-span-2`} placeholder="Başlık" value={v.baslik} onChange={e => set({ baslik: e.target.value })} />
        <input className={input} placeholder="Alan — örn. borç, ithalat" value={v.alan} onChange={e => set({ alan: e.target.value })} />
        <label className="text-xs text-[var(--text-muted)]">Karar tarihi<input type="date" className={input} value={v.kararTarihi} onChange={e => set({ kararTarihi: e.target.value })} /></label>
        <label className="text-xs text-[var(--text-muted)]">Ölçüm / hedef tarihi<input type="date" className={input} value={v.ilkOlcumTarihi} onChange={e => set({ ilkOlcumTarihi: e.target.value })} /></label>
      </div>
      <textarea className={`${input} min-h-[60px]`} placeholder="Neden (tez)" value={v.neden} onChange={e => set({ neden: e.target.value })} />
      <textarea className={`${input} min-h-[60px]`} placeholder="Yapılan / yapılacak" value={v.yapilan} onChange={e => set({ yapilan: e.target.value })} />
      <div className="grid gap-2 sm:grid-cols-3">
        <select className={input} value={v.metric} onChange={e => set({ metric: e.target.value })}>
          {metrics.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <input className={input} inputMode="decimal" placeholder={`Başlangıç${cur != null ? ` (bugün ${Math.round(cur).toLocaleString("tr-TR")})` : ""}`}
          value={v.baslangicDeger} onChange={e => set({ baslangicDeger: e.target.value })} />
        <input className={input} inputMode="decimal" placeholder="Beklenen değer (SAYI)" value={v.beklenenDeger} onChange={e => set({ beklenenDeger: e.target.value })} />
      </div>
      <input className={input} placeholder="Beklenen etki (isteğe bağlı metin)" value={v.beklenenEtki} onChange={e => set({ beklenenEtki: e.target.value })} />
      <input className={input} placeholder="Kaynak (isteğe bağlı)" value={v.kaynak} onChange={e => set({ kaynak: e.target.value })} />
      <div className="flex items-center gap-2">
        <button className={btn} disabled={pending} onClick={() => start(async () => {
          const r = await createHamleAction(v);
          setMsg({ ok: r.ok, text: r.message ?? (r.ok ? "Kaydedildi" : "Hata") });
          if (r.ok) { setV(empty); setOpen(false); router.refresh(); }
        })}>{pending ? "Kaydediliyor…" : "Kaydet"}</button>
        <button className="text-xs text-[var(--text-muted)]" onClick={() => setOpen(false)}>Vazgeç</button>
        {msg && <span className={`text-xs ${msg.ok ? "text-emerald-500" : "text-red-500"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}

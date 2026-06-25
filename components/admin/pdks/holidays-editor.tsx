"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { updateHolidaysAction } from "@/lib/actions/pdks-admin-actions";
import { TR_HOLIDAYS_2026, type Holiday } from "@/lib/pdks/holidays";

const inputCls =
  "rounded-lg border border-[var(--border-default)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:outline-none";

export function HolidaysEditor({ initial }: { initial: Holiday[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<Holiday[]>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function patch(i: number, p: Partial<Holiday>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...p } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, { date: "", name: "" }]);
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }
  function load2026() {
    setRows((prev) => {
      const byDate = new Map(prev.map((r) => [r.date, r]));
      for (const h of TR_HOLIDAYS_2026) byDate.set(h.date, h);
      return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    });
    setInfo("2026 tatilleri eklendi — kaydetmeyi unutmayın.");
  }

  function save() {
    setPending(true);
    setError(null);
    setInfo(null);
    const clean = rows.filter((r) => r.date && r.name.trim());
    startTransition(async () => {
      const r = await updateHolidaysAction(clean);
      if (!r.ok) {
        setError(r.message ?? "Kaydedilemedi.");
        setPending(false);
        return;
      }
      setInfo("Resmi tatiller kaydedildi.");
      setPending(false);
      router.refresh();
    });
  }

  return (
    <Card className="p-5">
      {error && <p className="mb-3 rounded-lg bg-[var(--danger-dim)] px-4 py-2 text-sm text-[var(--danger)]">{error}</p>}
      {info && <p className="mb-3 rounded-lg bg-[var(--success-dim)] px-4 py-2 text-sm text-[var(--success)]">{info}</p>}

      <div className="mb-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={load2026}>📅 2026 Türkiye tatillerini yükle</Button>
        <Button type="button" variant="secondary" onClick={addRow}>+ Satır ekle</Button>
      </div>

      <div className="space-y-2">
        {rows.length === 0 && <p className="text-sm text-[var(--text-muted)]">Tanımlı tatil yok.</p>}
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input type="date" className={inputCls} value={r.date} onChange={(e) => patch(i, { date: e.target.value })} />
            <input className={`${inputCls} flex-1`} value={r.name} placeholder="Tatil adı" onChange={(e) => patch(i, { name: e.target.value })} />
            <Button type="button" variant="secondary" onClick={() => removeRow(i)} disabled={pending}>Sil</Button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={save} disabled={pending}>{pending ? "Kaydediliyor…" : "Kaydet"}</Button>
      </div>
    </Card>
  );
}

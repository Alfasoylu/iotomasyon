"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { updateWorkScheduleAction } from "@/lib/actions/pdks-admin-actions";

type Day = { open: boolean; in: string; out: string };

// Görüntü sırası: Pazartesi → Pazar. İndeks JS getUTCDay (0=Pazar..6=Cmt).
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const NAMES: Record<number, string> = {
  1: "Pazartesi",
  2: "Salı",
  3: "Çarşamba",
  4: "Perşembe",
  5: "Cuma",
  6: "Cumartesi",
  0: "Pazar",
};

const inputCls =
  "rounded-lg border border-[var(--border-default)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:outline-none disabled:opacity-40";

export function WorkScheduleEditor({
  initial,
}: {
  initial: ({ in: string; out: string } | null)[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [days, setDays] = useState<Day[]>(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = initial[i];
      return d ? { open: true, in: d.in, out: d.out } : { open: false, in: "08:30", out: "18:30" };
    }),
  );

  function patch(idx: number, p: Partial<Day>) {
    setDays((prev) => prev.map((d, i) => (i === idx ? { ...d, ...p } : d)));
  }

  function save() {
    setPending(true);
    setError(null);
    setInfo(null);
    const week = days.map((d) => (d.open ? { in: d.in, out: d.out } : null));
    startTransition(async () => {
      const r = await updateWorkScheduleAction(week);
      if (!r.ok) {
        setError(r.message ?? "Kaydedilemedi.");
        setPending(false);
        return;
      }
      setInfo("Çalışma saatleri kaydedildi.");
      setPending(false);
      router.refresh();
    });
  }

  return (
    <Card className="p-5">
      {error && (
        <p className="mb-3 rounded-lg bg-[var(--danger-dim)] px-4 py-2 text-sm text-[var(--danger)]">{error}</p>
      )}
      {info && (
        <p className="mb-3 rounded-lg bg-[var(--success-dim)] px-4 py-2 text-sm text-[var(--success)]">{info}</p>
      )}

      <div className="space-y-2">
        {ORDER.map((idx) => {
          const d = days[idx];
          return (
            <div key={idx} className="flex flex-wrap items-center gap-3 border-b border-[var(--border-subtle)] py-2 last:border-0">
              <label className="flex w-32 items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                <input type="checkbox" checked={d.open} onChange={(e) => patch(idx, { open: e.target.checked })} />
                {NAMES[idx]}
              </label>
              {d.open ? (
                <div className="flex items-center gap-2">
                  <input type="time" className={inputCls} value={d.in} onChange={(e) => patch(idx, { in: e.target.value })} />
                  <span className="text-[var(--text-muted)]">–</span>
                  <input type="time" className={inputCls} value={d.out} onChange={(e) => patch(idx, { out: e.target.value })} />
                </div>
              ) : (
                <span className="text-sm text-[var(--text-muted)]">Tatil</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex justify-end">
        <Button onClick={save} disabled={pending}>
          {pending ? "Kaydediliyor…" : "Kaydet"}
        </Button>
      </div>
    </Card>
  );
}

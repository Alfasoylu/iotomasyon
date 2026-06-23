"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  updateAttendanceAction,
  deleteAttendanceAction,
  createManualAttendanceAction,
} from "@/lib/actions/pdks-admin-actions";

export type EditableRow = {
  id: string;
  personnelName: string;
  workDateYmd: string;
  workDateLabel: string;
  checkInTR: string; // "HH:MM" | ""
  checkOutTR: string; // "HH:MM" | ""
  worksiteName: string | null;
  hours: number | null;
  late: boolean;
  missingCheckout: boolean;
};

type Employee = { id: string; fullName: string };

const inputCls =
  "rounded-lg border border-[var(--border-default)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:outline-none";

export function TimesheetTable({
  rows,
  personnel,
  defaultYmd,
}: {
  rows: EditableRow[];
  personnel: Employee[];
  defaultYmd: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editId, setEditId] = useState<string | null>(null);
  const [eIn, setEIn] = useState("");
  const [eOut, setEOut] = useState("");

  // Manuel ekleme
  const [showAdd, setShowAdd] = useState(false);
  const [mPerson, setMPerson] = useState("");
  const [mDate, setMDate] = useState(defaultYmd);
  const [mIn, setMIn] = useState("");
  const [mOut, setMOut] = useState("");

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) {
    setPending(true);
    setError(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        setError(r.message ?? "Hata oluştu.");
        setPending(false);
        return;
      }
      after?.();
      setPending(false);
      router.refresh();
    });
  }

  function startEdit(r: EditableRow) {
    setEditId(r.id);
    setEIn(r.checkInTR);
    setEOut(r.checkOutTR);
    setError(null);
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg bg-[var(--danger-dim)] px-4 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Kayıtlar</h2>
        <Button onClick={() => setShowAdd((s) => !s)} variant={showAdd ? "secondary" : "primary"}>
          {showAdd ? "Vazgeç" : "Manuel kayıt ekle"}
        </Button>
      </div>

      {showAdd && (
        <Card className="p-5">
          <div className="grid gap-4 md:grid-cols-5">
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Personel</label>
              <select className={`${inputCls} w-full`} value={mPerson} onChange={(e) => setMPerson(e.target.value)}>
                <option value="">Seçin…</option>
                {personnel.map((p) => (
                  <option key={p.id} value={p.id}>{p.fullName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Tarih</label>
              <input type="date" className={`${inputCls} w-full`} value={mDate} onChange={(e) => setMDate(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Giriş</label>
              <input type="time" className={`${inputCls} w-full`} value={mIn} onChange={(e) => setMIn(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Çıkış (ops.)</label>
              <input type="time" className={`${inputCls} w-full`} value={mOut} onChange={(e) => setMOut(e.target.value)} />
            </div>
            <div className="md:col-span-5 flex justify-end">
              <Button
                disabled={pending || !mPerson || !mIn}
                onClick={() =>
                  run(
                    () => createManualAttendanceAction(mPerson, mDate, mIn, mOut),
                    () => {
                      setMPerson("");
                      setMIn("");
                      setMOut("");
                      setShowAdd(false);
                    },
                  )
                }
              >
                {pending ? "Ekleniyor…" : "Ekle"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden p-0 rounded-lg">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border-default)] bg-[var(--surface-1)]">
            <tr>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Personel</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Tarih</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Giriş</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Çıkış</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Süre</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Şantiye</th>
              <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">İşlemler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-[var(--text-muted)]">
                  Bu aralıkta kayıt yok.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const editing = editId === r.id;
              return (
                <tr key={r.id} className="hover:bg-[var(--surface-1)]">
                  <td className="px-4 py-3 font-medium text-[var(--text-primary)]">{r.personnelName}</td>
                  <td className="px-4 py-3 text-[var(--text-secondary)] tabular-nums">{r.workDateLabel}</td>
                  <td className="px-4 py-3 tabular-nums font-mono">
                    {editing ? (
                      <input type="time" className={inputCls} value={eIn} onChange={(e) => setEIn(e.target.value)} />
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                        {r.checkInTR || "—"}
                        {r.late && <Badge tone="warning">Geç</Badge>}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 tabular-nums font-mono">
                    {editing ? (
                      <input type="time" className={inputCls} value={eOut} onChange={(e) => setEOut(e.target.value)} />
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[var(--text-secondary)]">
                        {r.checkOutTR || "—"}
                        {r.missingCheckout && <Badge tone="danger">Eksik</Badge>}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)] tabular-nums">
                    {r.hours != null ? `${r.hours.toFixed(2)} s` : "—"}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)]">{r.worksiteName ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {editing ? (
                        <>
                          <Button variant="secondary" onClick={() => setEditId(null)} disabled={pending}>
                            İptal
                          </Button>
                          <Button
                            disabled={pending}
                            onClick={() =>
                              run(() => updateAttendanceAction(r.id, eIn, eOut), () => setEditId(null))
                            }
                          >
                            Kaydet
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="secondary" onClick={() => startEdit(r)} disabled={pending}>
                            Düzelt
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={pending}
                            onClick={() => {
                              if (window.confirm(`${r.personnelName} — ${r.workDateLabel} kaydı silinsin mi?`)) {
                                run(() => deleteAttendanceAction(r.id));
                              }
                            }}
                          >
                            Sil
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

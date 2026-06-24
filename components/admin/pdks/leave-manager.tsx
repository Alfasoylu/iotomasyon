"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  createLeaveAction,
  decideLeaveAction,
  deleteLeaveAction,
} from "@/lib/actions/pdks-admin-actions";

export type LeaveRow = {
  id: string;
  personnelName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;
  type: string;
  status: string;
  reason: string | null;
  requestedBy: string;
};
type Employee = { id: string; fullName: string };

const TYPE_LABELS: Record<string, string> = {
  annual: "Yıllık izin",
  sick: "Hastalık / rapor",
  unpaid: "Ücretsiz izin",
  other: "Diğer",
};
const inputCls =
  "rounded-lg border border-[var(--border-default)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:outline-none";

function fmt(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  return `${d}.${m}.${y}`;
}

export function LeaveManager({
  leaves,
  personnel,
}: {
  leaves: LeaveRow[];
  personnel: Employee[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [mPerson, setMPerson] = useState("");
  const [mStart, setMStart] = useState("");
  const [mEnd, setMEnd] = useState("");
  const [mType, setMType] = useState("annual");
  const [mReason, setMReason] = useState("");

  function run(fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) {
    setPending(true);
    setError(null);
    setInfo(null);
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

  const pendingLeaves = leaves.filter((l) => l.status === "pending");
  const decided = leaves.filter((l) => l.status !== "pending");

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-[var(--danger-dim)] px-4 py-2 text-sm text-[var(--danger)]">{error}</p>}
      {info && <p className="rounded-lg bg-[var(--success-dim)] px-4 py-2 text-sm text-[var(--success)]">{info}</p>}

      <div className="flex justify-end">
        <Button onClick={() => setShowAdd((s) => !s)} variant={showAdd ? "secondary" : "primary"}>
          {showAdd ? "Vazgeç" : "Yeni izin tanımla"}
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
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Başlangıç</label>
              <input type="date" className={`${inputCls} w-full`} value={mStart} onChange={(e) => setMStart(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Bitiş</label>
              <input type="date" className={`${inputCls} w-full`} value={mEnd} onChange={(e) => setMEnd(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Tür</label>
              <select className={`${inputCls} w-full`} value={mType} onChange={(e) => setMType(e.target.value)}>
                {Object.entries(TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-4">
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Açıklama (ops.)</label>
              <input className={`${inputCls} w-full`} value={mReason} onChange={(e) => setMReason(e.target.value)} />
            </div>
            <div className="flex items-end justify-end">
              <Button
                disabled={pending || !mPerson || !mStart || !mEnd}
                onClick={() =>
                  run(
                    () => createLeaveAction(mPerson, { startDate: mStart, endDate: mEnd, type: mType as "annual", reason: mReason }),
                    () => { setMPerson(""); setMStart(""); setMEnd(""); setMReason(""); setShowAdd(false); setInfo("İzin tanımlandı."); },
                  )
                }
              >
                {pending ? "…" : "Tanımla"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden p-0 rounded-lg">
        <div className="border-b border-[var(--border-default)] bg-[var(--surface-1)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Onay bekleyen ({pendingLeaves.length})</h2>
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {pendingLeaves.length === 0 && (
              <tr><td className="px-4 py-6 text-center text-[var(--text-muted)]">Bekleyen izin talebi yok.</td></tr>
            )}
            {pendingLeaves.map((l) => (
              <tr key={l.id} className="hover:bg-[var(--surface-1)]">
                <td className="px-4 py-3">
                  <div className="font-medium text-[var(--text-primary)]">{l.personnelName}</div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {fmt(l.startDate)} – {fmt(l.endDate)} · {TYPE_LABELS[l.type] ?? l.type}
                    {l.reason ? ` · ${l.reason}` : ""}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Button onClick={() => run(() => decideLeaveAction(l.id, true))} disabled={pending}>Onayla</Button>
                    <Button variant="secondary" onClick={() => run(() => decideLeaveAction(l.id, false))} disabled={pending}>Reddet</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="overflow-hidden p-0 rounded-lg">
        <div className="border-b border-[var(--border-default)] bg-[var(--surface-1)] px-4 py-3">
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">Tüm izinler</h2>
        </div>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {decided.length === 0 && (
              <tr><td className="px-4 py-6 text-center text-[var(--text-muted)]">Kayıt yok.</td></tr>
            )}
            {decided.map((l) => (
              <tr key={l.id} className="hover:bg-[var(--surface-1)]">
                <td className="px-4 py-3">
                  <div className="font-medium text-[var(--text-primary)]">{l.personnelName}</div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {fmt(l.startDate)} – {fmt(l.endDate)} · {TYPE_LABELS[l.type] ?? l.type}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {l.status === "approved" ? <Badge tone="success">Onaylandı</Badge> : <Badge tone="danger">Reddedildi</Badge>}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    variant="secondary"
                    disabled={pending}
                    onClick={() => { if (window.confirm("İzin kaydı silinsin mi?")) run(() => deleteLeaveAction(l.id)); }}
                  >
                    Sil
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  createPersonnelAction,
  updatePersonnelAction,
  setPersonnelActiveAction,
  issueLoginCodeAction,
} from "@/lib/actions/pdks-admin-actions";

type Person = {
  id: string;
  fullName: string;
  phone: string | null;
  expectedCheckIn: string | null;
  isActive: boolean;
  consented: boolean;
};

const inputCls =
  "w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:outline-none";

function fmtExpiry(iso: string): string {
  return new Date(iso).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  });
}

export function PersonnelManager({ initial }: { initial: Person[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [expected, setExpected] = useState("");

  const [editId, setEditId] = useState<string | null>(null);
  const [eName, setEName] = useState("");
  const [ePhone, setEPhone] = useState("");
  const [eExpected, setEExpected] = useState("");

  const [codes, setCodes] = useState<Record<string, { code: string; expiresAt: string }>>({});

  function run(
    fn: () => Promise<{ ok: boolean; message?: string }>,
    after?: () => void,
  ) {
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

  function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    run(
      () => createPersonnelAction({ fullName, phone, expectedCheckIn: expected }),
      () => {
        setFullName("");
        setPhone("");
        setExpected("");
        setShowAdd(false);
      },
    );
  }

  function startEdit(p: Person) {
    setEditId(p.id);
    setEName(p.fullName);
    setEPhone(p.phone ?? "");
    setEExpected(p.expectedCheckIn ?? "");
    setError(null);
  }

  function genCode(id: string) {
    setPending(true);
    setError(null);
    startTransition(async () => {
      const r = await issueLoginCodeAction(id);
      const code = r.code;
      if (!r.ok || !code) {
        setError(r.message ?? "Kod üretilemedi.");
        setPending(false);
        return;
      }
      setCodes((c) => ({ ...c, [id]: { code, expiresAt: r.expiresAt ?? "" } }));
      setPending(false);
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg bg-[var(--danger-dim)] px-4 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button onClick={() => setShowAdd((s) => !s)} variant={showAdd ? "secondary" : "primary"}>
          {showAdd ? "Vazgeç" : "Yeni personel"}
        </Button>
      </div>

      {showAdd && (
        <Card className="p-5">
          <form onSubmit={submitAdd} className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-1">
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Ad Soyad</label>
              <input className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Ali Veli" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Telefon</label>
              <input className={inputCls} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="05XX XXX XX XX" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Beklenen giriş (ops.)</label>
              <input className={inputCls} value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="08:30" />
            </div>
            <div className="md:col-span-3 flex justify-end">
              <Button type="submit" disabled={pending}>
                {pending ? "Kaydediliyor…" : "Ekle"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden p-0 rounded-lg">
        <table className="w-full text-sm">
          <thead className="border-b border-[var(--border-default)] bg-[var(--surface-1)]">
            <tr>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Ad Soyad</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Telefon</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Beklenen giriş</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Durum</th>
              <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">İşlemler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {initial.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--text-muted)]">
                  Henüz personel yok. &quot;Yeni personel&quot; ile ekleyin.
                </td>
              </tr>
            )}
            {initial.map((p) => {
              const editing = editId === p.id;
              const code = codes[p.id];
              return (
                <tr key={p.id} className="align-top hover:bg-[var(--surface-1)]">
                  <td className="px-4 py-3 font-medium text-[var(--text-primary)]">
                    {editing ? (
                      <input className={inputCls} value={eName} onChange={(e) => setEName(e.target.value)} />
                    ) : (
                      p.fullName
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)] tabular-nums">
                    {editing ? (
                      <input className={inputCls} value={ePhone} onChange={(e) => setEPhone(e.target.value)} />
                    ) : (
                      p.phone ?? "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)] tabular-nums">
                    {editing ? (
                      <input className={inputCls} value={eExpected} onChange={(e) => setEExpected(e.target.value)} placeholder="08:30" />
                    ) : (
                      p.expectedCheckIn ?? "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={p.isActive ? "success" : "danger"}>
                        {p.isActive ? "Aktif" : "Pasif"}
                      </Badge>
                      {!p.consented && <Badge tone="warning">KVKK bekliyor</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {editing ? (
                        <>
                          <Button variant="secondary" onClick={() => setEditId(null)} disabled={pending}>
                            İptal
                          </Button>
                          <Button
                            onClick={() =>
                              run(
                                () =>
                                  updatePersonnelAction(p.id, {
                                    fullName: eName,
                                    phone: ePhone,
                                    expectedCheckIn: eExpected,
                                  }),
                                () => setEditId(null),
                              )
                            }
                            disabled={pending}
                          >
                            Kaydet
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="secondary" onClick={() => genCode(p.id)} disabled={pending}>
                            Kod üret
                          </Button>
                          <Button variant="secondary" onClick={() => startEdit(p)} disabled={pending}>
                            Düzenle
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => run(() => setPersonnelActiveAction(p.id, !p.isActive))}
                            disabled={pending}
                          >
                            {p.isActive ? "Pasifleştir" : "Aktifleştir"}
                          </Button>
                        </>
                      )}
                    </div>
                    {code && (
                      <div className="mt-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] px-3 py-2 text-right">
                        <span className="font-mono text-lg font-bold tracking-widest text-[var(--text-primary)]">
                          {code.code}
                        </span>
                        <span className="ml-2 text-xs text-[var(--text-muted)]">
                          {code.expiresAt ? `${fmtExpiry(code.expiresAt)}'e kadar geçerli` : ""}
                        </span>
                      </div>
                    )}
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

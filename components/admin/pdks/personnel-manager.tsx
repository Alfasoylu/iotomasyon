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
  resetPasswordAction,
  resetDeviceAction,
} from "@/lib/actions/pdks-admin-actions";

type Person = {
  id: string;
  fullName: string;
  phone: string | null;
  expectedCheckIn: string | null;
  expectedCheckOut: string | null;
  isActive: boolean;
  consented: boolean;
  deviceBound: boolean;
};

const inputCls =
  "w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:outline-none";

export function PersonnelManager({ initial }: { initial: Person[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [expectedIn, setExpectedIn] = useState("");
  const [expectedOut, setExpectedOut] = useState("");

  const [editId, setEditId] = useState<string | null>(null);
  const [eName, setEName] = useState("");
  const [ePhone, setEPhone] = useState("");
  const [eExpectedIn, setEExpectedIn] = useState("");
  const [eExpectedOut, setEExpectedOut] = useState("");

  function run(
    fn: () => Promise<{ ok: boolean; message?: string }>,
    after?: () => void,
  ) {
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

  function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    run(
      () =>
        createPersonnelAction({
          fullName,
          phone,
          expectedCheckIn: expectedIn,
          expectedCheckOut: expectedOut,
          password,
        }),
      () => {
        setFullName("");
        setPhone("");
        setPassword("");
        setExpectedIn("");
        setExpectedOut("");
        setShowAdd(false);
      },
    );
  }

  function startEdit(p: Person) {
    setEditId(p.id);
    setEName(p.fullName);
    setEPhone(p.phone ?? "");
    setEExpectedIn(p.expectedCheckIn ?? "");
    setEExpectedOut(p.expectedCheckOut ?? "");
    setError(null);
  }

  function resetPassword(p: Person) {
    const pw = window.prompt(`${p.fullName} için yeni şifre/PIN (en az 4 karakter):`);
    if (pw == null) return; // iptal
    run(() => resetPasswordAction(p.id, pw.trim()), () => setInfo(`${p.fullName}: şifre güncellendi.`));
  }

  function resetDevice(p: Person) {
    if (!window.confirm(`${p.fullName} için cihaz bağı sıfırlansın mı? Sonraki giriş yeni cihaza bağlanır.`)) return;
    run(() => resetDeviceAction(p.id), () => setInfo(`${p.fullName}: cihaz bağı sıfırlandı.`));
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg bg-[var(--danger-dim)] px-4 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
      {info && (
        <p className="rounded-lg bg-[var(--success-dim)] px-4 py-2 text-sm text-[var(--success)]">
          {info}
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
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Ad Soyad</label>
              <input className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} required placeholder="Ali Veli" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Telefon</label>
              <input className={inputCls} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="05XX XXX XX XX" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Şifre / PIN</label>
              <input className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="En az 4 karakter" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Beklenen giriş (ops.)</label>
              <input className={inputCls} value={expectedIn} onChange={(e) => setExpectedIn(e.target.value)} placeholder="08:30" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Beklenen çıkış (ops.)</label>
              <input className={inputCls} value={expectedOut} onChange={(e) => setExpectedOut(e.target.value)} placeholder="18:00" />
            </div>
            <div className="flex items-end justify-end">
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
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Giriş</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Çıkış</th>
              <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Durum</th>
              <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">İşlemler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-subtle)]">
            {initial.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[var(--text-muted)]">
                  Henüz personel yok. &quot;Yeni personel&quot; ile ekleyin.
                </td>
              </tr>
            )}
            {initial.map((p) => {
              const editing = editId === p.id;
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
                      <input className={inputCls} value={eExpectedIn} onChange={(e) => setEExpectedIn(e.target.value)} placeholder="08:30" />
                    ) : (
                      p.expectedCheckIn ?? "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-[var(--text-secondary)] tabular-nums">
                    {editing ? (
                      <input className={inputCls} value={eExpectedOut} onChange={(e) => setEExpectedOut(e.target.value)} placeholder="18:00" />
                    ) : (
                      p.expectedCheckOut ?? "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={p.isActive ? "success" : "danger"}>
                        {p.isActive ? "Aktif" : "Pasif"}
                      </Badge>
                      {p.deviceBound && <Badge tone="default">Cihaz bağlı</Badge>}
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
                                    expectedCheckIn: eExpectedIn,
                                    expectedCheckOut: eExpectedOut,
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
                          <Button variant="secondary" onClick={() => resetPassword(p)} disabled={pending}>
                            Şifre sıfırla
                          </Button>
                          <Button variant="secondary" onClick={() => resetDevice(p)} disabled={pending || !p.deviceBound}>
                            Cihazı sıfırla
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

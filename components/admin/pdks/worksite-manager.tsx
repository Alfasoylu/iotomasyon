"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  createWorksiteAction,
  updateWorksiteAction,
  setWorksiteActiveAction,
  setWorksiteAssignmentsAction,
} from "@/lib/actions/pdks-admin-actions";

type Worksite = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  isActive: boolean;
  assigned: string[];
};

type Employee = { id: string; fullName: string };

const inputCls =
  "w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:outline-none";

export function WorksiteManager({
  initial,
  employees,
}: {
  initial: Worksite[];
  employees: Employee[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("150");

  const [editId, setEditId] = useState<string | null>(null);
  const [eName, setEName] = useState("");
  const [eLat, setELat] = useState("");
  const [eLng, setELng] = useState("");
  const [eRadius, setERadius] = useState("");

  // Atama paneli: açık olan şantiye + seçili personel kümesi
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  function fillMyLocation(setLatFn: (v: string) => void, setLngFn: (v: string) => void) {
    setError(null);
    if (!("geolocation" in navigator)) {
      setError("Cihaz konum desteklemiyor.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatFn(pos.coords.latitude.toFixed(6));
        setLngFn(pos.coords.longitude.toFixed(6));
      },
      () => setError("Konum alınamadı. İzni açın."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    run(
      () =>
        createWorksiteAction({
          name,
          latitude: Number(lat),
          longitude: Number(lng),
          radiusMeters: Number(radius),
        }),
      () => {
        setName("");
        setLat("");
        setLng("");
        setRadius("150");
        setShowAdd(false);
      },
    );
  }

  function startEdit(w: Worksite) {
    setEditId(w.id);
    setEName(w.name);
    setELat(String(w.latitude));
    setELng(String(w.longitude));
    setERadius(String(w.radiusMeters));
    setError(null);
  }

  function openAssign(w: Worksite) {
    setAssignFor(w.id);
    setSelected(new Set(w.assigned));
    setError(null);
  }

  function toggleSel(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
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
          {showAdd ? "Vazgeç" : "Yeni şantiye"}
        </Button>
      </div>

      {showAdd && (
        <Card className="p-5">
          <form onSubmit={submitAdd} className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Şantiye adı</label>
              <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required placeholder="Merkez Şube" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Enlem (lat)</label>
              <input className={inputCls} value={lat} onChange={(e) => setLat(e.target.value)} required placeholder="41.015137" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Boylam (lng)</label>
              <input className={inputCls} value={lng} onChange={(e) => setLng(e.target.value)} required placeholder="28.979530" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Yarıçap (m)</label>
              <input className={inputCls} type="number" value={radius} onChange={(e) => setRadius(e.target.value)} required />
            </div>
            <div className="md:col-span-3 flex items-end">
              <Button type="button" variant="secondary" onClick={() => fillMyLocation(setLat, setLng)}>
                📍 Konumumu kullan
              </Button>
            </div>
            <div className="md:col-span-4 flex justify-end">
              <Button type="submit" disabled={pending}>
                {pending ? "Kaydediliyor…" : "Ekle"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {initial.length === 0 && (
        <Card className="p-8 text-center text-[var(--text-muted)]">
          Henüz şantiye yok. &quot;Yeni şantiye&quot; ile ekleyin.
        </Card>
      )}

      {initial.map((w) => {
        const editing = editId === w.id;
        const assigning = assignFor === w.id;
        return (
          <Card key={w.id} className="p-5">
            {editing ? (
              <div className="grid gap-4 md:grid-cols-4">
                <div className="md:col-span-2">
                  <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Ad</label>
                  <input className={inputCls} value={eName} onChange={(e) => setEName(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Enlem</label>
                  <input className={inputCls} value={eLat} onChange={(e) => setELat(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Boylam</label>
                  <input className={inputCls} value={eLng} onChange={(e) => setELng(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Yarıçap (m)</label>
                  <input className={inputCls} type="number" value={eRadius} onChange={(e) => setERadius(e.target.value)} />
                </div>
                <div className="md:col-span-2 flex items-end">
                  <Button type="button" variant="secondary" onClick={() => fillMyLocation(setELat, setELng)}>
                    📍 Konumumu kullan
                  </Button>
                </div>
                <div className="md:col-span-4 flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setEditId(null)} disabled={pending}>
                    İptal
                  </Button>
                  <Button
                    onClick={() =>
                      run(
                        () =>
                          updateWorksiteAction(w.id, {
                            name: eName,
                            latitude: Number(eLat),
                            longitude: Number(eLng),
                            radiusMeters: Number(eRadius),
                          }),
                        () => setEditId(null),
                      )
                    }
                    disabled={pending}
                  >
                    Kaydet
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-[var(--text-primary)]">{w.name}</h3>
                    <Badge tone={w.isActive ? "success" : "danger"}>
                      {w.isActive ? "Aktif" : "Pasif"}
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-xs text-[var(--text-muted)] tabular-nums">
                    {w.latitude.toFixed(6)}, {w.longitude.toFixed(6)} · {w.radiusMeters} m ·{" "}
                    {w.assigned.length} personel
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => openAssign(w)} disabled={pending}>
                    Personel ata
                  </Button>
                  <Button variant="secondary" onClick={() => startEdit(w)} disabled={pending}>
                    Düzenle
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => run(() => setWorksiteActiveAction(w.id, !w.isActive))}
                    disabled={pending}
                  >
                    {w.isActive ? "Pasifleştir" : "Aktifleştir"}
                  </Button>
                </div>
              </div>
            )}

            {assigning && (
              <div className="mt-4 border-t border-[var(--border-subtle)] pt-4">
                {employees.length === 0 ? (
                  <p className="text-sm text-[var(--text-muted)]">Atanacak aktif personel yok.</p>
                ) : (
                  <>
                    <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                      {employees.map((emp) => (
                        <label key={emp.id} className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                          <input
                            type="checkbox"
                            checked={selected.has(emp.id)}
                            onChange={() => toggleSel(emp.id)}
                          />
                          {emp.fullName}
                        </label>
                      ))}
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                      <Button variant="secondary" onClick={() => setAssignFor(null)} disabled={pending}>
                        İptal
                      </Button>
                      <Button
                        onClick={() =>
                          run(
                            () => setWorksiteAssignmentsAction(w.id, Array.from(selected)),
                            () => setAssignFor(null),
                          )
                        }
                        disabled={pending}
                      >
                        Kaydet
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

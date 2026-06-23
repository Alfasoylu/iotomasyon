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
  maxAccuracyMeters: number;
  isActive: boolean;
  assigned: string[];
};

type Employee = { id: string; fullName: string };

const inputCls =
  "w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-1)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--border-strong)] focus:outline-none";

/**
 * "enlem, boylam" ya da bir Google Maps linkinden koordinat ayıklar.
 * Desteklenen: "41.0082, 28.9784" · ...@41.0082,28.9784,17z · ?q=lat,lng ·
 * !3dlat!4dlng. Kısaltılmış (maps.app.goo.gl) linkler koordinat içermez → null.
 */
function parseLocation(input: string): { lat: number; lng: number } | null {
  const s = input.trim();
  const tryPair = (a: string, b: string): { lat: number; lng: number } | null => {
    const lat = Number(a);
    const lng = Number(b);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return { lat, lng };
  };
  let m = s.match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (m) return tryPair(m[1], m[2]);
  // Google Maps yer pini (!3d=lat !4d=lng) — işletmenin GERÇEK konumu; @ (harita
  // merkezi/viewport) yerine bu önceliklidir.
  m = s.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (m) return tryPair(m[1], m[2]);
  m = s.match(/[?&](?:q|query|ll|center|destination)=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return tryPair(m[1], m[2]);
  // @lat,lng yalnızca harita merkezidir (en az kesin) → en sona bırak.
  m = s.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (m) return tryPair(m[1], m[2]);
  return null;
}

/** Konum yapıştırma + canlı harita önizleme (OpenStreetMap embed — anahtar gerekmez). */
function LocationPicker({
  lat,
  lng,
  onPick,
}: {
  lat: string;
  lng: string;
  onPick: (lat: string, lng: string) => void;
}) {
  const [paste, setPaste] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const latN = Number(lat);
  const lngN = Number(lng);
  const valid =
    lat !== "" && lng !== "" && Number.isFinite(latN) && Number.isFinite(lngN) &&
    Math.abs(latN) <= 90 && Math.abs(lngN) <= 180;

  function apply() {
    const p = parseLocation(paste);
    if (!p) {
      setErr("Konum bulunamadı. 'enlem, boylam' yazın veya tam Google Maps linkini yapıştırın.");
      return;
    }
    setErr(null);
    setPaste("");
    onPick(p.lat.toFixed(6), p.lng.toFixed(6));
  }

  const d = 0.003; // ~300 m'lik görüş penceresi
  const bbox = `${lngN - d},${latN - d},${lngN + d},${latN + d}`;

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-[var(--text-secondary)]">
        Konum yapıştır (Google Maps linki veya &quot;enlem, boylam&quot;)
      </label>
      <div className="flex gap-2">
        <input
          className={inputCls}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            }
          }}
          placeholder="41.0082, 28.9784  veya  https://maps.google.com/...@41.0082,28.9784,17z"
        />
        <Button type="button" variant="secondary" onClick={apply}>
          Uygula
        </Button>
      </div>
      {err && <p className="text-xs text-[var(--danger)]">{err}</p>}
      {valid && (
        <div className="space-y-1">
          <iframe
            title="Şantiye konumu"
            className="h-48 w-full rounded-lg border border-[var(--border-default)]"
            loading="lazy"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latN},${lngN}`}
          />
          <a
            href={`https://www.google.com/maps?q=${latN},${lngN}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[var(--accent)] underline"
          >
            Google Maps&apos;te aç / doğrula →
          </a>
        </div>
      )}
    </div>
  );
}

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
  const [maxAcc, setMaxAcc] = useState("100");

  const [editId, setEditId] = useState<string | null>(null);
  const [eName, setEName] = useState("");
  const [eLat, setELat] = useState("");
  const [eLng, setELng] = useState("");
  const [eRadius, setERadius] = useState("");
  const [eMaxAcc, setEMaxAcc] = useState("");

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
          maxAccuracyMeters: Number(maxAcc),
        }),
      () => {
        setName("");
        setLat("");
        setLng("");
        setRadius("150");
        setMaxAcc("100");
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
    setEMaxAcc(String(w.maxAccuracyMeters));
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
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Azami doğruluk (m)</label>
              <input className={inputCls} type="number" value={maxAcc} onChange={(e) => setMaxAcc(e.target.value)} required />
            </div>
            <div className="md:col-span-1 flex items-end">
              <Button type="button" variant="secondary" onClick={() => fillMyLocation(setLat, setLng)}>
                📍 Konumumu kullan
              </Button>
            </div>
            <div className="md:col-span-4">
              <LocationPicker lat={lat} lng={lng} onPick={(la, ln) => { setLat(la); setLng(ln); }} />
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
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Azami doğruluk (m)</label>
                  <input className={inputCls} type="number" value={eMaxAcc} onChange={(e) => setEMaxAcc(e.target.value)} />
                </div>
                <div className="md:col-span-1 flex items-end">
                  <Button type="button" variant="secondary" onClick={() => fillMyLocation(setELat, setELng)}>
                    📍 Konumumu kullan
                  </Button>
                </div>
                <div className="md:col-span-4">
                  <LocationPicker lat={eLat} lng={eLng} onPick={(la, ln) => { setELat(la); setELng(ln); }} />
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
                            maxAccuracyMeters: Number(eMaxAcc),
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
                    {w.latitude.toFixed(6)}, {w.longitude.toFixed(6)} · {w.radiusMeters} m · doğ. ≤{" "}
                    {w.maxAccuracyMeters} m · {w.assigned.length} personel
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

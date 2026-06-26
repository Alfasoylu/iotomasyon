"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  tCreatePersonnel,
  tSetPersonnelActive,
  tResetPassword,
  tResetDevice,
  tCreateWorksite,
  tSetWorksiteActive,
  tSetWorksiteAssignments,
  type TResult,
} from "@/lib/actions/pdks-tenant-actions";

export type PPerson = {
  id: string;
  fullName: string;
  phone: string;
  expectedCheckIn: string;
  expectedCheckOut: string;
  isActive: boolean;
  hasDevice: boolean;
};
export type PWorksite = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  maxAccuracyMeters: number;
  isActive: boolean;
  assignedIds: string[];
};

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-sky-500";

export function TenantAdminPanel({
  slug,
  brand,
  personnel,
  worksites,
}: {
  slug: string;
  brand: string;
  personnel: PPerson[];
  worksites: PWorksite[];
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<TResult>, okText = "Kaydedildi ✓") {
    setMsg(null);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setMsg({ ok: false, text: r.message });
      else {
        setMsg({ ok: true, text: okText });
        router.refresh();
      }
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-400">{brand}</p>
          <h1 className="text-2xl font-semibold">Yönetim Paneli</h1>
        </div>
        <a href={`/t/${slug}`} className="text-sm text-slate-400 underline">
          ← Uygulamaya dön
        </a>
      </div>

      {msg && (
        <p
          className={`mt-4 rounded-lg px-3 py-2 text-sm ${
            msg.ok ? "bg-emerald-950/50 text-emerald-300" : "bg-red-950/50 text-red-300"
          }`}
        >
          {msg.text}
        </p>
      )}

      <PersonnelSection slug={slug} personnel={personnel} run={run} pending={pending} />
      <WorksiteSection slug={slug} worksites={worksites} personnel={personnel} run={run} pending={pending} />

      <p className="mt-10 text-center text-xs text-slate-500">
        Çalışan giriş linki: <span className="font-mono text-slate-400">iotomasyon.com/t/{slug}</span>
      </p>
    </div>
  );
}

function PersonnelSection({
  slug,
  personnel,
  run,
  pending,
}: {
  slug: string;
  personnel: PPerson[];
  run: (fn: () => Promise<TResult>, okText?: string) => void;
  pending: boolean;
}) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [inT, setInT] = useState("08:30");
  const [outT, setOutT] = useState("18:30");

  function add() {
    run(
      () =>
        tCreatePersonnel(slug, {
          fullName,
          phone,
          password,
          expectedCheckIn: inT,
          expectedCheckOut: outT,
        }),
      "Personel eklendi ✓",
    );
    setFullName("");
    setPhone("");
    setPassword("");
  }

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">👷 Personel ({personnel.length})</h2>

      <div className="mt-3 space-y-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <input className={inputCls} placeholder="Ad soyad" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <input className={inputCls} placeholder="Telefon (05XX…)" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <input className={inputCls} placeholder="Şifre / PIN" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="flex gap-2">
            <input className={inputCls} placeholder="Giriş 08:30" value={inT} onChange={(e) => setInT(e.target.value)} />
            <input className={inputCls} placeholder="Çıkış 18:30" value={outT} onChange={(e) => setOutT(e.target.value)} />
          </div>
        </div>
        <button
          onClick={add}
          disabled={pending}
          className="w-full rounded-lg bg-sky-600 py-2 text-sm font-semibold disabled:opacity-50"
        >
          + Personel ekle
        </button>
      </div>

      <ul className="mt-3 space-y-2">
        {personnel.map((p) => (
          <li key={p.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-medium">
                  {p.fullName} {!p.isActive && <span className="text-xs text-red-400">(pasif)</span>}
                </p>
                <p className="text-xs text-slate-400">
                  {p.phone || "—"} · {p.expectedCheckIn || "—"}–{p.expectedCheckOut || "—"} ·{" "}
                  {p.hasDevice ? "cihaz bağlı" : "cihaz yok"}
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <button
                onClick={() => {
                  const np = window.prompt(`${p.fullName} için yeni şifre/PIN:`);
                  if (np) run(() => tResetPassword(slug, p.id, np), "Şifre güncellendi ✓");
                }}
                className="rounded border border-slate-700 px-2 py-1 text-slate-300"
              >
                Şifre sıfırla
              </button>
              <button
                onClick={() => run(() => tResetDevice(slug, p.id), "Cihaz sıfırlandı ✓")}
                className="rounded border border-slate-700 px-2 py-1 text-slate-300"
              >
                Cihazı sıfırla
              </button>
              <button
                onClick={() => run(() => tSetPersonnelActive(slug, p.id, !p.isActive), "Güncellendi ✓")}
                className="rounded border border-slate-700 px-2 py-1 text-slate-300"
              >
                {p.isActive ? "Pasifleştir" : "Aktifleştir"}
              </button>
            </div>
          </li>
        ))}
        {personnel.length === 0 && <li className="text-sm text-slate-500">Henüz personel yok.</li>}
      </ul>
    </section>
  );
}

function WorksiteSection({
  slug,
  worksites,
  personnel,
  run,
  pending,
}: {
  slug: string;
  worksites: PWorksite[];
  personnel: PPerson[];
  run: (fn: () => Promise<TResult>, okText?: string) => void;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("100");
  const [acc, setAcc] = useState("100");
  const [locBusy, setLocBusy] = useState(false);

  function useMyLocation() {
    if (!("geolocation" in navigator)) return;
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocBusy(false);
      },
      () => setLocBusy(false),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  function add() {
    run(
      () =>
        tCreateWorksite(slug, {
          name,
          latitude: Number(lat),
          longitude: Number(lng),
          radiusMeters: Number(radius),
          maxAccuracyMeters: Number(acc),
        }),
      "Şantiye eklendi ✓",
    );
    setName("");
    setLat("");
    setLng("");
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">📍 Şantiye / İş yeri ({worksites.length})</h2>

      <div className="mt-3 space-y-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <input className={inputCls} placeholder="Şantiye adı" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <input className={inputCls} placeholder="Enlem" value={lat} onChange={(e) => setLat(e.target.value)} />
          <input className={inputCls} placeholder="Boylam" value={lng} onChange={(e) => setLng(e.target.value)} />
          <input className={inputCls} placeholder="Yarıçap (m)" value={radius} onChange={(e) => setRadius(e.target.value)} />
          <input className={inputCls} placeholder="Azami doğruluk (m)" value={acc} onChange={(e) => setAcc(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <button
            onClick={useMyLocation}
            disabled={locBusy}
            className="flex-1 rounded-lg border border-slate-700 py-2 text-sm text-slate-300 disabled:opacity-50"
          >
            {locBusy ? "Konum alınıyor…" : "📍 Konumumu kullan"}
          </button>
          <button onClick={add} disabled={pending} className="flex-1 rounded-lg bg-sky-600 py-2 text-sm font-semibold disabled:opacity-50">
            + Şantiye ekle
          </button>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {worksites.map((w) => (
          <li key={w.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
            <div className="flex items-center justify-between">
              <p className="font-medium">
                {w.name} {!w.isActive && <span className="text-xs text-red-400">(pasif)</span>}
              </p>
              <button
                onClick={() => run(() => tSetWorksiteActive(slug, w.id, !w.isActive), "Güncellendi ✓")}
                className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300"
              >
                {w.isActive ? "Pasifleştir" : "Aktifleştir"}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {w.latitude.toFixed(5)}, {w.longitude.toFixed(5)} · yarıçap {w.radiusMeters}m · doğruluk {w.maxAccuracyMeters}m
            </p>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-sky-400">
                Atanan personel ({w.assignedIds.length})
              </summary>
              <AssignEditor slug={slug} worksite={w} personnel={personnel} run={run} pending={pending} />
            </details>
          </li>
        ))}
        {worksites.length === 0 && <li className="text-sm text-slate-500">Henüz şantiye yok.</li>}
      </ul>
    </section>
  );
}

function AssignEditor({
  slug,
  worksite,
  personnel,
  run,
  pending,
}: {
  slug: string;
  worksite: PWorksite;
  personnel: PPerson[];
  run: (fn: () => Promise<TResult>, okText?: string) => void;
  pending: boolean;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set(worksite.assignedIds));

  function toggle(id: string) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="mt-2 space-y-2">
      {personnel.filter((p) => p.isActive).map((p) => (
        <label key={p.id} className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} />
          {p.fullName}
        </label>
      ))}
      <button
        onClick={() => run(() => tSetWorksiteAssignments(slug, worksite.id, Array.from(sel)), "Atama güncellendi ✓")}
        disabled={pending}
        className="rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
      >
        Atamayı kaydet
      </button>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Initial =
  | { authed: false }
  | {
      authed: true;
      role: string;
      name: string;
      status: string | null; // 'open' | 'closed' | null
      checkInAt: string | null;
      checkOutAt: string | null;
    };

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  });
}

/** Tarayıcı konumunu yüksek doğrulukla alır. */
function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("Cihaz konum desteklemiyor"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });
}

export function PersonnelApp({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Service worker kaydı + iOS ana-ekran ipucu
  const [iosHint, setIosHint] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/pdks/sw.js", { scope: "/pdks" }).catch(() => {});
    }
    const ua = window.navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (isIOS && !standalone) setIosHint(true);
  }, []);

  // ── Login formu ────────────────────────────────────────────────────────────
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const submitLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/pdks/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: phone.trim(), code: code.trim() }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "Giriş başarısız");
          return;
        }
        router.refresh();
      } catch {
        setError("Ağ hatası");
      } finally {
        setBusy(false);
      }
    },
    [phone, code, router],
  );

  // ── Check-in / out ───────────────────────────────────────────────────────────
  const doAttendance = useCallback(
    async (kind: "check-in" | "check-out") => {
      setBusy(true);
      setError(null);
      setInfo(null);
      try {
        const pos = await getPosition();
        const res = await fetch(`/api/pdks/${kind}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? "İşlem başarısız");
          return;
        }
        setInfo(
          kind === "check-in"
            ? `Giriş yapıldı${json.worksite ? ` — ${json.worksite}` : ""}${
                json.distanceM != null ? ` (~${json.distanceM}m)` : ""
              }`
            : "Çıkış yapıldı",
        );
        router.refresh();
      } catch (err) {
        const msg = err instanceof GeolocationPositionError || (err as { code?: number })?.code != null
          ? "Konum alınamadı. Konum iznini açın ve tekrar deneyin."
          : err instanceof Error
            ? err.message
            : "İşlem başarısız";
        setError(msg);
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  const logout = useCallback(async () => {
    await fetch("/api/pdks/auth/logout", { method: "POST" });
    router.refresh();
  }, [router]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!initial.authed) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">PDKS — Giriş</h1>
        <p className="mt-1 text-sm text-slate-400">
          Telefon numaranız ve yöneticinizin verdiği tek kullanımlık kod ile giriş yapın.
        </p>
        <form onSubmit={submitLogin} className="mt-6 space-y-4">
          <Field label="Telefon">
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05XX XXX XX XX"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-lg outline-none focus:border-sky-500"
            />
          </Field>
          <Field label="Giriş Kodu">
            <input
              type="text"
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6 haneli kod"
              className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-lg tracking-widest outline-none focus:border-sky-500"
            />
          </Field>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-sky-600 py-3 text-lg font-semibold disabled:opacity-50"
          >
            {busy ? "Giriş yapılıyor…" : "Giriş Yap"}
          </button>
        </form>
        {iosHint && <IosHint />}
      </Shell>
    );
  }

  const isOpen = initial.status === "open" && !!initial.checkInAt;
  const isClosed = initial.status === "closed";

  return (
    <Shell>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-400">Merhaba</p>
          <h1 className="text-2xl font-semibold">{initial.name || "Personel"}</h1>
        </div>
        <button onClick={logout} className="text-sm text-slate-400 underline">
          Çıkış
        </button>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <p className="text-xs uppercase tracking-widest text-slate-500">Bugün</p>
        <div className="mt-2 flex justify-between text-sm">
          <span className="text-slate-400">Giriş</span>
          <span className="font-mono">{fmtTime(initial.checkInAt)}</span>
        </div>
        <div className="mt-1 flex justify-between text-sm">
          <span className="text-slate-400">Çıkış</span>
          <span className="font-mono">{fmtTime(initial.checkOutAt)}</span>
        </div>
      </div>

      <div className="mt-8">
        {isClosed ? (
          <div className="rounded-2xl border border-emerald-800 bg-emerald-950/40 p-6 text-center">
            <p className="text-lg font-semibold text-emerald-400">Bugünkü mesai tamamlandı ✓</p>
          </div>
        ) : (
          <button
            onClick={() => doAttendance(isOpen ? "check-out" : "check-in")}
            disabled={busy}
            className={`flex h-44 w-full items-center justify-center rounded-3xl text-3xl font-bold shadow-lg transition active:scale-95 disabled:opacity-60 ${
              isOpen ? "bg-rose-600" : "bg-emerald-600"
            }`}
          >
            {busy ? "Konum alınıyor…" : isOpen ? "ÇIKIŞ YAP" : "GİRİŞ YAP"}
          </button>
        )}
      </div>

      {info && <p className="mt-4 text-center text-sm text-emerald-400">{info}</p>}
      {error && <p className="mt-4 text-center text-sm text-red-400">{error}</p>}

      {iosHint && <IosHint />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-10">{children}</div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function IosHint() {
  return (
    <p className="mt-8 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-center text-xs text-slate-400">
      Bildirim alabilmek için: <b>Paylaş</b> → <b>Ana Ekrana Ekle</b> ile uygulamayı yükleyin.
    </p>
  );
}

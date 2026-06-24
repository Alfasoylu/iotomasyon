"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type HistoryRow = {
  id: string;
  dateLabel: string;
  checkIn: string;
  checkOut: string;
  hours: string;
  auto: boolean;
  open: boolean;
};

type Initial =
  | { authed: false }
  | {
      authed: true;
      role: string;
      name: string;
      consented: boolean; // KVKK açık rıza verildi mi
      status: string | null; // 'open' | 'closed' | null
      checkInAt: string | null;
      checkOutAt: string | null;
      overtime: boolean; // bugünün kaydında fazla mesai işaretli mi
    };

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  });
}

/** VAPID base64url anahtarını PushManager için Uint8Array'e çevirir. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i);
  return arr;
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

export function PersonnelApp({
  initial,
  history = [],
}: {
  initial: Initial;
  history?: HistoryRow[];
}) {
  const router = useRouter();
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Push bildirim durumu
  const [pushSupported, setPushSupported] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);

  // Service worker kaydı + iOS ana-ekran ipucu
  const [iosHint, setIosHint] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/personel/sw.js", { scope: "/personel" }).catch(() => {});
    }
    // Yetenek/kurulum tespiti — setState'ler mikrotask içinde (cascading-render uyarısı).
    void Promise.resolve().then(() => {
      const ua = window.navigator.userAgent;
      const isIOS = /iphone|ipad|ipod/i.test(ua);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      if (isIOS && !standalone) setIosHint(true);

      if (!("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)) {
        setPushSupported(false);
        return;
      }
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => setPushEnabled(!!sub && Notification.permission === "granted"))
        .catch(() => {});
    });
  }, []);

  // Uygulama (özellikle ana-ekrana eklenmiş PWA) arka planda açık kaldığında React
  // durumu donar; ertesi gün öne geldiğinde hâlâ dünkü "mesai tamamlandı" görünür.
  // Görünür olunca / odak alınca sunucu verisini tazele → o günün doğru durumu gelir.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [router]);

  const enablePush = useCallback(async () => {
    setPushBusy(true);
    setError(null);
    setInfo(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setError("Bildirim izni verilmedi");
        return;
      }
      const keyRes = await fetch("/api/pdks/push/public-key");
      if (!keyRes.ok) {
        setError("Bildirim sunucusu hazır değil");
        return;
      }
      const { key } = await keyRes.json();
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
      });
      const saveRes = await fetch("/api/pdks/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!saveRes.ok) {
        setError("Abonelik kaydedilemedi");
        return;
      }
      setPushEnabled(true);
      setInfo("Bildirimler açıldı");
    } catch {
      setError("Bildirim açılamadı");
    } finally {
      setPushBusy(false);
    }
  }, []);

  // ── Login formu ────────────────────────────────────────────────────────────
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const submitLogin = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/pdks/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: phone.trim(), password: password.trim() }),
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
    [phone, password, router],
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
        // GeolocationPositionError her tarayıcıda global değil (eski iOS Safari);
        // instanceof ReferenceError atabilir → `code` alanına göre ayırt et.
        const isGeoError =
          typeof err === "object" &&
          err !== null &&
          typeof (err as { code?: unknown }).code === "number";
        const msg = isGeoError
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

  const toggleOvertime = useCallback(
    async (next: boolean) => {
      setBusy(true);
      setError(null);
      setInfo(null);
      try {
        const res = await fetch("/api/pdks/overtime", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ overtime: next }),
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          setError(j.error ?? "İşlem başarısız");
          return;
        }
        setInfo(
          next
            ? "Fazla mesai açıldı — otomatik çıkış yapılmayacak. İşiniz bitince çıkış yapın."
            : "Fazla mesai kapatıldı.",
        );
        router.refresh();
      } catch {
        setError("Ağ hatası");
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  const submitConsent = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pdks/consent", { method: "POST" });
      if (!res.ok) {
        setError("Onay kaydedilemedi. Tekrar deneyin.");
        return;
      }
      router.refresh();
    } catch {
      setError("Ağ hatası");
    } finally {
      setBusy(false);
    }
  }, [router]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (!initial.authed) {
    return (
      <Shell>
        <h1 className="text-2xl font-semibold">PDKS — Giriş</h1>
        <p className="mt-1 text-sm text-slate-400">
          Telefon numaranız ve yöneticinizin verdiği şifre ile giriş yapın. İlk giriş
          bu cihaza tanımlanır; başka cihazdan giriş yapılamaz.
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
          <Field label="Şifre">
            <input
              type="password"
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Şifreniz / PIN"
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

  // KVKK açık rıza alınmadıysa giriş/çıkış ekranı yerine aydınlatma + rıza ekranı.
  if (!initial.consented) {
    return (
      <Shell>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">KVKK Aydınlatma & Onay</h1>
          <button onClick={logout} className="text-sm text-slate-400 underline">
            Çıkış
          </button>
        </div>
        <ConsentGate onAccept={submitConsent} busy={busy} />
        {error && <p className="mt-4 text-center text-sm text-red-400">{error}</p>}
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

      {isOpen && (
        <button
          onClick={() => toggleOvertime(!initial.overtime)}
          disabled={busy}
          className={`mt-4 w-full rounded-xl border py-2.5 text-sm font-medium transition disabled:opacity-50 ${
            initial.overtime
              ? "border-amber-600 bg-amber-950/40 text-amber-300"
              : "border-slate-700 text-slate-300 hover:border-slate-500"
          }`}
        >
          {initial.overtime
            ? "🌙 Fazla mesai açık — kapatmak için dokun"
            : "🌙 Bugün fazla mesai (otomatik çıkışı kapat)"}
        </button>
      )}

      {info && <p className="mt-4 text-center text-sm text-emerald-400">{info}</p>}
      {error && <p className="mt-4 text-center text-sm text-red-400">{error}</p>}

      {pushSupported && (
        <div className="mt-6 text-center">
          {pushEnabled ? (
            <p className="text-sm text-slate-400">🔔 Bildirimler açık</p>
          ) : (
            <button
              onClick={enablePush}
              disabled={pushBusy}
              className="text-sm text-sky-400 underline disabled:opacity-50"
            >
              {pushBusy ? "Açılıyor…" : "🔔 Bildirimleri Aç"}
            </button>
          )}
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowHistory((s) => !s)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm text-slate-300"
          >
            <span>📋 Geçmiş kayıtlarım</span>
            <span className="text-slate-500">{showHistory ? "▲" : "▼"}</span>
          </button>
          {showHistory && (
            <div className="mt-2 overflow-hidden rounded-xl border border-slate-800">
              <table className="w-full text-sm">
                <thead className="bg-slate-900/60 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Tarih</th>
                    <th className="px-3 py-2 text-left font-medium">Giriş</th>
                    <th className="px-3 py-2 text-left font-medium">Çıkış</th>
                    <th className="px-3 py-2 text-right font-medium">Süre</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {history.map((h) => (
                    <tr key={h.id}>
                      <td className="px-3 py-2 tabular-nums text-slate-300">{h.dateLabel}</td>
                      <td className="px-3 py-2 font-mono tabular-nums text-slate-400">{h.checkIn}</td>
                      <td className="px-3 py-2 font-mono tabular-nums text-slate-400">
                        {h.checkOut}
                        {h.auto && <span className="ml-1 text-[10px] text-amber-400">oto</span>}
                        {h.open && <span className="ml-1 text-[10px] text-emerald-400">açık</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-300">{h.hours}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

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

function ConsentGate({ onAccept, busy }: { onAccept: () => void; busy: boolean }) {
  const [agreed, setAgreed] = useState(false);
  return (
    <div className="mt-6">
      <div className="max-h-[45vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-sm leading-6 text-slate-300">
        <p>
          İşvereniniz, devam (giriş/çıkış) takibini yürütmek amacıyla, giriş/çıkış
          anında cihazınızın <b>konumunu</b> işler. Konum yalnızca o anda atanmış
          şantiyeye olan <b>mesafenin</b> hesaplanmasında kullanılır.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>Ham koordinatlarınız varsayılan olarak <b>saklanmaz</b>; yalnızca mesafe ve doğruluk değeri tutulur.</li>
          <li>Veriler, işveren tarafından yalnızca puantaj/devam amacıyla görüntülenir.</li>
          <li>Konum yalnızca siz giriş/çıkış butonuna bastığınızda, tek seferlik alınır; arka planda takip yapılmaz.</li>
          <li>KVKK kapsamındaki haklarınız (erişim, düzeltme, silme) için işvereninize başvurabilirsiniz.</li>
        </ul>
        <p className="mt-3">
          Aşağıdaki kutuyu işaretleyerek bu aydınlatma metnini okuduğunuzu ve konum
          verinizin belirtilen amaçla işlenmesine <b>açık rıza</b> verdiğinizi beyan edersiniz.
        </p>
      </div>

      <label className="mt-4 flex items-start gap-3 text-sm text-slate-200">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1"
        />
        <span>Aydınlatma metnini okudum, konum verimin işlenmesine açık rıza veriyorum.</span>
      </label>

      <button
        onClick={onAccept}
        disabled={!agreed || busy}
        className="mt-6 w-full rounded-xl bg-sky-600 py-3 text-lg font-semibold disabled:opacity-50"
      >
        {busy ? "Kaydediliyor…" : "Onaylıyorum ve devam et"}
      </button>
    </div>
  );
}

function IosHint() {
  return (
    <p className="mt-8 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-center text-xs text-slate-400">
      Bildirim alabilmek için: <b>Paylaş</b> → <b>Ana Ekrana Ekle</b> ile uygulamayı yükleyin.
    </p>
  );
}

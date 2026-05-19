"use client";

import { useState, useEffect } from "react";
import { X, Sparkles, Heart, Sparkle, Lightbulb } from "lucide-react";

const STORAGE_KEY = "iotomasyon.dashboard.first-time-dismissed.v1";

/**
 * Dashboard'da ilk açılışta gösterilen tanıtım banner'ı.
 *
 * - LocalStorage'da dismiss durumu hatırlar (bir kez gösterilir)
 * - "Tamamladım" → kapat, gelecekte gösterme
 * - 3 mini kart ile sistemi kısaca tanıtır
 */
export function FirstTimeBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = window.localStorage.getItem(STORAGE_KEY);
    if (!dismissed) setShow(true);
  }, []);

  function dismiss() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, new Date().toISOString());
    }
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-blue-50 to-emerald-50 p-6">
      <button
        type="button"
        onClick={dismiss}
        className="absolute top-3 right-3 rounded-md p-1 text-slate-400 transition hover:bg-white/60 hover:text-slate-700"
        title="Kapat — bir daha gösterme"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-2xl bg-white shadow-sm">
          <Sparkles className="h-5 w-5 text-violet-600" />
        </div>
        <div className="min-w-0 flex-1 pr-6">
          <p className="text-[10px] uppercase tracking-widest text-violet-700">
            Hoş geldin
          </p>
          <h2 className="mt-1 text-base font-semibold text-slate-900">
            iotomasyon CRM&apos;e ilk girişin
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-700">
            Bu pano sana &quot;bugün ne yapmalıyım&quot; sorusunun cevabını 5 saniyede verir.
            Üç hızlı ipucu:
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Tip
          icon={Heart}
          color="rose"
          title="Sermaye Sağlık Skoru"
          desc="0–100 arası tek manşet skor. Sermayenin ne durumda olduğunu söyler."
        />
        <Tip
          icon={Sparkle}
          color="blue"
          title="Akıllı Öneriler"
          desc="Sistem 4-8 aksiyon önerir: yıldız ürünler, acil sipariş, ölü stok…"
        />
        <Tip
          icon={Lightbulb}
          color="amber"
          title="Sağ-üst yardım"
          desc="Her sayfanın sağ-üstünde &apos;Bu sayfa nedir?&apos; butonu var."
        />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <a
          href="/yardim/glosari"
          className="text-xs text-slate-600 hover:text-slate-900 underline-offset-4 hover:underline"
        >
          📚 Glosari & Terimler →
        </a>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700"
        >
          Anladım, kapat
        </button>
      </div>
    </div>
  );
}

function Tip({
  icon: Icon,
  color,
  title,
  desc,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: "rose" | "blue" | "amber";
  title: string;
  desc: string;
}) {
  const iconClass = {
    rose: "bg-rose-100 text-rose-700",
    blue: "bg-blue-100 text-blue-700",
    amber: "bg-amber-100 text-amber-700",
  }[color];
  return (
    <div className="rounded-xl border border-white/60 bg-white/70 p-3">
      <div className="flex items-start gap-2.5">
        <div className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-900">{title}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
            {desc}
          </p>
        </div>
      </div>
    </div>
  );
}

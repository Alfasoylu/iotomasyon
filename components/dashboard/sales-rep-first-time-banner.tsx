"use client";

import { useState, useEffect } from "react";
import { X, Zap, Phone, MessageCircle, CheckSquare, ListPlus } from "lucide-react";

const STORAGE_KEY = "iotomasyon.sales-rep.first-time-dismissed.v1";

/**
 * P5 — Sales Rep ilk giriş onboarding banner'ı.
 *
 * 5 adımlı quickstart, satış temsilcisi günlük akışını öğretir.
 * LocalStorage'da dismiss durumu hatırlanır.
 */
export function SalesRepFirstTimeBanner() {
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
    <div className="relative overflow-hidden rounded-2xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50 p-5">
      <button
        type="button"
        onClick={dismiss}
        className="absolute top-3 right-3 rounded-md p-1 text-slate-400 transition hover:bg-white/60 hover:text-slate-700"
        title="Kapat — bir daha gösterme"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500 shadow-sm">
          <Zap className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1 pr-6">
          <p className="text-[10px] uppercase tracking-widest text-amber-700 font-semibold">
            İlk Giriş Rehberi
          </p>
          <h2 className="mt-1 text-base font-bold text-slate-900">
            5 Adımda Günlük İş Akışın
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-700">
            Çağrı merkezi satış temsilcisi olarak hızlı başlamak için:
          </p>
        </div>
      </div>

      <ol className="mt-4 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-5">
        <Step
          number="1"
          icon={Phone}
          title="ŞİMDİ BUNU ARA"
          desc="Üstteki hero kartta gösterilen müşteriyi ara (akıllı sıraya göre)."
        />
        <Step
          number="2"
          icon={MessageCircle}
          title="Çağrı bittiğinde"
          desc="Müşteri detayında 6'lı outcome chip'ten birini tıkla (İlgilendi/Açmadı/...)."
        />
        <Step
          number="3"
          icon={CheckSquare}
          title="Görevlerim"
          desc="Sol menüden Görevler → Bugün/Gecikmiş cohort kartlarına bak."
        />
        <Step
          number="4"
          icon={ListPlus}
          title="Listelerim"
          desc="Sol menü → Listelerim → şehir seç → 'Aramaya Başla'."
        />
        <Step
          number="5"
          icon={Zap}
          title="Klavye"
          desc="Müşteri listesinde J/K ile gez, ⌘K ile global ara."
        />
      </ol>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-[11px] text-slate-600">
          💡 Üstteki "Görüşme 0/30" hedefini her gün doldur — sistem seni Power Queue ile yönlendirir.
        </span>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700"
        >
          Anladım, başlayalım
        </button>
      </div>
    </div>
  );
}

function Step({
  number,
  icon: Icon,
  title,
  desc,
}: {
  number: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border border-amber-200 bg-white p-3">
      <div className="flex items-start gap-2">
        <span className="flex-shrink-0 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5 text-amber-700" />
            <p className="text-xs font-bold text-slate-900">{title}</p>
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-600">{desc}</p>
        </div>
      </div>
    </div>
  );
}

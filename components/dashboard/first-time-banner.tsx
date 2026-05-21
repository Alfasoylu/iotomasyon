"use client";

import { useState, useEffect } from "react";
import { X, Sparkles, Heart, Sparkle, Lightbulb, BookOpen } from "lucide-react";

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
    <div className="relative overflow-hidden rounded-lg border border-[var(--accent-border)] bg-[var(--accent-dim)] p-6">
      <button
        type="button"
        onClick={dismiss}
        className="absolute right-3 top-3 rounded-md p-1 text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
        title="Kapat — bir daha gösterme"
      >
        <X size={14} strokeWidth={1.5} />
      </button>

      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border border-[var(--accent-border)] bg-[var(--surface-2)] text-[var(--accent)]">
          <Sparkles size={18} strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1 pr-6">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            Hoş geldin
          </p>
          <h2 className="mt-1 text-base font-semibold text-[var(--text-primary)]">
            iotomasyon CRM&apos;e ilk girişin
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
            Bu pano sana &quot;bugün ne yapmalıyım&quot; sorusunun cevabını 5 saniyede verir.
            Üç hızlı ipucu:
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Tip
          icon={Heart}
          tone="danger"
          title="Sermaye Sağlık Skoru"
          desc="0–100 arası tek manşet skor. Sermayenin ne durumda olduğunu söyler."
        />
        <Tip
          icon={Sparkle}
          tone="info"
          title="Akıllı Öneriler"
          desc="Sistem 4-8 aksiyon önerir: yıldız ürünler, acil sipariş, ölü stok…"
        />
        <Tip
          icon={Lightbulb}
          tone="warn"
          title="Sağ-üst yardım"
          desc="Her sayfanın sağ-üstünde &apos;Bu sayfa nedir?&apos; butonu var."
        />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <a
          href="/yardim/glosari"
          className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] underline-offset-4 transition hover:text-[var(--text-primary)] hover:underline"
        >
          <BookOpen size={14} strokeWidth={1.5} />
          Glosari & Terimler →
        </a>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--accent-fg)] transition hover:opacity-90"
        >
          Anladım, kapat
        </button>
      </div>
    </div>
  );
}

type TipTone = "danger" | "info" | "warn";

function Tip({
  icon: Icon,
  tone,
  title,
  desc,
}: {
  icon: React.ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;
  tone: TipTone;
  title: string;
  desc: string;
}) {
  const toneClass: Record<TipTone, string> = {
    danger: "border-[var(--danger-border)] bg-[var(--danger-dim)] text-[var(--danger)]",
    info: "border-[var(--info-border)] bg-[var(--info-dim)] text-[var(--info)]",
    warn: "border-[var(--warn-border)] bg-[var(--warn-dim)] text-[var(--warn)]",
  };
  return (
    <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] p-3">
      <div className="flex items-start gap-2.5">
        <div
          className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border ${toneClass[tone]}`}
        >
          <Icon size={14} strokeWidth={1.5} />
        </div>
        <div>
          <p className="text-xs font-semibold text-[var(--text-primary)]">{title}</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {desc}
          </p>
        </div>
      </div>
    </div>
  );
}

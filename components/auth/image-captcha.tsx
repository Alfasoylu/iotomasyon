"use client";

import { useEffect, useState, useTransition } from "react";

import { refreshCaptchaAction } from "@/lib/actions/captcha-actions";
import type { CaptchaChallenge } from "@/lib/captcha";

/**
 * Yerleşik resim CAPTCHA'sı (lib/captcha.ts). Sunucudan gelen ilk resimle başlar;
 * "Yenile" ya da üst bileşenin `refreshSignal` artırması yeni resim getirir.
 * Üst bileşene (token, cevap) çiftini bildirir.
 */
type Props = {
  initial: CaptchaChallenge;
  /** Her artışta yeni resim yüklenir ve cevap temizlenir. */
  refreshSignal?: number;
  onChange: (value: { token: string; answer: string }) => void;
  /** Tema: CRM (koyu) ya da landing (açık). */
  tone?: "dark" | "light";
  inputId?: string;
};

export function ImageCaptcha({ initial, refreshSignal = 0, onChange, tone = "dark", inputId = "captcha" }: Props) {
  const [challenge, setChallenge] = useState(initial);
  const [answer, setAnswer] = useState("");
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => {
      const next = await refreshCaptchaAction();
      setChallenge(next);
      setAnswer("");
      onChange({ token: next.token, answer: "" });
    });
  }

  // Üst bileşen başarısız denemeden sonra sinyali artırır → yeni resim.
  useEffect(() => {
    if (refreshSignal > 0) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  function onAnswer(v: string) {
    const digits = v.replace(/\D/g, "").slice(0, 5);
    setAnswer(digits);
    onChange({ token: challenge.token, answer: digits });
  }

  const dark = tone === "dark";
  const inputCls = dark
    ? "h-10 w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 font-mono text-[15px] tracking-[0.3em] text-[var(--text-primary)] outline-none focus:border-[var(--accent-border)]"
    : "h-10 w-full rounded-lg border border-slate-300 px-3 font-mono text-[15px] tracking-[0.3em] text-slate-900 outline-none focus:ring-2 focus:ring-blue-500";
  const btnCls = dark
    ? "text-[11px] text-[var(--text-muted)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline disabled:opacity-50"
    : "text-[11px] text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline disabled:opacity-50";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URI, optimize edilemez */}
        <img
          src={challenge.image}
          alt="Doğrulama kodu"
          width={170}
          height={58}
          className={`select-none rounded-md ${pending ? "opacity-50" : ""}`}
          draggable={false}
        />
        <button type="button" onClick={refresh} disabled={pending} className={btnCls} aria-label="Yeni resim">
          {pending ? "Yükleniyor…" : "Yenile ↻"}
        </button>
      </div>
      <input
        id={inputId}
        value={answer}
        onChange={(e) => onAnswer(e.target.value)}
        inputMode="numeric"
        autoComplete="off"
        placeholder="Resimdeki 5 rakam"
        className={inputCls}
      />
    </div>
  );
}

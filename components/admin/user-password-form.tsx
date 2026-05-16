"use client";

import { startTransition, useState } from "react";

import { updateUserPasswordAction } from "@/lib/actions/user-management-actions";

interface UserPasswordFormProps {
  userId: string;
  canEdit: boolean;
}

function generatePassword(length = 14): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%&*";
  const all = upper + lower + digits + symbols;
  const required = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    symbols[Math.floor(Math.random() * symbols.length)],
  ];
  const rest = Array.from({ length: length - 4 }, () =>
    all[Math.floor(Math.random() * all.length)],
  );
  return [...required, ...rest].sort(() => Math.random() - 0.5).join("");
}

function strengthLabel(pwd: string): { label: string; color: string; width: string } {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  if (score <= 1) return { label: "Çok zayıf", color: "bg-red-400", width: "w-1/5" };
  if (score === 2) return { label: "Zayıf", color: "bg-orange-400", width: "w-2/5" };
  if (score === 3) return { label: "Orta", color: "bg-yellow-400", width: "w-3/5" };
  if (score === 4) return { label: "Güçlü", color: "bg-emerald-400", width: "w-4/5" };
  return { label: "Çok güçlü", color: "bg-emerald-500", width: "w-full" };
}

export function UserPasswordForm({ userId, canEdit }: UserPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  const strength = password ? strengthLabel(password) : null;
  const mismatch = confirm.length > 0 && password !== confirm;

  function handleGenerate() {
    const pwd = generatePassword();
    setPassword(pwd);
    setConfirm(pwd);
    setShowPwd(true);
    setShowConfirm(true);
    setError(null);
    setSuccess(false);
  }

  async function handleCopy() {
    if (!password) return;
    await navigator.clipboard.writeText(password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (password.length < 8) { setError("Şifre en az 8 karakter olmalıdır."); return; }
    if (password !== confirm) { setError("Şifreler eşleşmiyor."); return; }
    setPending(true);
    startTransition(async () => {
      const result = await updateUserPasswordAction(userId, password);
      if (result.ok) {
        setSuccess(true);
        setPassword("");
        setConfirm("");
        setShowPwd(false);
        setShowConfirm(false);
      } else {
        setError(result.message ?? "Hata oluştu.");
      }
      setPending(false);
    });
  }

  const inputCls =
    "w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-mono text-slate-900 shadow-sm transition placeholder:text-slate-400 placeholder:font-sans focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Generate button row */}
      {canEdit && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleGenerate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-300"
          >
            <span className="text-base leading-none">⟳</span>
            Güçlü şifre üret
          </button>
          {password && (
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
            >
              {copied ? (
                <><span className="text-base leading-none text-emerald-500">✓</span> Kopyalandı</>
              ) : (
                <><span className="text-base leading-none">⎘</span> Kopyala</>
              )}
            </button>
          )}
        </div>
      )}

      {/* Password fields */}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Yeni şifre
          </label>
          <div className="relative">
            <input
              type={showPwd ? "text" : "password"}
              value={password}
              onChange={(e) => { setPassword(e.target.value); setSuccess(false); setError(null); }}
              disabled={!canEdit || pending}
              placeholder="En az 8 karakter"
              className={inputCls + " pr-10"}
            />
            {canEdit && (
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPwd((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
              >
                {showPwd ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                )}
              </button>
            )}
          </div>
          {/* Strength bar */}
          {strength && (
            <div className="space-y-1">
              <div className="h-1 w-full rounded-full bg-slate-100">
                <div className={`h-1 rounded-full transition-all ${strength.color} ${strength.width}`} />
              </div>
              <p className="text-xs text-slate-400">{strength.label}</p>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Şifre tekrar
          </label>
          <div className="relative">
            <input
              type={showConfirm ? "text" : "password"}
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setSuccess(false); setError(null); }}
              disabled={!canEdit || pending}
              placeholder="Aynı şifreyi tekrar girin"
              className={inputCls + " pr-10" + (mismatch ? " border-red-300 focus:ring-red-100" : "")}
            />
            {canEdit && (
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
              >
                {showConfirm ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                )}
              </button>
            )}
          </div>
          {mismatch && (
            <p className="text-xs text-red-500">Şifreler eşleşmiyor.</p>
          )}
        </div>
      </div>

      {canEdit && (
        <div className="flex items-center justify-between">
          <div className="min-h-[20px]">
            {error && (
              <p className="flex items-center gap-1.5 text-sm text-red-600">
                <span className="text-base leading-none">⚠</span> {error}
              </p>
            )}
            {success && (
              <p className="flex items-center gap-1.5 text-sm text-emerald-600">
                <span className="text-base leading-none">✓</span> Şifre güncellendi.
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={pending || !password || !confirm || mismatch}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Güncelleniyor…" : "Şifreyi güncelle"}
          </button>
        </div>
      )}
    </form>
  );
}

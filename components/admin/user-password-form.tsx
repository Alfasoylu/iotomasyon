"use client";

import { startTransition, useState } from "react";

import { Button } from "@/components/ui/button";
import { updateUserPasswordAction } from "@/lib/actions/user-management-actions";

interface UserPasswordFormProps {
  userId: string;
  canEdit: boolean;
}

export function UserPasswordForm({ userId, canEdit }: UserPasswordFormProps) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (password.length < 8) {
      setError("Şifre en az 8 karakter olmalıdır.");
      return;
    }
    if (password !== confirm) {
      setError("Şifreler eşleşmiyor.");
      return;
    }

    setPending(true);
    startTransition(async () => {
      const result = await updateUserPasswordAction(userId, password);
      if (result.ok) {
        setSuccess(true);
        setPassword("");
        setConfirm("");
      } else {
        setError(result.message ?? "Hata oluştu.");
      }
      setPending(false);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}
      {success && (
        <p className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
          Şifre güncellendi.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Yeni şifre</label>
          <input
            type="password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setSuccess(false); setError(null); }}
            disabled={!canEdit || pending}
            minLength={8}
            placeholder="En az 8 karakter"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none disabled:opacity-50"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Şifre tekrar</label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setSuccess(false); setError(null); }}
            disabled={!canEdit || pending}
            placeholder="Aynı şifreyi tekrar girin"
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none disabled:opacity-50"
          />
        </div>
      </div>

      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending || !password || !confirm}>
            {pending ? "Güncelleniyor..." : "Şifreyi güncelle"}
          </Button>
        </div>
      )}
    </form>
  );
}

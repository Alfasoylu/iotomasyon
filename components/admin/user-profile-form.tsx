"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { updateUserProfileAction } from "@/lib/actions/user-management-actions";

interface UserProfileFormProps {
  userId: string;
  currentName: string;
  currentEmail: string;
  canEdit: boolean;
}

export function UserProfileForm({
  userId,
  currentName,
  currentEmail,
  canEdit,
}: UserProfileFormProps) {
  const router = useRouter();
  const [name, setName] = useState(currentName);
  const [email, setEmail] = useState(currentEmail);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isDirty =
    name.trim() !== currentName || email.trim().toLowerCase() !== currentEmail;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isDirty) return;
    setPending(true);
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updateUserProfileAction(userId, { name, email });
      if (result.ok) {
        setSuccess(true);
        router.refresh();
      } else {
        setError(result.message ?? "Hata oluştu.");
      }
      setPending(false);
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
            Ad Soyad
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setSuccess(false); }}
            disabled={!canEdit || pending}
            required
            minLength={2}
            placeholder="Ad Soyad"
            className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
            E-posta adresi
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setSuccess(false); }}
            disabled={!canEdit || pending}
            required
            placeholder="ornek@sirket.com"
            className="w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
          />
        </div>
      </div>

      {canEdit && (
        <div className="mt-5 flex items-center justify-between">
          <div className="min-h-[20px]">
            {error && (
              <p className="flex items-center gap-1.5 text-sm text-red-600">
                <span className="text-base leading-none">⚠</span> {error}
              </p>
            )}
            {success && (
              <p className="flex items-center gap-1.5 text-sm text-emerald-600">
                <span className="text-base leading-none">✓</span> Kaydedildi.
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={pending || !isDirty}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {pending ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
      )}
    </form>
  );
}

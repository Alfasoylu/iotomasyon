"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { Button } from "@/components/ui/button";
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

  const isDirty = name.trim() !== currentName || email.trim().toLowerCase() !== currentEmail;

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
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}
      {success && (
        <p className="rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
          Bilgiler güncellendi.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Ad Soyad</label>
          <input
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setSuccess(false); }}
            disabled={!canEdit || pending}
            required
            minLength={2}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none disabled:opacity-50"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">E-posta</label>
          <input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setSuccess(false); }}
            disabled={!canEdit || pending}
            required
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none disabled:opacity-50"
          />
        </div>
      </div>

      {canEdit && (
        <div className="flex justify-end">
          <Button type="submit" disabled={pending || !isDirty}>
            {pending ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </div>
      )}
    </form>
  );
}

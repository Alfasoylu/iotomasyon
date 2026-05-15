"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createUserAction } from "@/lib/actions/user-management-actions";
import { ROLE_LABELS, type UserRole } from "@/lib/user-roles";

interface NewUserFormProps {
  supportedRoles: UserRole[];
}

export function NewUserForm({ supportedRoles }: NewUserFormProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>(
    supportedRoles.includes("SALES") ? "SALES" : (supportedRoles[0] ?? "ADMIN"),
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    startTransition(async () => {
      const result = await createUserAction({ name, email, password, role });

      if (result.ok && result.redirectTo) {
        router.push(result.redirectTo);
        return;
      }

      setError(result.message ?? "Hata oluştu.");
      setPending(false);
    });
  }

  return (
    <Card className="max-w-lg p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Ad Soyad</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none"
            placeholder="Ali Veli"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">E-posta</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none"
            placeholder="ali@sirket.com"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Şifre</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none"
            placeholder="En az 8 karakter"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Rol</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm focus:border-slate-400 focus:outline-none"
          >
            {supportedRoles.map((supportedRole) => (
              <option key={supportedRole} value={supportedRole}>
                {ROLE_LABELS[supportedRole]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Oluşturuluyor..." : "Kullanıcı oluştur"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push("/admin/users")}
            disabled={pending}
          >
            İptal
          </Button>
        </div>
      </form>
    </Card>
  );
}

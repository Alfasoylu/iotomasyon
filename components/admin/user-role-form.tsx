"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  toggleUserActiveAction,
  updateUserRoleAction,
} from "@/lib/actions/user-management-actions";
import { ROLE_LABELS, type UserRole } from "@/lib/user-roles";

interface UserRoleFormProps {
  userId: string;
  currentRole: UserRole;
  supportedRoles: UserRole[];
  isActive: boolean;
  isCurrentUser: boolean;
}

export function UserRoleForm({
  userId,
  currentRole,
  supportedRoles,
  isActive,
  isCurrentUser,
}: UserRoleFormProps) {
  const router = useRouter();
  const [role, setRole] = useState<UserRole>(currentRole);
  const [rolePending, setRolePending] = useState(false);
  const [activePending, setActivePending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleRoleSave() {
    setRolePending(true);
    setError(null);
    startTransition(async () => {
      const result = await updateUserRoleAction(userId, role);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.message ?? "Hata oluştu.");
      }
      setRolePending(false);
    });
  }

  function handleToggleActive() {
    setActivePending(true);
    setError(null);
    startTransition(async () => {
      const result = await toggleUserActiveAction(userId, !isActive);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.message ?? "Hata oluştu.");
      }
      setActivePending(false);
    });
  }

  return (
    <div className="space-y-4">
      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Rol</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            disabled={isCurrentUser || rolePending}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-slate-400 focus:outline-none disabled:opacity-50"
          >
            {supportedRoles.map((supportedRole) => (
              <option key={supportedRole} value={supportedRole}>
                {ROLE_LABELS[supportedRole]}
              </option>
            ))}
          </select>
        </div>
        <Button
          onClick={handleRoleSave}
          disabled={isCurrentUser || rolePending || role === currentRole}
        >
          {rolePending ? "Kaydediliyor..." : "Kaydet"}
        </Button>
      </div>

      {!isCurrentUser && (
        <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-900">Hesap durumu</p>
            <p className="text-xs text-slate-500">
              {isActive ? "Kullanıcı sisteme giriş yapabilir." : "Kullanıcı giriş yapamaz."}
            </p>
          </div>
          <Button
            variant={isActive ? "danger" : "secondary"}
            disabled={activePending}
            onClick={handleToggleActive}
          >
            {activePending ? "..." : isActive ? "Devre dışı bırak" : "Aktif et"}
          </Button>
        </div>
      )}
    </div>
  );
}

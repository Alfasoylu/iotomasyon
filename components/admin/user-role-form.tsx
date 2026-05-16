"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

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
  const [roleSuccess, setRoleSuccess] = useState(false);

  function handleRoleSave() {
    setRolePending(true);
    setError(null);
    setRoleSuccess(false);
    startTransition(async () => {
      const result = await updateUserRoleAction(userId, role);
      if (result.ok) {
        setRoleSuccess(true);
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
    <div className="space-y-5">
      {error && (
        <p className="flex items-center gap-1.5 text-sm text-red-600">
          <span className="text-base leading-none">⚠</span> {error}
        </p>
      )}

      {/* Role selector */}
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-400">
          Rol
        </label>
        <div className="flex items-center gap-3">
          <select
            value={role}
            onChange={(e) => { setRole(e.target.value as UserRole); setRoleSuccess(false); }}
            disabled={isCurrentUser || rolePending}
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
          >
            {supportedRoles.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleRoleSave}
            disabled={isCurrentUser || rolePending || role === currentRole}
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {rolePending ? "Kaydediliyor…" : "Kaydet"}
          </button>
        </div>
        {isCurrentUser && (
          <p className="text-xs text-slate-400">Kendi rolünüzü değiştiremezsiniz.</p>
        )}
        {roleSuccess && (
          <p className="flex items-center gap-1.5 text-xs text-emerald-600">
            <span>✓</span> Rol güncellendi.
          </p>
        )}
      </div>

      {/* Active toggle — not shown for self */}
      {!isCurrentUser && (
        <div className={`flex items-center justify-between rounded-xl border px-4 py-3.5 ${isActive ? "border-slate-200 bg-white" : "border-red-100 bg-red-50"}`}>
          <div>
            <p className="text-sm font-medium text-slate-900">
              {isActive ? "Hesap aktif" : "Hesap pasif"}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">
              {isActive
                ? "Kullanıcı sisteme giriş yapabilir."
                : "Kullanıcı giriş yapamaz."}
            </p>
          </div>
          <button
            type="button"
            disabled={activePending}
            onClick={handleToggleActive}
            className={`rounded-lg px-4 py-2 text-sm font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${
              isActive
                ? "bg-red-600 text-white hover:bg-red-700"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            }`}
          >
            {activePending ? "…" : isActive ? "Devre dışı bırak" : "Aktif et"}
          </button>
        </div>
      )}
    </div>
  );
}

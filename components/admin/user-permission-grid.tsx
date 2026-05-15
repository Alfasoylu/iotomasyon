"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { setUserPermissionAction } from "@/lib/actions/user-management-actions";

export type PermissionRow = {
  id: string;
  key: string;
  name: string;
  category: string;
  /** Current override for this user: true=grant, false=deny, null=no override (role default applies) */
  override: boolean | null;
  /** Whether the user's role grants this permission by default */
  roleDefault: boolean;
};

interface UserPermissionGridProps {
  userId: string;
  permissions: PermissionRow[];
  canEdit: boolean;
}

const OVERRIDE_LABELS = {
  grant:  { label: "Verildi",   className: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" },
  deny:   { label: "Engellendi", className: "bg-red-50 text-red-700 ring-1 ring-red-200" },
  inherit:{ label: "Varsayılan", className: "bg-slate-100 text-slate-600 ring-1 ring-slate-200" },
};

function overrideState(override: boolean | null): "grant" | "deny" | "inherit" {
  if (override === true) return "grant";
  if (override === false) return "deny";
  return "inherit";
}

// Group permissions by category
function groupByCategory(permissions: PermissionRow[]): Map<string, PermissionRow[]> {
  const map = new Map<string, PermissionRow[]>();
  for (const perm of permissions) {
    const list = map.get(perm.category) ?? [];
    list.push(perm);
    map.set(perm.category, list);
  }
  return map;
}

export function UserPermissionGrid({ userId, permissions, canEdit }: UserPermissionGridProps) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function cycle(perm: PermissionRow) {
    if (!canEdit || pending) return;
    // Cycle: inherit → grant → deny → inherit
    const current = overrideState(perm.override);
    const next: boolean | null =
      current === "inherit" ? true : current === "grant" ? false : null;

    setPending(perm.key);
    setError(null);
    startTransition(async () => {
      const result = await setUserPermissionAction(userId, perm.key, next);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.message ?? "Hata oluştu.");
      }
      setPending(null);
    });
  }

  const grouped = groupByCategory(permissions);

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
      )}

      {canEdit && (
        <p className="text-xs text-slate-500">
          Her izne tıklayarak üç durumu arasında geçiş yapın:{" "}
          <span className="font-medium text-slate-700">Varsayılan → Verildi → Engellendi → Varsayılan</span>
        </p>
      )}

      {Array.from(grouped.entries()).map(([category, perms]) => (
        <div key={category}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            {category}
          </h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {perms.map((perm) => {
              const state = overrideState(perm.override);
              const badge = OVERRIDE_LABELS[state];
              const isPending = pending === perm.key;

              return (
                <button
                  key={perm.key}
                  disabled={!canEdit || !!pending}
                  onClick={() => cycle(perm)}
                  className={`flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2.5 text-left transition ${
                    canEdit
                      ? "cursor-pointer hover:border-slate-300 hover:bg-slate-50"
                      : "cursor-default"
                  } ${isPending ? "opacity-50" : ""}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{perm.name}</p>
                    <p className="truncate text-xs text-slate-500">{perm.key}</p>
                    {perm.roleDefault && state === "inherit" && (
                      <p className="text-xs text-emerald-600">Rol varsayılanı: aktif</p>
                    )}
                  </div>
                  <span className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${badge.className}`}>
                    {isPending ? "..." : badge.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

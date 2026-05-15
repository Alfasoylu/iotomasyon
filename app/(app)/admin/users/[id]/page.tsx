import Link from "next/link";
import { notFound } from "next/navigation";

import { UserPermissionGrid, type PermissionRow } from "@/components/admin/user-permission-grid";
import { UserRoleForm } from "@/components/admin/user-role-form";
import { getCurrentSession, requirePermission, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS, type UserRole } from "@/lib/user-roles";
import { getSupportedUserRoles } from "@/lib/user-role-support";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, currentSession, supportedRoles] = await Promise.all([
    params,
    getCurrentSession(),
    getSupportedUserRoles(),
  ]);

  await requirePermission(PERMISSIONS.USERS_READ);
  const canManagePerms = currentSession
    ? await checkPermission(currentSession, PERMISSIONS.PERMISSIONS_MANAGE)
    : false;

  // Try to load user with Phase 5 permission overrides.
  // Falls back to basic user data if Phase 5 tables haven't been migrated yet.
  type UserWithPerms = {
    id: string; name: string; email: string; role: string;
    isActive: boolean; createdAt: Date;
    userPermissions: Array<{ granted: boolean; permission: { id: string; key: string } }>;
  };
  let targetUser: UserWithPerms | null = null;
  let phase5Available = true;

  try {
    const row = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true, name: true, email: true, role: true, isActive: true, createdAt: true,
        userPermissions: {
          select: { granted: true, permission: { select: { id: true, key: true } } },
        },
      },
    });
    targetUser = row ? { ...row, role: row.role as string } : null;
  } catch {
    phase5Available = false;
    const row = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    });
    targetUser = row ? { ...row, role: row.role as string, userPermissions: [] } : null;
  }

  if (!targetUser) notFound();

  let allPermissions: { id: string; key: string; name: string; category: string }[] = [];
  let roleDefaultKeys = new Set<string>();

  if (phase5Available) {
    try {
      const [perms, roleRecord] = await Promise.all([
        prisma.permission.findMany({
          orderBy: [{ category: "asc" }, { name: "asc" }],
          select: { id: true, key: true, name: true, category: true },
        }),
        prisma.role.findUnique({
          where: { key: targetUser.role },
          select: { permissions: { select: { permission: { select: { key: true } } } } },
        }),
      ]);
      allPermissions = perms;
      roleDefaultKeys = new Set(roleRecord?.permissions.map((rp) => rp.permission.key) ?? []);
    } catch {
      // Phase 5 tables inaccessible mid-request — proceed with empty collections.
      phase5Available = false;
    }
  }

  const overrideMap = new Map<string, boolean>();
  for (const up of targetUser.userPermissions) {
    overrideMap.set(up.permission.key, up.granted);
  }

  const permissionRows: PermissionRow[] = allPermissions.map((perm) => ({
    id: perm.id,
    key: perm.key,
    name: perm.name,
    category: perm.category,
    override: overrideMap.has(perm.key) ? (overrideMap.get(perm.key) ?? null) : null,
    roleDefault: roleDefaultKeys.has(perm.key),
  }));

  const isCurrentUser = currentSession?.id === targetUser.id;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          <Link href="/admin/users" className="hover:text-slate-700">
            Kullanıcılar
          </Link>
          {" / "}
          {targetUser.name}
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          {targetUser.name}
        </h1>
        <div className="mt-2 flex items-center gap-2">
          <p className="text-sm text-slate-600">{targetUser.email}</p>
          <Badge tone={targetUser.isActive ? "success" : "danger"}>
            {targetUser.isActive ? "Aktif" : "Pasif"}
          </Badge>
          <Badge tone="default">{ROLE_LABELS[targetUser.role as UserRole] ?? targetUser.role}</Badge>
        </div>
      </div>

      <Card className="p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Rol ve hesap durumu</h2>
        <UserRoleForm
          userId={targetUser.id}
          currentRole={targetUser.role as UserRole}
          supportedRoles={supportedRoles}
          isActive={targetUser.isActive}
          isCurrentUser={isCurrentUser}
        />
      </Card>

      <Card className="p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">İzin geçersiz kılmaları</h2>
            <p className="mt-1 text-sm text-slate-500">
              Rol varsayılanlarının üstüne yazılan kullanıcıya özel izinler.
              {!canManagePerms && " (Düzenleme için permissions.manage yetkisi gereklidir.)"}
            </p>
          </div>
          <p className="text-xs text-slate-400">
            {targetUser.userPermissions.length} geçersiz kılma
          </p>
        </div>
        {!phase5Available ? (
          <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            İzin yönetimi için Phase 5 veritabanı migrasyonunun uygulanması gerekiyor.
          </p>
        ) : (
          <UserPermissionGrid
            userId={targetUser.id}
            permissions={permissionRows}
            canEdit={canManagePerms && !isCurrentUser}
          />
        )}
      </Card>
    </div>
  );
}

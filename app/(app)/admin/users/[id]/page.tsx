import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { UserRoleForm } from "@/components/admin/user-role-form";
import { UserPermissionGrid, type PermissionRow } from "@/components/admin/user-permission-grid";
import { getCurrentSession, requirePermission, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ id }, currentSession] = await Promise.all([params, getCurrentSession()]);

  await requirePermission(PERMISSIONS.USERS_READ);
  const canManagePerms = currentSession
    ? await checkPermission(currentSession, PERMISSIONS.PERMISSIONS_MANAGE)
    : false;

  const targetUser = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      userPermissions: {
        select: {
          granted: true,
          permission: { select: { id: true, key: true } },
        },
      },
    },
  });

  if (!targetUser) notFound();

  // Load all permissions grouped by category
  const allPermissions = await prisma.permission.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: { id: true, key: true, name: true, category: true },
  });

  // Load role defaults for the user's current role
  const roleRecord = await prisma.role.findUnique({
    where: { key: targetUser.role },
    select: {
      permissions: { select: { permission: { select: { key: true } } } },
    },
  });
  const roleDefaultKeys = new Set(
    roleRecord?.permissions.map((rp) => rp.permission.key) ?? [],
  );

  // Build per-user override map
  const overrideMap = new Map<string, boolean>();
  for (const up of targetUser.userPermissions) {
    overrideMap.set(up.permission.key, up.granted);
  }

  // Compose full permission rows
  const permissionRows: PermissionRow[] = allPermissions.map((perm) => ({
    id: perm.id,
    key: perm.key,
    name: perm.name,
    category: perm.category,
    override: overrideMap.has(perm.key) ? (overrideMap.get(perm.key) ?? null) : null,
    roleDefault: roleDefaultKeys.has(perm.key),
  }));

  const isCurrentUser = currentSession?.id === targetUser.id;
  const ROLE_LABELS: Record<string, string> = {
    ADMIN: "Admin", SALES: "Satış", OPERATIONS: "Operasyon",
    MARKETPLACE_OPERATOR: "Mağaza Operatörü", CUSTOM: "Özel",
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          <Link href="/admin/users" className="hover:text-slate-700">Kullanıcılar</Link>
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
          <Badge tone="default">{ROLE_LABELS[targetUser.role] ?? targetUser.role}</Badge>
        </div>
      </div>

      {/* Role & Status */}
      <Card className="p-6">
        <h2 className="mb-4 text-base font-semibold text-slate-900">Rol ve hesap durumu</h2>
        <UserRoleForm
          userId={targetUser.id}
          currentRole={targetUser.role as "ADMIN" | "SALES" | "OPERATIONS" | "MARKETPLACE_OPERATOR" | "CUSTOM"}
          isActive={targetUser.isActive}
          isCurrentUser={isCurrentUser}
        />
      </Card>

      {/* Permission overrides */}
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
        <UserPermissionGrid
          userId={targetUser.id}
          permissions={permissionRows}
          canEdit={canManagePerms && !isCurrentUser}
        />
      </Card>
    </div>
  );
}

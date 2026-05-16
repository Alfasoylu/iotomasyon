import Link from "next/link";
import { notFound } from "next/navigation";

import { UserPermissionGrid, type PermissionRow } from "@/components/admin/user-permission-grid";
import { UserPasswordForm } from "@/components/admin/user-password-form";
import { UserProfileForm } from "@/components/admin/user-profile-form";
import { UserRoleForm } from "@/components/admin/user-role-form";
import { getCurrentSession, requirePermission, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { ROLE_LABELS, type UserRole } from "@/lib/user-roles";
import { getSupportedUserRoles } from "@/lib/user-role-support";

export const dynamic = "force-dynamic";

const ROLE_COLOR: Record<string, string> = {
  ADMIN:                "bg-red-100 text-red-700 ring-red-200",
  SALES:                "bg-emerald-100 text-emerald-700 ring-emerald-200",
  OPERATIONS:           "bg-amber-100 text-amber-700 ring-amber-200",
  MARKETPLACE_OPERATOR: "bg-blue-100 text-blue-700 ring-blue-200",
  CUSTOM:               "bg-slate-100 text-slate-600 ring-slate-200",
};

// Deterministic avatar background from name
const AVATAR_COLORS = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500",
  "bg-orange-500", "bg-rose-500", "bg-indigo-500",
];
function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

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
  const [canManagePerms, canManageUsers] = currentSession
    ? await Promise.all([
        checkPermission(currentSession, PERMISSIONS.PERMISSIONS_MANAGE),
        checkPermission(currentSession, PERMISSIONS.USERS_UPDATE),
      ])
    : [false, false];

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
  const roleKey = targetUser.role as UserRole;
  const roleLabel = ROLE_LABELS[roleKey] ?? targetUser.role;
  const roleCls = ROLE_COLOR[targetUser.role] ?? ROLE_COLOR.CUSTOM;
  const createdDate = new Intl.DateTimeFormat("tr-TR", { dateStyle: "long" }).format(targetUser.createdAt);

  return (
    <div className="mx-auto max-w-3xl space-y-6">

      {/* ── Breadcrumb ── */}
      <nav className="flex items-center gap-1.5 text-sm text-slate-400">
        <Link href="/admin/users" className="hover:text-slate-600 transition">Kullanıcılar</Link>
        <span>/</span>
        <span className="text-slate-600">{targetUser.name}</span>
      </nav>

      {/* ── User hero card ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-5">
          {/* Avatar */}
          <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-xl font-bold text-white shadow-inner ${avatarColor(targetUser.name)}`}>
            {initials(targetUser.name)}
          </div>
          {/* Info */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-slate-900">{targetUser.name}</h1>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${roleCls}`}>
                {roleLabel}
              </span>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${targetUser.isActive ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-red-50 text-red-600 ring-red-200"}`}>
                {targetUser.isActive ? "Aktif" : "Pasif"}
              </span>
              {isCurrentUser && (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
                  Sen
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-slate-500">{targetUser.email}</p>
            <p className="mt-0.5 text-xs text-slate-400">Kayıt: {createdDate}</p>
          </div>
        </div>
      </div>

      {/* ── Profil bilgileri ── */}
      <Section
        icon="👤"
        title="Profil bilgileri"
        description="Kullanıcının adı ve e-posta adresi."
      >
        <UserProfileForm
          userId={targetUser.id}
          currentName={targetUser.name}
          currentEmail={targetUser.email}
          canEdit={canManageUsers}
        />
      </Section>

      {/* ── Şifre ── */}
      <Section
        icon="🔑"
        title="Şifre"
        description={
          canManageUsers
            ? "Yeni şifre belirleyin veya güçlü şifre üretin."
            : "Şifre değiştirmek için users.update yetkisi gereklidir."
        }
      >
        <UserPasswordForm userId={targetUser.id} canEdit={canManageUsers} />
      </Section>

      {/* ── Rol ve hesap ── */}
      <Section
        icon="🛡️"
        title="Rol ve hesap durumu"
        description="Kullanıcının sistem rolü ve giriş yetkisi."
      >
        <UserRoleForm
          userId={targetUser.id}
          currentRole={roleKey}
          supportedRoles={supportedRoles}
          isActive={targetUser.isActive}
          isCurrentUser={isCurrentUser}
        />
      </Section>

      {/* ── İzin özelleştirme ── */}
      <Section
        icon="⚙️"
        title="İzin özelleştirme"
        description="Rol varsayılanlarının üstüne yazılan kullanıcıya özel izinler."
        badge={targetUser.userPermissions.length > 0 ? `${targetUser.userPermissions.length} özel kural` : undefined}
        note={!canManagePerms ? "Düzenlemek için permissions.manage yetkisi gereklidir." : undefined}
      >
        {!phase5Available ? (
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            İzin yönetimi için Phase 5 veritabanı migrasyonunun uygulanması gerekiyor.
          </div>
        ) : (
          <UserPermissionGrid
            userId={targetUser.id}
            permissions={permissionRows}
            canEdit={canManagePerms && !isCurrentUser}
          />
        )}
      </Section>
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({
  icon,
  title,
  description,
  badge,
  note,
  children,
}: {
  icon: string;
  title: string;
  description: string;
  badge?: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-slate-100 px-6 py-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-lg leading-none">{icon}</span>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
            <p className="mt-0.5 text-xs text-slate-400">{description}</p>
            {note && <p className="mt-1 text-xs text-amber-600">{note}</p>}
          </div>
        </div>
        {badge && (
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
            {badge}
          </span>
        )}
      </div>
      {/* Body */}
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

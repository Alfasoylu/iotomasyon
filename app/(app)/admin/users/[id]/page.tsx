import Link from "next/link";
import { notFound } from "next/navigation";
import { User, Key, Shield, Settings, AlertTriangle } from "lucide-react";

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

const ROLE_TONE: Record<string, { bg: string; fg: string; border: string }> = {
  ADMIN:                { bg: "var(--danger-dim)", fg: "var(--danger)",       border: "var(--danger-border)" },
  SALES:                { bg: "var(--ok-dim)",     fg: "var(--ok)",           border: "var(--ok-border)" },
  OPERATIONS:           { bg: "var(--warn-dim)",   fg: "var(--warn)",         border: "var(--warn-border)" },
  WAREHOUSE:            { bg: "var(--info-dim)",   fg: "var(--info)",         border: "var(--info-border)" },
  MARKETPLACE_OPERATOR: { bg: "var(--info-dim)",   fg: "var(--info)",         border: "var(--info-border)" },
  CUSTOM:               { bg: "var(--surface-3)",  fg: "var(--text-secondary)", border: "var(--border-default)" },
};

// Deterministic avatar background from name
const AVATAR_HUES = [220, 260, 160, 30, 350, 200];
function avatarHue(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_HUES[h % AVATAR_HUES.length];
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
  const roleTone = ROLE_TONE[targetUser.role] ?? ROLE_TONE.CUSTOM;
  const createdDate = new Intl.DateTimeFormat("tr-TR", { dateStyle: "long" }).format(targetUser.createdAt);
  const hue = avatarHue(targetUser.name);

  return (
    <div className="mx-auto max-w-3xl space-y-6">

      {/* ── Breadcrumb ── */}
      <nav className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
        <Link href="/admin/users" className="hover:text-[var(--text-secondary)] transition">Kullanıcılar</Link>
        <span>/</span>
        <span className="text-[var(--text-secondary)]">{targetUser.name}</span>
      </nav>

      {/* ── User hero card ── */}
      <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-6">
        <div className="flex items-center gap-5">
          {/* Avatar */}
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md text-lg font-semibold text-white"
            style={{ backgroundColor: `hsl(${hue} 55% 45%)` }}
          >
            {initials(targetUser.name)}
          </div>
          {/* Info */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">{targetUser.name}</h1>
              <span
                className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium border"
                style={{ backgroundColor: roleTone.bg, color: roleTone.fg, borderColor: roleTone.border }}
              >
                {roleLabel}
              </span>
              <span
                className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium border"
                style={
                  targetUser.isActive
                    ? { backgroundColor: "var(--ok-dim)", color: "var(--ok)", borderColor: "var(--ok-border)" }
                    : { backgroundColor: "var(--danger-dim)", color: "var(--danger)", borderColor: "var(--danger-border)" }
                }
              >
                {targetUser.isActive ? "Aktif" : "Pasif"}
              </span>
              {isCurrentUser && (
                <span className="inline-flex items-center rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
                  Sen
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">{targetUser.email}</p>
            <p className="mt-0.5 text-xs text-[var(--text-muted)] tabular-nums font-mono">Kayıt: {createdDate}</p>
          </div>
        </div>
      </div>

      {/* ── Profil bilgileri ── */}
      <Section
        icon={User}
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
        icon={Key}
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
        icon={Shield}
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
        icon={Settings}
        title="İzin özelleştirme"
        description="Rol varsayılanlarının üstüne yazılan kullanıcıya özel izinler."
        badge={targetUser.userPermissions.length > 0 ? `${targetUser.userPermissions.length} özel kural` : undefined}
        note={!canManagePerms ? "Düzenlemek için permissions.manage yetkisi gereklidir." : undefined}
      >
        {!phase5Available ? (
          <div className="flex items-start gap-2 rounded-md border border-[var(--warn-border)] bg-[var(--warn-dim)] px-4 py-3 text-sm text-[var(--warn)]">
            <AlertTriangle size={14} strokeWidth={1.5} className="mt-0.5 shrink-0" />
            <span>İzin yönetimi için Phase 5 veritabanı migrasyonunun uygulanması gerekiyor.</span>
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
  icon: Icon,
  title,
  description,
  badge,
  note,
  children,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  title: string;
  description: string;
  badge?: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)]">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-[var(--border-subtle)] px-6 py-4">
        <div className="flex items-start gap-3">
          <Icon size={14} strokeWidth={1.5} className="mt-1 text-[var(--text-muted)]" />
          <div>
            <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-secondary)]">{title}</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">{description}</p>
            {note && <p className="mt-1 text-xs text-[var(--warn)]">{note}</p>}
          </div>
        </div>
        {badge && (
          <span className="shrink-0 rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]">
            {badge}
          </span>
        )}
      </div>
      {/* Body */}
      <div className="px-6 py-5">{children}</div>
    </div>
  );
}

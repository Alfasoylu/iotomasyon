import Link from "next/link";

import { NewUserForm } from "@/components/admin/new-user-form";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { getSupportedUserRoles } from "@/lib/user-role-support";

export const dynamic = "force-dynamic";

export default async function NewUserPage() {
  await requirePermission(PERMISSIONS.USERS_CREATE);
  const supportedRoles = await getSupportedUserRoles();

  return (
    <div className="space-y-6">
      <div>
        <nav className="flex flex-wrap items-center gap-1 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
          <span>Yönetim</span>
          <span className="text-[var(--border-default)]">/</span>
          <Link href="/admin/users" className="transition hover:text-[var(--text-primary)]">
            ← Kullanıcılar
          </Link>
        </nav>
        <h1 className="mt-3 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
          Yeni kullanıcı
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
          Yeni bir sistem kullanıcısı oluşturun.
        </p>
      </div>

      <NewUserForm supportedRoles={supportedRoles} />
    </div>
  );
}

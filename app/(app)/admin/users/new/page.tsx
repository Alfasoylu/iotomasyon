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
        <nav className="flex flex-wrap items-center gap-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
          <span>Yönetim</span>
          <span className="text-slate-300">/</span>
          <Link href="/admin/users" className="hover:text-slate-900 transition">
            ← Kullanıcılar
          </Link>
        </nav>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Yeni kullanıcı
        </h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          Yeni bir sistem kullanıcısı oluşturun.
        </p>
      </div>

      <NewUserForm supportedRoles={supportedRoles} />
    </div>
  );
}

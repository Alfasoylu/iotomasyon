import { NewUserForm } from "@/components/admin/new-user-form";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function NewUserPage() {
  await requirePermission(PERMISSIONS.USERS_CREATE);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          Yönetim / Kullanıcılar / Yeni
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Yeni kullanıcı
        </h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          Yeni bir sistem kullanıcısı oluşturun.
        </p>
      </div>

      <NewUserForm />
    </div>
  );
}

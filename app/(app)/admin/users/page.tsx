import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ROLE_LABELS: Record<string, string> = {
  ADMIN:                "Admin",
  SALES:                "Satış",
  OPERATIONS:           "Operasyon",
  WAREHOUSE:            "Depo",
  MARKETPLACE_OPERATOR: "Mağaza Operatörü",
  CUSTOM:               "Özel",
};

const ROLE_TONE: Record<string, "default" | "success" | "warning" | "danger"> = {
  ADMIN:                "danger",
  SALES:                "success",
  OPERATIONS:           "warning",
  WAREHOUSE:            "default",
  MARKETPLACE_OPERATOR: "default",
  CUSTOM:               "default",
};

export default async function AdminUsersPage() {
  await requirePermission(PERMISSIONS.USERS_READ);

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Yönetim
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Kullanıcılar
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Sistem kullanıcılarını ve yetkilerini yönetin.
          </p>
        </div>
        <Link href="/admin/users/new">
          <Button>Yeni kullanıcı</Button>
        </Link>
      </div>

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Ad</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">E-posta</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Rol</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Durum</th>
              <th className="px-4 py-3 text-left font-medium text-slate-600">Kayıt tarihi</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-900">{u.name}</td>
                <td className="px-4 py-3 text-slate-600">{u.email}</td>
                <td className="px-4 py-3">
                  <Badge tone={ROLE_TONE[u.role] ?? "default"}>
                    {ROLE_LABELS[u.role] ?? u.role}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={u.isActive ? "success" : "danger"}>
                    {u.isActive ? "Aktif" : "Pasif"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium" }).format(u.createdAt)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/users/${u.id}`}>
                    <Button variant="secondary">Düzenle</Button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

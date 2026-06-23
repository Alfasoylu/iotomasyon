import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { runWithPdksAdmin } from "@/lib/pdks/admin";
import { prismaPdks } from "@/lib/pdks/prisma";
import { WorksiteManager } from "@/components/admin/pdks/worksite-manager";

export const dynamic = "force-dynamic";

export default async function PdksWorksitePage() {
  const user = await requirePermission(PERMISSIONS.PDKS_MANAGE);

  const { worksites, employees } = await runWithPdksAdmin(user, async () => {
    const [ws, emps] = await Promise.all([
      prismaPdks.pdksWorksite.findMany({
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        include: { personnel: { select: { personnelId: true } } },
      }),
      prismaPdks.pdksPersonnel.findMany({
        where: { isActive: true, role: "employee" },
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true },
      }),
    ]);
    return {
      worksites: ws.map((w) => ({
        id: w.id,
        name: w.name,
        latitude: w.latitude,
        longitude: w.longitude,
        radiusMeters: w.radiusMeters,
        maxAccuracyMeters: w.maxAccuracyMeters,
        isActive: w.isActive,
        assigned: w.personnel.map((p) => p.personnelId),
      })),
      employees: emps,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Devam Takip
          </p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
            Şantiyeler
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Şantiye konumu (enlem/boylam) ve yarıçapı tanımlayın; personel atayın.
            Giriş/çıkış bu sınıra göre sunucuda doğrulanır.
          </p>
        </div>
        <Link href="/admin/pdks">
          <Button variant="secondary">← Pano</Button>
        </Link>
      </div>

      <WorksiteManager initial={worksites} employees={employees} />
    </div>
  );
}

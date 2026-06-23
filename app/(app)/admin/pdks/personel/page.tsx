import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { runWithPdksAdmin } from "@/lib/pdks/admin";
import { prismaPdks } from "@/lib/pdks/prisma";
import { PersonnelManager } from "@/components/admin/pdks/personnel-manager";

export const dynamic = "force-dynamic";

export default async function PdksPersonnelPage() {
  const user = await requirePermission(PERMISSIONS.PDKS_MANAGE);

  const personnel = await runWithPdksAdmin(user, async () => {
    const list = await prismaPdks.pdksPersonnel.findMany({
      where: { role: "employee" },
      orderBy: [{ isActive: "desc" }, { fullName: "asc" }],
      select: {
        id: true,
        fullName: true,
        phone: true,
        expectedCheckIn: true,
        isActive: true,
      },
    });
    return list;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Devam Takip
          </p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
            Personel
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Personel ekleyin, telefon/beklenen giriş saatini düzenleyin, tek kullanımlık
            giriş kodu üretin.
          </p>
        </div>
        <Link href="/admin/pdks">
          <Button variant="secondary">← Pano</Button>
        </Link>
      </div>

      <PersonnelManager initial={personnel} />
    </div>
  );
}

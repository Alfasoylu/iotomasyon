import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { runWithPdksAdmin } from "@/lib/pdks/admin";
import { prismaPdks } from "@/lib/pdks/prisma";
import { LeaveManager, type LeaveRow } from "@/components/admin/pdks/leave-manager";

export const dynamic = "force-dynamic";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function PdksLeavesPage() {
  const user = await requirePermission(PERMISSIONS.PDKS_MANAGE);

  const { leaves, personnel } = await runWithPdksAdmin(user, async () => {
    const [rows, emps] = await Promise.all([
      prismaPdks.pdksLeave.findMany({
        orderBy: { createdAt: "desc" },
        take: 200,
        include: { personnel: { select: { fullName: true } } },
      }),
      prismaPdks.pdksPersonnel.findMany({
        where: { isActive: true, role: "employee" },
        orderBy: { fullName: "asc" },
        select: { id: true, fullName: true },
      }),
    ]);
    const leaves: LeaveRow[] = rows.map((l) => ({
      id: l.id,
      personnelName: l.personnel.fullName,
      startDate: ymd(l.startDate),
      endDate: ymd(l.endDate),
      type: l.type,
      status: l.status,
      reason: l.reason,
      requestedBy: l.requestedBy,
    }));
    return { leaves, personnel: emps };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Devam Takip
          </p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
            İzinler
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Personelin izin talepleri burada onaylanır. Onaylı izin günlerinde geç-kalma
            uyarısı gönderilmez. Yönetici doğrudan izin de tanımlayabilir.
          </p>
        </div>
        <Link href="/admin/pdks">
          <Button variant="secondary">← Pano</Button>
        </Link>
      </div>

      <LeaveManager leaves={leaves} personnel={personnel} />
    </div>
  );
}

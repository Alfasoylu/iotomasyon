import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { runWithPdksAdmin } from "@/lib/pdks/admin";
import { prisma } from "@/lib/prisma";
import { parseWeekSchedule } from "@/lib/pdks/schedule";
import { parseHolidays } from "@/lib/pdks/holidays";
import { WorkScheduleEditor } from "@/components/admin/pdks/work-schedule-editor";
import { HolidaysEditor } from "@/components/admin/pdks/holidays-editor";

export const dynamic = "force-dynamic";

export default async function PdksWorkSchedulePage() {
  const user = await requirePermission(PERMISSIONS.PDKS_MANAGE);

  const { week, holidays } = await runWithPdksAdmin(user, async (tenantId) => {
    const t = await prisma.pdksTenant.findUnique({
      where: { id: tenantId },
      select: { workScheduleJson: true, holidaysJson: true },
    });
    return { week: parseWeekSchedule(t?.workScheduleJson), holidays: parseHolidays(t?.holidaysJson) };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Devam Takip
          </p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
            Çalışma Saatleri
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Haftalık program; geç-kalma hatırlatması ve otomatik çıkış buna göre çalışır.
            Tatil günlerinde işlem yapılmaz. Bir personelin saati farklıysa, Personel
            kartındaki giriş/çıkış alanı o kişi için bu programı geçersiz kılar.
          </p>
        </div>
        <Link href="/admin/pdks">
          <Button variant="secondary">← Pano</Button>
        </Link>
      </div>

      <WorkScheduleEditor initial={week} />

      <div>
        <h2 className="mb-2 text-base font-semibold text-[var(--text-primary)]">Resmi Tatiller</h2>
        <p className="mb-3 text-sm text-[var(--text-secondary)]">
          Bu günlerde geç-kalma/otomatik-çıkış işlemi yapılmaz ve aylık raporda beklenen iş
          gününden düşülür. &quot;2026 Türkiye tatillerini yükle&quot; ile hazır listeyi ekleyin.
        </p>
        <HolidaysEditor initial={holidays} />
      </div>
    </div>
  );
}

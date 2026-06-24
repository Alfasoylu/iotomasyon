import { getPdksSession, withPdksSession } from "@/lib/pdks/auth";
import { prismaPdks } from "@/lib/pdks/prisma";
import { workDateTR } from "@/lib/pdks/geo";
import { PersonnelApp, type HistoryRow, type LeaveItem } from "@/components/pdks/personnel-app";

export const dynamic = "force-dynamic";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function trDateShort(d: Date): string {
  return d.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Istanbul",
  });
}
function trClock(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  });
}

export default async function PdksPage() {
  const session = await getPdksSession();
  if (!session) {
    return <PersonnelApp initial={{ authed: false }} history={[]} />;
  }

  const data = await withPdksSession(async () => {
    const [rec, me, recent, leaveRows] = await Promise.all([
      prismaPdks.pdksAttendanceRecord.findFirst({
        where: { personnelId: session.personnelId, workDate: workDateTR() },
        orderBy: { createdAt: "desc" },
      }),
      prismaPdks.pdksPersonnel.findUnique({ where: { id: session.personnelId } }),
      prismaPdks.pdksAttendanceRecord.findMany({
        where: { personnelId: session.personnelId },
        orderBy: [{ workDate: "desc" }, { createdAt: "desc" }],
        take: 14,
      }),
      prismaPdks.pdksLeave.findMany({
        where: { personnelId: session.personnelId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);
    return { rec, name: me?.fullName ?? "", consented: !!me?.kvkkConsentAt, recent, leaveRows };
  });

  const leaves: LeaveItem[] = (data?.leaveRows ?? []).map((l) => ({
    id: l.id,
    startDate: ymd(l.startDate),
    endDate: ymd(l.endDate),
    type: l.type,
    status: l.status,
  }));

  const history: HistoryRow[] = (data?.recent ?? []).map((r) => ({
    id: r.id,
    dateLabel: trDateShort(r.workDate),
    checkIn: trClock(r.checkInAt),
    checkOut: trClock(r.checkOutAt),
    hours:
      r.checkInAt && r.checkOutAt
        ? `${((r.checkOutAt.getTime() - r.checkInAt.getTime()) / 3_600_000).toFixed(1)} s`
        : "—",
    auto: r.autoCheckout,
    open: r.status === "open",
  }));

  return (
    <PersonnelApp
      initial={{
        authed: true,
        role: session.role,
        name: data?.name ?? "",
        consented: data?.consented ?? false,
        status: data?.rec?.status ?? null,
        checkInAt: data?.rec?.checkInAt?.toISOString() ?? null,
        checkOutAt: data?.rec?.checkOutAt?.toISOString() ?? null,
        overtime: data?.rec?.overtime ?? false,
      }}
      history={history}
      leaves={leaves}
    />
  );
}

import { getPdksSession, withPdksSession } from "@/lib/pdks/auth";
import { prismaPdks } from "@/lib/pdks/prisma";
import { workDateTR } from "@/lib/pdks/geo";
import { PersonnelApp } from "@/components/pdks/personnel-app";

export const dynamic = "force-dynamic";

export default async function PdksPage() {
  const session = await getPdksSession();
  if (!session) {
    return <PersonnelApp initial={{ authed: false }} />;
  }

  const data = await withPdksSession(async () => {
    const [rec, me] = await Promise.all([
      prismaPdks.pdksAttendanceRecord.findFirst({
        where: { personnelId: session.personnelId, workDate: workDateTR() },
        orderBy: { createdAt: "desc" },
      }),
      prismaPdks.pdksPersonnel.findUnique({ where: { id: session.personnelId } }),
    ]);
    return { rec, name: me?.fullName ?? "" };
  });

  return (
    <PersonnelApp
      initial={{
        authed: true,
        role: session.role,
        name: data?.name ?? "",
        status: data?.rec?.status ?? null,
        checkInAt: data?.rec?.checkInAt?.toISOString() ?? null,
        checkOutAt: data?.rec?.checkOutAt?.toISOString() ?? null,
      }}
    />
  );
}

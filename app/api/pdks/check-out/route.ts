import { NextResponse, type NextRequest } from "next/server";

import { withPdksSession } from "@/lib/pdks/auth";
import { prismaPdks } from "@/lib/pdks/prisma";
import { distanceMeters, workDateTR } from "@/lib/pdks/geo";

export const dynamic = "force-dynamic";

/**
 * POST /api/pdks/check-out  body: { latitude?, longitude?, accuracy? }
 * Günün açık kaydını kapatır. Koordinat verilirse çıkış mesafesi de saklanır.
 */
export async function POST(req: NextRequest) {
  const result = await withPdksSession(async (session) => {
    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      // gövdesiz çıkışa izin ver
    }

    const lat = Number(body.latitude);
    const lng = Number(body.longitude);
    const accuracy = Number(body.accuracy);

    const workDate = workDateTR();
    const open = await prismaPdks.pdksAttendanceRecord.findFirst({
      where: { personnelId: session.personnelId, workDate, status: "open" },
    });
    if (!open) {
      return NextResponse.json({ error: "Bugün açık giriş kaydınız yok" }, { status: 409 });
    }

    let checkOutDistanceM: number | null = null;
    let checkOutAccuracyM: number | null = null;
    if (Number.isFinite(lat) && Number.isFinite(lng) && open.worksiteId) {
      const w = await prismaPdks.pdksWorksite.findUnique({ where: { id: open.worksiteId } });
      if (w) checkOutDistanceM = Math.round(distanceMeters(lat, lng, w.latitude, w.longitude));
      if (Number.isFinite(accuracy)) checkOutAccuracyM = Math.round(accuracy);
    }

    await prismaPdks.pdksAttendanceRecord.update({
      where: { id: open.id },
      data: {
        checkOutAt: new Date(),
        status: "closed",
        checkOutDistanceM,
        checkOutAccuracyM,
      },
    });

    return NextResponse.json({ ok: true, recordId: open.id });
  });

  return result ?? NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
}

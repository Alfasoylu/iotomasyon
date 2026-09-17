import { NextResponse, type NextRequest } from "next/server";

import { withPdksSession } from "@/lib/pdks/auth";
import { prismaPdks } from "@/lib/pdks/prisma";
import { leaveSchema } from "@/lib/validations/pdks";
import { ymdToDate } from "@/lib/pdks/leave";
import {
  BLOCKING_STATUSES,
  findOverlappingLeave,
  overlapMessage,
} from "@/lib/pdks/leave-overlap";

export const dynamic = "force-dynamic";

/**
 * POST /api/pdks/leave  body: { startDate, endDate, type, reason }
 * Personel izin TALEBİ oluşturur (status=pending). Yönetici onayı bekler.
 */
export async function POST(req: NextRequest) {
  const result = await withPdksSession(async (session) => {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
    }
    const parsed = leaveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Form alanlarını kontrol edin." },
        { status: 400 },
      );
    }

    const startDate = ymdToDate(parsed.data.startDate);
    const endDate = ymdToDate(parsed.data.endDate);

    // ÇAKIŞMA KONTROLÜ (daha önce YOKTU): aynı personel için üst üste binen
    // izinler oluşturulabiliyordu. Sonuç sessiz — puantaj aynı günü iki kez
    // izinli sayar, izin bakiyesi hesaplanmaya başlandığında gün sayısı şişer.
    // SQL aralığı daraltır, KARARI tek kaynak verir (lib/pdks/leave-overlap.ts).
    const mevcut = await prismaPdks.pdksLeave.findMany({
      where: {
        personnelId: session.personnelId,
        status: { in: [...BLOCKING_STATUSES] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
      select: { id: true, startDate: true, endDate: true, status: true },
    });
    const cakisan = findOverlappingLeave(mevcut, { startDate, endDate });
    if (cakisan) {
      return NextResponse.json({ error: overlapMessage(cakisan) }, { status: 409 });
    }

    await prismaPdks.pdksLeave.create({
      data: {
        tenantId: session.tenantId,
        personnelId: session.personnelId,
        startDate,
        endDate,
        type: parsed.data.type,
        reason: parsed.data.reason || null,
        status: "pending",
        requestedBy: "personnel",
      },
    });

    return NextResponse.json({ ok: true });
  });

  return result ?? NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
}

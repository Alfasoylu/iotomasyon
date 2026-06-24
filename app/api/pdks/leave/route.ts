import { NextResponse, type NextRequest } from "next/server";

import { withPdksSession } from "@/lib/pdks/auth";
import { prismaPdks } from "@/lib/pdks/prisma";
import { leaveSchema } from "@/lib/validations/pdks";
import { ymdToDate } from "@/lib/pdks/leave";

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

    await prismaPdks.pdksLeave.create({
      data: {
        tenantId: session.tenantId,
        personnelId: session.personnelId,
        startDate: ymdToDate(parsed.data.startDate),
        endDate: ymdToDate(parsed.data.endDate),
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

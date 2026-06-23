import { NextResponse, type NextRequest } from "next/server";

import { withPdksSession } from "@/lib/pdks/auth";
import { prismaPdks } from "@/lib/pdks/prisma";
import { workDateTR } from "@/lib/pdks/geo";

export const dynamic = "force-dynamic";

/**
 * POST /api/pdks/overtime  body: { overtime: boolean }
 * Bugünün açık kaydında fazla mesai bayrağını ayarlar. overtime=true ise cron
 * otomatik çıkış uygulamaz (kişi geç çıkacak, çıkışı kendisi yapar).
 */
export async function POST(req: NextRequest) {
  const result = await withPdksSession(async (session) => {
    let body: { overtime?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
    }
    const overtime = body.overtime === true;

    const { count } = await prismaPdks.pdksAttendanceRecord.updateMany({
      where: { personnelId: session.personnelId, workDate: workDateTR(), status: "open" },
      data: { overtime },
    });
    if (count === 0) {
      return NextResponse.json({ error: "Bugün açık giriş kaydınız yok" }, { status: 409 });
    }
    return NextResponse.json({ ok: true, overtime });
  });

  return result ?? NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
}

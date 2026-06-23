import { NextResponse, type NextRequest } from "next/server";

import { withPdksSession } from "@/lib/pdks/auth";
import { prismaPdks } from "@/lib/pdks/prisma";
import { distanceMeters, workDateTR } from "@/lib/pdks/geo";

export const dynamic = "force-dynamic";

/**
 * POST /api/pdks/check-out  body: { latitude, longitude, accuracy }
 * Günün açık kaydını kapatır. Geofence girişteki ile AYNI sunucu-tarafı kontrole tabidir:
 * konum zorunlu, doğruluk şantiye eşiğini ve mesafe şantiye yarıçapını aşarsa reddedilir.
 */
export async function POST(req: NextRequest) {
  const result = await withPdksSession(async (session) => {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Geçersiz istek" }, { status: 400 });
    }

    const lat = Number(body.latitude);
    const lng = Number(body.longitude);
    const accuracy = Number(body.accuracy);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ error: "Konum bilgisi gerekli" }, { status: 400 });
    }

    const workDate = workDateTR();
    const open = await prismaPdks.pdksAttendanceRecord.findFirst({
      where: { personnelId: session.personnelId, workDate, status: "open" },
    });
    if (!open) {
      return NextResponse.json({ error: "Bugün açık giriş kaydınız yok" }, { status: 409 });
    }

    let checkOutDistanceM: number | null = null;
    const checkOutAccuracyM = Number.isFinite(accuracy) ? Math.round(accuracy) : null;

    // Şantiye biliniyorsa geofence + doğruluk kapısı (girişle aynı kural).
    if (open.worksiteId) {
      const w = await prismaPdks.pdksWorksite.findUnique({ where: { id: open.worksiteId } });
      if (w) {
        if (Number.isFinite(accuracy) && accuracy > w.maxAccuracyMeters) {
          return NextResponse.json(
            { error: `Konum doğruluğu yetersiz (~${Math.round(accuracy)}m). Açık alana çıkın.` },
            { status: 422 },
          );
        }
        const dist = distanceMeters(lat, lng, w.latitude, w.longitude);
        if (dist > w.radiusMeters) {
          return NextResponse.json(
            { error: `İşyeri sınırının dışındasınız: ~${Math.round(dist)}m uzakta` },
            { status: 422 },
          );
        }
        checkOutDistanceM = Math.round(dist);
      }
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

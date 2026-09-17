import { NextResponse, type NextRequest } from "next/server";

import { withPdksSession } from "@/lib/pdks/auth";
import { prismaPdks } from "@/lib/pdks/prisma";
import { workDateTR } from "@/lib/pdks/geo";
import { geofenceVerdict } from "@/lib/pdks/geofence";

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
        // GİRİŞLE AYNI karar fonksiyonu (lib/pdks/geofence.ts) — tek şantiyeli
        // liste. Kuralın kopyası burada duruyordu; giriş tarafı değişince
        // çıkış sessizce eski kuralda kalıyordu.
        const karar = geofenceVerdict({ lat, lng, accuracy, sites: [w] });
        if (!karar.ok) {
          if (karar.reason === "dogruluk-yetersiz") {
            return NextResponse.json(
              { error: `Konum doğruluğu yetersiz (~${Math.round(Number(accuracy))}m). Açık alana çıkın.` },
              { status: 422 },
            );
          }
          return NextResponse.json(
            { error: `Henüz işyeri konumunda değilsiniz (~${Math.round(karar.distance ?? 0)} m uzaktasınız).` },
            { status: 422 },
          );
        }
        checkOutDistanceM = Math.round(karar.distance);
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

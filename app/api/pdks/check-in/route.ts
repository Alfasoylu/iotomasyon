import { NextResponse, type NextRequest } from "next/server";

import { withPdksSession } from "@/lib/pdks/auth";
import { prismaPdks } from "@/lib/pdks/prisma";
import { workDateTR, currentTimeTR } from "@/lib/pdks/geo";
import { geofenceVerdict, isAbnormalCheckInHour } from "@/lib/pdks/geofence";

export const dynamic = "force-dynamic";

/**
 * POST /api/pdks/check-in  body: { latitude, longitude, accuracy }
 * Geofence kararını SUNUCU verir (spec §7). KVKK: yalnızca mesafe saklanır,
 * ham koordinat varsayılan kapalı (DB'ye yazılmaz).
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

    // KVKK: konum işleme için açık rıza zorunlu (sunucu tarafı kapı).
    const me = await prismaPdks.pdksPersonnel.findFirst({
      where: { id: session.personnelId },
      select: { kvkkConsentAt: true },
    });
    if (!me?.kvkkConsentAt) {
      return NextResponse.json(
        { error: "Önce KVKK aydınlatma metnini onaylamanız gerekir.", needsConsent: true },
        { status: 403 },
      );
    }

    const links = await prismaPdks.pdksPersonnelWorksite.findMany({
      where: { personnelId: session.personnelId },
      include: { worksite: true },
    });
    const sites = links.map((l) => l.worksite).filter((w) => w.isActive);
    if (sites.length === 0) {
      return NextResponse.json(
        { error: "Henüz bir şantiyeye atanmadınız. Lütfen yöneticinize bildirin." },
        { status: 400 },
      );
    }

    // Karar TEK KAYNAKTAN: lib/pdks/geofence.ts (çıkış ucu da aynısını kullanır).
    // Kural iki uçta ayrı yazılıydı; biri güncellenip öbürü unutulduğunda
    // çıkışta kabul edilen konum girişte reddediliyordu ve fark sessizdi.
    const karar = geofenceVerdict({ lat, lng, accuracy, sites });
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
    const nearest = karar.site;
    const best = karar.distance;

    // Olağandışı saat kuralı: 18:00–05:00 arası normal mesai başlangıcı değildir →
    // ya yanlışlık ya fazla mesai. Personelden onay istenir; onaylarsa kayıt fazla
    // mesai olarak işaretlenir (otomatik çıkıştan muaf). Onaylamazsa giriş yapılmaz.
    const abnormalHour = isAbnormalCheckInHour(currentTimeTR());
    const overtimeConfirmed = body.overtimeConfirmed === true;
    if (abnormalHour && !overtimeConfirmed) {
      return NextResponse.json(
        {
          needsOvertimeConfirm: true,
          error:
            "Şu an normal mesai başlangıç saati değil (18:00–05:00). Bu bir fazla mesai / özel durum mu?",
        },
        { status: 409 },
      );
    }

    const workDate = workDateTR();
    const existing = await prismaPdks.pdksAttendanceRecord.findFirst({
      where: { personnelId: session.personnelId, workDate, status: "open" },
    });
    if (existing) {
      return NextResponse.json({ error: "Bugün zaten giriş yaptınız" }, { status: 409 });
    }

    const rec = await prismaPdks.pdksAttendanceRecord.create({
      data: {
        tenantId: session.tenantId, // extension de pekiştirir; tip için açık veriyoruz
        personnelId: session.personnelId,
        worksiteId: nearest.id,
        workDate,
        checkInAt: new Date(),
        checkInDistanceM: Math.round(best),
        checkInAccuracyM: Number.isFinite(accuracy) ? Math.round(accuracy) : null,
        status: "open",
        overtime: abnormalHour, // olağandışı saatte onaylanan giriş = fazla mesai
      },
    });

    return NextResponse.json({
      ok: true,
      recordId: rec.id,
      worksite: nearest.name,
      distanceM: Math.round(best),
    });
  });

  return result ?? NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
}

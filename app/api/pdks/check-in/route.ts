import { NextResponse, type NextRequest } from "next/server";

import { withPdksSession } from "@/lib/pdks/auth";
import { prismaPdks } from "@/lib/pdks/prisma";
import { distanceMeters, workDateTR, currentTimeTR } from "@/lib/pdks/geo";

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

    let nearest = sites[0];
    let best = Infinity;
    for (const w of sites) {
      const d = distanceMeters(lat, lng, w.latitude, w.longitude);
      if (d < best) {
        best = d;
        nearest = w;
      }
    }

    // Doğruluk kapısı: en yakın şantiyenin kendi toleransına göre (spec §7).
    // Cihazın bildirdiği accuracy bu eşiği aşarsa konum güvenilmez kabul edilir.
    if (Number.isFinite(accuracy) && accuracy > nearest.maxAccuracyMeters) {
      return NextResponse.json(
        { error: `Konum doğruluğu yetersiz (~${Math.round(accuracy)}m). Açık alana çıkın.` },
        { status: 422 },
      );
    }

    if (best > nearest.radiusMeters) {
      return NextResponse.json(
        { error: `Henüz işyeri konumunda değilsiniz (~${Math.round(best)} m uzaktasınız).` },
        { status: 422 },
      );
    }

    // Olağandışı saat kuralı: 18:00–05:00 arası normal mesai başlangıcı değildir →
    // ya yanlışlık ya fazla mesai. Personelden onay istenir; onaylarsa kayıt fazla
    // mesai olarak işaretlenir (otomatik çıkıştan muaf). Onaylamazsa giriş yapılmaz.
    const trHour = Number(currentTimeTR().slice(0, 2));
    const abnormalHour = trHour >= 18 || trHour < 5;
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

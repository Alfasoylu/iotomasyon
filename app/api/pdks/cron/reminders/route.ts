import { NextResponse, type NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { isPushConfigured, sendPushToSubs } from "@/lib/pdks/push";
import { currentTimeTR, workDateTR } from "@/lib/pdks/geo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Beklenen giriş saatinden bu kadar dakika sonra "geç kaldı" sayılır.
const GRACE_MIN = 30;

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * GET /api/pdks/cron/reminders  (Vercel Cron — vercel.json)
 *
 * Geç-kalan hatırlatması. Çok-tenant'lı bir iş olduğundan KASITLI olarak unscoped
 * `prisma` kullanır (oturum/tenant bağlamı yok; prismaPdks burada fail-closed atardı).
 * `lastLateReminderOn` ile gün içinde tekrar göndermez (idempotent).
 *
 * Hobby plan cron limiti (günde 1) nedeniyle hafta içi tek sefer çalışır; bu yüzden
 * çalıştığı saatte eşiği (beklenen + GRACE) henüz geçmemiş personel atlanır.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.get("Authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isPushConfigured()) {
    return NextResponse.json({ ok: true, skipped: "push yapılandırılmamış" });
  }

  const today = workDateTR();
  const nowMin = toMinutes(currentTimeTR());
  if (nowMin == null) {
    return NextResponse.json({ error: "Zaman hesaplanamadı" }, { status: 500 });
  }

  const candidates = await prisma.pdksPersonnel.findMany({
    where: {
      isActive: true,
      expectedCheckIn: { not: null },
      OR: [{ lastLateReminderOn: null }, { lastLateReminderOn: { not: today } }],
    },
    include: { subs: true },
  });

  let reminded = 0;
  const deadEndpoints: string[] = [];

  for (const p of candidates) {
    const expected = toMinutes(p.expectedCheckIn ?? "");
    if (expected == null) continue;
    if (nowMin < expected + GRACE_MIN) continue; // eşik henüz geçmedi

    const rec = await prisma.pdksAttendanceRecord.findFirst({
      where: { personnelId: p.id, workDate: today, checkInAt: { not: null } },
      select: { id: true },
    });
    if (rec) continue; // giriş yapmış — hatırlatma yok

    if (p.subs.length > 0) {
      const dead = await sendPushToSubs(
        p.subs.map((s) => ({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth })),
        {
          title: "Giriş hatırlatması",
          body: "Bugün henüz giriş yapmadınız. Şantiyeye ulaştıysanız lütfen giriş yapın.",
          url: "/pdks",
        },
      );
      deadEndpoints.push(...dead);
      reminded += 1;
    }

    // Push olmasa bile işaretle ki aynı gün tekrar taranmasın.
    await prisma.pdksPersonnel.update({
      where: { id: p.id },
      data: { lastLateReminderOn: today },
    });
  }

  if (deadEndpoints.length > 0) {
    await prisma.pdksPushSubscription.deleteMany({
      where: { endpoint: { in: deadEndpoints } },
    });
  }

  return NextResponse.json({
    ok: true,
    candidates: candidates.length,
    reminded,
    prunedSubs: deadEndpoints.length,
  });
}

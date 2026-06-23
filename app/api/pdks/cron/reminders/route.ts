import { NextResponse, type NextRequest } from "next/server";

import { prisma } from "@/lib/prisma";
import { isPushConfigured, sendPushToSubs } from "@/lib/pdks/push";
import { currentTimeTR, workDateTR } from "@/lib/pdks/geo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// İlk hatırlatma kaç dakika gecikmeden sonra; ve en geç kaç dakikaya kadar (üst sınır).
const FIRST_REMINDER_MIN = 5;
const MAX_REMINDER_MIN = 60; // 1 saat → en fazla 12 bildirim (5,10,…,60)

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * GET /api/pdks/cron/reminders  (her 5 dk'da bir çağrılmalı)
 *
 * Geç-kalan hatırlatması. Çok-tenant'lı iş olduğundan KASITLI olarak unscoped
 * `prisma` kullanır (oturum/tenant bağlamı yok). Her çağrıda giriş yapmamış
 * personele gecikme dilimine göre ("5/10/…/60 dakika geç kaldınız") bildirim
 * gönderir. `lateReminderLastMin` ile aynı 5-dk dilimini tekrar göndermez;
 * `lastLateReminderOn` ile gün değişince sayaç sıfırlanır. 60 dk'da durur.
 *
 * TETİKLEME: Vercel Hobby planı yalnızca GÜNLÜK cron'a izin verdiğinden bu uç nokta
 * vercel.json'da DEĞİL. Harici bir zamanlayıcı (cron-job.org / GitHub Actions) ile
 * her 5 dakikada bir `Authorization: Bearer $CRON_SECRET` başlığıyla çağırın.
 * (Vercel Pro'ya geçilirse vercel.json'a 5 dakikalık cron olarak da eklenebilir.)
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
    where: { isActive: true, expectedCheckIn: { not: null } },
    include: { subs: true },
  });

  let reminded = 0;
  const deadEndpoints: string[] = [];

  for (const p of candidates) {
    const expected = toMinutes(p.expectedCheckIn ?? "");
    if (expected == null) continue;

    const minutesLate = nowMin - expected;
    if (minutesLate < FIRST_REMINDER_MIN) continue; // henüz geç değil
    if (minutesLate > MAX_REMINDER_MIN) continue; // 1 saat üst sınırı geçti

    // 5'in katına yuvarla: 5, 10, 15, … 60
    const bucket = Math.floor(minutesLate / 5) * 5;

    // Gün değiştiyse sayaç sıfır; aynı/daha düşük dilim zaten gönderildiyse atla.
    const sameDay = p.lastLateReminderOn != null && p.lastLateReminderOn.getTime() === today.getTime();
    const lastMin = sameDay ? p.lateReminderLastMin : 0;
    if (bucket <= lastMin) continue;

    // Giriş yapmışsa hatırlatma yok.
    const rec = await prisma.pdksAttendanceRecord.findFirst({
      where: { personnelId: p.id, workDate: today, checkInAt: { not: null } },
      select: { id: true },
    });
    if (rec) continue;

    if (p.subs.length === 0) continue; // gönderilecek cihaz yok

    const dead = await sendPushToSubs(
      p.subs.map((s) => ({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth })),
      {
        title: "⏰ Geç kaldınız",
        body: `${bucket} dakika geç kaldınız. Şantiyeye ulaştıysanız lütfen giriş yapın.`,
        url: "/pdks",
      },
    );
    deadEndpoints.push(...dead);
    reminded += 1;

    await prisma.pdksPersonnel.update({
      where: { id: p.id },
      data: { lastLateReminderOn: today, lateReminderLastMin: bucket },
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

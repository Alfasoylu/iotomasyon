import { NextResponse, type NextRequest } from "next/server";
import { authorizeCron } from "@/lib/cron-auth";

import { prisma } from "@/lib/prisma";
import { isPushConfigured, sendPushToSubs } from "@/lib/pdks/push";
import { currentTimeTR, workDateTR } from "@/lib/pdks/geo";
import { toMinutes, trTimeOnDateToUtc } from "@/lib/pdks/tr-time";
import { AUTO_CHECKOUT_DELAY_MIN, checkoutAction } from "@/lib/pdks/checkout-rules";
import { DEFAULT_WEEK_SCHEDULE, parseWeekSchedule, resolveExpected } from "@/lib/pdks/schedule";
import { parseHolidays, holidaySet } from "@/lib/pdks/holidays";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// İlk hatırlatma kaç dakika gecikmeden sonra; ve en geç kaç dakikaya kadar (üst sınır).
const FIRST_REMINDER_MIN = 5;
const MAX_REMINDER_MIN = 60; // 1 saat → en fazla 12 bildirim (5,10,…,60)
// Otomatik çıkış eşiği ve kararı lib/pdks/checkout-rules.ts'te (test edilebilir):
// karar DB çağrılarının arasına gömülü olduğu sürece sınanamıyordu ve yanlış
// karar doğrudan maaşa yazılıyor.

/**
 * GET /api/pdks/cron/reminders  (her 5 dk'da bir çağrılmalı)
 *
 * İki iş yapar (çok-tenant'lı olduğundan KASITLI unscoped `prisma`):
 *  1) Geç giriş: giriş yapmamış personele "5/10/…/60 dakika geç kaldınız"
 *     (lateReminderLastMin dilim dedup; gün değişince sıfırlanır; 60 dk'da durur).
 *  2) Çıkış: beklenen çıkış geçince tek sefer hatırlatma; +15 dk sonra hâlâ açıksa
 *     otomatik çıkış (checkOutAt = beklenen çıkış, autoCheckout=true). overtime=true
 *     kayıtlar otomatik çıkıştan muaftır.
 *
 * TETİKLEME: Vercel Hobby planı yalnızca GÜNLÜK cron'a izin verdiğinden bu uç nokta
 * vercel.json'da DEĞİL. Harici bir zamanlayıcı (cron-job.org / GitHub Actions) ile
 * her 5 dakikada bir `Authorization: Bearer $CRON_SECRET` başlığıyla çağırın.
 * (Vercel Pro'ya geçilirse vercel.json'a 5 dakikalık cron olarak da eklenebilir.)
 */
export async function GET(req: NextRequest) {
  const denied = authorizeCron(req);
  if (denied) return denied;
  // NOT: push yapılandırılmamış olsa bile DEVAM ederiz — otomatik çıkış (gün sonu /
  // geçmiş gün kapanışı) bir DB işlemidir, push'tan bağımsızdır. Push gönderimleri
  // sendPushToSubs içinde zaten no-op'tur (configured değilse boş döner).

  const today = workDateTR();
  const nowMin = toMinutes(currentTimeTR());
  if (nowMin == null) {
    return NextResponse.json({ error: "Zaman hesaplanamadı" }, { status: 500 });
  }

  // Tenant'ların haftalık programı (panelden düzenlenebilir; yoksa kod varsayılanı).
  const tenants = await prisma.pdksTenant.findMany({
    select: { id: true, workScheduleJson: true, holidaysJson: true },
  });
  const scheduleByTenant = new Map(
    tenants.map((t) => [t.id, parseWeekSchedule(t.workScheduleJson)]),
  );
  const holidaysByTenant = new Map(
    tenants.map((t) => [t.id, holidaySet(parseHolidays(t.holidaysJson))]),
  );
  const scheduleFor = (tenantId: string) =>
    scheduleByTenant.get(tenantId) ?? DEFAULT_WEEK_SCHEDULE;
  const holidaysFor = (tenantId: string) => holidaysByTenant.get(tenantId);

  const candidates = await prisma.pdksPersonnel.findMany({
    where: { isActive: true },
    include: { subs: true },
  });

  let reminded = 0;
  const deadEndpoints: string[] = [];

  for (const p of candidates) {
    // Bugünün beklenen giriş saati: haftalık program (override > program). Tatilse atla.
    const exp = resolveExpected(scheduleFor(p.tenantId), today, p.expectedCheckIn, p.expectedCheckOut, holidaysFor(p.tenantId));
    if (!exp) continue; // tatil günü → geç-kalma yok
    const expected = toMinutes(exp.in);
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

    // Onaylı izinde ise geç-kalma uyarısı gönderme.
    const onLeave = await prisma.pdksLeave.findFirst({
      where: {
        personnelId: p.id,
        status: "approved",
        startDate: { lte: today },
        endDate: { gte: today },
      },
      select: { id: true },
    });
    if (onLeave) continue;

    if (p.subs.length === 0) continue; // gönderilecek cihaz yok

    const dead = await sendPushToSubs(
      p.subs.map((s) => ({ endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth })),
      {
        title: "⏰ Geç kaldınız",
        body: `${bucket} dakika geç kaldınız. Şantiyeye ulaştıysanız lütfen giriş yapın.`,
        url: "/personel",
      },
    );
    deadEndpoints.push(...dead);
    reminded += 1;

    await prisma.pdksPersonnel.update({
      where: { id: p.id },
      data: { lastLateReminderOn: today, lateReminderLastMin: bucket },
    });
  }

  // ── Çıkış hatırlatması + otomatik çıkış ────────────────────────────────────
  // Bugünün açık kayıtları: beklenen çıkış geçtiyse hatırlat; +15 dk sonra hâlâ
  // açıksa otomatik çıkış (checkOutAt = beklenen çıkış). Fazla mesai işaretliyse atla.
  let checkoutReminded = 0;
  let autoClosed = 0;

  const openRecs = await prisma.pdksAttendanceRecord.findMany({
    where: { workDate: { lte: today }, status: "open", checkInAt: { not: null }, overtime: false },
    include: { personnel: { include: { subs: true } } },
  });

  for (const rec of openRecs) {
    // Kaydın ait olduğu günün beklenen çıkışı (haftalık program; override > program).
    const exp = resolveExpected(
      scheduleFor(rec.personnel.tenantId),
      rec.workDate,
      rec.personnel.expectedCheckIn,
      rec.personnel.expectedCheckOut,
      holidaysFor(rec.personnel.tenantId),
    );
    const expectedOut = exp ? toMinutes(exp.out) : null;

    const subs = rec.personnel.subs.map((s) => ({
      endpoint: s.endpoint,
      p256dh: s.p256dh,
      auth: s.auth,
    }));

    const aksiyon = checkoutAction({
      workDate: rec.workDate,
      today,
      expectedOutMin: expectedOut,
      nowMinTR: nowMin,
      reminded: Boolean(rec.checkoutReminderAt),
    });
    if (aksiyon === "tatil" || aksiyon === "bekle" || aksiyon === "hatirlatildi") continue;

    // Geçmiş güne ait açık kayıt → kesin gecikmiş; sessizce kapat (bildirim yok).
    if (aksiyon === "gecmis-gun-kapat") {
      const checkOutAt = trTimeOnDateToUtc(rec.workDate, exp!.out);
      await prisma.pdksAttendanceRecord.update({
        where: { id: rec.id },
        data: { checkOutAt, status: "closed", autoCheckout: true },
      });
      autoClosed += 1;
      continue;
    }

    if (aksiyon === "otomatik-cikis") {
      // Çıkış saatini beklenen çıkışa sabitle (adil; admin düzeltebilir).
      const checkOutAt = trTimeOnDateToUtc(rec.workDate, exp!.out);
      await prisma.pdksAttendanceRecord.update({
        where: { id: rec.id },
        data: { checkOutAt, status: "closed", autoCheckout: true },
      });
      autoClosed += 1;
      if (subs.length > 0) {
        const dead = await sendPushToSubs(subs, {
          title: "Otomatik çıkış yapıldı",
          body: `Beklenen çıkış saatinizde (${exp!.out}) otomatik çıkış yapıldı.`,
          url: "/personel",
        });
        deadEndpoints.push(...dead);
      }
    } else if (subs.length > 0) {
      // aksiyon === "hatirlat": beklenen çıkış geçti, süre dolmadı → tek sefer.
      const dead = await sendPushToSubs(subs, {
        title: "🏁 Çıkış hatırlatması",
        // Süre SABİTTEN okunur: metne "15 dk" yazmak eşik değişince yalan olur.
        body: `Mesai bitti. Çıkış yapmayı unutmayın (${AUTO_CHECKOUT_DELAY_MIN} dk içinde otomatik çıkış yapılır).`,
        url: "/personel",
      });
      deadEndpoints.push(...dead);
      checkoutReminded += 1;
      await prisma.pdksAttendanceRecord.update({
        where: { id: rec.id },
        data: { checkoutReminderAt: new Date() },
      });
    }
  }

  if (deadEndpoints.length > 0) {
    await prisma.pdksPushSubscription.deleteMany({
      where: { endpoint: { in: deadEndpoints } },
    });
  }

  return NextResponse.json({
    ok: true,
    pushConfigured: isPushConfigured(),
    candidates: candidates.length,
    reminded,
    checkoutReminded,
    autoClosed,
    prunedSubs: deadEndpoints.length,
  });
}

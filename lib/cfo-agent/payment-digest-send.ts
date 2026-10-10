import "server-only";
import { prisma } from "@/lib/prisma";
import { istanbulPeriod } from "./period";
import { deliverAlarmParams, type AlarmSendResult } from "./alarm-whatsapp";
import { alarmSendDeps } from "./health-notify";
import { overduePaymentsSql, paymentDigestParams, upcomingPaymentsSql, type DigestRow } from "./payment-digest";

const SOURCE = "cfo-odeme-ozeti";
export type PaymentDigestResult = { status: AlarmSendResult["status"] | "bugun_gonderildi"; sent: number; params?: [string, string]; detail?: string[] };

/** Günlük ödeme özeti (en yakın 5 ödeme). Aynı İstanbul gününde başarıyla gönderildiyse tekrar göndermez (force=true hariç). */
export async function sendPaymentDigest(o: { now?: Date; force?: boolean } = {}): Promise<PaymentDigestResult> {
  const now = o.now ?? new Date();
  const { date, dayStart } = istanbulPeriod(now);
  if (!o.force) {
    const done = await prisma.cfoChangeLog.count({ where: { source: SOURCE, changedAt: { gte: dayStart }, note: { contains: "gonderildi" } } });
    if (done > 0) return { status: "bugun_gonderildi", sent: 0 };
  }
  const rows = await prisma.$queryRawUnsafe<DigestRow[]>(upcomingPaymentsSql(date));
  const [{ n: overdue }] = await prisma.$queryRawUnsafe<{ n: number }[]>(overduePaymentsSql(date));
  const params = paymentDigestParams(rows.map(r => ({ ...r, amountTry: Number(r.amountTry) })), Number(overdue), date);
  const r = await deliverAlarmParams(params, alarmSendDeps());
  await prisma.cfoChangeLog.create({ data: { area: "nakit", item: "Günlük ödeme özeti (WhatsApp)", source: SOURCE, kind: "arastirma",
    note: `${date}: ${rows.length} ödeme · WhatsApp ${r.status} (${r.sent})${o.force ? " · elle" : ""}` } }).catch(() => undefined);
  return { ...r, params };
}

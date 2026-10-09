import "server-only";
import { prisma } from "@/lib/prisma";
import { loadCfoAlarms, shouldNotify, type CfoAlarm } from "./health";
import { istanbulPeriod } from "./period";
import { sendAlarmWhatsapp, type AlarmSendResult } from "./alarm-whatsapp";
import { sendTemplate, whatsappConfigured } from "@/lib/whatsapp/client";
import { parseRecipients } from "@/lib/whatsapp/phone";

// Sağlık değerlendirmesi + bildirim tek yerde (CFO-009 / D-P07). İki çağıran:
//  - /api/cron/ai-cfo-health (GitHub işi, motor adımından SONRA): karşılaştırma son koşudan bir önceki koşu (skipLatest).
//  - Vercel cron after() zinciri (xml-sync 02:00, trendyol-sync 12:00 UTC; workflow-trigger.ts): motordan ÖNCE ve SONRA,
//    karşılaştırma zincir başlamadan önce tamamlanmış son koşu (before). GitHub zamanlaması pratikte çalışmadığı için (09.10:
//    motor 197 dk askıda kaldı, alarm üretilmedi) motor sağlık alarmı artık buradan gider; takılan koşu motor öncesinde görülür.
export type HealthNotifyResult = { alarms: CfoAlarm[]; notify: boolean; whatsapp: AlarmSendResult | null };
type Opts = { now?: Date; before?: Date; skipLatest?: boolean; reminder?: boolean; alreadySent?: readonly string[] };

export async function checkHealthAndNotify(o: Opts = {}): Promise<HealthNotifyResult> {
  const now = o.now ?? new Date();
  const alarms = await loadCfoAlarms(now);
  const runs = await prisma.cfoRun.findMany({
    where: { idempotencyKey: { startsWith: "engine:" }, status: "completed", ...(o.before ? { generatedAt: { lt: o.before } } : {}) },
    orderBy: { generatedAt: "desc" }, take: 2, select: { triggerReasons: true } });
  const ref = runs[o.skipLatest ? 1 : 0];
  const prev = ref ? ((ref.triggerReasons as { alarms?: CfoAlarm[] } | null)?.alarms ?? []).map(a => a.key) : null;
  const hour = o.reminder === false ? -1 : Math.floor(istanbulPeriod(now).minutes / 60);
  const notify = shouldNotify(alarms, prev, hour, o.alreadySent);
  const whatsapp = notify ? await sendAlarmWhatsapp(alarms, { configured: whatsappConfigured, send: sendTemplate, parseRecipients,
    env: { to: process.env.CFO_ALARM_WHATSAPP_TO, template: process.env.CFO_ALARM_WHATSAPP_TEMPLATE } }) : null;
  return { alarms, notify, whatsapp };
}

/** Cron zinciri için: hata fırlatmaz; bildirim olduysa değişiklik günlüğüne iz bırakır (alıcı/numara yazılmaz). */
export async function safeHealthNotify(phase: string, o: Opts): Promise<HealthNotifyResult | null> {
  try {
    const r = await checkHealthAndNotify({ ...o, reminder: false });
    if (r.notify) await prisma.cfoChangeLog.create({ data: { area: "erisim", item: "CFO alarm bildirimi", source: "cfo-health-notify", kind: "arastirma",
      note: `${phase}: ${r.alarms.map(a => a.key).join(", ").slice(0, 400)} · WhatsApp ${r.whatsapp?.status ?? "yok"} (${r.whatsapp?.sent ?? 0})` } }).catch(() => undefined);
    return r;
  } catch { return null; }
}

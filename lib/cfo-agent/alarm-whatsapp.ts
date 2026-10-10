// CFO alarmlarının WhatsApp teslimi (CFO-009 / D-P07, Alperen 2026-10-09: "alarmlar WhatsApp'la gelsin"). Mevcut resmî Cloud API
// istemcisi (lib/whatsapp/client.ts) kullanılır; gönderim YALNIZ health uç noktasının e-posta (503) ürettiği durumlarda olur
// (motor arızası, YENİ alarm, sabah hatırlatması — shouldNotify) → günde en fazla birkaç mesaj, süregelen alarm tekrar tekrar gitmez.
// İşletme başlatan mesaj 24 saat penceresi dışında yalnız ONAYLI ŞABLONLA gider: şablon adı CFO_ALARM_WHATSAPP_TEMPLATE (varsayılan
// "cfo_alarm"), gövde iki parametre: {{1}} özet (sayı + kodlar), {{2}} en öncelikli alarmın metni (her biri ≤ 200 karakter).
// Alıcı(lar) CFO_ALARM_WHATSAPP_TO (virgülle ayrılmış; numara koda yazılmaz). Yapılandırma eksikse sessiz değil: sonuç nedeni döner.
import type { CfoAlarm } from "./health";

/** Öncelik: motor ve para kaybettiren alarmlar önce. */
const PRIORITY = ["engine_stale", "consecutive_failures", "stuck_run", "floor_breach", "capacity_breach", "payment_unmarked", "schedule_duplicate",
  "ledger_stale", "duty_gap", "cost_jump", "source_dead"];
const rank = (code: string) => { const i = PRIORITY.indexOf(code); return i < 0 ? PRIORITY.length : i; };

export function alarmTemplateParams(alarms: CfoAlarm[]): [string, string] {
  const sorted = [...alarms].sort((a, b) => rank(a.code) - rank(b.code));
  const codes = [...new Set(sorted.map(a => a.code))];
  const summary = `${alarms.length} alarm: ${codes.join(", ")}`;
  return [summary.slice(0, 200), (sorted[0]?.message ?? "").slice(0, 200)];
}

export type AlarmSendDeps = {
  configured: () => boolean;
  send: (to: string, template: string, params: string[]) => Promise<{ ok: boolean; reason?: string; detail?: string }>;
  parseRecipients: (raw: string) => string[];
  env: { to?: string; template?: string };
};
export type AlarmSendResult = { status: "gonderildi" | "kismen" | "alarm_yok" | "yapilandirilmadi" | "alici_yok" | "hata"; sent: number; detail?: string[] };

export async function sendAlarmWhatsapp(alarms: CfoAlarm[], deps: AlarmSendDeps): Promise<AlarmSendResult> {
  if (!alarms.length) return { status: "alarm_yok", sent: 0 };
  return deliverAlarmParams(alarmTemplateParams(alarms), deps);
}

/** Deneme gönderimi (Alperen 2026-10-10: "deneme alarmı oluştur"): aynı şablon + aynı alıcı yolu, metinde gerçek alarm OLMADIĞI yazılı.
 *  Alarm üretmez, veritabanına dokunmaz; yalnız elle tetiklenen /api/cron/cfo-alarm-test çağırır. */
export function testAlarmParams(now: Date): [string, string] {
  const t = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", dateStyle: "short", timeStyle: "short" }).format(now);
  return [`DENEME (${t}) — gerçek alarm değil`, "WhatsApp alarm kanalı testi; işlem gerekmez"];
}
export async function sendTestAlarmWhatsapp(deps: AlarmSendDeps, now = new Date()): Promise<AlarmSendResult> {
  return deliverAlarmParams(testAlarmParams(now), deps);
}

/** Hazır iki parametreyi aynı şablon + alıcı yoluyla gönderir (alarm, deneme, günlük ödeme özeti). */
export async function deliverAlarmParams(params: [string, string], deps: AlarmSendDeps): Promise<AlarmSendResult> {
  if (!deps.configured()) return { status: "yapilandirilmadi", sent: 0, detail: ["WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID tanımlı değil"] };
  const to = deps.parseRecipients(deps.env.to ?? "");
  if (!to.length) return { status: "alici_yok", sent: 0, detail: ["CFO_ALARM_WHATSAPP_TO tanımlı değil ya da geçersiz"] };
  const template = (deps.env.template ?? "").trim() || "cfo_alarm";
  let sent = 0; const errors: string[] = [];
  for (const r of to) {
    const res = await deps.send(r, template, params).catch(e => ({ ok: false, reason: "hata", detail: e instanceof Error ? e.message : "hata" }));
    if (res.ok) sent++; else errors.push(`${r.slice(0, 4)}…${r.slice(-2)}: ${res.reason ?? "hata"} ${res.detail ?? ""}`.trim());
  }
  return { status: sent === to.length ? "gonderildi" : sent > 0 ? "kismen" : "hata", sent, ...(errors.length ? { detail: errors } : {}) };
}

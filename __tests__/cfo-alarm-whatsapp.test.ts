import assert from "node:assert/strict";
import { alarmTemplateParams, sendAlarmWhatsapp, sendTestAlarmWhatsapp, testAlarmParams, type AlarmSendDeps } from "../lib/cfo-agent/alarm-whatsapp";
import { parseRecipients } from "../lib/whatsapp/phone";
import type { CfoAlarm } from "../lib/cfo-agent/health";

// CFO alarmlarının WhatsApp teslimi (D-P07): onaylı şablon + iki parametre, öncelik sırası, yapılandırma eksikleri nedenle döner,
// numara koda yazılmaz (ortam değişkeni). Çalıştır: node --import tsx __tests__/cfo-alarm-whatsapp.test.ts
const A = (code: CfoAlarm["code"], message: string): CfoAlarm => ({ code, key: code, message });

async function main() {
  const alarms = [A("source_dead", "Banka bakiyesi 7 günden eski: Enpara"), A("capacity_breach", "Nakit pozisyonu 01.01'de şirket KMH kapasitesini aşıyor"),
    A("stuck_run", "1 motor koşusu 15 dakikadan uzun süredir 'running'")];
  const [p1, p2] = alarmTemplateParams(alarms);
  assert.equal(p1, "3 alarm: stuck_run, capacity_breach, source_dead", "öncelik: motor → para → kaynak");
  assert.equal(p2, alarms[2].message, "ikinci parametre en öncelikli alarm");
  assert.ok(alarmTemplateParams([A("source_dead", "x".repeat(500))])[1].length <= 200);

  const sent: { to: string; template: string; params: string[] }[] = [];
  const deps = (o: Partial<AlarmSendDeps> = {}, env: AlarmSendDeps["env"] = { to: "+90 549 000 00 00", template: "" }): AlarmSendDeps => ({
    configured: () => true, parseRecipients, env,
    send: async (to, template, params) => { sent.push({ to, template, params }); return { ok: true }; }, ...o });

  assert.deepEqual(await sendAlarmWhatsapp([], deps()), { status: "alarm_yok", sent: 0 });
  assert.equal((await sendAlarmWhatsapp(alarms, deps({ configured: () => false }))).status, "yapilandirilmadi");
  assert.equal((await sendAlarmWhatsapp(alarms, deps({}, { to: "" }))).status, "alici_yok");
  assert.equal(sent.length, 0, "eksik yapılandırmada hiçbir şey gönderilmez");

  const ok = await sendAlarmWhatsapp(alarms, deps());
  assert.deepEqual([ok.status, ok.sent], ["gonderildi", 1]);
  assert.deepEqual([sent[0].to, sent[0].template, sent[0].params], ["905490000000", "cfo_alarm", [p1, p2]], "numara normalleştirilir, varsayılan şablon");

  const fail = await sendAlarmWhatsapp(alarms, deps({ send: async () => ({ ok: false, reason: "hata", detail: "132001 template not found" }) }));
  assert.equal(fail.status, "hata"); assert.match(fail.detail![0], /132001/); assert.ok(!fail.detail![0].includes("5490000000"), "numara loglarda maskeli");
  const partial = await sendAlarmWhatsapp(alarms, deps({ send: async to => ({ ok: to.endsWith("00") }) }, { to: "905490000000, 905490000011" }));
  assert.deepEqual([partial.status, partial.sent], ["kismen", 1]);

  // Deneme gönderimi: aynı şablon + alıcı yolu, gerçek alarm olmadığı metinde yazılı, TR saati; yapılandırma eksikleri aynı nedenle.
  const now = new Date("2026-10-10T11:40:00Z");
  assert.deepEqual(testAlarmParams(now), ["DENEME (10.10.2026 14:40) — gerçek alarm değil", "WhatsApp alarm kanalı testi; işlem gerekmez"]);
  sent.length = 0;
  const test = await sendTestAlarmWhatsapp(deps(), now);
  assert.deepEqual([test.status, test.sent, sent[0].template, sent[0].params], ["gonderildi", 1, "cfo_alarm", testAlarmParams(now)]);
  assert.equal((await sendTestAlarmWhatsapp(deps({}, { to: "" }), now)).status, "alici_yok");
  assert.equal((await sendTestAlarmWhatsapp(deps({ configured: () => false }), now)).status, "yapilandirilmadi");
  assert.ok(testAlarmParams(now).every(p => !/[\n\t]/.test(p) && p.length <= 200), "Meta parametre kuralı: satır sonu/sekme yok");
  console.log("CFO alarm WhatsApp: şablon + 2 parametre, öncelik, yapılandırma eksikleri nedenle, numara maskeli, kısmi gönderim, deneme gönderimi passed");
}
main().catch(e => { console.error(e); process.exitCode = 1; });

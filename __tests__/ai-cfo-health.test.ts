/**
 * CFO alarmları (lib/cfo-agent/health.ts, 2026-10-08: sitede LLM yok) — saf değerlendirme + bildirim kuralı.
 * Çalıştır: node --import tsx __tests__/ai-cfo-health.test.ts
 */
import assert from "node:assert/strict";
import { evaluateCfoAlarms, shouldNotify, type AlarmInput, type EngineRunInfo } from "../lib/cfo-agent/health";

const now = new Date("2026-10-08T10:00:00Z");
const h = (n: number) => new Date(now.getTime() - n * 3600000);
const run = (hoursAgo: number, status: string, error: string | null = null): EngineRunInfo => ({ status, generatedAt: h(hoursAgo), finishedAt: h(hoursAgo), error });
const fresh = [{ name: "XML", lastAt: h(5), maxAgeHours: 26 }, { name: "Trendyol", lastAt: h(1), maxAgeHours: 26 }, { name: "Entegra", lastAt: h(70), maxAgeHours: 192 }];
const base = (o: Partial<AlarmInput> = {}): AlarmInput => ({ now, engineEnabled: true, runs: [run(1, "completed"), run(2, "completed")],
  minPosition: { valueTry: -2500000, date: "2026-12-01" }, floorTry: -3000000, payments: [], sources: fresh, staleBankAccounts: [], ...o });
const codes = (i: AlarmInput) => evaluateCfoAlarms(i).map(a => a.code);

assert.deepEqual(codes(base()), [], "sağlıklı: alarm yok — AI çağrısı olmaması alarm DEĞİL (no_insight_24h kaldırıldı)");

// Motor bayat: 20 saattir tamamlanmadı (günde 3 koşu) (koşu var ama hep başarısız ya da hiç yok); motor kapalıyken susar
assert.deepEqual(codes(base({ runs: [run(15, "completed")] })), [], "gece boşluğu (16:07 → 07:17) bayat değil");
assert.deepEqual(codes(base({ runs: [run(21, "completed")] })), ["engine_stale"]);
assert.deepEqual(codes(base({ runs: [] })), ["engine_stale"]);
assert.deepEqual(codes(base({ runs: [], engineEnabled: false })), [], "motor kapalıyken bayatlık alarmı yok");
// Üst üste iki tamamlanmamış koşu (failed ya da beklenmeyen durum); 'running' sayılmaz
assert.deepEqual(codes(base({ runs: [run(0, "failed", "engine_failed"), run(1, "failed"), run(2, "completed")] })), ["consecutive_failures"]);
assert.deepEqual(codes(base({ runs: [run(0, "running"), run(1, "failed"), run(2, "completed")] })), [], "koşan koşu başarısız sayılmaz");
// Taban deliniyor (07.10: −3.379.787)
const floor = evaluateCfoAlarms(base({ minPosition: { valueTry: -3379787, date: "2026-12-01" } }));
assert.equal(floor[0].code, "floor_breach"); assert.match(floor[0].message, /-3\.379\.787 TL \(2026-12-01\).*-3\.000\.000 TL/);
// İşaretlenmemiş ödeme ve ölü kaynaklar (her biri ayrı anahtar)
const pay = evaluateCfoAlarms(base({ payments: [{ label: "Garanti — Kredi 1", amountTry: 60000, due: "2026-10-08" }] }));
assert.deepEqual(pay.map(a => a.key), ["payment_unmarked:Garanti — Kredi 1:2026-10-08"]);
const dead = evaluateCfoAlarms(base({ sources: [{ name: "XML", lastAt: h(30), maxAgeHours: 26 }, { name: "Trendyol", lastAt: null, maxAgeHours: 26 }, fresh[2]],
  staleBankAccounts: ["Ziraat USD"] }));
assert.deepEqual(dead.map(a => a.key), ["source_dead:XML", "source_dead:Trendyol", "source_dead:banka"]);
assert.match(dead[1].message, /hiç gelmedi/);

// Bildirim: arıza her zaman; yeni alarm; süregelen alarm her koşuda e-posta üretmez; sabah koşusunda (06–10 TR) günlük hatırlatma
const f = evaluateCfoAlarms(base({ minPosition: { valueTry: -3379787, date: "2026-12-01" } }));
assert.equal(shouldNotify([], null, 9), false);
assert.equal(shouldNotify(f, null, 13), true, "ilk kez görülen alarm");
assert.equal(shouldNotify(f, ["floor_breach"], 13), false, "süregelen taban alarmı: e-posta yok (cfo_gun_ozeti'nde görünür)");
assert.equal(shouldNotify(f, ["floor_breach"], 7), true, "07:17 TR sabah koşusu hatırlatır");
assert.equal(shouldNotify(f, ["floor_breach"], 10), true, "gecikmeli sabah koşusu da hatırlatır");
assert.equal(shouldNotify(f, ["floor_breach"], 12), false, "öğle koşusu hatırlatmaz");
assert.equal(shouldNotify(f, ["floor_breach"], 16), false, "akşam koşusu hatırlatmaz");
assert.equal(shouldNotify([...f, ...pay], ["floor_breach"], 13), true, "yeni ödeme alarmı");
assert.equal(shouldNotify(evaluateCfoAlarms(base({ runs: [] })), ["engine_stale"], 13), true, "motor arızası her saat bildirilir");
console.log("CFO alarms: engine stale, consecutive failures, floor breach, unmarked payment, dead sources, notify-on-change + morning-slot reminder passed");

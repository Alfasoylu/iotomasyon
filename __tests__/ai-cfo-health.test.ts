import assert from "node:assert/strict";
import { evaluateCfoAlarms, type HealthRun } from "../lib/cfo-agent/health";

// AI CFO sağlık alarmı: üretimde 07.10 sabahı 5 başarısız koşu kimseye ulaşmadı. Bu kurallar o sessizliği yakalar.
const at = (h: string) => new Date(`2026-10-07T${h}:00Z`);
const run = (h: string, status: string, o: Partial<HealthRun> = {}): HealthRun => ({ status, generatedAt: at(h), error: null, insights: 0, sentActionable: 8, ...o });
const now = at("06:00");

// Üretim dizisi: 05:30 ve 05:42 provider_http_400 → iki ardışık başarısızlık
const prod = [run("04:59", "blocked_by_input_tokens", { sentActionable: 0 }), run("05:30", "failed", { error: "provider_http_400" }), run("05:42", "failed", { error: "provider_http_400" })];
const a1 = evaluateCfoAlarms(prod, null, true, now);
assert.deepEqual(a1.map(a => a.code), ["consecutive_failures", "no_insight_24h"]);
assert.match(a1[0].message, /provider_http_400/);

// Tek başarısızlık alarm değil; araya giren başarılı koşu diziyi keser
assert.deepEqual(evaluateCfoAlarms([run("05:30", "failed"), run("05:42", "completed", { insights: 2 })], at("05:43"), true, now), []);
// invalid_output (hiç içgörü geçmedi) da başarısızlık sayılır
assert.deepEqual(evaluateCfoAlarms([run("05:30", "invalid_output"), run("05:42", "failed")], at("05:00"), true, now).map(a => a.code), ["consecutive_failures"]);
// "running" nötrdür: arada yarım kalmış koşu diziyi bozmaz
assert.deepEqual(evaluateCfoAlarms([run("05:30", "failed"), run("05:40", "running"), run("05:42", "failed")], at("05:00"), true, now).map(a => a.code), ["consecutive_failures"]);

// 24 saat içgörü yok: yalnız AI açıkken ve eylemlik anomali gönderilmişken
assert.deepEqual(evaluateCfoAlarms([run("05:42", "no_actionable_anomaly", { sentActionable: 0 })], null, true, now), [], "hiç gönderim yoksa alarm yok");
assert.deepEqual(evaluateCfoAlarms([run("05:42", "completed")], null, false, now), [], "AI kapalıysa alarm yok");
assert.deepEqual(evaluateCfoAlarms([run("05:42", "completed")], at("05:42"), true, now), [], "taze içgörü varsa alarm yok");
assert.deepEqual(evaluateCfoAlarms([run("05:42", "completed")], new Date("2026-10-06T05:00:00Z"), true, now).map(a => a.code), ["no_insight_24h"]);
assert.deepEqual(evaluateCfoAlarms([], null, true, now), [], "hiç koşu yoksa alarm yok");

// Bütçe / girdi sınırı: TEK atlanan koşu yeter, 24 saat beklenmez (07.10: sınır 8.000'de kaldı, koşular atlandı, alarm çalmadı)
const tok = evaluateCfoAlarms([run("05:00", "completed", { insights: 1 }), run("05:42", "blocked_by_input_tokens")], at("05:00"), true, now);
assert.deepEqual(tok.map(a => a.code), ["input_limit_blocked"]); assert.match(tok[0].message, /AI_CFO_MAX_INPUT_TOKENS_PER_RUN/);
assert.deepEqual(evaluateCfoAlarms([run("05:42", "blocked_by_input_size")], at("05:00"), true, now).map(a => a.code), ["input_limit_blocked"]);
for (const st of ["blocked_by_budget", "blocked_by_daily_limit", "billing_unconfigured"])
  assert.deepEqual(evaluateCfoAlarms([run("05:42", st)], at("05:00"), true, now).map(a => a.code), ["budget_blocked"], st);
assert.deepEqual(evaluateCfoAlarms([run("05:30", "blocked_by_budget"), run("05:42", "no_actionable_anomaly", { sentActionable: 0 })], at("05:00"), true, now), [],
  "yalnız SON koşu sayılır: sonraki koşu atlanmadıysa alarm kalkar");

// Haftalık veri isteği (2026-10-07): günlük döküm beklenmez; 7 gün dolunca hatırlatılır, eski hesaplar adıyla yazılır
const fresh = { entegraLastImport: new Date("2026-10-05T09:06:00Z"), staleBankAccounts: [] };
assert.deepEqual(evaluateCfoAlarms([], null, true, now, fresh), [], "2 günlük Entegra yüklemesi istek doğurmaz");
assert.deepEqual(evaluateCfoAlarms([], null, true, new Date("2026-10-12T10:00:00Z"), fresh).map(a => a.code), ["entegra_upload_due"], "7 gün dolunca istenir");
const banks = evaluateCfoAlarms([], null, true, now, { ...fresh, staleBankAccounts: ["Ziraat USD (şirket)", "Yapı Kredi USD (şirket)"] });
assert.deepEqual(banks.map(a => a.code), ["bank_update_due"]); assert.match(banks[0].message, /Ziraat USD \(şirket\), Yapı Kredi USD \(şirket\)/);
assert.deepEqual(evaluateCfoAlarms([], null, true, now, { entegraLastImport: null, staleBankAccounts: [] }).map(a => a.code), ["entegra_upload_due"], "hiç yükleme yoksa istenir");

console.log("AI CFO health alarms: consecutive failures (prod 07.10 sequence), invalid_output counts, running neutral, immediate budget/input-limit blocks, 24h no-insight gated by AI + actionable sends, weekly Entegra/bank data requests passed");

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

// Vercel cron yapılandırması (RF-006 / CFO-009, 2026-10-10). Hobby planı: proje başına 100 cron, her biri GÜNDE EN FAZLA BİR KEZ
// (daha sık ifade dağıtımı düşürür), zamanlama ±59 dk. Koruma: her cron günlük (sabit dakika + saat, gün/ay/hafta '*'); yolu gerçek bir
// route ve CRON_SECRET ile korunuyor (fail-closed authorizeCron); süre ≤ 300 sn. Motorun kendi cron'u senkronlardan SONRA (senkron
// zincirinde süre bütçesine sığmıyordu), çalışma döngüsü sabah snapshot'ından (~05:15 UTC) sonra (Goal v3 aynı sabah yazılsın).
// Çalıştır: node --import tsx __tests__/vercel-crons.test.ts
type Cron = { path: string; schedule: string };
const crons = (JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: Cron[] }).crons;
const hourOf = (c: Cron) => Number(c.schedule.split(" ")[1]);
const seen = new Set<string>();
for (const c of crons) {
  const f = c.schedule.trim().split(/\s+/);
  assert.equal(f.length, 5, `${c.path}: 5 alanlı cron ifadesi`);
  assert.ok(/^\d{1,2}$/.test(f[0]) && Number(f[0]) <= 59 && /^\d{1,2}$/.test(f[1]) && Number(f[1]) <= 23 && f.slice(2).every(x => x === "*"),
    `${c.path} "${c.schedule}": Hobby planında yalnız günlük cron (sabit dakika ve saat)`);
  assert.ok(!seen.has(`${c.path} ${c.schedule}`), `${c.path} ${c.schedule} tekrar`); seen.add(`${c.path} ${c.schedule}`);
  assert.ok(c.path.startsWith("/api/cron/") && !c.path.includes("?"), `${c.path}: /api/cron altında, sorgu dizesiz`);
  const file = `app${c.path}/route.ts`;
  assert.ok(existsSync(file), `${file} yok`);
  const src = readFileSync(file, "utf8");
  assert.match(src, /export async function GET\(/, `${file}: Vercel cron GET çağırır`);
  assert.match(src, /authorizeCron\(req\)/, `${file}: CRON_SECRET ile korunmalı`);
  const max = src.match(/export const maxDuration\s*=\s*(\d+)/);
  assert.ok(max && Number(max[1]) <= 300, `${file}: maxDuration ≤ 300`);
}
const at = (p: string) => crons.filter(c => c.path === p).map(hourOf).sort((a, b) => a - b);
const [xml] = at("/api/cron/xml-sync"), [ty] = at("/api/cron/trendyol-sync");
assert.deepEqual(at("/api/cron/cfo-engine"), [xml + 1, ty + 1], "motor her senkrondan bir saat sonra (kendi 300 sn bütçesiyle)");
assert.ok(at("/api/cron/cfo-cycle")[0] >= 6, "çalışma döngüsü sabah snapshot'ından (~05:15 UTC) sonra");
assert.match(readFileSync("app/api/cron/cfo-engine/route.ts", "utf8"), /runEngineWithHealth\("scheduled"\)/, "motor cron'u sağlık alarmıyla, scheduled dilim anahtarıyla");
console.log(`Vercel crons: ${crons.length} günlük cron, route + CRON_SECRET + ≤300 sn; motor senkronlardan sonra (${at("/api/cron/cfo-engine").join(", ")} UTC), döngü ${at("/api/cron/cfo-cycle")} UTC passed`);

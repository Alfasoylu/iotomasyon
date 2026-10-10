/**
 * KMH kapasite durumu tek kural (lib/cfo-agent/capacity.ts; CFO-020/023, RF-019): motor capacity_breach alarmı ve /cfo kartı aynı
 * fonksiyon. Yol genel KMH'yi aşarsa warn, şirket kapasitesini (genel + amaca bağlı) aşarsa danger, aşmazsa ok; yol/limit yoksa unknown.
 * Çalıştır: node --conditions=react-server --import tsx __tests__/cfo-capacity.test.ts
 */
import assert from "node:assert/strict";
import { capacityStatus, toCapacityInput } from "../lib/cfo-agent/capacity";

const c = (positions: number[]) => ({ generalTry: 1_000_000, customsTry: 400_000, personalTry: 1_350_000,
  path: positions.map((p, i) => ({ date: `2026-10-${String(11 + i).padStart(2, "0")}`, position: p })) });
assert.deepEqual(capacityStatus(c([100_000, -500_000, -999_999])).status, "ok");
const w = capacityStatus(c([0, -1_200_000, -900_000]));
assert.deepEqual([w.status, w.breach], ["warn", { date: "2026-10-12", positionTry: -1_200_000, overTry: 200_000, scope: "general" }]);
const d = capacityStatus(c([0, -1_200_000, -1_600_000, -1_500_000]));
assert.deepEqual([d.status, d.breach?.scope, d.breach?.date, d.breach?.overTry, d.worst?.position], ["danger", "company", "2026-10-13", 200_000, -1_600_000]);
assert.equal(capacityStatus(null).status, "unknown");
assert.equal(capacityStatus(c([])).status, "unknown");
// SQL satırları → girdi: limit bilinmiyorsa null (yeşil gösterilmez)
assert.equal(toCapacityInput([{ v: "-5", d: "2026-10-11" }], [{ g: null, c: 0 }], []), null);
assert.deepEqual(toCapacityInput([{ v: "-5", d: "2026-10-11" }, { v: null, d: "2026-10-12" }], [{ g: "1000", c: null }], [{ t: "7" }]),
  { generalTry: 1000, customsTry: 0, personalTry: 7, path: [{ date: "2026-10-11", position: -5 }] });
console.log("KMH kapasite tek kural: ok/warn/danger/unknown, ilk aşım günü ve aşım tutarı, SQL satırı dönüşümü passed");

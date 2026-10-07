/**
 * Hedef açığı atfı (lib/cfo/goal-attribution.ts) — saf, DB yok. Fikstürler 07.10 üretim fm_balance_day satırları.
 * Çalıştır: node --import tsx __tests__/cfo-goal-attribution.test.ts
 */
import assert from "node:assert/strict";
import { attribute, pace } from "../lib/cfo/goal-attribution";

// 04.10 → 06.10: adet −1.322 (miktar etkisi −99.221), stok değeri +1.348.124 → artışın tamamı değerleme
const d04 = { date: "2026-10-04", cash: 72484, receivables: 1082982, inventory: 13257288, debt: 9239814, net: 1414605 };
const d06 = { date: "2026-10-06", cash: 71510, receivables: 1082982, inventory: 14605412, debt: 9239814, net: 2761756 };
const a = attribute(d04, d06, -99221);
assert.equal(a.days, 2);
assert.equal(a.netChange, 1347151);
assert.equal(a.inventoryValuation, 14605412 - 13257288 + 99221, "değerleme = stok değişimi − miktar etkisi");
assert.equal(a.operational, -974 + 0 + 0 - 99221, "nakit + alacak − borç değişimi + miktar etkisi");
assert.ok(a.valuationShare > 0.9, "değişimin neredeyse tamamı değerleme");

// 11.09 → 06.10: bildirilen net sermaye +227k ama operasyonel tablo farklı
const d11 = { date: "2026-09-11", cash: 200869, receivables: 1201163, inventory: 13926653, debt: 9401290, net: 2534787 };
const m = attribute(d11, d06, -650000);
assert.equal(m.debt, 9401290 - 9239814, "borç azalışı pozitif katkı");
assert.equal(m.operational, (71510 - 200869) + (1082982 - 1201163) + (9401290 - 9239814) - 650000);
assert.ok(m.operationalPerDay < 0 && m.reportedPerDay > 0, "bildirilen artış, operasyonel erime");

// Hedef hızı: wealth_usd gereken 26.177 TL/gün
assert.equal(pace(m, { gapTry: 11805794, requiredPerDay: 26177 }).verdict, "SHRINKING");
const good = attribute(d04, { ...d06, cash: 72484 + 800000 }, 0);
const p = pace(good, { gapTry: 11805794, requiredPerDay: 26177 });
assert.equal(p.verdict, "ON_PACE"); assert.equal(p.daysToGoalAtOperational, Math.ceil(11805794 / (800000 / 2)));
assert.equal(pace(good, { gapTry: null, requiredPerDay: null }).verdict, "UNKNOWN");
console.log("CFO goal attribution: cash/receivables/debt/stock-quantity/stock-valuation split, valuation share, operational vs reported pace passed");

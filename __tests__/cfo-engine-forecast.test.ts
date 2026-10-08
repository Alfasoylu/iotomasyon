/**
 * lib/cfo/engine.ts haftalık tahmin — tek tahsilat mekanizması (cfo_tahsilat_tahmini, 2026-10-08). Saf, DB yok.
 * Çalıştır: node --import tsx __tests__/cfo-engine-forecast.test.ts
 */
import assert from "node:assert/strict";
import { buildAllocation, computeCfo, type CfoInput } from "../lib/cfo/engine";

const today = new Date(2026, 9, 8);
const day = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return d; };
const rec = (id: string, n: number, amountTry: number) => ({ id, channel: "Trendyol", dueDate: day(n), amountTry, isCollected: false }) as unknown as CfoInput["receivables"][number];
const base = (o: Partial<CfoInput>): CfoInput => ({ settings: null, banks: [], cards: [], loans: [], expenses: [], receivables: [rec("r1", 2, 50000), rec("r2", 9, 30000)],
  cashEvents: [], imports: [], today, ...o });

// Kanal temposu: ufuk (son açık vade +9) sonrası her gün 1.000 TL → hafta 1 (7–13. gün) 4 gün = 4.000; alacakla çakışmaz
const forecast = Array.from({ length: 111 }, (_, i) => ({ date: day(10 + i), amountTry: 1000 }));
const o = computeCfo(base({ forecast }));
assert.equal(o.weeklyEstimateSource, "kanal_temposu");
assert.deepEqual(o.weeks.slice(0, 3).map(w => [w.actual, w.net, w.gross]), [[50000, 0, 50000], [30000, 4000, 34000], [0, 7000, 7000]]);
// 30 gün ufku: alacak 80.000 + bitişi ≤ 30. gün olan haftaların tahmini (hafta 1–3 → 4.000 + 7.000 + 7.000) — eski last14 tahmini YOK
assert.equal(o.horizons.find(h => h.days === 30)!.inflow, 80000 + 18000);

// Görünüm yoksa yedek: last14/4, haftanın hakedişi düşülür (eski davranış birebir)
const settings = { last14dRevenueTry: 400000 } as unknown as CfoInput["settings"];
const f = computeCfo(base({ forecast: null, settings }));
assert.equal(f.weeklyEstimateSource, "last14");
assert.deepEqual(f.weeks.slice(0, 2).map(w => [w.gross, w.actual, w.net]), [[100000, 50000, 50000], [100000, 30000, 70000]]);
// KMH faizi kademeli, hesap başına ölçülmüş oran (CFO-005): küresel cfo_settings %4,5 kullanılmaz; oranı olmayan hesabın kullanımı
// faizsiz değil "faizi bilinmiyor"; gümrük açığı mevcut kullanımın üstüne çekiliş sırasıyla faizlenir; KMH yokken "KMH azaltma" getirisi 0.
const bank = (name: string, balanceTry: number, kmhLimitTry: number, monthlyRatePct: number | null) =>
  ({ id: name, name, accountType: "Vadesiz + KMH", balanceTry, kmhLimitTry, monthlyRatePct, dataTag: "KESIN", note: null, lastUpdatedAt: today }) as unknown as CfoInput["banks"][number];
const k = computeCfo(base({ settings: { kmhMonthlyRatePct: 4.5 } as unknown as CfoInput["settings"],
  banks: [bank("Ziraat", -100000, 250000, 4.083), bank("Garanti", -50000, 500000, null)] }));
assert.equal(Math.round(k.kmhInterestMonthlyTry), Math.round(100000 * 0.04083), "yalnız ölçülmüş oranlı kullanım faizlenir");
assert.equal(k.kmhUsedWithoutRateTry, 50000);
assert.deepEqual(k.kmh.range, { minPct: 4.083, maxPct: 4.083, unmeasured: 1 });
const custom = computeCfo(base({ settings: { kmhMonthlyRatePct: 4.5, customsReserveTarget: 200000, customsReserveSaved: 0, customsReserveDate: day(5) } as unknown as CfoInput["settings"],
  banks: [bank("Ziraat", 0, 250000, 4.083), bank("Garanti", 0, 500000, null)], receivables: [] }));
assert.equal(Math.round(custom.customs!.interestCostMonthly), Math.round(200000 * 0.04083), "açık ölçülmüş Ziraat diliminden");
assert.equal(custom.customs!.interestUnknownTry, 0);
const alloc = buildAllocation(custom, []);
assert.equal(alloc.find(a => a.name === "KMH azaltma")!.certainSavingMonthly, 0, "KMH kullanılmıyorsa tasarruf yok");
assert.equal(Math.round(alloc.find(a => a.name === "Gümrük rezervi")!.certainSavingMonthly!), Math.round(100000 * 0.04083));
console.log("CFO engine weekly forecast: channel tempo from cfo_tahsilat_tahmini (no overlap with receivables, horizons), last14/4 fallback passed");

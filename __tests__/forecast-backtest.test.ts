import assert from "node:assert/strict";
import { forecastMonthlySales, effectiveMonthlyUnits } from "../lib/sales-forecast";
import { addDays, legacyForecast, monthBuckets, productionLayers, statusKept, stockAdjustedDemand, sumWindow } from "../lib/forecast/models";
import { cutoffSchedule, ECONOMIC_TIME_LABEL, forecastSnapshot, metrics, reportHash, runBacktest, type BacktestData, type CanonicalRow } from "../lib/forecast/backtest";

// Forecast backtest reference (PR1): metric math, production-path layers, leakage guards, determinism. No DB.
// Run with: node --import tsx __tests__/forecast-backtest.test.ts

// 1) metric math, hand computed
{
  const m = metrics([{ f: 10, a: 5, w: 2, segs: [] }, { f: 0, a: 5, w: null, segs: [] }, { f: 4, a: 0, w: 1, segs: [] }, { f: 3, a: 3, w: 1, segs: [] }]);
  assert.equal(m.n, 4); assert.equal(m.sumActual, 13); assert.equal(m.sumForecast, 17); assert.equal(m.sumAbsError, 14);
  assert.equal(m.wape, 14 / 13); assert.equal(m.bias, 4 / 13); assert.equal(m.mae, 3.5);
  assert.equal(m.overRate, 0.5); assert.equal(m.underRate, 0.25);
  assert.equal(m.catOverRate, 0.25, "4 vs 0 (+4) is catastrophic; 10 vs 5 is exactly 2x (strictly greater required)");
  // revenue weighted: obs 1 (w2): |5|·2=10, a·w=10; obs3 (w1): 4, 0; obs4: 0, 3 → 14/13; bias (10+4+0)/13
  assert.equal(m.revWape, 14 / 13); assert.equal(m.revBias, 14 / 13); assert.equal(m.revN, 3);
  assert.equal(metrics([{ f: 2.5, a: 1, w: null, segs: [] }]).catOverRate, 0, "f − a < 3 units is not catastrophic");
  assert.equal(metrics([]).wape, null);
}

// 2) production layers reproduce the production call path and expose the window bug
{
  // sales only in September (1/day); cutoff 6 Oct: true 30d = 25 units (11 Sep–5 Oct... only Sep days ≥ 6 Sep), bucket "last30" = all of September
  const sept = Array.from({ length: 30 }, (_, i) => ({ day: `2026-09-${String(i + 1).padStart(2, "0")}`, units: 1 }));
  assert.equal(sumWindow(sept, addDays("2026-10-06", -30), "2026-10-06"), 25);
  assert.equal(legacyForecast(sept, "2026-10-06").components.last30dUnits, 30, "month bucket dated the 15th counts the whole month");
  // the reference is literally the production function on training buckets
  assert.deepEqual(legacyForecast(sept, "2026-10-06"), forecastMonthlySales(monthBuckets(sept), new Date("2026-10-06T00:00:00Z")));
  const layers = productionLayers({ canonical: sept, unionCorrect: [...sept, ...sept.slice(20)], unionProduction: [...sept, ...sept.slice(20), { day: "2026-09-29", units: 4 }], manual: 80 }, "2026-10-06");
  assert.equal(layers.L0_canonical_true30, 25); assert.equal(layers.L1_union_dedupe_gap, 35); assert.equal(layers.L2_union_status_filter_leak, 39);
  assert.equal(layers.L3_month_bucket_window, 44);
  const fms = forecastMonthlySales(monthBuckets([...sept, ...sept.slice(20), { day: "2026-09-29", units: 4 }]), new Date("2026-10-06T00:00:00Z"));
  assert.equal(layers.L4_max_blend_seasonal, fms.monthlyUnits);
  assert.equal(layers.L5_manual_override_max, effectiveMonthlyUnits(fms, 80), "L5 = production effectiveMonthlyUnits");
  assert.equal(productionLayers({ canonical: sept, unionCorrect: sept, unionProduction: sept, manual: null }, "2026-10-06").L5_manual_override_max, null,
    "unknown manual potential is never back-filled");
  // status filter: production ILIKE misses Turkish İ; the correct filter does not
  assert.equal(statusKept("İade-İptal", false), true); assert.equal(statusKept("İade-İptal", true), false);
  assert.equal(statusKept("Cancelled", false), false); assert.equal(statusKept("Onaylandı", false), true); assert.equal(statusKept(null, false), true);
}

// 3) stock-adjusted demand: unknown before the first log, ≥10 in-stock days required, out-of-stock days excluded
{
  const sales = Array.from({ length: 30 }, (_, i) => ({ day: addDays("2026-07-01", i), units: i < 20 ? 2 : 0 }));
  const log = [{ day: "2026-06-20", unitsOpen: 5, unitsEod: 5 }, { day: "2026-07-21", unitsOpen: 1, unitsEod: 0 }];
  const r = stockAdjustedDemand(sales, log, "2026-07-01", "2026-07-31");
  assert.deepEqual(r, { estimate: 40 / 21 * 30, inStockDays: 21, outDays: 9 }, "21 Jul opens with 1 unit → in stock; 22–30 Jul out");
  assert.equal(stockAdjustedDemand(sales, log, "2026-06-10", "2026-07-10").estimate, null, "stock unknown before the first log");
  assert.equal(stockAdjustedDemand(sales, [{ day: "2026-06-20", unitsOpen: 0, unitsEod: 0 }], "2026-07-01", "2026-07-31").estimate, null, "<10 in-stock days");
}

// 4) leakage: nothing dated or known at/after the cutoff may change what the backtest knows at the cutoff
const C = "2026-08-01";
function base(): BacktestData {
  const canonical: CanonicalRow[] = [];
  for (let i = 0; i < 400; i++) {
    const day = addDays("2025-07-01", i);
    if (i % 3 === 0) canonical.push({ key: "P:a", productId: "a", rawKey: "R:A-1", channel: i % 2 ? "TRENDYOL" : "HEPSIBURADA", day, units: 2, revenue: 200, legacy: false, knownAt: `${addDays(day, 1)}T08:00:00.000Z` });
    if (i % 5 === 0) canonical.push({ key: "R:B-1", productId: null, rawKey: "R:B-1", channel: "N11", day, units: 1, revenue: 50, legacy: false, knownAt: `${addDays(day, 1)}T08:00:00.000Z` });
  }
  return { canonical,
    union: canonical.filter(r => r.productId).flatMap(r => [{ productId: "a", day: r.day, units: r.units, status: "Onaylandı" }, { productId: "a", day: r.day, units: 1, status: "Delivered" }]),
    stock: [{ productId: "a", day: "2026-06-01", unitsOpen: 9, unitsEod: 8, knownAt: "2026-06-01T10:00:00.000Z" }],
    manual: [{ productId: "a", value: 5, knownAt: "2026-09-30T00:00:00.000Z" }] }; // like production: potential known only today
}
for (const mode of ["economic_time", "point_in_time"] as const) {
  const before = forecastSnapshot(base(), C, mode);
  assert.ok(before.length === 2 && before.every(k => Object.values(k.observed).every(Number.isFinite)));
  const mutations: [string, (d: BacktestData) => void][] = [
    ["post-cutoff sales", d => d.canonical.push({ ...d.canonical[0], day: C, units: 500, knownAt: `${C}T09:00:00.000Z` })],
    ["post-cutoff price (revenue)", d => d.canonical.push({ ...d.canonical[0], day: addDays(C, 3), units: 1, revenue: 99999, knownAt: `${addDays(C, 3)}T09:00:00.000Z` })],
    ["post-cutoff stock", d => d.stock.push({ productId: "a", day: C, unitsOpen: 0, unitsEod: 0, knownAt: `${C}T10:00:00.000Z` })],
    ["post-cutoff legacy union rows", d => d.union.push({ productId: "a", day: addDays(C, 1), units: 300, status: null })],
    ["post-cutoff manual potential", d => d.manual.push({ productId: "a", value: 9999, knownAt: `${addDays(C, 2)}T00:00:00.000Z` })],
  ];
  for (const [name, mutate] of mutations) { const d = base(); mutate(d); assert.deepEqual(forecastSnapshot(d, C, mode), before, `${mode}: ${name}`); }
}
{
  // knowledge-state inputs: only point_in_time ignores them; economic_time uses them and is labelled accordingly
  const pit = forecastSnapshot(base(), C, "point_in_time");
  const lateAlias = (d: BacktestData) => d.canonical.filter(r => r.key === "R:B-1" && r.day >= "2026-03-01").forEach(r => { r.key = "P:a"; r.productId = "a"; r.mappedAt = "2026-09-01T00:00:00.000Z"; });
  const bulk = (d: BacktestData) => d.canonical.push({ key: "P:a", productId: "a", rawKey: "R:A-1", channel: "TRENDYOL", day: "2026-07-20", units: 77, revenue: 770, legacy: false, knownAt: "2026-09-15T00:00:00.000Z" });
  for (const [name, mutate] of [["alias learned after the cutoff", lateAlias], ["historical bulk import known after the cutoff", bulk]] as const) {
    const d = base(); mutate(d);
    assert.deepEqual(forecastSnapshot(d, C, "point_in_time"), pit, `point_in_time: ${name}`);
    assert.notDeepEqual(forecastSnapshot(d, C, "economic_time"), forecastSnapshot(base(), C, "economic_time"), `economic_time sees ${name} (hence the label)`);
  }
  const cfg = { longCutoffs: [C], shortCutoffs: [], todayCutoff: "2026-08-10" };
  assert.equal(runBacktest(base(), { ...cfg, mode: "economic_time" }).meta.label, ECONOMIC_TIME_LABEL);
  assert.equal(runBacktest(base(), { ...cfg, mode: "point_in_time" }).meta.label, null);
  // manual potential known only after every historical cutoff → the backtest reports it UNKNOWN instead of back-filling today's value
  const r = runBacktest(base(), { ...cfg, mode: "economic_time" });
  assert.equal(r.meta.samples.waterfallManualKnown, 0);
  assert.match(r.meta.unknown.manual_override_backtest, /^UNKNOWN/);
  assert.match(r.meta.unknown.capital_weighted_overforecast, /^UNKNOWN/);
}

// 5) determinism: same data + same version ⇒ same result, independent of input row order
{
  const cfg = { longCutoffs: cutoffSchedule("2026-01-05", "2026-08-03", 14), shortCutoffs: ["2026-07-05"], todayCutoff: "2026-08-04", mode: "economic_time" as const };
  const a = runBacktest(base(), cfg), b = runBacktest(base(), cfg);
  const shuffled = base(); shuffled.canonical.reverse(); shuffled.union.reverse();
  assert.equal(reportHash(a), reportHash(b)); assert.equal(reportHash(a), reportHash(runBacktest(shuffled, cfg)));
  assert.ok(a.long.length > 0 && a.waterfall.length > 0);
  assert.deepEqual(cfg.longCutoffs.at(-1), "2026-06-22", "schedule stops when the 30-day target would pass the last observed day");
}
console.log("Forecast backtest: metric math, production layers (window/max/manual/status leak), stock-adjusted demand, leakage (sales/stock/price/union/manual/alias/known_at), determinism passed");

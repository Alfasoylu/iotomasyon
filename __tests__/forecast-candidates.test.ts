import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { addDays, stockAtStart, type DayUnits } from "../lib/forecast/models";
import { cutoffSchedule, stockLog } from "../lib/forecast/backtest";
import { CALIBRATION, calibrationCells, calibrationFactor, CANDIDATE_MODELS, candidateForecasts, historyCoverage, PARTIAL_HISTORY_MODEL, runCandidateBacktest,
  SEASONAL, type CalibrationCell } from "../lib/forecast/candidates";
import { candidateSql, candidateSqlHash } from "../lib/forecast/candidates-sql";
import { compareRows, dataset, FIELDS, LAST, loadPglite, resetSeed } from "./forecast-fixture";

// Forecast V2 candidates: formula behaviour (zero/intermittent/spike/partial history/seasonality guards), walk-forward calibration
// without future leakage (sales, stock, calibration), determinism, and SQL (lib/forecast/candidates-sql.ts) == TS parity on PGlite.
// Run with: node --import tsx __tests__/forecast-candidates.test.ts
const C = "2026-06-01";
const series = (from: string, to: string, f: (d: string, i: number) => number): DayUnits[] => {
  const out: DayUnits[] = [];
  for (let d = from, i = 0; d < to; d = addDays(d, 1), i++) { const u = f(d, i); if (u) out.push({ day: d, units: u }); }
  return out;
};
const fc = (training: DayUnits[], firstSaleDay = training[0]?.day ?? C, calibration = 1) => candidateForecasts({ training, cutoff: C, firstSaleDay, calibration });
const near = (a: number, b: number, m: string) => assert.ok(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)), `${m}: ${a} vs ${b}`);

function pure() {
  // zero sales: every candidate is 0 (no floor from any other source)
  const zero = fc([], addDays(C, -400));
  for (const m of CANDIDATE_MODELS) assert.equal(zero[m], 0, `zero ${m}`);
  // constant rate: every candidate recovers 2/day · 30 = 60
  const flat = fc(series(addDays(C, -600), C, () => 2));
  for (const m of CANDIDATE_MODELS) near(flat[m], 60, `flat ${m}`);
  // declining demand: no upward floor — the 30-day models follow the drop and stay below true90
  const decline = fc(series(addDays(C, -200), C, d => d >= addDays(C, -30) ? 1 : 4));
  assert.equal(decline.M0_true30, 30); near(decline.M1_true90, 90, "decline M1");
  assert.ok(decline.M2_weighted_30_90 < decline.M1_true90 && decline.M4_damped_trend < decline.M1_true90 && decline.M3_ewma_hl30 < decline.M1_true90);
  near(decline.M4_damped_trend, 90 * (1 - 0.5 * 0.5), "decline M4 capped at −50% · 0.5");
  // intermittent: one order 60 days ago → true30 0, true90 1, EWMA small but positive
  const inter = fc([{ day: addDays(C, -60), units: 3 }], addDays(C, -60));
  assert.equal(inter.M0_true30, 0); assert.equal(inter.M1_true90, 1); assert.ok(inter.M3_ewma_hl30 > 0 && inter.M3_ewma_hl30 < 3);
  // spike: 300 units yesterday on 1/day → damped trend capped at +25 %; true30 explodes
  const spike = fc([...series(addDays(C, -200), C, () => 1), { day: addDays(C, -1), units: 300 }]);
  assert.equal(spike.M0_true30, 330); near(spike.M4_damped_trend, spike.M1_true90 * 1.25, "spike M4 cap");
  // partial history (first sale 10 days ago, 1/day): EWMA uses only observed days → 30, true30 understates (10)
  const young = fc(series(addDays(C, -10), C, () => 1));
  assert.equal(young.M0_true30, 10); near(young.M3_ewma_hl30, 30, "young EWMA");
  assert.deepEqual([historyCoverage(0), historyCoverage(6), historyCoverage(7), historyCoverage(29), historyCoverage(30)], ["lt7", "lt7", "7_29", "7_29", "ge30"]);
  // seasonality: insufficient history or base → factor 1; sufficient → capped
  const peak = (d: string) => d >= addDays(C, -365) && d < addDays(C, -335) ? 10 : 1;
  const longHist = fc(series(addDays(C, -SEASONAL.minHistoryDays), C, peak));
  near(longHist.M6_seasonal_true90, longHist.M1_true90 * SEASONAL.max, "seasonal cap");
  const shortHist = fc(series(addDays(C, -SEASONAL.minHistoryDays + 1), C, peak));
  near(shortHist.M6_seasonal_true90, shortHist.M1_true90, "insufficient history → no seasonality");
  const thin = fc([...series(addDays(C, -500), C, d => d >= addDays(C, -365) && d < addDays(C, -335) ? 1 : 0), { day: addDays(C, -500), units: 1 }]);
  near(thin.M6_seasonal_true90, thin.M1_true90, "insufficient base → no seasonality");
  // calibration factor: clamped, segment → global → 1, only cells whose target ended ≤ asOf
  const cells: CalibrationCell[] = Array.from({ length: 6 }, (_, i) => ({ cutoff: addDays("2026-01-01", 14 * i), segment: "A_ge30_per_month", n: 100, sumActual: 50, sumM0: 100 }));
  assert.equal(calibrationFactor(cells, "2026-01-30", "A_ge30_per_month"), 1, "first cell's target not yet ended");
  assert.equal(calibrationFactor(cells, "2026-02-27", "A_ge30_per_month"), 1, "3 cells < minObs/minCutoffs");
  assert.equal(calibrationFactor(cells, "2026-03-14", "A_ge30_per_month"), 0.6, "4 cells, ratio 0.5 clamped to 0.6");
  assert.equal(calibrationFactor(cells, "2026-03-14", "C_lt5_per_month"), 0.6, "segment without cells → global");
  const leaky = [...cells, { cutoff: "2026-03-01", segment: "A_ge30_per_month", n: 10_000, sumActual: 10_000, sumM0: 1 }];
  assert.equal(calibrationFactor(leaky, "2026-03-14", "A_ge30_per_month"), 0.6, "a cell whose target ends after asOf is ignored");
  assert.ok(CALIBRATION.min < 1 && CALIBRATION.max > 1);
}

function leakageAndDeterminism() {
  resetSeed();
  const data = dataset();
  const longCutoffs = cutoffSchedule("2025-03-04", LAST, 14), shortCutoffs = cutoffSchedule("2026-06-16", LAST, 7);
  const asOf = "2026-03-17";
  // mutate everything on/after asOf: sales ×7, stock levels, extra rows → nothing usable at asOf may change
  const future = { ...data,
    canonical: [...data.canonical.map(r => r.day >= asOf ? { ...r, units: r.units * 7 } : r),
      { ...data.canonical[0], day: addDays(asOf, 3), units: 999, knownAt: `${addDays(asOf, 4)}T06:00:00.000Z` }],
    stock: data.stock.map(s => s.day >= asOf ? { ...s, unitsOpen: 0, unitsEod: 0 } : s) };
  const segs = ["A_ge30_per_month", "B_5_30_per_month", "C_lt5_per_month"];
  const before = calibrationCells(data, longCutoffs, "economic_time"), after = calibrationCells(future, longCutoffs, "economic_time");
  for (const s of segs) assert.equal(calibrationFactor(after, asOf, s), calibrationFactor(before, asOf, s), `calibration leakage ${s}`);
  assert.ok(segs.some(s => calibrationFactor(before, LAST, s) !== 1), "calibration is exercised by the dataset");
  assert.ok(segs.some(s => calibrationFactor(after, LAST, s) !== calibrationFactor(before, LAST, s)), "later factors do see the mutated past");
  // sales leakage: forecasts at asOf are identical under the future mutation
  const at = (d: typeof data) => runCandidateBacktest(d, { longCutoffs: [asOf], shortCutoffs: [], mode: "economic_time" }).long
    .filter(r => r.dim === "all").map(r => [r.model, r.sumForecast]);
  assert.deepEqual(at(future), at(data), "sales leakage");
  // stock leakage: stock at the cutoff comes only from days before it
  for (const pid of ["p00", "p01", "p02"]) {
    const c = "2026-08-04";
    const mut = { ...data, stock: data.stock.map(s => s.day >= c ? { ...s, unitsOpen: 77, unitsEod: 77 } : s) };
    assert.equal(stockAtStart(stockLog(mut, pid, c, "economic_time"), c), stockAtStart(stockLog(data, pid, c, "economic_time"), c), `stock leakage ${pid}`);
  }
  // determinism
  const cfg = { longCutoffs, shortCutoffs, mode: "economic_time" as const };
  resetSeed();
  const a = runCandidateBacktest(data, cfg), b = runCandidateBacktest(dataset(), cfg);
  assert.deepEqual(a, b, "deterministic");
  return { data, a, longCutoffs, shortCutoffs };
}

async function main() {
  pure();
  const { data, a: ts, longCutoffs, shortCutoffs } = leakageAndDeterminism();
  // the dataset exercises what the report claims
  const has = (rows: typeof ts.long, model: string, dim: string, seg: string) => rows.some(r => r.model === model && r.dim === dim && r.segment === seg);
  assert.ok(has(ts.long, PARTIAL_HISTORY_MODEL, "history_coverage", "7_29") && !ts.long.some(r => r.model === PARTIAL_HISTORY_MODEL && r.dim === "history_coverage" && r.segment !== "7_29"),
    "partial-history estimate only for 7–29 days");
  assert.ok(has(ts.long, "M0_true30", "history_coverage", "lt7") || has(ts.long, "M0_true30", "history_coverage", "7_29"), "new SKU present");
  assert.ok(has(ts.short, "stock_adjusted_demand_estimate_30", "stock_state", "constrained_pre_cutoff"), "stock-outs present");
  assert.ok(ts.short.every(r => r.orderUnits != null && r.overOrderUnits! >= 0), "reorder metrics in short");
  assert.ok(ts.long.every(r => r.excessUnits >= 0), "excess units");

  const pg = new PGlite();
  try {
    await loadPglite(pg, data);
    const sql = candidateSql({ longCutoffs, shortCutoffs });
    compareRows("cand_long", (await pg.query<Record<string, unknown>>(sql.candLong)).rows, ts.long, [...FIELDS, "excessUnits", "excessRatio"]);
    compareRows("cand_short", (await pg.query<Record<string, unknown>>(sql.candShort)).rows, ts.short,
      [...FIELDS, "excessUnits", "excessRatio", "orderUnits", "idealOrderUnits", "overOrderUnits"]);
    assert.equal(candidateSqlHash({ longCutoffs, shortCutoffs }), candidateSqlHash({ longCutoffs, shortCutoffs }));
    assert.throws(() => candidateSql({ longCutoffs: ["2026-01-01'; drop table x; --"], shortCutoffs }), /invalid_cutoff/);
    console.log(`Forecast candidates: pure + leakage + determinism OK; SQL parity cand_long ${ts.long.length}, cand_short ${ts.short.length} rows identical to the TS reference`);
  } finally { await pg.close(); }
}
main().then(() => process.exit(process.exitCode ?? 0)).catch(e => { console.error(e); process.exit(1); });

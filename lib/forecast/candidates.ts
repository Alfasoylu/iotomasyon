import { addDays, MIN_IN_STOCK_DAYS, stockAdjustedDemand, stockAtStart, sumWindow, type DayUnits } from "./models";
import { futureUnits, grouped, HORIZON_DAYS, sourceEra, stockLog, universe, units, velocity, type BacktestData, type BacktestMode, type MetricRow, type Obs } from "./backtest";

// Forecast V2 candidates (PR2). Pre-registered BEFORE looking at production results — formulas and constants are frozen here and
// documented in docs/FORECAST-V2.md. Every candidate forecasts OBSERVED sales over the next 30 days from canonical sales only.
// None uses max(forecast, other_forecast); the only clamps are symmetric caps on a ratio.
export const CANDIDATES_VERSION = "forecast-candidates-v1";
export const CANDIDATES = {
  M0_true30: { complexity: 1, formula: "U30" },
  M1_true90: { complexity: 1, formula: "U90 / 3" },
  M2_weighted_30_90: { complexity: 2, formula: "0.5·U30 + 0.5·U90/3" },
  M3_ewma_hl30: { complexity: 3, formula: "30 · Σ w(d)·u(d) / Σ w(d), w = 2^(−age/30), days since max(c−180, first sale)" },
  M4_damped_trend: { complexity: 3, formula: "M1 · (1 + 0.5 · clamp((M0 − M1)/M1, −0.5, +0.5)); M1 = 0 → 0" },
  M5_calibrated_true30: { complexity: 5, formula: "k(c, velocity) · M0; k = Σa/ΣM0 over earlier cutoffs whose target ended ≤ c (≥300 obs, ≥4 cutoffs, else global, else 1), clamp [0.6, 1.4]" },
  M6_seasonal_true90: { complexity: 4, formula: "M1 · clamp(U[c−365,c−335) / (U[c−455,c−365)/3), 0.8, 1.25) if history ≥ 455 d and base ≥ 30 units, else M1" },
} as const;
export type Candidate = keyof typeof CANDIDATES;
export const CANDIDATE_MODELS = Object.keys(CANDIDATES) as Candidate[];
export const PARTIAL_HISTORY_MODEL = "P_partial_history_annualized"; // U30 / history_days · 30, only for 7 ≤ history < 30 (evaluation)
export const EWMA = { halfLifeDays: 30, windowDays: 180 } as const;
export const DAMPED = { weight: 0.5, clamp: 0.5 } as const;
export const CALIBRATION = { minObs: 300, minCutoffs: 4, min: 0.6, max: 1.4 } as const;
export const SEASONAL = { minHistoryDays: 455, minBaseUnits: 30, min: 0.8, max: 1.25 } as const;
export const COLD_START = { unknownBelowDays: 7, partialBelowDays: 30 } as const;
export const REORDER_RULE = "reorder-v1: order = max(0, forecast − stock at cutoff); 30-day cover, no safety stock, no lead time, no inbound";

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
export const historyCoverage = (days: number) => days < COLD_START.unknownBelowDays ? "lt7" : days < COLD_START.partialBelowDays ? "7_29" : "ge30";

/** Daily totals of training rows (one value per day; zero days omitted). */
function daily(rows: DayUnits[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.day, (m.get(r.day) ?? 0) + r.units);
  return m;
}
export interface CandidateInputs { training: DayUnits[]; cutoff: string; firstSaleDay: string; calibration: number }
/** All closed-form candidates (M5 needs the walk-forward factor `calibration`). Pure function of training data. */
export function candidateForecasts(x: CandidateInputs): Record<Candidate, number> {
  const { training, cutoff: c } = x;
  const u30 = sumWindow(training, addDays(c, -30), c), u90 = sumWindow(training, addDays(c, -90), c), m1 = u90 / 3;
  // M3: exponentially weighted daily rate; zero days count; denominator in closed form over n days
  const start = [addDays(c, -EWMA.windowDays), x.firstSaleDay].sort().at(-1)!, n = Math.max(0, dayDiff(c, start));
  const r = Math.pow(2, -1 / EWMA.halfLifeDays);
  let num = 0;
  for (const [d, u] of daily(training)) if (d >= start && d < c) num += Math.pow(2, -(dayDiff(c, d) - 1) / EWMA.halfLifeDays) * u; // age = c − 1 − d
  const den = n > 0 ? (1 - Math.pow(r, n)) / (1 - r) : 0;
  const history = dayDiff(c, x.firstSaleDay);
  const base = sumWindow(training, addDays(c, -455), addDays(c, -365)), ly = sumWindow(training, addDays(c, -365), addDays(c, -335));
  const seasonal = history >= SEASONAL.minHistoryDays && base >= SEASONAL.minBaseUnits ? clamp(ly / (base / 3), SEASONAL.min, SEASONAL.max) : 1;
  return {
    M0_true30: u30,
    M1_true90: m1,
    M2_weighted_30_90: 0.5 * u30 + 0.5 * m1,
    M3_ewma_hl30: den > 0 ? 30 * num / den : 0,
    M4_damped_trend: m1 === 0 ? 0 : m1 * (1 + DAMPED.weight * clamp((u30 - m1) / m1, -DAMPED.clamp, DAMPED.clamp)),
    M5_calibrated_true30: x.calibration * u30,
    M6_seasonal_true90: m1 * seasonal,
  };
}

/** Walk-forward calibration state: per long-grid cutoff and velocity segment, Σactual and ΣM0. */
export interface CalibrationCell { cutoff: string; segment: string; n: number; sumActual: number; sumM0: number }
export function calibrationCells(data: BacktestData, gridCutoffs: string[], mode: BacktestMode): CalibrationCell[] {
  const cells = new Map<string, CalibrationCell>();
  for (const c of gridCutoffs) for (const u of universe(data, c, mode)) {
    const seg = velocity(u.u90), key = `${c}|${seg}`, cell = cells.get(key) ?? { cutoff: c, segment: seg, n: 0, sumActual: 0, sumM0: 0 };
    cell.n++; cell.sumActual += futureUnits(data, u.key, c, addDays(c, HORIZON_DAYS), mode); cell.sumM0 += sumWindow(units(u.rows), addDays(c, -30), c);
    cells.set(key, cell);
  }
  return [...cells.values()];
}
/** Factor usable at `asOf`: only cells whose 30-day target ended on or before asOf (cutoff + 30 ≤ asOf). Segment → global → 1. */
export function calibrationFactor(cells: CalibrationCell[], asOf: string, segment: string): number {
  const past = cells.filter(c => addDays(c.cutoff, HORIZON_DAYS) <= asOf);
  const pick = (xs: CalibrationCell[]) => {
    const n = xs.reduce((s, c) => s + c.n, 0), sa = xs.reduce((s, c) => s + c.sumActual, 0), sf = xs.reduce((s, c) => s + c.sumM0, 0);
    const cutoffs = new Set(xs.filter(c => c.n > 0).map(c => c.cutoff)).size;
    return n >= CALIBRATION.minObs && cutoffs >= CALIBRATION.minCutoffs && sf > 0 ? clamp(sa / sf, CALIBRATION.min, CALIBRATION.max) : null;
  };
  return pick(past.filter(c => c.segment === segment)) ?? pick(past) ?? 1;
}

export interface CandidateMetricRow extends MetricRow { excessUnits: number; excessRatio: number | null; orderUnits?: number; idealOrderUnits?: number; overOrderUnits?: number }
interface CObs extends Obs { stock?: number }
function withSafety(section: string, model: string, target: MetricRow["target"], obs: CObs[]): CandidateMetricRow[] {
  return grouped(section, model, target, obs).map(row => {
    const g = obs.filter(o => o.segs.some(([d, s]) => d === row.dim && s === row.segment));
    const excess = g.reduce((s, o) => s + Math.max(0, o.f - o.a), 0);
    const out: CandidateMetricRow = { ...row, excessUnits: excess, excessRatio: row.sumActual === 0 ? null : excess / row.sumActual };
    if (g.every(o => o.stock != null)) {
      let order = 0, ideal = 0, over = 0;
      for (const o of g) { const q = Math.max(0, o.f - o.stock!), i = Math.max(0, o.a - o.stock!); order += q; ideal += i; over += Math.max(0, q - i); }
      Object.assign(out, { orderUnits: order, idealOrderUnits: ideal, overOrderUnits: over });
    }
    return out;
  });
}

export interface CandidateReport { meta: Record<string, unknown>; long: CandidateMetricRow[]; short: CandidateMetricRow[] }
/** Candidate comparison on the same walk-forward grid as PR1 (long) and on the stock-covered short window. */
export function runCandidateBacktest(data: BacktestData, config: { longCutoffs: string[]; shortCutoffs: string[]; mode: BacktestMode }): CandidateReport {
  const { mode } = config;
  const cells = calibrationCells(data, config.longCutoffs, mode);
  const longObs = new Map<string, CObs[]>(), shortObs = new Map<string, CObs[]>();
  const push = (m: Map<string, CObs[]>, k: string, o: CObs) => m.set(k, [...(m.get(k) ?? []), o]);
  const prepare = (u: ReturnType<typeof universe>[number], c: string) => {
    const training = units(u.rows), first = training.filter(r => r.units > 0).reduce((m, r) => r.day < m ? r.day : m, "9999-12-31");
    const vel = velocity(u.u90), history = dayDiff(c, first);
    const f = candidateForecasts({ training, cutoff: c, firstSaleDay: first, calibration: calibrationFactor(cells, c, vel) });
    return { f, history, u30: f.M0_true30 };
  };
  let longN = 0, shortN = 0, shortNoCoverage = 0;
  for (const c of config.longCutoffs) for (const u of universe(data, c, mode)) {
    const { f, history, u30 } = prepare(u, c), a = futureUnits(data, u.key, c, addDays(c, HORIZON_DAYS), mode); longN++;
    const segs: [string, string][] = [...u.segs.filter(([d]) => ["all", "velocity", "lifecycle", "business_line", "top50_revenue"].includes(d)),
      ["history_coverage", historyCoverage(history)], ["source_era", sourceEra(c)]];
    for (const m of CANDIDATE_MODELS) push(longObs, m, { f: f[m], a, w: u.weight, segs });
    if (history >= COLD_START.unknownBelowDays && history < COLD_START.partialBelowDays)
      push(longObs, PARTIAL_HISTORY_MODEL, { f: u30 / history * 30, a, w: u.weight, segs });
  }
  for (const c of config.shortCutoffs) for (const u of universe(data, c, mode)) {
    if (u.productId == null || u.legacy) continue;
    const log = stockLog(data, u.productId, c, mode), train = stockAdjustedDemand(units(u.rows), log, addDays(c, -30), c);
    if (train.inStockDays == null) { shortNoCoverage++; continue; }
    const stock = stockAtStart(log, c)!; // log holds days < c → start of day c = last end-of-day before c (covered ⇒ known)
    const { f } = prepare(u, c), a = futureUnits(data, u.key, c, addDays(c, HORIZON_DAYS), mode); shortN++;
    const target = stockAdjustedDemand(data.canonical.filter(r => r.key === u.key).map(r => ({ day: r.day, units: r.units })),
      stockLog(data, u.productId, null, mode), c, addDays(c, HORIZON_DAYS)).estimate;
    const segs: [string, string][] = [["all", "all"], ["stock_state", (train.outDays ?? 0) > 0 ? "constrained_pre_cutoff" : "unconstrained_pre_cutoff"],
      ["velocity", velocity(u.u90)]];
    const models: [string, number | null][] = [...CANDIDATE_MODELS.map(m => [m, f[m]] as [string, number]), ["stock_adjusted_demand_estimate_30", train.estimate]];
    for (const [m, v] of models) {
      if (v == null) continue;
      push(shortObs, `${m}\u0000observed`, { f: v, a, w: u.weight, segs, stock });
      if (target != null) push(shortObs, `${m}\u0000availability_normalized`, { f: v, a: target, w: u.weight, segs, stock });
    }
  }
  const sort = (rows: CandidateMetricRow[]) => rows.sort((a, b) => `${a.model}|${a.target}|${a.dim}|${a.segment}` < `${b.model}|${b.target}|${b.dim}|${b.segment}` ? -1 : 1);
  return {
    meta: { version: CANDIDATES_VERSION, mode, longCutoffs: config.longCutoffs, shortCutoffs: config.shortCutoffs, samples: { long: longN, short: shortN, shortNoCoverage },
      candidates: CANDIDATES, ewma: EWMA, damped: DAMPED, calibration: CALIBRATION, seasonal: SEASONAL, coldStart: COLD_START, reorder: REORDER_RULE,
      minInStockDays: MIN_IN_STOCK_DAYS },
    long: sort([...longObs].flatMap(([m, o]) => withSafety("cand_long", m, "observed", o))),
    short: sort([...shortObs].flatMap(([k, o]) => { const [m, t] = k.split("\u0000"); return withSafety("cand_short", m, t as MetricRow["target"], o); })),
  };
}

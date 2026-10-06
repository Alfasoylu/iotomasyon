import { createHash } from "node:crypto";
import { addDays, MIN_IN_STOCK_DAYS, OBSERVED_MODELS, observedForecasts, PRODUCTION_LAYERS, productionLayers, statusKept, stockAdjustedDemand,
  sumWindow, type DayUnits, type StockDay } from "./models";

// Walk-forward forecast backtest — reference implementation (pure; no DB access, no writes). The production run uses the SQL port in
// backtest-sql.ts, which is parity-tested against this file. Rules:
//  - Training data for cutoff c: economic day < c. In point_in_time mode additionally known_at < c, stock/alias/manual known before c.
//  - Segments, price weights and every model input use training data only. Only the evaluation target looks past the cutoff.
//  - economic_time mode replays economic dates with today's mappings and is labelled as NOT a historical knowledge-state replay.
export const BACKTEST_VERSION = "forecast-backtest-v1";
export const HORIZON_DAYS = 30;
export const CATASTROPHIC = { ratio: 2, minUnits: 3 } as const;
export const ECONOMIC_TIME_LABEL = "economic-time backtest, not historical knowledge-state replay";
/** Trendyol API became the primary Trendyol source on this day (fm_source_priority); from then on the legacy UNION ALL double counts. */
export const TRENDYOL_API_FROM = "2026-05-04";
export const sourceEra = (cutoff: string) => cutoff < TRENDYOL_API_FROM ? "before_trendyol_api" : cutoff >= addDays(TRENDYOL_API_FROM, 30) ? "trendyol_api_full_window" : "transition";

export interface CanonicalRow { key: string; productId: string | null; rawKey: string; channel: string; day: string; units: number; revenue: number;
  legacy: boolean; knownAt: string | null; mappedAt?: string | null }
export interface UnionRow { productId: string; day: string; units: number; status: string | null; knownAt?: string | null }
export interface StockRow { productId: string; day: string; unitsOpen: number; unitsEod: number; knownAt: string | null }
export interface ManualRow { productId: string; value: number | null; knownAt: string }
export interface BacktestData { canonical: CanonicalRow[]; union: UnionRow[]; stock: StockRow[]; manual: ManualRow[] }
export type BacktestMode = "economic_time" | "point_in_time";
export interface BacktestConfig { longCutoffs: string[]; shortCutoffs: string[]; todayCutoff: string; mode: BacktestMode }

export interface Metrics { n: number; sumActual: number; sumForecast: number; sumAbsError: number; mae: number | null; wape: number | null; bias: number | null;
  overRate: number | null; underRate: number | null; catOverRate: number | null; revWape: number | null; revBias: number | null; revN: number }
export interface MetricRow extends Metrics { section: "long" | "waterfall" | "short"; model: string; target: "observed" | "availability_normalized"; dim: string; segment: string }
export interface LevelRow { layer: string; n: number; sumForecast: number; nManualKnown: number }
export interface Obs { f: number; a: number; w: number | null; segs: [string, string][] }

/** Metric definitions (units). WAPE = Σ|f−a|/Σa (unit-volume weighted); bias = Σ(f−a)/Σa; catastrophic overforecast = f > 2·a AND f−a ≥ 3 units;
 *  revenue-weighted = same with each observation weighted by its pre-cutoff realized unit price (90d, else 365d; none → excluded, revN counts used). */
export function metrics(obs: Obs[]): Metrics {
  let sa = 0, sf = 0, sae = 0, over = 0, under = 0, cat = 0, rae = 0, rdiff = 0, ra = 0, revN = 0;
  for (const o of obs) {
    const e = o.f - o.a; sa += o.a; sf += o.f; sae += Math.abs(e);
    if (e > 0) over++; else if (e < 0) under++;
    if (o.f > CATASTROPHIC.ratio * o.a && e >= CATASTROPHIC.minUnits) cat++;
    if (o.w != null) { revN++; rae += Math.abs(e) * o.w; rdiff += e * o.w; ra += o.a * o.w; }
  }
  const n = obs.length, ratio = (x: number, y: number) => y === 0 ? null : x / y;
  return { n, sumActual: sa, sumForecast: sf, sumAbsError: sae, mae: ratio(sae, n), wape: ratio(sae, sa), bias: ratio(sf - sa, sa),
    overRate: ratio(over, n), underRate: ratio(under, n), catOverRate: ratio(cat, n), revWape: ratio(rae, ra), revBias: ratio(rdiff, ra), revN };
}
function grouped(section: MetricRow["section"], model: string, target: MetricRow["target"], obs: Obs[]): MetricRow[] {
  const groups = new Map<string, Obs[]>();
  for (const o of obs) for (const [dim, seg] of o.segs) { const k = `${dim}\u0000${seg}`; groups.set(k, [...(groups.get(k) ?? []), o]); }
  return [...groups].map(([k, g]) => { const [dim, segment] = k.split("\u0000"); return { section, model, target, dim, segment, ...metrics(g) }; });
}

const iso = (day: string) => `${day}T00:00:00.000Z`;
const known = (at: string | null | undefined, cutoff: string, mode: BacktestMode) => mode === "economic_time" || (at != null && at < iso(cutoff));
const velocity = (u90: number) => u90 / 3 >= 30 ? "A_ge30_per_month" : u90 / 3 >= 5 ? "B_5_30_per_month" : "C_lt5_per_month";

interface KeyState { key: string; productId: string | null; rows: CanonicalRow[] }
/** Training view of the canonical rows at a cutoff: day < c, known_at/mapping per mode. Keys follow the mapping known at the cutoff. */
function trainingByKey(data: BacktestData, cutoff: string, mode: BacktestMode): Map<string, KeyState> {
  const out = new Map<string, KeyState>();
  for (const r of data.canonical) {
    if (r.day >= cutoff || !known(r.knownAt, cutoff, mode)) continue;
    const mapped = r.productId != null && (mode === "economic_time" || r.mappedAt == null || r.mappedAt < iso(cutoff));
    const key = mapped ? r.key : r.rawKey;
    const s = out.get(key) ?? { key, productId: mapped ? r.productId : null, rows: [] };
    s.rows.push(r); out.set(key, s);
  }
  return out;
}
const units = (rows: CanonicalRow[]): DayUnits[] => rows.map(r => ({ day: r.day, units: r.units }));
/** Evaluation target (may look past the cutoff). In point_in_time mode a pre-mapping raw key also owns its later (now mapped) rows. */
const futureUnits = (data: BacktestData, key: string, from: string, to: string, mode: BacktestMode) =>
  data.canonical.reduce((s, r) => (r.key === key || (mode === "point_in_time" && r.rawKey === key)) && r.day >= from && r.day < to ? s + r.units : s, 0);

interface Universe { key: string; productId: string | null; rows: CanonicalRow[]; u90: number; r90: number; legacy: boolean; weight: number | null; segs: [string, string][] }
/** Keys with sales in the 365 days before the cutoff, with pre-cutoff segments. */
function universe(data: BacktestData, cutoff: string, mode: BacktestMode): Universe[] {
  const from365 = addDays(cutoff, -365), from90 = addDays(cutoff, -90);
  const list: Universe[] = [];
  for (const s of trainingByKey(data, cutoff, mode).values()) {
    const y = s.rows.filter(r => r.day >= from365), q = y.filter(r => r.day >= from90);
    const u365 = y.reduce((a, r) => a + r.units, 0); if (!(u365 > 0)) continue;
    const u90 = q.reduce((a, r) => a + r.units, 0), r90 = q.reduce((a, r) => a + r.revenue, 0), r365 = y.reduce((a, r) => a + r.revenue, 0);
    const first = s.rows.filter(r => r.units > 0).reduce((m, r) => r.day < m ? r.day : m, "9999-12-31");
    const ch = new Map<string, number>(); for (const r of q) ch.set(r.channel, (ch.get(r.channel) ?? 0) + r.units);
    const channel = [...ch].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))[0]?.[0] ?? "NONE";
    const legacy = y.some(r => r.legacy);
    list.push({ key: s.key, productId: s.productId, rows: s.rows, u90, r90, legacy, weight: u90 > 0 ? r90 / u90 : u365 > 0 ? r365 / u365 : null, segs: [
      ["all", "all"], ["velocity", velocity(u90)], ["business_line", legacy ? "legacy" : "core"], ["lifecycle", first >= from90 ? "new_lt90d" : "mature"],
      ["channel", channel]] });
  }
  list.sort((a, b) => b.r90 - a.r90 || (a.key < b.key ? -1 : 1));
  const n = list.length;
  list.forEach((u, i) => {
    // integer arithmetic (n/5, n/2) so the SQL port ranks identically
    u.segs.push(["revenue_tier", i < Math.ceil(n / 5) ? "high_top20pct" : i < Math.ceil(n / 2) ? "medium_next30pct" : "low_rest"]);
    u.segs.push(["top50_revenue", i < 50 ? "top50" : "rest"]);
    if (!u.segs.some(([d, s]) => d === "velocity" && s.startsWith("C_"))) u.segs.push(["volume_filter", "excl_C_lt5"]);
  });
  return list;
}

const manualAt = (data: BacktestData, productId: string, cutoff: string) => {
  const v = data.manual.filter(m => m.productId === productId && m.knownAt < iso(cutoff)).sort((a, b) => a.knownAt < b.knownAt ? 1 : -1)[0];
  return v ? v.value ?? 0 : null;
};
function unionInputs(data: BacktestData, productId: string, cutoff: string, mode: BacktestMode) {
  const rows = data.union.filter(r => r.productId === productId && r.day < cutoff && known(r.knownAt, cutoff, mode));
  return { unionCorrect: rows.filter(r => statusKept(r.status, true)).map(r => ({ day: r.day, units: r.units })),
    unionProduction: rows.filter(r => statusKept(r.status, false)).map(r => ({ day: r.day, units: r.units })) };
}
const stockLog = (data: BacktestData, productId: string, cutoff: string | null, mode: BacktestMode): StockDay[] => data.stock
  .filter(r => r.productId === productId && (cutoff == null || (r.day < cutoff && known(r.knownAt, cutoff, mode))))
  .sort((a, b) => a.day < b.day ? -1 : 1).map(r => ({ day: r.day, unitsOpen: r.unitsOpen, unitsEod: r.unitsEod }));

export interface BacktestReport {
  meta: { version: string; mode: BacktestMode; label: string | null; horizonDays: number; longCutoffs: string[]; shortCutoffs: string[]; todayCutoff: string;
    samples: Record<string, number>; exclusions: Record<string, number | string>; unknown: Record<string, string>; definitions: Record<string, string> };
  long: MetricRow[]; waterfall: MetricRow[]; short: MetricRow[]; today: LevelRow[];
}

export function runBacktest(data: BacktestData, config: BacktestConfig): BacktestReport {
  const { mode } = config;
  const longObs = new Map<string, Obs[]>(), layerObs = new Map<string, Obs[]>(), shortObs = new Map<string, Obs[]>();
  const push = (m: Map<string, Obs[]>, k: string, o: Obs) => m.set(k, [...(m.get(k) ?? []), o]);
  let longN = 0, layerN = 0, layerManual = 0, shortN = 0, shortNoCoverage = 0, shortUnknownEstimate = 0, shortUnknownTarget = 0;
  for (const c of config.longCutoffs) {
    for (const u of universe(data, c, mode)) {
      const a = futureUnits(data, u.key, c, addDays(c, HORIZON_DAYS), mode);
      const f = observedForecasts(units(u.rows), c); longN++;
      for (const m of OBSERVED_MODELS) push(longObs, m, { f: f[m], a, w: u.weight, segs: u.segs });
      if (u.productId == null || u.legacy) continue;
      const layers = productionLayers({ canonical: units(u.rows), ...unionInputs(data, u.productId, c, mode), manual: manualAt(data, u.productId, c) }, c); layerN++;
      const segs: [string, string][] = [...u.segs.filter(([d]) => d === "all" || d === "velocity"), ["source_era", sourceEra(c)]];
      for (const l of PRODUCTION_LAYERS) { const v = layers[l]; if (v != null) push(layerObs, l, { f: v, a, w: u.weight, segs }); }
      if (layers.L5_manual_override_max != null) layerManual++;
    }
  }
  for (const c of config.shortCutoffs) {
    for (const u of universe(data, c, mode)) {
      if (u.productId == null || u.legacy) continue;
      const train = stockAdjustedDemand(units(u.rows), stockLog(data, u.productId, c, mode), addDays(c, -30), c);
      if (train.inStockDays == null) { shortNoCoverage++; continue; }
      if (train.estimate == null) { shortUnknownEstimate++; continue; }
      const a = futureUnits(data, u.key, c, addDays(c, HORIZON_DAYS), mode); shortN++;
      const futureSales = data.canonical.filter(r => r.key === u.key).map(r => ({ day: r.day, units: r.units }));
      const target = stockAdjustedDemand(futureSales, stockLog(data, u.productId, null, mode), c, addDays(c, HORIZON_DAYS)).estimate;
      if (target == null) shortUnknownTarget++;
      const segs: [string, string][] = [["all", "all"], ["stock_state", (train.outDays ?? 0) > 0 ? "constrained_pre_cutoff" : "unconstrained_pre_cutoff"],
        u.segs.find(([d]) => d === "velocity")!];
      const f = { observed_sales_forecast_true30: sumWindow(units(u.rows), addDays(c, -30), c), stock_adjusted_demand_estimate_30: train.estimate };
      for (const [m, v] of Object.entries(f)) {
        push(shortObs, `${m}\u0000observed`, { f: v, a, w: u.weight, segs });
        if (target != null) push(shortObs, `${m}\u0000availability_normalized`, { f: v, a: target, w: u.weight, segs });
      }
    }
  }
  const todayUniverse = universe(data, config.todayCutoff, mode).filter(u => u.productId != null && !u.legacy);
  const today = PRODUCTION_LAYERS.map(layer => {
    let n = 0, sum = 0, nManual = 0;
    for (const u of todayUniverse) {
      const manual = manualAt(data, u.productId!, addDays(config.todayCutoff, 1));
      const v = productionLayers({ canonical: units(u.rows), ...unionInputs(data, u.productId!, config.todayCutoff, mode), manual }, config.todayCutoff)[layer];
      if (manual != null && manual > 0) nManual++;
      if (v != null) { n++; sum += v; }
    }
    return { layer, n, sumForecast: sum, nManualKnown: nManual };
  });
  const sortRows = (rows: MetricRow[]) => rows.sort((a, b) => `${a.model}|${a.target}|${a.dim}|${a.segment}` < `${b.model}|${b.target}|${b.dim}|${b.segment}` ? -1 : 1);
  return {
    meta: { version: BACKTEST_VERSION, mode, label: mode === "economic_time" ? ECONOMIC_TIME_LABEL : null, horizonDays: HORIZON_DAYS,
      longCutoffs: config.longCutoffs, shortCutoffs: config.shortCutoffs, todayCutoff: config.todayCutoff,
      samples: { long: longN, waterfall: layerN, waterfallManualKnown: layerManual, short: shortN, todayProducts: todayUniverse.length },
      exclusions: { waterfall: "unmapped keys and legacy business line", short_no_stock_coverage: shortNoCoverage,
        short_lt10_in_stock_days_training: shortUnknownEstimate, short_target_lt10_in_stock_days: shortUnknownTarget },
      unknown: {
        capital_weighted_overforecast: "UNKNOWN: no point-in-time unit cost history (Product.unitCostTry is current-only; today's cost is not applied to the past)",
        ...(layerManual === 0 ? { manual_override_backtest: "UNKNOWN: Product.onlineSalesPotential has no history; measured only as of todayCutoff (level, no actuals)" } : {}),
      },
      definitions: {
        observation: `key × cutoff with sales in the 365 days before the cutoff; target = observed units in [cutoff, cutoff+${HORIZON_DAYS}d)`,
        wape: "Σ|f−a| / Σa (unit-volume weighted)", bias: "Σ(f−a) / Σa", mae: "Σ|f−a| / n (units)",
        over_under: "share of observations with f>a / f<a", catastrophic_overforecast: `f > ${CATASTROPHIC.ratio}·a and f−a ≥ ${CATASTROPHIC.minUnits} units`,
        revenue_weighted: "same as WAPE/bias with weight = pre-cutoff realized unit price (90d, else 365d)",
        segments: "computed from training data only (velocity = 90d units/3; revenue tiers rank 90d revenue: top 20% / next 30% / rest; channel = dominant 90d channel)",
        availability_normalized: `units on in-stock target days / in-stock days × 30 (≥${MIN_IN_STOCK_DAYS} in-stock days; stock-aware benchmark only)`,
      } },
    long: sortRows([...longObs].flatMap(([m, o]) => grouped("long", m, "observed", o))),
    waterfall: sortRows([...layerObs].flatMap(([m, o]) => grouped("waterfall", m, "observed", o))),
    short: sortRows([...shortObs].flatMap(([k, o]) => { const [m, t] = k.split("\u0000"); return grouped("short", m, t as MetricRow["target"], o); })),
    today,
  };
}

/** Everything the backtest knows at a cutoff BEFORE looking at the target: per key segments, price weight and every model output.
 *  Leakage tests assert this is invariant to any data dated/known at or after the cutoff. */
export function forecastSnapshot(data: BacktestData, cutoff: string, mode: BacktestMode) {
  return universe(data, cutoff, mode).map(u => {
    const eligible = u.productId != null && !u.legacy;
    const stock = eligible ? stockAdjustedDemand(units(u.rows), stockLog(data, u.productId!, cutoff, mode), addDays(cutoff, -30), cutoff) : null;
    return { key: u.key, segs: u.segs, weight: u.weight, observed: observedForecasts(units(u.rows), cutoff),
      layers: eligible ? productionLayers({ canonical: units(u.rows), ...unionInputs(data, u.productId!, cutoff, mode), manual: manualAt(data, u.productId!, cutoff) }, cutoff) : null,
      stock_adjusted_demand_estimate_30: stock?.estimate ?? null };
  }).sort((a, b) => a.key < b.key ? -1 : 1);
}

/** Stable fingerprint of a report's results (generated_at excluded) — same data + same version ⇒ same hash. */
export function reportHash(r: BacktestReport): string {
  return createHash("sha256").update(JSON.stringify({ meta: r.meta, long: r.long, waterfall: r.waterfall, short: r.short, today: r.today })).digest("hex");
}
/** Cutoff schedule: every `stepDays` from `from` while cutoff + horizon ≤ lastDay + 1 (target fully observed). */
export function cutoffSchedule(from: string, lastDay: string, stepDays: number): string[] {
  const out: string[] = [];
  for (let c = from; addDays(c, HORIZON_DAYS) <= addDays(lastDay, 1); c = addDays(c, stepDays)) out.push(c);
  return out;
}

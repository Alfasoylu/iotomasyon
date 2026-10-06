import { addDays, MIN_IN_STOCK_DAYS, stockAtStart, sumWindow, type DayUnits, type StockDay } from "./models";

// Forecast V2 — production observed-sales forecast (PR2). Canonical Financial Memory sales (fm_sales_canonical_snapshot, COUNTED)
// over a TRUE 30-day window [as_of − 30, as_of). No legacy UNION ALL source, no max() upward floor, no seasonality, no manual potential.
// Chosen by the pre-registered gate in docs/FORECAST-V2.md (M0_true30). Gated by FORECAST_V2_ENABLED (default off); while off every
// consumer keeps its legacy formula byte-for-byte. Experimental models (M7 shadow) live in m7-shadow.ts and are NOT imported here.
export const FORECAST_V2_MODEL_VERSION = "observed-sales-v2-true30";
export const FORECAST_V2_HORIZON_DAYS = 30;
export const FORECAST_V2_COLD_START = { unknownBelowDays: 7, partialBelowDays: 30 } as const;
/** Canonical source considered stale when its newest economic day is older than as_of − 2 (yesterday's data may still be arriving). */
export const FORECAST_V2_STALE_AFTER_DAYS = 2;

export function forecastV2Enabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.FORECAST_V2_ENABLED === "true";
}

export type ForecastV2Grade = "FULL" | "PARTIAL" | "UNKNOWN";
export type ForecastV2Segment = "A_ge30_per_month" | "B_5_30_per_month" | "C_lt5_per_month";
export type ForecastV2Reason =
  | "NO_CANONICAL_SALES" | "COLD_START_LT7D" | "PARTIAL_HISTORY_7_29D" | "NO_SALES_LAST_30D" | "SOURCE_STALE" | "STOCK_CONSTRAINED_LAST_30D"
  | "DEMAND_ESTIMATE_NO_STOCK_HISTORY" | "DEMAND_ESTIMATE_LT10_IN_STOCK_DAYS" | "MANUAL_OVERRIDE_NOT_APPLIED";

/** Output contract (snake_case on purpose: it is the documented, versioned contract shared with reports). */
export interface ForecastV2 {
  sku: string;
  product_id: string;
  as_of: string;
  horizon_days: 30;
  /** Observed-sales forecast for [as_of, as_of + 30). null = UNKNOWN. PARTIAL values are the observed units, never annualised. */
  forecast_units: number | null;
  model_version: typeof FORECAST_V2_MODEL_VERSION;
  /** Days from first canonical sale to as_of; null when never sold. */
  history_days: number | null;
  /** Velocity on pre-as_of data only (90-day units / 3). */
  segment: ForecastV2Segment;
  data_grade: ForecastV2Grade;
  /** false: forecast_units is an observed count, nothing is imputed or extrapolated. */
  estimated: false;
  reason_flags: ForecastV2Reason[];
  /** Newest canonical economic day seen by the loader (ISO date) — the data watermark. */
  source_watermark: string | null;
  /** Stock-adjusted DEMAND estimate (separate concept): units sold on in-stock days / in-stock days × 30. UNKNOWN without full stock history.
   *  Never substitutes forecast_units. */
  demand_estimate_units: number | null;
  /** Manual potential (Product.onlineSalesPotential), shown for comparison only. */
  manual_override_units: number | null;
  model_forecast: number | null;
  manual_override: number | null;
  /** In this PR: effective_forecast = model_forecast (manual override is NOT applied). */
  effective_forecast: number | null;
}

/** Per-product aggregates the loader reads from the database (or the reference computes from rows). */
export interface ForecastV2Aggregates {
  productId: string;
  sku: string;
  units30: number;
  units90: number;
  firstSaleDay: string | null;
  /** Days in [as_of − 30, as_of) with a known start-of-day stock; in-stock (> 0) days; units sold on in-stock days; out-of-stock days. */
  stockKnownDays: number;
  inStockDays: number;
  unitsOnInStockDays: number;
  outOfStockDays: number;
  manualOverride: number | null;
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
export const segmentOf = (units90: number): ForecastV2Segment => units90 / 3 >= 30 ? "A_ge30_per_month" : units90 / 3 >= 5 ? "B_5_30_per_month" : "C_lt5_per_month";

/** Pure V2 forecast from aggregates. Deterministic; manual override and demand estimate cannot change forecast_units. */
export function forecastV2(x: ForecastV2Aggregates, asOf: string, sourceWatermark: string | null): ForecastV2 {
  const reasons: ForecastV2Reason[] = [];
  const history = x.firstSaleDay == null ? null : dayDiff(asOf, x.firstSaleDay);
  let grade: ForecastV2Grade, forecast: number | null;
  if (history == null) { grade = "UNKNOWN"; forecast = null; reasons.push("NO_CANONICAL_SALES"); }
  else if (history < FORECAST_V2_COLD_START.unknownBelowDays) { grade = "UNKNOWN"; forecast = null; reasons.push("COLD_START_LT7D"); }
  else if (history < FORECAST_V2_COLD_START.partialBelowDays) { grade = "PARTIAL"; forecast = x.units30; reasons.push("PARTIAL_HISTORY_7_29D"); }
  else { grade = "FULL"; forecast = x.units30; }
  if (forecast === 0) reasons.push("NO_SALES_LAST_30D");
  if (sourceWatermark == null || sourceWatermark < addDays(asOf, -FORECAST_V2_STALE_AFTER_DAYS)) reasons.push("SOURCE_STALE");
  if (x.outOfStockDays > 0) reasons.push("STOCK_CONSTRAINED_LAST_30D");
  let demand: number | null = null;
  if (x.stockKnownDays < FORECAST_V2_HORIZON_DAYS) reasons.push("DEMAND_ESTIMATE_NO_STOCK_HISTORY");
  else if (x.inStockDays < MIN_IN_STOCK_DAYS) reasons.push("DEMAND_ESTIMATE_LT10_IN_STOCK_DAYS");
  else demand = x.unitsOnInStockDays / x.inStockDays * 30;
  if (x.manualOverride != null && x.manualOverride !== forecast) reasons.push("MANUAL_OVERRIDE_NOT_APPLIED");
  return {
    sku: x.sku, product_id: x.productId, as_of: asOf, horizon_days: FORECAST_V2_HORIZON_DAYS, forecast_units: forecast, model_version: FORECAST_V2_MODEL_VERSION,
    history_days: history, segment: segmentOf(x.units90), data_grade: grade, estimated: false, reason_flags: reasons, source_watermark: sourceWatermark,
    demand_estimate_units: demand, manual_override_units: x.manualOverride, model_forecast: forecast, manual_override: x.manualOverride, effective_forecast: forecast,
  };
}

/**
 * Units a capital / purchase / reorder engine may treat as a reliable monthly demand: FULL grade only. PARTIAL and UNKNOWN return null, so
 * those engines must take their "veri eksik" path instead of sizing an order or a capital need on a partial history.
 */
export function decisionUnits(f: ForecastV2): number | null {
  return f.data_grade === "FULL" ? f.effective_forecast : null;
}

/** Reference aggregation from raw rows (canonical daily units of one product, its stock log) — used by tests to prove the loader SQL. */
export function aggregatesFromRows(input: { productId: string; sku: string; sales: DayUnits[]; stock: StockDay[]; manualOverride: number | null }, asOf: string): ForecastV2Aggregates {
  const training = input.sales.filter(r => r.day < asOf);
  const first = training.filter(r => r.units > 0).reduce<string | null>((m, r) => m == null || r.day < m ? r.day : m, null);
  const from = addDays(asOf, -FORECAST_V2_HORIZON_DAYS);
  const log = input.stock.filter(s => s.day < asOf).sort((a, b) => a.day < b.day ? -1 : 1);
  let known = 0, ins = 0, outd = 0, uin = 0;
  for (let d = from; d < asOf; d = addDays(d, 1)) {
    const stock = stockAtStart(log, d);
    if (stock == null) continue;
    known++;
    if (stock > 0) { ins++; uin += sumWindow(training, d, addDays(d, 1)); } else outd++;
  }
  return { productId: input.productId, sku: input.sku, units30: sumWindow(training, from, asOf), units90: sumWindow(training, addDays(asOf, -90), asOf), firstSaleDay: first,
    stockKnownDays: known, inStockDays: ins, unitsOnInStockDays: uin, outOfStockDays: outd, manualOverride: input.manualOverride };
}

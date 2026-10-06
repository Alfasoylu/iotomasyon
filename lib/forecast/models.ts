import { forecastMonthlySales } from "@/lib/sales-forecast";

// Forecast models evaluated by the backtest (lib/forecast/backtest.ts). Each model sees ONLY training data (economic day < cutoff)
// that the backtest already sliced. Names keep the forecast/demand distinction explicit:
//  - observed_sales_forecast_*  : forecasts of OBSERVED sales (what the shelf sold, stockouts included)
//  - stock_adjusted_demand_estimate_30 : demand while in stock; UNKNOWN (null) unless stock history covers the window
//  - production_*               : the layers of today's production call path (app/api/products/importer-view, admin/sermaye-saglik)
export const OBSERVED_MODELS = ["observed_sales_forecast_legacy_fms", "observed_sales_forecast_true30", "observed_sales_forecast_true90",
  "observed_sales_forecast_blend_seasonal_no_max"] as const;
export type ObservedModel = typeof OBSERVED_MODELS[number];
/** Inflation waterfall, cumulative and in this order: each layer adds exactly one production behaviour to the previous one. */
export const PRODUCTION_LAYERS = [
  "L0_canonical_true30",            // canonical deduplicated sales (Financial Memory), true 30-day window
  "L1_union_dedupe_gap",            // + legacy UNION ALL of Marketplace/Trendyol/Hepsiburada records (duplicate source), correct status filter
  "L2_union_status_filter_leak",    // + production status filter (ILIKE misses Turkish 'İ': 'İade-İptal' counted as a sale)
  "L3_month_bucket_window",         // + month buckets dated the 15th instead of a true 30-day window (forecast.components.last30dUnits)
  "L4_max_blend_seasonal",          // + max(last30 bucket, blend × seasonal) = forecastMonthlySales().monthlyUnits
  "L5_manual_override_max",         // + caller max(forecast, Product.onlineSalesPotential) = effectiveMonthlyUnits
] as const;
export type ProductionLayer = typeof PRODUCTION_LAYERS[number];

export interface DayUnits { day: string; units: number }
const DAY_MS = 86_400_000;
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
export const sumWindow = (rows: DayUnits[], from: string, to: string) => rows.reduce((s, r) => r.day >= from && r.day < to ? s + r.units : s, 0);

/** Month buckets exactly as production builds them (one bucket per calendar month that has rows; value = sum, zero allowed). */
export function monthBuckets(rows: DayUnits[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.day.slice(0, 7), (m.get(r.day.slice(0, 7)) ?? 0) + r.units);
  return m;
}
/** Production forecastMonthlySales, called unchanged with the cutoff as `now` (00:00 UTC) on training buckets only. */
export function legacyForecast(training: DayUnits[], cutoff: string) {
  return forecastMonthlySales(monthBuckets(training), new Date(`${cutoff}T00:00:00Z`));
}

export function observedForecasts(training: DayUnits[], cutoff: string): Record<ObservedModel, number> {
  const fms = legacyForecast(training, cutoff);
  return {
    observed_sales_forecast_legacy_fms: fms.monthlyUnits,
    observed_sales_forecast_true30: sumWindow(training, addDays(cutoff, -30), cutoff),
    observed_sales_forecast_true90: sumWindow(training, addDays(cutoff, -90), cutoff) / 3,
    observed_sales_forecast_blend_seasonal_no_max: fms.components.blendSeasonal,
  };
}

/** Status filter of the production call path: ILIKE on '%iptal%'/'%iade%'/'%cancel%'. PostgreSQL ILIKE (and JS toLowerCase) does not fold
 *  Turkish 'İ' to 'i', so 'İade-İptal' passes as a sale. `correct` folds 'İ'/'I' first. */
export function statusKept(status: string | null, correct: boolean): boolean {
  if (status == null) return true;
  const s = (correct ? status.replace(/İ/g, "i") : status).toLowerCase();
  return !s.includes("iptal") && !s.includes("iade") && !s.includes("cancel");
}

export interface ProductionInputs { canonical: DayUnits[]; unionCorrect: DayUnits[]; unionProduction: DayUnits[]; manual: number | null }
/** Cumulative production layers at a cutoff. L5 is null when no manual potential was known at the cutoff (never back-filled). */
export function productionLayers(x: ProductionInputs, cutoff: string): Record<ProductionLayer, number | null> {
  const fms = legacyForecast(x.unionProduction, cutoff);
  return {
    L0_canonical_true30: sumWindow(x.canonical, addDays(cutoff, -30), cutoff),
    L1_union_dedupe_gap: sumWindow(x.unionCorrect, addDays(cutoff, -30), cutoff),
    L2_union_status_filter_leak: sumWindow(x.unionProduction, addDays(cutoff, -30), cutoff),
    L3_month_bucket_window: fms.components.last30dUnits,
    L4_max_blend_seasonal: fms.monthlyUnits,
    L5_manual_override_max: x.manual == null ? null : Math.max(fms.monthlyUnits, x.manual),
  };
}

/** Start-of-day stock: units_open on a logged day, else the last logged end-of-day level; null before the first log (unknown). */
export interface StockDay { day: string; unitsOpen: number; unitsEod: number }
export function stockAtStart(log: StockDay[], day: string): number | null {
  let last: StockDay | null = null;
  for (const r of log) { if (r.day > day) break; last = r; }
  return last == null ? null : last.day === day ? last.unitsOpen : last.unitsEod;
}
export const MIN_IN_STOCK_DAYS = 10;
/** Units sold on in-stock days scaled to 30 days. null (UNKNOWN) when any day's stock is unknown or fewer than 10 in-stock days. */
export function stockAdjustedDemand(sales: DayUnits[], log: StockDay[], from: string, to: string): { estimate: number | null; inStockDays: number | null; outDays: number | null } {
  let inStock = 0, out = 0, units = 0;
  const byDay = new Map<string, number>();
  for (const r of sales) if (r.day >= from && r.day < to) byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.units);
  for (let d = from; d < to; d = addDays(d, 1)) {
    const s = stockAtStart(log, d);
    if (s == null) return { estimate: null, inStockDays: null, outDays: null };
    if (s > 0) { inStock++; units += byDay.get(d) ?? 0; } else out++;
  }
  return { estimate: inStock >= MIN_IN_STOCK_DAYS ? units / inStock * 30 : null, inStockDays: inStock, outDays: out };
}

import { decisionUnits, type ForecastV2 } from "./v2";

// Pure selection helpers for Forecast V2 consumers (no database / framework imports, so tests can load them directly).
export type ForecastV2Map = Map<string, ForecastV2>;

/** Decision-grade monthly units for capital / purchase / reorder engines: FULL grade only; PARTIAL / UNKNOWN / missing → 0 ("veri eksik"). */
export function v2DecisionDemand(v2: ForecastV2Map, productId: string): number {
  const f = v2.get(productId);
  return f ? decisionUnits(f) ?? 0 : 0;
}

/** Selection used by every migrated consumer; with v2 = null it returns the legacy value untouched. */
export function selectMonthlyDemand(v2: ForecastV2Map | null, productId: string, legacy: () => number): number {
  return v2 ? v2DecisionDemand(v2, productId) : legacy();
}

/** Compact, serialisable V2 view for UI rows (comparison only — consumers must use v2DecisionDemand for decisions). */
export interface ForecastV2View {
  modelVersion: string; forecastUnits: number | null; dataGrade: ForecastV2["data_grade"]; historyDays: number | null; reasonFlags: string[];
  demandEstimateUnits: number | null; manualOverrideUnits: number | null; decisionUnits: number; sourceWatermark: string | null;
}
export function forecastV2View(v2: ForecastV2Map, productId: string): ForecastV2View | null {
  const f = v2.get(productId);
  if (!f) return null;
  return { modelVersion: f.model_version, forecastUnits: f.forecast_units, dataGrade: f.data_grade, historyDays: f.history_days, reasonFlags: f.reason_flags,
    demandEstimateUnits: f.demand_estimate_units, manualOverrideUnits: f.manual_override_units, decisionUnits: decisionUnits(f) ?? 0, sourceWatermark: f.source_watermark };
}

/** Legacy vs V2 comparison (shadow report): absolute and percentage difference; thresholds documented in docs/FORECAST-V2.md. */
export function compareLegacyV2(legacy: number, v2: number | null) {
  if (v2 == null) return { absDiff: null, pctDiff: null, gt25pct: false, gt2x: false };
  const absDiff = v2 - legacy, pctDiff = legacy === 0 ? null : absDiff / legacy;
  const hi = Math.max(legacy, v2), lo = Math.min(legacy, v2);
  return { absDiff, pctDiff, gt25pct: Math.abs(absDiff) >= 1 && (legacy === 0 || Math.abs(absDiff) / legacy > 0.25), gt2x: hi - lo >= 3 && hi > 2 * lo };
}

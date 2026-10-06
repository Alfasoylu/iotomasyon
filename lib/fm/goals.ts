// Goal Engine (AI CFO V2 Step 2) — pure mapping of fm_memory_goal rows into the CFO workflow's goal observation.
// No database access here (also used by tests and the panel). Unknown stays null; nothing is inferred on this side.
export type GoalState = 'ACHIEVED' | 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK' | 'NOT_MET' | 'UNKNOWN';
export type GoalRow = {
  goal_key: string; goal_version: number; kind: string; title: string; target_value: unknown; target_currency: string; deadline: unknown;
  as_of: unknown; period_start: unknown; period_end: unknown; state: string; observed_value_try: unknown; observed_on: unknown;
  target_value_try: unknown; fx_usd_try: unknown; fx_month: unknown; progress_pct: unknown; gap_try: unknown;
  current_rate_try_per_day: unknown; required_rate_try_per_day: unknown; projected_value_try: unknown; projected_on: unknown;
  grade: string; flags: string[] | null;
};
export type GoalItem = {
  key: string; version: number; kind: string; title: string; state: GoalState; grade: string; flags: string[];
  targetValue: number | null; targetCurrency: string; targetTry: number | null; deadline: string | null;
  fxUsdTry: number | null; fxMonth: string | null; periodStart: string | null; periodEnd: string | null;
  observedTry: number | null; observedOn: string | null; progressPct: number | null; gapTry: number | null;
  currentRatePerDayTry: number | null; requiredRatePerDayTry: number | null; projectedTry: number | null; projectedOn: string | null;
};
export type GoalEngineResult =
  | { ok: true; asOf: string; refresh: 'refreshed' | 'recent' | 'failed'; rows: GoalRow[] }
  | { ok: false; stage: 'refresh' | 'evaluate' | 'read'; code: string };
export type GoalObservation = { engine: 'fm_goal_engine'; available: boolean; asOf: string | null; memoryRefresh: string | null; unavailable: string | null; items: GoalItem[] };

const STATES: GoalState[] = ['ACHIEVED', 'ON_TRACK', 'AT_RISK', 'OFF_TRACK', 'NOT_MET', 'UNKNOWN'];
const num = (v: unknown): number | null => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };
const day = (v: unknown): string | null => {
  if (v == null) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};

export function goalItem(r: GoalRow): GoalItem {
  const state = (STATES as string[]).includes(r.state) ? (r.state as GoalState) : 'UNKNOWN';
  return {
    key: r.goal_key, version: Number(r.goal_version), kind: r.kind, title: r.title, state, grade: /^[ABCDU]$/.test(r.grade) ? r.grade : 'U',
    flags: [...(r.flags ?? [])].sort(), targetValue: num(r.target_value), targetCurrency: r.target_currency, targetTry: num(r.target_value_try),
    deadline: day(r.deadline), fxUsdTry: num(r.fx_usd_try), fxMonth: day(r.fx_month), periodStart: day(r.period_start), periodEnd: day(r.period_end),
    observedTry: num(r.observed_value_try), observedOn: day(r.observed_on), progressPct: num(r.progress_pct), gapTry: num(r.gap_try),
    currentRatePerDayTry: num(r.current_rate_try_per_day), requiredRatePerDayTry: num(r.required_rate_try_per_day),
    projectedTry: num(r.projected_value_try), projectedOn: day(r.projected_on),
  };
}

// Deterministic (no evaluation timestamp) so an unchanged cycle keeps the same workflow fingerprint.
export function goalObservation(result: GoalEngineResult | null | undefined): GoalObservation {
  if (!result) return { engine: 'fm_goal_engine', available: false, asOf: null, memoryRefresh: null, unavailable: 'not_run', items: [] };
  if (!result.ok) return { engine: 'fm_goal_engine', available: false, asOf: null, memoryRefresh: null, unavailable: `${result.stage}:${result.code}`, items: [] };
  const items = result.rows.map(goalItem).sort((a, b) => a.key.localeCompare(b.key));
  return { engine: 'fm_goal_engine', available: true, asOf: result.asOf, memoryRefresh: result.refresh, unavailable: null, items };
}

export const GOAL_STATE_LABEL: Record<GoalState, string> = {
  ACHIEVED: 'Ulaşıldı', ON_TRACK: 'Yolunda', AT_RISK: 'Risk altında', OFF_TRACK: 'Hedefin gerisinde', NOT_MET: 'Henüz sağlanmadı', UNKNOWN: 'Bilinmiyor',
};

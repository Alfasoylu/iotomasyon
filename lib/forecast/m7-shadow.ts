import { createHash } from "node:crypto";
import { addDays, sumWindow } from "./models";
import { CATASTROPHIC, cutoffSchedule, futureUnits, HORIZON_DAYS, universe, units, velocity, type BacktestData } from "./backtest";
import { BASE, dates } from "./backtest-sql";
import { calibrationCells, type CalibrationCell } from "./candidates";

// M7 A-shrink — SHADOW-ONLY experimental model (PR2). Never read by production consumers (lib/forecast/v2.ts does not import this file).
// Designed AFTER the 2026-10-06 candidate results, so data before the discovery cutoff can NOT serve as its validation: only cutoffs on or
// after M7_DISCOVERY_CUTOFF, whose 30-day target has fully elapsed, are scored (forward telemetry). Never promoted automatically.
export const M7_SHADOW_VERSION = "shadow-m7-a-shrink-v1";
export const M7_DISCOVERY_CUTOFF = "2026-10-06";
export const M7 = {
  segment: "A_ge30_per_month",
  /** Calibration grid (same as the long backtest): every 14 days from this anchor; a cell is usable at c only if cell + 30 ≤ c. */
  gridFrom: "2024-10-08", gridStepDays: 14, forwardStepDays: 7,
  minObs: 300, minCutoffs: 4, min: 0.6, max: 1.0, // shrink only; no global fallback (k = 1 when A has too few cells)
} as const;
/** Pre-registered FUTURE promotion gate (documentation + report status only; promotion needs a separate PR and explicit approval). */
export const M7_PROMOTION_GATE = { minForwardCutoffs: 12, minObservations: 150, wapeImprovementPp: 3 } as const;

export function m7Factor(cells: CalibrationCell[], asOf: string): number {
  const xs = cells.filter(c => c.segment === M7.segment && addDays(c.cutoff, HORIZON_DAYS) <= asOf);
  const n = xs.reduce((s, c) => s + c.n, 0), sa = xs.reduce((s, c) => s + c.sumActual, 0), sf = xs.reduce((s, c) => s + c.sumM0, 0);
  const cuts = new Set(xs.filter(c => c.n > 0).map(c => c.cutoff)).size;
  return n >= M7.minObs && cuts >= M7.minCutoffs && sf > 0 ? Math.min(M7.max, Math.max(M7.min, sa / sf)) : 1;
}

/** Forward cutoffs scored as of `asOf` (data < asOf): weekly from the discovery cutoff, target complete. Refuses pre-discovery cutoffs. */
export function m7ForwardCutoffs(asOf: string, discoveryCutoff: string = M7_DISCOVERY_CUTOFF, opts: { allowPreDiscoveryForTests?: boolean } = {}): string[] {
  if (discoveryCutoff < M7_DISCOVERY_CUTOFF && !opts.allowPreDiscoveryForTests) throw new Error("m7_pre_discovery_cutoff");
  return cutoffSchedule(discoveryCutoff, addDays(asOf, -1), M7.forwardStepDays);
}
export const m7GridCutoffs = (asOf: string) => cutoffSchedule(M7.gridFrom, addDays(asOf, -1), M7.gridStepDays);

export interface M7Row { model: "M0_true30" | "M7_a_shrink"; scope: string; n: number; sumActual: number; sumForecast: number; wape: number | null; bias: number | null;
  catOverRate: number | null; excessUnits: number; factor: number | null }
export interface M7Report { version: string; discoveryCutoff: string; asOf: string; forwardCutoffs: string[]; rows: M7Row[]; status: "INSUFFICIENT_FORWARD_SAMPLE" | "GATE_PASSED_REQUIRES_SEPARATE_APPROVAL" | "GATE_FAILED" }

function row(model: M7Row["model"], scope: string, obs: { f: number; a: number }[], factor: number | null): M7Row {
  const sa = obs.reduce((s, o) => s + o.a, 0), sf = obs.reduce((s, o) => s + o.f, 0), sae = obs.reduce((s, o) => s + Math.abs(o.f - o.a), 0);
  return { model, scope, n: obs.length, sumActual: sa, sumForecast: sf, wape: sa === 0 ? null : sae / sa, bias: sa === 0 ? null : (sf - sa) / sa,
    catOverRate: obs.length === 0 ? null : obs.filter(o => o.f > CATASTROPHIC.ratio * o.a && o.f - o.a >= CATASTROPHIC.minUnits).length / obs.length,
    excessUnits: obs.reduce((s, o) => s + Math.max(0, o.f - o.a), 0), factor };
}

/** Reference forward telemetry (A segment, mapped core products with ≥30 days history, economic time). */
export function m7ForwardReport(data: BacktestData, asOf: string, discoveryCutoff: string = M7_DISCOVERY_CUTOFF, opts: { allowPreDiscoveryForTests?: boolean } = {}): M7Report {
  const cuts = m7ForwardCutoffs(asOf, discoveryCutoff, opts), cells = calibrationCells(data, m7GridCutoffs(asOf), "economic_time");
  const pooled: Record<M7Row["model"], { f: number; a: number }[]> = { M0_true30: [], M7_a_shrink: [] }, rows: M7Row[] = [];
  for (const c of cuts) {
    const k = m7Factor(cells, c), per: typeof pooled = { M0_true30: [], M7_a_shrink: [] };
    for (const u of universe(data, c, "economic_time")) {
      if (u.productId == null || u.legacy || velocity(u.u90) !== M7.segment) continue;
      const tr = units(u.rows), first = tr.filter(r => r.units > 0).reduce((m, r) => r.day < m ? r.day : m, "9999-12-31");
      if (first > addDays(c, -30)) continue; // FULL grade only (history ≥ 30 days)
      const u30 = sumWindow(tr, addDays(c, -30), c), a = futureUnits(data, u.key, c, addDays(c, HORIZON_DAYS), "economic_time");
      per.M0_true30.push({ f: u30, a }); per.M7_a_shrink.push({ f: k * u30, a });
    }
    rows.push(row("M0_true30", c, per.M0_true30, null), row("M7_a_shrink", c, per.M7_a_shrink, k));
    pooled.M0_true30.push(...per.M0_true30); pooled.M7_a_shrink.push(...per.M7_a_shrink);
  }
  const p0 = row("M0_true30", "pooled", pooled.M0_true30, null), p7 = row("M7_a_shrink", "pooled", pooled.M7_a_shrink, null);
  rows.push(p0, p7);
  return { version: M7_SHADOW_VERSION, discoveryCutoff, asOf, forwardCutoffs: cuts, rows, status: m7Status(cuts.length, p0, p7) };
}

export function m7Status(forwardCutoffs: number, p0: M7Row, p7: M7Row): M7Report["status"] {
  if (forwardCutoffs < M7_PROMOTION_GATE.minForwardCutoffs || p0.n < M7_PROMOTION_GATE.minObservations || p0.wape == null || p7.wape == null) return "INSUFFICIENT_FORWARD_SAMPLE";
  const ok = p7.wape <= p0.wape - M7_PROMOTION_GATE.wapeImprovementPp / 100 && Math.abs(p7.bias!) <= Math.abs(p0.bias!) && p7.catOverRate! <= p0.catOverRate!
    && p7.excessUnits <= p0.excessUnits;
  return ok ? "GATE_PASSED_REQUIRES_SEPARATE_APPROVAL" : "GATE_FAILED";
}

/** SQL port of m7ForwardReport (read-only; same prelude as backtest-sql). Rows: per forward cutoff and pooled, both models. */
export function m7ForwardSql(asOf: string, discoveryCutoff: string = M7_DISCOVERY_CUTOFF, opts: { allowPreDiscoveryForTests?: boolean } = {}): string {
  const cuts = dates(m7ForwardCutoffs(asOf, discoveryCutoff, opts)), grid = dates(m7GridCutoffs(asOf));
  const obsMetrics = (scope: string) => `count(*)::int as "n", coalesce(sum(a), 0) as "sumActual", coalesce(sum(f), 0) as "sumForecast",
  sum(abs(f - a)) / nullif(sum(a), 0) as "wape", (sum(f) - sum(a)) / nullif(sum(a), 0) as "bias",
  avg((f > ${CATASTROPHIC.ratio} * a and f - a >= ${CATASTROPHIC.minUnits})::int) as "catOverRate", coalesce(sum(greatest(f - a, 0)), 0) as "excessUnits", ${scope}`;
  return `with ${BASE(cuts)},
gcuts as (select unnest(${grid}) as c),
gwin as (select g.c, kd.k, coalesce(sum(kd.u) filter (where kd.d >= g.c - 30), 0) as u30, coalesce(sum(kd.u) filter (where kd.d >= g.c - 90), 0) as u90
  from gcuts g join kd on kd.d >= g.c - 365 and kd.d < g.c group by 1, 2 having sum(kd.u) > 0),
gact as (select w.c, w.k, coalesce(sum(kd.u), 0) as a from gwin w left join kd on kd.k = w.k and kd.d >= w.c and kd.d < w.c + ${HORIZON_DAYS} group by 1, 2),
cell as (select w.c, count(*) as n, sum(a.a) as sa, sum(w.u30) as sf from gwin w join gact a using (c, k) where w.u90 / 3.0 >= 30 group by 1),
fac as (select t.c, case when coalesce(sum(cl.n), 0) >= ${M7.minObs} and count(distinct cl.c) filter (where cl.n > 0) >= ${M7.minCutoffs} and coalesce(sum(cl.sf), 0) > 0
    then greatest(${M7.min}::float8, least(${M7.max}::float8, sum(cl.sa)::float8 / sum(cl.sf)::float8)) else 1::float8 end as k
  from cuts t left join cell cl on cl.c + ${HORIZON_DAYS} <= t.c group by 1),
o as (select u.c, fa.k, u.u30::float8 as m0, fa.k * u.u30::float8 as m7, a.a::float8 as a from uni u join first_sale f using (k) join act a using (c, k) join fac fa on fa.c = u.c
  where u.pid is not null and not u.leg and u.vel = '${M7.segment}' and f.fd <= u.c - 30),
x as (select o.c, o.k, m.model, m.f, o.a from o cross join lateral (values ('M0_true30', o.m0), ('M7_a_shrink', o.m7)) m(model, f))
select model as "model", to_char(c, 'YYYY-MM-DD') as "scope", ${obsMetrics(`case when model = 'M7_a_shrink' then max(k) end as "factor"`)} from x group by model, c
union all select model, 'pooled', ${obsMetrics(`null::float8`)} from x group by model
order by 2, 1`;
}
export const m7ForwardSqlHash = (asOf: string) => createHash("sha256").update(m7ForwardSql(asOf)).digest("hex");

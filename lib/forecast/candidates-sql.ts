import { createHash } from "node:crypto";
import { HORIZON_DAYS, TRENDYOL_API_FROM } from "./backtest";
import { BASE, dates, METRICS } from "./backtest-sql";
import { CALIBRATION, COLD_START, DAMPED, EWMA, PARTIAL_HISTORY_MODEL, SEASONAL } from "./candidates";
import { MIN_IN_STOCK_DAYS } from "./models";

// SQL port of lib/forecast/candidates.ts (economic_time) for the read-only production run; parity-tested on PGlite
// (__tests__/forecast-candidates.test.ts). Same session prelude as backtest-sql.ts (read-only transaction, no nested loops).
const VEL = (u90: string) => `case when ${u90} / 3.0 >= 30 then 'A_ge30_per_month' when ${u90} / 3.0 >= 5 then 'B_5_30_per_month' else 'C_lt5_per_month' end`;
const SAFETY = (f: string, a: string) => `sum(greatest(${f} - ${a}, 0)) as "excessUnits", sum(greatest(${f} - ${a}, 0)) / nullif(sum(${a}), 0) as "excessRatio"`;
const CLAMP = (x: string, lo: number, hi: number) => `greatest(${lo}::float8, least(${hi}::float8, ${x}))`;

/** Walk-forward calibration: cells on the long grid; factor at t uses only cells with cutoff + 30 ≤ t (segment → global → 1). */
const CALIBRATION_SQL = (grid: string) => `gcuts as (select unnest(${grid}) as c),
gwin as (select g.c, kd.k, coalesce(sum(kd.u) filter (where kd.d >= g.c - 30), 0) as u30, coalesce(sum(kd.u) filter (where kd.d >= g.c - 90), 0) as u90
  from gcuts g join kd on kd.d >= g.c - 365 and kd.d < g.c group by 1, 2 having sum(kd.u) > 0),
gact as (select w.c, w.k, coalesce(sum(kd.u), 0) as a from gwin w left join kd on kd.k = w.k and kd.d >= w.c and kd.d < w.c + ${HORIZON_DAYS} group by 1, 2),
cal_cell as (select w.c, ${VEL("w.u90")} as seg, count(*) as n, sum(a.a) as sa, sum(w.u30) as sf from gwin w join gact a using (c, k) group by 1, 2),
segs as (select unnest(array['A_ge30_per_month', 'B_5_30_per_month', 'C_lt5_per_month']) as seg),
calp as (select t.c, s.seg, sum(cc.n) filter (where cc.seg = s.seg) as sn, sum(cc.sa) filter (where cc.seg = s.seg) as ssa,
    sum(cc.sf) filter (where cc.seg = s.seg) as ssf, count(distinct cc.c) filter (where cc.seg = s.seg and cc.n > 0) as scut,
    sum(cc.n) as gn, sum(cc.sa) as gsa, sum(cc.sf) as gsf, count(distinct cc.c) filter (where cc.n > 0) as gcut
  from cuts t cross join segs s left join cal_cell cc on cc.c + ${HORIZON_DAYS} <= t.c group by 1, 2),
calk as (select c, seg, case
    when coalesce(sn, 0) >= ${CALIBRATION.minObs} and coalesce(scut, 0) >= ${CALIBRATION.minCutoffs} and coalesce(ssf, 0) > 0 then ${CLAMP("ssa::float8 / ssf::float8", CALIBRATION.min, CALIBRATION.max)}
    when coalesce(gn, 0) >= ${CALIBRATION.minObs} and coalesce(gcut, 0) >= ${CALIBRATION.minCutoffs} and coalesce(gsf, 0) > 0 then ${CLAMP("gsa::float8 / gsf::float8", CALIBRATION.min, CALIBRATION.max)}
    else 1.0::float8 end as k from calp)`;

/** Candidate features per (cutoff, key): first sale, EWMA numerator/denominator, last-year windows, calibration factor. */
const FEATURES = `feat as (
  select u.c, u.k, u.pid, u.leg, u.vel, u.wt, u.rn, u.life, u.u30::float8 as u30, u.u90::float8 / 3 as m1, (u.c - f.fd) as hist,
    greatest(u.c - ${EWMA.windowDays}, f.fd) as ew_start, ck.k as calk
  from uni u join first_sale f using (k) join calk ck on ck.c = u.c and ck.seg = u.vel),
ew as (select fe.c, fe.k, coalesce(sum(power(2::float8, -((fe.c - kd.d - 1)::float8) / ${EWMA.halfLifeDays}) * kd.u::float8), 0) as num
  from feat fe left join kd on kd.k = fe.k and kd.d >= fe.ew_start and kd.d < fe.c group by 1, 2),
ly as (select fe.c, fe.k, coalesce(sum(kd.u) filter (where kd.d < fe.c - 365), 0)::float8 as base, coalesce(sum(kd.u) filter (where kd.d >= fe.c - 365), 0)::float8 as ly
  from feat fe left join kd on kd.k = fe.k and kd.d >= fe.c - 455 and kd.d < fe.c - 335 group by 1, 2),
fc as (select fe.*, a.a::float8 as a,
    fe.u30 as m0,
    0.5 * fe.u30 + 0.5 * fe.m1 as m2,
    case when (fe.c - fe.ew_start) > 0 then 30 * e.num / ((1 - power(power(2::float8, -1::float8 / ${EWMA.halfLifeDays}), (fe.c - fe.ew_start)::float8))
      / (1 - power(2::float8, -1::float8 / ${EWMA.halfLifeDays}))) else 0::float8 end as m3,
    case when fe.m1 = 0 then 0::float8 else fe.m1 * (1 + ${DAMPED.weight} * ${CLAMP("(fe.u30 - fe.m1) / fe.m1", -DAMPED.clamp, DAMPED.clamp)}) end as m4,
    fe.calk * fe.u30 as m5,
    fe.m1 * case when fe.hist >= ${SEASONAL.minHistoryDays} and l.base >= ${SEASONAL.minBaseUnits} then ${CLAMP("l.ly / (l.base / 3)", SEASONAL.min, SEASONAL.max)} else 1::float8 end as m6,
    case when fe.hist >= ${COLD_START.unknownBelowDays} and fe.hist < ${COLD_START.partialBelowDays} then fe.u30 / fe.hist * 30 end as p
  from feat fe join act a using (c, k) join ew e using (c, k) join ly l using (c, k))`;
const MODELS = `('M0_true30', fc.m0), ('M1_true90', fc.m1), ('M2_weighted_30_90', fc.m2), ('M3_ewma_hl30', fc.m3), ('M4_damped_trend', fc.m4),
    ('M5_calibrated_true30', fc.m5), ('M6_seasonal_true90', fc.m6)`;

export interface CandidateSqlParams { longCutoffs: string[]; shortCutoffs: string[] }
export function candidateSql(p: CandidateSqlParams): Record<"candLong" | "candShort", string> {
  const long = dates(p.longCutoffs), short = dates(p.shortCutoffs);
  return {
    candLong: `with ${BASE(long)}, ${CALIBRATION_SQL(long)}, ${FEATURES},
obs as (select fc.*, x.model, x.f from fc cross join lateral (values ${MODELS}, ('${PARTIAL_HISTORY_MODEL}', fc.p)) x(model, f) where x.f is not null),
seg as (select o.*, s.dim, s.seg from obs o cross join lateral (values ('all', 'all'), ('velocity', o.vel), ('lifecycle', o.life),
    ('business_line', case when o.leg then 'legacy' else 'core' end), ('top50_revenue', case when o.rn <= 50 then 'top50' else 'rest' end),
    ('history_coverage', case when o.hist < ${COLD_START.unknownBelowDays} then 'lt7' when o.hist < ${COLD_START.partialBelowDays} then '7_29' else 'ge30' end),
    ('source_era', case when o.c < date '${TRENDYOL_API_FROM}' then 'before_trendyol_api' when o.c >= date '${TRENDYOL_API_FROM}' + ${HORIZON_DAYS}
      then 'trendyol_api_full_window' else 'transition' end)) s(dim, seg))
select 'cand_long' as "section", model as "model", 'observed' as "target", dim as "dim", seg as "segment", ${METRICS("f", "a", "wt")}, ${SAFETY("f", "a")}
from seg group by model, dim, seg order by 2, 4, 5`,

    candShort: `with ${BASE(short)}, ${CALIBRATION_SQL(long)}, ${FEATURES},
st as (select product_id as pid, economic_date as d, units_open, units_eod from public.fm_stock_sku_day),
days as (select generate_series(least((select min(d) from st), (select min(c) from cuts) - 30), (select max(c) from cuts) + ${HORIZON_DAYS - 1}, interval '1 day')::date as d),
grid as (select g.pid, dd.d, s.units_open, s.units_eod, count(s.d) over (partition by g.pid order by dd.d) as grp
  from (select distinct pid from st) g cross join days dd left join st s on s.pid = g.pid and s.d = dd.d),
sod as (select pid, d, case when units_open is not null then units_open else max(units_eod) over (partition by pid, grp) end as stock,
    max(units_eod) over (partition by pid, grp) as carry_eod from grid),
sw as (select fc.* from fc where fc.pid is not null and not fc.leg),
sday as (select sw.c, sw.k, s.d, s.stock, coalesce(kd.u, 0) as u from sw join sod s on s.pid = sw.pid and s.d >= sw.c - 30 and s.d < sw.c + ${HORIZON_DAYS}
  left join kd on kd.k = sw.k and kd.d = s.d),
agg as (select c, k, count(*) filter (where d < c) as days_logged, count(*) filter (where d < c and stock is null) as unk,
    count(*) filter (where d < c and stock > 0) as ins, count(*) filter (where d < c and stock <= 0) as outd, coalesce(sum(u) filter (where d < c and stock > 0), 0) as uin,
    count(*) filter (where d >= c and stock is null) as tunk, count(*) filter (where d >= c and stock > 0) as tins, coalesce(sum(u) filter (where d >= c and stock > 0), 0) as tuin
  from sday group by 1, 2),
cov as (select sw.*, g.outd, s0.carry_eod::float8 as stock_c,
    case when g.ins >= ${MIN_IN_STOCK_DAYS} then g.uin::float8 / g.ins * 30 end as est,
    case when g.tunk = 0 and g.tins >= ${MIN_IN_STOCK_DAYS} then g.tuin::float8 / g.tins * 30 end as target2
  from sw join agg g using (c, k) join sod s0 on s0.pid = sw.pid and s0.d = sw.c - 1 where g.days_logged = 30 and g.unk = 0),
obs as (select v.*, x.model, x.f from cov v cross join lateral (values ${MODELS.replaceAll("fc.", "v.")}, ('stock_adjusted_demand_estimate_30', v.est)) x(model, f)
  where x.f is not null),
tgt as (select o.*, t.target, t.av from obs o cross join lateral (values ('observed', o.a), ('availability_normalized', o.target2)) t(target, av) where t.av is not null),
seg as (select o.*, s.dim, s.seg from tgt o cross join lateral (values ('all', 'all'),
    ('stock_state', case when o.outd > 0 then 'constrained_pre_cutoff' else 'unconstrained_pre_cutoff' end), ('velocity', o.vel)) s(dim, seg))
select 'cand_short' as "section", model as "model", target as "target", dim as "dim", seg as "segment", ${METRICS("f", "av", "wt")}, ${SAFETY("f", "av")},
  sum(greatest(0, f - stock_c)) as "orderUnits", sum(greatest(0, av - stock_c)) as "idealOrderUnits",
  sum(greatest(0, greatest(0, f - stock_c) - greatest(0, av - stock_c))) as "overOrderUnits"
from seg group by model, target, dim, seg order by 2, 3, 4, 5`,
  };
}
export const candidateSqlHash = (p: CandidateSqlParams) => createHash("sha256").update(JSON.stringify(candidateSql(p))).digest("hex");

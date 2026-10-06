import { createHash } from "node:crypto";
import { BACKTEST_VERSION, CATASTROPHIC, HORIZON_DAYS, TRENDYOL_API_FROM } from "./backtest";
import { MIN_IN_STOCK_DAYS } from "./models";

// SQL port of lib/forecast/backtest.ts (economic_time mode) for the production run. READ-ONLY: SELECT statements over
// fm_sales_canonical_snapshot, the legacy sales tables, fm_stock_sku_day and Product; no temp tables, no writes. Parity with the
// TypeScript reference is proven on PGlite (__tests__/forecast-backtest-sql.test.ts). Parameters are rendered as validated literals
// so the exact same text can be run by scripts/forecast-backtest.ts or pasted into a read-only SQL session; its sha256 is reported.
/** Session prelude for every section: read-only transaction; nested loops disabled because CTE joins (no statistics) otherwise plan as
 *  24k×24k nested loops. Planner setting only — results are identical, only the plan changes. */
export const BACKTEST_SESSION_PRELUDE = ["begin read only", "set local enable_nestloop = off"] as const;
export interface SqlParams { longCutoffs: string[]; shortCutoffs: string[]; todayCutoff: string }
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const dates = (xs: string[]) => {
  for (const x of xs) if (!DAY.test(x)) throw new Error("invalid_cutoff");
  return `array[${xs.map(x => `'${x}'`).join(",") || "null"}]::date[]`;
};

const KEY = `case when s.product_id is not null then 'P:' || s.product_id when s.sku_raw is not null then 'R:' || public.cfo_norm(s.sku_raw) else 'R:(none)' end`;
// Production filter: the app's ILIKE '%iptal%'/'%iade%'/'%cancel%'. Its outcome on 'İ' depends on the DB locale: production (en_US.UTF-8)
// lowercases 'İ' to 'i̇' (i + U+0307) so 'İade-İptal' is KEPT as a sale; a C.UTF-8 database folds it to 'i'. The emulation below fixes the
// production behaviour independently of the locale; the meta section verifies it equals the real ILIKE row-for-row on the production DB.
const PROD_ILIKE = `(status is null or (status not ilike '%iptal%' and status not ilike '%iade%' and status not ilike '%cancel%'))`;
const PROD_KEPT = `(status is null or (lower(replace(status, 'İ', 'i' || chr(775))) not like '%iptal%' and lower(replace(status, 'İ', 'i' || chr(775))) not like '%iade%'
  and lower(replace(status, 'İ', 'i' || chr(775))) not like '%cancel%'))`;
const CORRECT_KEPT = `(status is null or (lower(replace(status, 'İ', 'i')) not like '%iptal%' and lower(replace(status, 'İ', 'i')) not like '%iade%' and lower(replace(status, 'İ', 'i')) not like '%cancel%'))`;
const METRICS = (f: string, a: string, w: string) => `count(*)::int as "n", sum(${a}) as "sumActual", sum(${f}) as "sumForecast", sum(abs(${f} - ${a})) as "sumAbsError",
  sum(abs(${f} - ${a})) / count(*) as "mae", sum(abs(${f} - ${a})) / nullif(sum(${a}), 0) as "wape", (sum(${f}) - sum(${a})) / nullif(sum(${a}), 0) as "bias",
  avg((${f} > ${a})::int) as "overRate", avg((${f} < ${a})::int) as "underRate",
  avg((${f} > ${CATASTROPHIC.ratio} * ${a} and ${f} - ${a} >= ${CATASTROPHIC.minUnits})::int) as "catOverRate",
  sum(abs(${f} - ${a}) * ${w}) filter (where ${w} is not null) / nullif(sum(${a} * ${w}) filter (where ${w} is not null), 0) as "revWape",
  sum((${f} - ${a}) * ${w}) filter (where ${w} is not null) / nullif(sum(${a} * ${w}) filter (where ${w} is not null), 0) as "revBias",
  count(${w})::int as "revN"`;

/** Canonical daily sales (COUNTED), key per Financial Memory (P:product / R:normalised raw sku), universe with pre-cutoff segments. */
const BASE = (cuts: string) => `cuts as (select unnest(${cuts}) as c),
sales as (
  select ${KEY} as k, s.product_id as pid, s.channel as ch, s.economic_date as d, sum(s.units_counted)::numeric as u,
    sum(s.revenue_incl_vat_try)::numeric as r, bool_or(s.legacy_business is not null) as leg
  from public.fm_sales_canonical_snapshot s where s.disposition = 'COUNTED' group by 1, 2, 3, 4),
kd as (select k, max(pid) as pid, d, sum(u) as u, sum(r) as r, bool_or(leg) as leg from sales group by k, d),
first_sale as (select k, min(d) as fd from kd where u > 0 group by k),
win as (
  select c.c, kd.k, max(kd.pid) as pid, coalesce(sum(kd.u) filter (where kd.d >= c.c - 30), 0) as u30,
    coalesce(sum(kd.u) filter (where kd.d >= c.c - 90), 0) as u90, sum(kd.u) as u365, coalesce(sum(kd.r) filter (where kd.d >= c.c - 90), 0) as r90,
    sum(kd.r) as r365, bool_or(kd.leg) as leg
  from cuts c join kd on kd.d >= c.c - 365 and kd.d < c.c group by 1, 2 having sum(kd.u) > 0),
uni as (
  select w.*, row_number() over (partition by w.c order by w.r90 desc, w.k collate "C") as rn, count(*) over (partition by w.c) as cnt,
    case when w.u90 / 3.0 >= 30 then 'A_ge30_per_month' when w.u90 / 3.0 >= 5 then 'B_5_30_per_month' else 'C_lt5_per_month' end as vel,
    case when w.u90 > 0 then w.r90 / w.u90 when w.u365 > 0 then w.r365 / w.u365 end as wt,
    case when f.fd >= w.c - 90 then 'new_lt90d' else 'mature' end as life
  from win w join first_sale f using (k)),
act as (select u.c, u.k, coalesce(sum(kd.u), 0) as a from uni u left join kd on kd.k = u.k and kd.d >= u.c and kd.d < u.c + ${HORIZON_DAYS} group by 1, 2)`;

/** forecastMonthlySales() in SQL over a buckets relation (c, k, m, u): 15th-of-month windows, blend, seasonal clamp. Computed in float8 in
 *  the same operation order as the JS so values are bit-identical; the caller applies floor(greatest(b30, blend × seas) + 0.5), which is
 *  Math.round for positive values (PostgreSQL round(float8) rounds half to even and would differ on exact .5). */
const FMS = (name: string, buckets: string) => `${name}_agg as (
  select c, k, coalesce(sum(u) filter (where u > 0 and m + 14 >= c - 30), 0) as b30, coalesce(sum(u) filter (where u > 0 and m + 14 >= c - 90), 0) as b90,
    coalesce(sum(u) filter (where u > 0 and m + 14 >= c - 365), 0) as b365, coalesce(sum(u) filter (where u > 0), 0) as life, min(m) filter (where u > 0) as fm,
    count(*) as n_all, count(*) filter (where extract(month from m) = extract(month from c)) as n_cur,
    sum(u) filter (where extract(month from m) = extract(month from c)) as s_cur, sum(u) as s_all
  from ${buckets} group by 1, 2),
${name} as (
  select c, k, b30::float8 as b30, (b90::float8 / 3) * 0.5 + (b365::float8 / 12) * 0.3 + (case when fm is null then 0 else life::float8 / greatest(1,
      (extract(year from c) - extract(year from fm)) * 12 + extract(month from c) - extract(month from fm) + 1)::float8 end) * 0.2 as blend,
    case when n_all < 12 or n_cur = 0 then 1.0::float8 when s_all::float8 / n_all <= 0 then 1.0::float8
      else greatest(0.5::float8, least(2.0::float8, (s_cur::float8 / n_cur) / (s_all::float8 / n_all))) end as seas
  from ${name}_agg)`;

const UNION = `ur as (
  select "productId" as pid, "orderDate"::date as d, quantity::numeric as u, status from (
    select "productId", "orderDate", quantity, status from public."MarketplaceSalesRecord" where "productId" is not null
    union all select "productId", "orderDate", quantity, status from public."TrendyolSalesRecord" where "productId" is not null
    union all select "productId", "orderDate", quantity, status from public."HepsiburadaSalesRecord" where "productId" is not null) x),
ud as (select pid, d, coalesce(sum(u) filter (where ${CORRECT_KEPT}), 0) as uc, coalesce(sum(u) filter (where ${PROD_KEPT}), 0) as up,
  bool_or(${PROD_KEPT}) as has_p from ur group by 1, 2),
um as (select pid, date_trunc('month', d)::date as m, sum(up) as u from ud where has_p group by 1, 2)`;
const UNION_LAYERS = (uni: string) => `ubk as (
  select w.c, w.k, um.m, um.u from ${uni} w join um on um.pid = w.pid and um.m < date_trunc('month', w.c)
  union all select w.c, w.k, date_trunc('month', w.c)::date, sum(ud.up) from ${uni} w join ud on ud.pid = w.pid and ud.has_p
    and ud.d >= date_trunc('month', w.c) and ud.d < w.c group by 1, 2, 3),
${FMS("ufx", "ubk")},
uwin as (select w.c, w.k, coalesce(sum(ud.uc), 0) as l1, coalesce(sum(ud.up), 0) as l2 from ${uni} w
  left join ud on ud.pid = w.pid and ud.d >= w.c - 30 and ud.d < w.c group by 1, 2),
layers as (select w.*, uw.l1, uw.l2, coalesce(f.b30, 0) as l3, coalesce(floor(greatest(f.b30, f.blend * f.seas) + 0.5), 0) as l4
  from ${uni} w join uwin uw using (c, k) left join ufx f using (c, k))`;

export function backtestSql(p: SqlParams): Record<"long" | "waterfall" | "short" | "today" | "meta", string> {
  const long = dates(p.longCutoffs), short = dates(p.shortCutoffs), today = dates([p.todayCutoff]);
  return {
    long: `with ${BASE(long)},
km as (select k, date_trunc('month', d)::date as m, sum(u) as u from kd group by 1, 2),
bk as (select u.c, u.k, km.m, km.u from uni u join km on km.k = u.k and km.m < date_trunc('month', u.c)
  union all select u.c, u.k, date_trunc('month', u.c)::date, sum(kd.u) from uni u join kd on kd.k = u.k and kd.d >= date_trunc('month', u.c) and kd.d < u.c group by 1, 2, 3),
${FMS("fx", "bk")},
chn as (select distinct on (c.c, s.k) c.c, s.k, s.ch from cuts c join sales s on s.d >= c.c - 90 and s.d < c.c
  group by c.c, s.k, s.ch order by c.c, s.k, sum(s.u) desc, s.ch collate "C"),
obs as (select u.*, a.a, x.model, x.f from uni u join act a using (c, k) join fx using (c, k)
  cross join lateral (values ('observed_sales_forecast_legacy_fms', floor(greatest(fx.b30, fx.blend * fx.seas) + 0.5)), ('observed_sales_forecast_true30', u.u30::float8),
    ('observed_sales_forecast_true90', u.u90::float8 / 3), ('observed_sales_forecast_blend_seasonal_no_max', fx.blend * fx.seas)) x(model, f)),
seg as (select o.*, s.dim, s.seg from obs o left join chn using (c, k) cross join lateral (values ('all', 'all'), ('velocity', o.vel),
    ('business_line', case when o.leg then 'legacy' else 'core' end), ('lifecycle', o.life), ('channel', coalesce(chn.ch, 'NONE')),
    ('revenue_tier', case when o.rn <= ceil(o.cnt / 5.0) then 'high_top20pct' when o.rn <= ceil(o.cnt / 2.0) then 'medium_next30pct' else 'low_rest' end),
    ('top50_revenue', case when o.rn <= 50 then 'top50' else 'rest' end), ('volume_filter', case when o.vel <> 'C_lt5_per_month' then 'excl_C_lt5' end)) s(dim, seg)
  where s.seg is not null)
select 'long' as "section", model as "model", 'observed' as "target", dim as "dim", seg as "segment", ${METRICS("f", "a", "wt")}
from seg group by model, dim, seg order by 2, 4, 5`,

    waterfall: `with ${BASE(long)}, ${UNION},
wuni as (select * from uni where pid is not null and not leg),
${UNION_LAYERS("wuni")},
obs as (select l.*, a.a, x.model, x.f from layers l join act a using (c, k) cross join lateral (values ('L0_canonical_true30', l.u30),
    ('L1_union_dedupe_gap', l.l1), ('L2_union_status_filter_leak', l.l2), ('L3_month_bucket_window', l.l3), ('L4_max_blend_seasonal', l.l4)) x(model, f)),
seg as (select o.*, s.dim, s.seg from obs o cross join lateral (values ('all', 'all'), ('velocity', o.vel), ('source_era', case when o.c < date '${TRENDYOL_API_FROM}'
    then 'before_trendyol_api' when o.c >= date '${TRENDYOL_API_FROM}' + ${HORIZON_DAYS} then 'trendyol_api_full_window' else 'transition' end)) s(dim, seg))
select 'waterfall' as "section", model as "model", 'observed' as "target", dim as "dim", seg as "segment", ${METRICS("f", "a", "wt")}
from seg group by model, dim, seg order by 2, 4, 5`,

    short: `with ${BASE(short)},
suni as (select * from uni where pid is not null and not leg),
st as (select product_id as pid, economic_date as d, units_open, units_eod from public.fm_stock_sku_day),
days as (select generate_series(least((select min(d) from st), (select min(c) from cuts) - 30), (select max(c) from cuts) + ${HORIZON_DAYS - 1}, interval '1 day')::date as d),
grid as (select g.pid, dd.d, s.units_open, s.units_eod, count(s.d) over (partition by g.pid order by dd.d) as grp
  from (select distinct pid from st) g cross join days dd left join st s on s.pid = g.pid and s.d = dd.d),
-- start-of-day stock: units_open on a logged day, else the last logged end-of-day (forward fill); null before the first log
sod as (select pid, d, case when units_open is not null then units_open else max(units_eod) over (partition by pid, grp) end as stock from grid),
sw as (select w.c, w.k, w.pid, w.u30, w.vel, w.wt, a.a from suni w join act a using (c, k)),
sday as (select sw.c, sw.k, s.d, s.stock, coalesce(kd.u, 0) as u from sw join sod s on s.pid = sw.pid and s.d >= sw.c - 30 and s.d < sw.c + ${HORIZON_DAYS}
  left join kd on kd.k = sw.k and kd.d = s.d),
agg as (select c, k, count(*) filter (where d < c) as days_logged, count(*) filter (where d < c and stock is null) as unk,
    count(*) filter (where d < c and stock > 0) as ins, count(*) filter (where d < c and stock <= 0) as outd, coalesce(sum(u) filter (where d < c and stock > 0), 0) as uin,
    count(*) filter (where d >= c and stock is null) as tunk, count(*) filter (where d >= c and stock > 0) as tins, coalesce(sum(u) filter (where d >= c and stock > 0), 0) as tuin
  from sday group by 1, 2),
win2 as (select sw.*, coalesce(g.days_logged, 0) as days_logged, coalesce(g.unk, 0) as unk, g.ins, g.outd, g.uin, g.tunk, g.tins, g.tuin
  from sw left join agg g using (c, k)),
cov as (select *, days_logged = 30 and unk = 0 as covered,
    case when days_logged = 30 and unk = 0 and ins >= ${MIN_IN_STOCK_DAYS} then uin::float8 / ins * 30 end as est,
    case when tunk = 0 and tins >= ${MIN_IN_STOCK_DAYS} then tuin::float8 / tins * 30 end as target2 from win2),
obs as (select v.*, x.model, x.f from cov v cross join lateral (values ('observed_sales_forecast_true30', v.u30::float8),
    ('stock_adjusted_demand_estimate_30', v.est)) x(model, f) where v.covered and v.est is not null),
tgt as (select o.*, t.target, t.av from obs o cross join lateral (values ('observed', o.a::float8), ('availability_normalized', o.target2)) t(target, av) where t.av is not null),
seg as (select o.*, s.dim, s.seg from tgt o cross join lateral (values ('all', 'all'),
    ('stock_state', case when o.outd > 0 then 'constrained_pre_cutoff' else 'unconstrained_pre_cutoff' end), ('velocity', o.vel)) s(dim, seg))
select 'short' as "section", model as "model", target as "target", dim as "dim", seg as "segment", ${METRICS("f", "av", "wt")}
from seg group by model, target, dim, seg
union all
select 'short_exclusions', 'coverage', null, 'counts', json_build_object('short', count(*) filter (where covered and est is not null),
    'short_no_stock_coverage', count(*) filter (where not covered), 'short_lt10_in_stock_days_training', count(*) filter (where covered and est is null),
    'short_target_lt10_in_stock_days', count(*) filter (where covered and est is not null and target2 is null))::text,
  null, null, null, null, null, null, null, null, null, null, null, null, null
from cov order by 1, 2, 3, 4, 5`,

    today: `with ${BASE(today)}, ${UNION},
wuni as (select * from uni where pid is not null and not leg),
${UNION_LAYERS("wuni")},
lv as (select l.*, case when p.id is null then null else greatest(l.l4, coalesce(p."onlineSalesPotential", 0)) end as l5,
    case when p.id is not null and coalesce(p."onlineSalesPotential", 0) > 0 then 1 else 0 end as man from layers l left join public."Product" p on p.id = l.pid),
x as (select x.layer, x.v, lv.man from lv cross join lateral (values ('L0_canonical_true30', lv.u30), ('L1_union_dedupe_gap', lv.l1),
    ('L2_union_status_filter_leak', lv.l2), ('L3_month_bucket_window', lv.l3), ('L4_max_blend_seasonal', lv.l4), ('L5_manual_override_max', lv.l5)) x(layer, v))
select layer as "layer", count(v)::int as "n", coalesce(sum(v), 0) as "sumForecast", (select coalesce(sum(man), 0)::int from lv) as "nManualKnown"
from x group by layer order by layer`,

    meta: `with ${BASE(long)},
pit as (select c.c, coalesce(sum(s.units_counted) filter (where s.known_at < c.c), 0) / nullif(sum(s.units_counted), 0) as share
  from cuts c join public.fm_sales_canonical_snapshot s on s.disposition = 'COUNTED' and s.economic_date >= c.c - 365 and s.economic_date < c.c group by 1)
select json_build_object(
  'version', '${BACKTEST_VERSION}',
  'canonical', (select json_build_object('rows', count(*), 'counted_rows', count(*) filter (where disposition = 'COUNTED'), 'min_economic_date', min(economic_date),
      'max_economic_date', max(economic_date), 'max_known_at', max(known_at)) from public.fm_sales_canonical_snapshot),
  'ingest_run', (select json_build_object('id', id, 'kind', kind, 'finished_at', finished_at, 'definition_version', definition_version)
      from public.fm_ingest_run order by started_at desc limit 1),
  'stock', (select json_build_object('rows', count(*), 'products', count(distinct product_id), 'min_day', min(economic_date), 'max_day', max(economic_date),
      'max_known_at', max(known_at_max)) from public.fm_stock_sku_day),
  'legacy_sources', json_build_object('marketplace_max_order', (select max("orderDate") from public."MarketplaceSalesRecord"),
      'trendyol_max_order', (select max("orderDate") from public."TrendyolSalesRecord"), 'hepsiburada_max_order', (select max("orderDate") from public."HepsiburadaSalesRecord")),
  'point_in_time_share_of_training_units_known_before_cutoff', (select json_build_object('min', min(share), 'max', max(share), 'avg', avg(share),
      'cutoffs', count(*), 'cutoffs_below_99pct', count(*) filter (where share < 0.99), 'per_cutoff', json_agg(json_build_object('c', c, 'share', round(share, 4)) order by c)) from pit),
  'long_universe', (select json_build_object('observations', count(*), 'mapped_core', count(*) filter (where pid is not null and not leg)) from uni),
  'production_status_filter_emulation_mismatches', (select count(*) from (select status from public."MarketplaceSalesRecord" union all
      select status from public."TrendyolSalesRecord" union all select status from public."HepsiburadaSalesRecord") x where ${PROD_ILIKE} <> ${PROD_KEPT}),
  'status_leak_units', (select json_build_object('rows', count(*), 'units', coalesce(sum(quantity), 0)) from (select status, quantity from public."MarketplaceSalesRecord" where "productId" is not null
      union all select status, quantity from public."TrendyolSalesRecord" where "productId" is not null union all select status, quantity from public."HepsiburadaSalesRecord" where "productId" is not null) x
      where ${PROD_KEPT} and not ${CORRECT_KEPT})
) as meta`,
  };
}

/** sha256 of the rendered SQL — recorded in every report so a run can be reproduced byte-for-byte. */
export function backtestSqlHash(p: SqlParams): string {
  const s = backtestSql(p);
  return createHash("sha256").update(JSON.stringify(s)).digest("hex");
}

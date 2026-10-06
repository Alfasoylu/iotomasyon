import { createHash } from "node:crypto";
import { FMS, UNION } from "./backtest-sql";
import { FORECAST_V2_COLD_START } from "./v2";
import { forecastV2Select } from "./v2-loader";

// Forecast V2 shadow comparison (READ-ONLY SELECT; same prelude as backtest-sql). Per active product it puts the legacy demand signals next
// to V2 and recomputes the demand-driven order quantities of the existing reorder engines both ways. Units only — TL figures only as
// "today's forward exposure at current unit cost", never as historical savings. Parity with the TS reference: __tests__/forecast-shadow.test.ts.
//
// Legacy signals (docs/FORECAST-V2.md → consumer audit):
//   l_imp = max(forecastMonthlySales(UNION ALL, month buckets), onlineSalesPotential)          importer-view, sermaye-sağlık
//   l_ty  = max(Trendyol 30 d excl. iptal/cancel, onlineSalesPotential)                        dashboard snapshot, smart recommendations, capital
//   l_ck  = max(Trendyol 30 d Delivered × (1 − return rate), online) + wholesale + installer    import cockpit
//   l_man = online + wholesale + installer potentials                                           PO prefill, product page, import snapshot
// V2: forecast_units (observed true30; UNKNOWN < 7 d) and decision units (FULL grade only, else 0).
// Order rules (demand part only, before profit/ROI/budget gates): cockpit 90-day cover, importer 45-day need, PO prefill 2× monthly demand.
export interface ShadowParams { asOf: string; legacyNow: string }
const DAY = /^\d{4}-\d{2}-\d{2}$/, TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

export function shadowSql(p: ShadowParams): Record<"summary" | "detail", string> {
  if (!DAY.test(p.asOf) || !TS.test(p.legacyNow)) throw new Error("invalid_shadow_params");
  const A = `date '${p.asOf}'`, NOW = `timestamp '${p.legacyNow.replace("T", " ").replace("Z", "")}'`;
  const base = `with v2 as (${forecastV2Select(A, "null::text[]")}),
${UNION},
bk as (select ${A} as c, pid as k, m, u from um where m < date_trunc('month', ${A})
  union all select ${A}, pid, date_trunc('month', ${A})::date, sum(up) from ud where has_p and d >= date_trunc('month', ${A}) and d < ${A} group by pid),
${FMS("fx", "bk")},
ty as (select "productId" as pid, sum(quantity)::float8 as u from public."TrendyolSalesRecord" where "productId" is not null and "orderDate" >= ${NOW} - interval '30 days'
  and not (status ilike '%iptal%' or status ilike '%cancel%') group by 1),
cd30 as (select "productId" as pid, sum(quantity)::float8 as u from public."TrendyolSalesRecord" where "productId" is not null and "orderDate" >= ${NOW} - interval '30 days'
  and status ilike '%Delivered%' group by 1),
cd90 as (select "productId" as pid, sum(quantity)::float8 as u from public."TrendyolSalesRecord" where "productId" is not null and "orderDate" >= ${NOW} - interval '90 days'
  and status ilike '%Delivered%' group by 1),
cret as (select "productId" as pid, count(*)::float8 as n from public."TrendyolReturnRecord" where "productId" is not null group by 1),
p as (select id, coalesce(sku, '') as sku, "stockQuantity"::float8 as st, "minimumStock"::float8 as mn, coalesce("onlineSalesPotential", 0)::float8 as mo,
  coalesce("wholesaleSalesPotential", 0)::float8 as mw, coalesce("installerSalesPotential", 0)::float8 as mi, "unitCostTry"::float8 as cost from public."Product" where "isActive"),
x as (select p.*, v."units30" as u30, v."firstSaleDay" as fsd,
    case when v."firstSaleDay" is null or ${A} - v."firstSaleDay"::date < ${FORECAST_V2_COLD_START.unknownBelowDays} then 'UNKNOWN'
      when ${A} - v."firstSaleDay"::date < ${FORECAST_V2_COLD_START.partialBelowDays} then 'PARTIAL' else 'FULL' end as grade,
    (v."stockKnownDays" = 30 and v."inStockDays" >= 10) as has_demand,
    coalesce(floor(greatest(fx.b30, fx.blend * fx.seas) + 0.5), 0)::float8 as l4,
    coalesce(ty.u, 0) as tyu, coalesce(cd30.u, 0) as d30, case when coalesce(cd90.u, 0) + coalesce(cret.n, 0) > 0 then coalesce(cret.n, 0) / (coalesce(cd90.u, 0) + coalesce(cret.n, 0)) end as rr
  from p join v2 v on v."productId" = p.id left join fx on fx.k = p.id left join ty on ty.pid = p.id left join cd30 on cd30.pid = p.id
  left join cd90 on cd90.pid = p.id left join cret on cret.pid = p.id),
y as (select x.*, case when grade = 'UNKNOWN' then null else u30 end as v2f, case when grade = 'FULL' then u30 else 0 end as v2d,
    greatest(l4, mo) as l_imp, greatest(tyu, mo) as l_ty, greatest(case when d30 > 0 then d30 * (1 - coalesce(rr, 0)) else 0 end, mo) + mw + mi as l_ck, mo + mw + mi as l_man
  from x),
r as (select y.*,
    case when l_ck > 0 then greatest(0, ceil(l_ck / 30 * 90) - st) else 0 end as ck_l, case when v2d > 0 then greatest(0, ceil(v2d / 30 * 90) - st) else 0 end as ck_v,
    case when l_imp > 0 then ceil(greatest(0, l_imp / 30 * 45 - st)) else 0 end as im_l, case when v2d > 0 then ceil(greatest(0, v2d / 30 * 45 - st)) else 0 end as im_v,
    (st <= mn or st = 0) as needs,
    case when not (st <= mn or st = 0) then 0 when l_man > 0 then greatest(1, ceil(l_man * 2) - st) else greatest(1, mn + 1 - st) end as po_l,
    case when not (st <= mn or st = 0) then 0 when v2d > 0 then greatest(1, ceil(v2d * 2) - st) else greatest(1, mn + 1 - st) end as po_v
  from y)`;
  const cmp = (l: string) => `json_build_object('legacy_sum', coalesce(sum(${l}), 0), 'n_compared', count(v2f), 'n_v2_unknown', count(*) filter (where v2f is null),
      'gt25pct', count(*) filter (where v2f is not null and abs(v2f - ${l}) >= 1 and (${l} = 0 or abs(v2f - ${l}) / ${l} > 0.25)),
      'gt2x', count(*) filter (where v2f is not null and greatest(${l}, v2f) - least(${l}, v2f) >= 3 and greatest(${l}, v2f) > 2 * least(${l}, v2f)),
      'v2_lower', count(*) filter (where v2f < ${l}), 'v2_higher', count(*) filter (where v2f > ${l}))`;
  const rule = (l: string, v: string) => `json_build_object('n_legacy_positive', count(*) filter (where ${l} > 0), 'n_v2_positive', count(*) filter (where ${v} > 0),
      'n_changed', count(*) filter (where ${l} <> ${v}), 'n_dropped_to_zero', count(*) filter (where ${l} > 0 and ${v} = 0),
      'legacy_units', coalesce(sum(${l}), 0), 'v2_units', coalesce(sum(${v}), 0), 'reduction_units', coalesce(sum(greatest(0, ${l} - ${v})), 0),
      'increase_units', coalesce(sum(greatest(0, ${v} - ${l})), 0),
      'forward_exposure_reduction_try_current_cost', coalesce(sum(greatest(0, ${l} - ${v}) * cost) filter (where cost > 0), 0),
      'reduction_units_with_current_cost', coalesce(sum(greatest(0, ${l} - ${v})) filter (where cost > 0), 0))`;
  return {
    summary: `${base},
po as (select i."productId" as pid, sum(i.qty)::float8 as qty, count(*) as n from public."PurchaseOrderItem" i join public."PurchaseOrder" o on o.id = i."orderId"
  where o.status::text in ('DRAFT', 'CONFIRMED') group by 1),
ol as (select l.id, l.qty::float8 as qty, l.monthly_sales::float8 as ms,
    (select r.id from r where r.sku <> '' and public.cfo_norm(r.sku) = public.cfo_norm(l.sku) order by r.id limit 1) as pid
  from public.cfo_order_line l where l.status = 'BEKLIYOR')
select json_build_object(
  'as_of', '${p.asOf}', 'legacy_now', '${p.legacyNow}', 'watermark', (select max("watermark") from v2),
  'products', (select json_build_object('active', count(*), 'full', count(*) filter (where grade = 'FULL'), 'partial', count(*) filter (where grade = 'PARTIAL'),
      'unknown', count(*) filter (where grade = 'UNKNOWN'), 'unknown_lt7d', count(*) filter (where grade = 'UNKNOWN' and fsd is not null),
      'never_sold', count(*) filter (where fsd is null), 'demand_estimate_known', count(*) filter (where has_demand),
      'manual_online_set', count(*) filter (where mo > 0), 'manual_any_set', count(*) filter (where l_man > 0), 'with_current_cost', count(*) filter (where cost > 0)) from r),
  'totals', (select json_build_object('legacy_fms_l4', sum(l4), 'legacy_importer_effective', sum(l_imp), 'legacy_trendyol_max_manual', sum(l_ty),
      'legacy_cockpit', sum(l_ck), 'legacy_manual_sum', sum(l_man), 'v2_forecast_units', sum(v2f), 'v2_decision_units', sum(v2d),
      'v2_partial_units', coalesce(sum(v2f) filter (where grade = 'PARTIAL'), 0)) from r),
  'vs_importer_effective', (select ${cmp("l_imp")} from r),
  'vs_fms_l4', (select ${cmp("l4")} from r),
  'vs_trendyol_max_manual', (select ${cmp("l_ty")} from r),
  'vs_cockpit', (select ${cmp("l_ck")} from r),
  'vs_manual_sum', (select ${cmp("l_man")} from r where l_man > 0),
  'rule_cockpit_90d', (select ${rule("ck_l", "ck_v")} from r),
  'rule_importer_45d', (select ${rule("im_l", "im_v")} from r),
  'rule_po_prefill_2x', (select ${rule("po_l", "po_v")} from r where needs),
  'open_purchase_orders', (select json_build_object('items', coalesce(sum(po.n), 0), 'products', count(*), 'units', coalesce(sum(po.qty), 0),
      'over_90d_cover_legacy', count(*) filter (where r.l_imp > 0 and r.st + po.qty > r.l_imp * 3),
      'over_90d_cover_v2', count(*) filter (where r.v2d = 0 or r.st + po.qty > r.v2d * 3), 'v2_no_decision_demand', count(*) filter (where r.v2d = 0),
      'units_above_90d_v2_need', coalesce(sum(greatest(0, r.st + po.qty - ceil(r.v2d * 3))), 0),
      'units_above_90d_legacy_need', coalesce(sum(greatest(0, r.st + po.qty - ceil(r.l_imp * 3))), 0)) from po join r on r.id = po.pid),
  'open_cfo_order_lines', (select json_build_object('lines', count(*), 'matched', count(r.id), 'units', coalesce(sum(ol.qty), 0), 'monthly_sales_sum', coalesce(sum(ol.ms), 0),
      'v2_decision_sum_matched', coalesce(sum(r.v2d), 0), 'v2_no_decision_demand', count(*) filter (where r.id is not null and r.v2d = 0),
      'gt25pct_vs_monthly_sales', count(*) filter (where r.id is not null and ol.ms is not null and abs(r.v2d - ol.ms) >= 1 and (ol.ms = 0 or abs(r.v2d - ol.ms) / ol.ms > 0.25)),
      'gt2x_vs_monthly_sales', count(*) filter (where r.id is not null and ol.ms is not null and greatest(ol.ms, r.v2d) - least(ol.ms, r.v2d) >= 3 and greatest(ol.ms, r.v2d) > 2 * least(ol.ms, r.v2d)),
      'units_above_90d_v2_need', coalesce(sum(greatest(0, r.st + ol.qty - ceil(r.v2d * 3))) filter (where r.id is not null), 0),
      'units_above_90d_own_monthly_sales_need', coalesce(sum(greatest(0, r.st + ol.qty - ceil(ol.ms * 3))) filter (where r.id is not null and ol.ms is not null), 0))
    from ol left join r on r.id = ol.pid)
) as shadow`,
    detail: `${base}
select id as "productId", sku as "sku", st as "stock", l4 as "legacyFms", mo as "manualOnline", l_imp as "legacyImporterEffective", l_ty as "legacyTrendyolMaxManual",
  l_ck as "legacyCockpit", l_man as "legacyManualSum", grade as "grade", v2f as "v2Forecast", v2d as "v2Decision", ck_l as "cockpitQtyLegacy", ck_v as "cockpitQtyV2",
  im_l as "importerQtyLegacy", im_v as "importerQtyV2", po_l as "poQtyLegacy", po_v as "poQtyV2"
from r order by abs(coalesce(v2f, 0) - l_imp) desc, id`,
  };
}
export const shadowSqlHash = (p: ShadowParams) => createHash("sha256").update(JSON.stringify(shadowSql(p))).digest("hex");

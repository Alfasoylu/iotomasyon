import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { legacyForecast, statusKept } from "../lib/forecast/models";
import { FORECAST_V2_SQL, rowsToForecasts, type ForecastV2Row } from "../lib/forecast/v2-loader";
import { shadowSql, shadowSqlHash } from "../lib/forecast/shadow-sql";
import { compareLegacyV2 } from "../lib/forecast/selection";
import { close, dataset, loadPglite, resetSeed } from "./forecast-fixture";

// Forecast V2 shadow comparison: the read-only SQL (lib/forecast/shadow-sql.ts) == an independent TypeScript reference on PGlite —
// legacy signals of every audited consumer, V2 grades, the demand part of the cockpit / importer / PO-prefill order rules, open purchase
// orders and open CFO order lines. Run with: node --import tsx __tests__/forecast-shadow.test.ts
const AS_OF = "2026-08-10", NOW = "2026-08-10T00:00:00Z";
const ceil = Math.ceil, max = Math.max, min = Math.min;
const gt25 = (l: number, v: number) => Math.abs(v - l) >= 1 && (l === 0 || Math.abs(v - l) / l > 0.25);
const gt2x = (l: number, v: number) => max(l, v) - min(l, v) >= 3 && max(l, v) > 2 * min(l, v);

async function main() {
  resetSeed();
  const data = dataset();
  const pg = new PGlite();
  try {
    await loadPglite(pg, data);
    await pg.exec(`alter table public."Product" add column sku text, add column "isActive" boolean default true, add column "stockQuantity" int default 0,
        add column "minimumStock" int default 5, add column "wholesaleSalesPotential" int, add column "installerSalesPotential" int, add column "unitCostTry" numeric;
      insert into public."Product" (id) values ('p05'), ('p98'), ('p99');
      update public."Product" set sku = upper(id), "stockQuantity" = (substr(id, 2)::int * 7) % 40, "unitCostTry" = case when substr(id, 2)::int % 3 = 0 then null else 10 + substr(id, 2)::int end,
        "wholesaleSalesPotential" = case when substr(id, 2)::int % 4 = 1 then 6 end, "installerSalesPotential" = case when id = 'p10' then 3 end;
      update public."Product" set "isActive" = false where id = 'p98';
      update public."Product" set "stockQuantity" = 0 where id in ('p02', 'p11');
      create table public."TrendyolReturnRecord" ("productId" text);
      insert into public."TrendyolReturnRecord" values ('p01'), ('p01'), ('p03'), (null), ('p04');
      insert into public."TrendyolSalesRecord" values ('p03', '2026-08-01 10:00', 4, 'Cancelled'), ('p03', '2026-08-02 10:00', 2, null), ('p04', '2026-08-03 10:00', 5, 'Shipped');
      create table public."PurchaseOrder" (id text, status text); create table public."PurchaseOrderItem" (id text, "orderId" text, "productId" text, qty int);
      insert into public."PurchaseOrder" values ('o1', 'DRAFT'), ('o2', 'RECEIVED');
      insert into public."PurchaseOrderItem" values ('i1', 'o1', 'p01', 40), ('i2', 'o1', 'p04', 5), ('i3', 'o1', 'p04', 7), ('i4', 'o2', 'p03', 99), ('i5', 'o1', 'p07', 30);
      create table public.cfo_order_line (id text, sku text, qty int, monthly_sales numeric, status text);
      insert into public.cfo_order_line values ('l1', ' p01 ', 50, 20, 'BEKLIYOR'), ('l2', 'P04', 10, 90, 'BEKLIYOR'), ('l3', 'P03', 10, null, 'BEKLIYOR'),
        ('l4', 'NOPE', 10, 5, 'BEKLIYOR'), ('l5', 'P02', 500, 1, 'IPTAL');`);
    const sql = shadowSql({ asOf: AS_OF, legacyNow: NOW });
    const got = (await pg.query<{ shadow: Record<string, Record<string, unknown>> }>(sql.summary)).rows[0].shadow;

    // ── TS reference from raw rows ──
    const q = async <T,>(s: string) => (await pg.query<T>(s)).rows;
    const products = await q<{ id: string; sku: string; isActive: boolean; stockQuantity: number; minimumStock: number; onlineSalesPotential: number | null;
      wholesaleSalesPotential: number | null; installerSalesPotential: number | null; unitCostTry: string | null }>(`select * from public."Product"`);
    const legacyRows = await q<{ productId: string | null; d: string; quantity: number; status: string | null; t: string }>(`select "productId", to_char("orderDate", 'YYYY-MM-DD') as d, quantity, status, 'M' as t from public."MarketplaceSalesRecord"
      union all select "productId", to_char("orderDate", 'YYYY-MM-DD'), quantity, status, 'T' from public."TrendyolSalesRecord"
      union all select "productId", to_char("orderDate", 'YYYY-MM-DD'), quantity, status, 'H' from public."HepsiburadaSalesRecord"`);
    const tyRaw = await q<{ productId: string | null; ts: string; quantity: number; status: string | null }>(`select "productId", to_char("orderDate", 'YYYY-MM-DD"T"HH24:MI:SS') as ts, quantity, status from public."TrendyolSalesRecord"`);
    const returns = await q<{ productId: string | null }>(`select * from public."TrendyolReturnRecord"`);
    const v2 = rowsToForecasts((await pg.query<ForecastV2Row>(FORECAST_V2_SQL, [AS_OF, null])).rows, AS_OF);
    const nowMs = Date.parse(NOW), since = (days: number) => new Date(nowMs - days * 86_400_000).toISOString().slice(0, 19);
    const tySum = (pid: string, days: number, pred: (s: string | null) => boolean) => tyRaw.filter(r => r.productId === pid && r.ts >= since(days) && pred(r.status)).reduce((s, r) => s + r.quantity, 0);
    const notCancelled = (s: string | null) => s != null && !/iptal|cancel/i.test(s), delivered = (s: string | null) => s != null && /delivered/i.test(s);
    type Ref = { id: string; sku: string; st: number; mn: number; mo: number; l_man: number; cost: number | null; grade: string; fsd: string | null; hasDemand: boolean;
      l4: number; l_imp: number; l_ty: number; l_ck: number; v2f: number | null; v2d: number; ck_l: number; ck_v: number; im_l: number; im_v: number; needs: boolean; po_l: number; po_v: number };
    const ref: Ref[] = products.filter(p => p.isActive).map(p => {
      const st = p.stockQuantity, mn = p.minimumStock, mo = p.onlineSalesPotential ?? 0, mw = p.wholesaleSalesPotential ?? 0, mi = p.installerSalesPotential ?? 0;
      const train = legacyRows.filter(r => r.productId === p.id && r.d < AS_OF && statusKept(r.status, false)).map(r => ({ day: r.d, units: r.quantity }));
      const l4 = legacyForecast(train, AS_OF).monthlyUnits;
      const f = v2.get(p.id)!;
      const d30 = tySum(p.id, 30, delivered), d90 = tySum(p.id, 90, delivered), ret = returns.filter(r => r.productId === p.id).length;
      const rr = d90 + ret > 0 ? ret / (d90 + ret) : null;
      const l_ck = max(d30 > 0 ? d30 * (1 - (rr ?? 0)) : 0, mo) + mw + mi, l_imp = max(l4, mo), l_ty = max(tySum(p.id, 30, notCancelled), mo), l_man = mo + mw + mi;
      const v2f = f.forecast_units, v2d = f.data_grade === "FULL" ? f.forecast_units! : 0, needs = st <= mn || st === 0;
      const po = (d: number) => !needs ? 0 : d > 0 ? max(1, ceil(d * 2) - st) : max(1, mn + 1 - st);
      return { id: p.id, sku: p.sku, st, mn, mo, l_man, cost: p.unitCostTry == null ? null : Number(p.unitCostTry), grade: f.data_grade, fsd: f.history_days == null ? null : "x",
        hasDemand: f.demand_estimate_units != null, l4, l_imp, l_ty, l_ck, v2f, v2d,
        ck_l: l_ck > 0 ? max(0, ceil(l_ck / 30 * 90) - st) : 0, ck_v: v2d > 0 ? max(0, ceil(v2d / 30 * 90) - st) : 0,
        im_l: l_imp > 0 ? ceil(max(0, l_imp / 30 * 45 - st)) : 0, im_v: v2d > 0 ? ceil(max(0, v2d / 30 * 45 - st)) : 0, needs, po_l: po(l_man), po_v: po(v2d) };
    });
    const sum = (xs: Ref[], f: (r: Ref) => number | null) => xs.reduce((s, r) => s + (f(r) ?? 0), 0);
    const cmp = (xs: Ref[], l: (r: Ref) => number) => {
      const c = xs.filter(r => r.v2f != null);
      for (const r of c) { const x = compareLegacyV2(l(r), r.v2f); assert.equal(x.gt25pct, gt25(l(r), r.v2f!)); assert.equal(x.gt2x, gt2x(l(r), r.v2f!)); }
      return { legacy_sum: sum(xs, l), n_compared: c.length, n_v2_unknown: xs.length - c.length, gt25pct: c.filter(r => gt25(l(r), r.v2f!)).length,
        gt2x: c.filter(r => gt2x(l(r), r.v2f!)).length, v2_lower: c.filter(r => r.v2f! < l(r)).length, v2_higher: c.filter(r => r.v2f! > l(r)).length };
    };
    const rule = (xs: Ref[], l: (r: Ref) => number, v: (r: Ref) => number) => ({ n_legacy_positive: xs.filter(r => l(r) > 0).length, n_v2_positive: xs.filter(r => v(r) > 0).length,
      n_changed: xs.filter(r => l(r) !== v(r)).length, n_dropped_to_zero: xs.filter(r => l(r) > 0 && v(r) === 0).length, legacy_units: sum(xs, l), v2_units: sum(xs, v),
      reduction_units: sum(xs, r => max(0, l(r) - v(r))), increase_units: sum(xs, r => max(0, v(r) - l(r))),
      forward_exposure_reduction_try_current_cost: sum(xs.filter(r => (r.cost ?? 0) > 0), r => max(0, l(r) - v(r)) * r.cost!),
      reduction_units_with_current_cost: sum(xs.filter(r => (r.cost ?? 0) > 0), r => max(0, l(r) - v(r))) });
    const byId = new Map(ref.map(r => [r.id, r]));
    const poItems = [{ p: "p01", q: 40 }, { p: "p04", q: 5 }, { p: "p04", q: 7 }, { p: "p07", q: 30 }];
    const poAgg = [...new Set(poItems.map(i => i.p))].map(pid => ({ r: byId.get(pid)!, qty: poItems.filter(i => i.p === pid).reduce((s, i) => s + i.q, 0), n: poItems.filter(i => i.p === pid).length }));
    const lines = [{ sku: " p01 ", qty: 50, ms: 20 }, { sku: "P04", qty: 10, ms: 90 }, { sku: "P03", qty: 10, ms: null as number | null }, { sku: "NOPE", qty: 10, ms: 5 }]
      .map(l => ({ ...l, r: ref.find(r => r.sku !== "" && r.sku.trim().toUpperCase() === l.sku.trim().toUpperCase()) }));
    const matched = lines.filter(l => l.r);
    const expected = {
      products: { active: ref.length, full: ref.filter(r => r.grade === "FULL").length, partial: ref.filter(r => r.grade === "PARTIAL").length,
        unknown: ref.filter(r => r.grade === "UNKNOWN").length, unknown_lt7d: ref.filter(r => r.grade === "UNKNOWN" && r.fsd != null).length,
        never_sold: ref.filter(r => r.fsd == null).length, demand_estimate_known: ref.filter(r => r.hasDemand).length, manual_online_set: ref.filter(r => r.mo > 0).length,
        manual_any_set: ref.filter(r => r.l_man > 0).length, with_current_cost: ref.filter(r => (r.cost ?? 0) > 0).length },
      totals: { legacy_fms_l4: sum(ref, r => r.l4), legacy_importer_effective: sum(ref, r => r.l_imp), legacy_trendyol_max_manual: sum(ref, r => r.l_ty),
        legacy_cockpit: sum(ref, r => r.l_ck), legacy_manual_sum: sum(ref, r => r.l_man), v2_forecast_units: sum(ref, r => r.v2f), v2_decision_units: sum(ref, r => r.v2d),
        v2_partial_units: sum(ref.filter(r => r.grade === "PARTIAL"), r => r.v2f) },
      vs_importer_effective: cmp(ref, r => r.l_imp), vs_fms_l4: cmp(ref, r => r.l4), vs_trendyol_max_manual: cmp(ref, r => r.l_ty), vs_cockpit: cmp(ref, r => r.l_ck),
      vs_manual_sum: cmp(ref.filter(r => r.l_man > 0), r => r.l_man),
      rule_cockpit_90d: rule(ref, r => r.ck_l, r => r.ck_v), rule_importer_45d: rule(ref, r => r.im_l, r => r.im_v), rule_po_prefill_2x: rule(ref.filter(r => r.needs), r => r.po_l, r => r.po_v),
      open_purchase_orders: { items: poAgg.reduce((s, x) => s + x.n, 0), products: poAgg.length, units: poAgg.reduce((s, x) => s + x.qty, 0),
        over_90d_cover_legacy: poAgg.filter(x => x.r.l_imp > 0 && x.r.st + x.qty > x.r.l_imp * 3).length,
        over_90d_cover_v2: poAgg.filter(x => x.r.v2d === 0 || x.r.st + x.qty > x.r.v2d * 3).length, v2_no_decision_demand: poAgg.filter(x => x.r.v2d === 0).length,
        units_above_90d_v2_need: poAgg.reduce((s, x) => s + max(0, x.r.st + x.qty - ceil(x.r.v2d * 3)), 0),
        units_above_90d_legacy_need: poAgg.reduce((s, x) => s + max(0, x.r.st + x.qty - ceil(x.r.l_imp * 3)), 0) },
      open_cfo_order_lines: { lines: lines.length, matched: matched.length, units: lines.reduce((s, l) => s + l.qty, 0), monthly_sales_sum: lines.reduce((s, l) => s + (l.ms ?? 0), 0),
        v2_decision_sum_matched: matched.reduce((s, l) => s + l.r!.v2d, 0), v2_no_decision_demand: matched.filter(l => l.r!.v2d === 0).length,
        gt25pct_vs_monthly_sales: matched.filter(l => l.ms != null && gt25(l.ms, l.r!.v2d)).length, gt2x_vs_monthly_sales: matched.filter(l => l.ms != null && gt2x(l.ms, l.r!.v2d)).length,
        units_above_90d_v2_need: matched.reduce((s, l) => s + max(0, l.r!.st + l.qty - ceil(l.r!.v2d * 3)), 0),
        units_above_90d_own_monthly_sales_need: matched.filter(l => l.ms != null).reduce((s, l) => s + max(0, l.r!.st + l.qty - ceil(l.ms! * 3)), 0) },
    };
    for (const [section, obj] of Object.entries(expected)) for (const [k, v] of Object.entries(obj)) close(got[section][k], v, `${section}.${k}`);
    // the fixture exercises what the report claims
    assert.ok(expected.products.partial >= 1 && expected.products.unknown >= 1 && expected.vs_importer_effective.gt25pct >= 1, JSON.stringify(expected.products));
    assert.ok(expected.rule_cockpit_90d.n_changed >= 1 && expected.rule_po_prefill_2x.n_legacy_positive >= 1 && expected.open_cfo_order_lines.matched === 3);
    const detail = (await pg.query<Record<string, unknown>>(sql.detail)).rows;
    assert.equal(detail.length, ref.length);
    for (const d of detail) { const r = byId.get(String(d.productId))!; close(d.legacyImporterEffective, r.l_imp, "detail l_imp"); close(d.v2Forecast, r.v2f, "detail v2f"); close(d.cockpitQtyV2, r.ck_v, "detail ck_v"); }
    assert.equal(shadowSqlHash({ asOf: AS_OF, legacyNow: NOW }), shadowSqlHash({ asOf: AS_OF, legacyNow: NOW }));
    assert.throws(() => shadowSql({ asOf: "2026-08-10'; drop table x; --", legacyNow: NOW }), /invalid_shadow_params/);
    console.log(`Forecast V2 shadow: summary SQL == TS reference (${ref.length} active products, ${JSON.stringify(expected.products)}); detail rows match`);
  } finally { await pg.close(); }
}
main().then(() => process.exit(process.exitCode ?? 0)).catch(e => { console.error(e); process.exit(1); });

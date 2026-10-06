import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { addDays, stockAdjustedDemand } from "../lib/forecast/models";
import { aggregatesFromRows, decisionUnits, FORECAST_V2_MODEL_VERSION, forecastV2, forecastV2Enabled, type ForecastV2Aggregates } from "../lib/forecast/v2";
import { FORECAST_V2_SQL, rowsToForecasts, type ForecastV2Row } from "../lib/forecast/v2-loader";
import { M7_DISCOVERY_CUTOFF, m7ForwardCutoffs, m7ForwardReport, m7ForwardSql, type M7Row } from "../lib/forecast/m7-shadow";
import { close, dataset, loadPglite, resetSeed } from "./forecast-fixture";

// Forecast V2 (observed-sales-v2-true30): output contract, cold start, separation of model / manual override / demand estimate, flag parsing,
// loader SQL == reference on PGlite, immunity to the legacy duplicate sources, and the M7 shadow (forward-only, never touches V2).
// Run with: node --import tsx __tests__/forecast-v2.test.ts
const AS_OF = "2026-08-10";
const agg = (o: Partial<ForecastV2Aggregates> = {}): ForecastV2Aggregates => ({ productId: "p", sku: "SKU", units30: 12, units90: 30, firstSaleDay: "2025-01-01",
  stockKnownDays: 30, inStockDays: 20, unitsOnInStockDays: 10, outOfStockDays: 10, manualOverride: null, ...o });

function pure() {
  // flag: only the exact string "true" enables
  assert.equal(forecastV2Enabled({}), false); assert.equal(forecastV2Enabled({ FORECAST_V2_ENABLED: "1" }), false);
  assert.equal(forecastV2Enabled({ FORECAST_V2_ENABLED: "false" }), false); assert.equal(forecastV2Enabled({ FORECAST_V2_ENABLED: "true" }), true);
  // contract
  const full = forecastV2(agg(), AS_OF, "2026-08-09");
  for (const k of ["sku", "as_of", "horizon_days", "forecast_units", "model_version", "history_days", "segment", "data_grade", "estimated", "reason_flags",
    "source_watermark", "demand_estimate_units", "manual_override_units", "model_forecast", "manual_override", "effective_forecast"]) assert.ok(k in full, k);
  assert.equal(full.model_version, FORECAST_V2_MODEL_VERSION); assert.equal(FORECAST_V2_MODEL_VERSION, "observed-sales-v2-true30");
  assert.equal(full.forecast_units, 12); assert.equal(full.data_grade, "FULL"); assert.equal(full.estimated, false); assert.equal(full.horizon_days, 30);
  assert.equal(full.segment, "B_5_30_per_month"); assert.equal(decisionUnits(full), 12);
  assert.ok(full.reason_flags.includes("STOCK_CONSTRAINED_LAST_30D") && !full.reason_flags.includes("SOURCE_STALE"));
  // cold start: < 7 days UNKNOWN, 7–29 PARTIAL = observed units (not annualised), ≥ 30 FULL; never sold UNKNOWN
  const at = (first: string | null, u30 = 5) => forecastV2(agg({ firstSaleDay: first, units30: u30 }), AS_OF, "2026-08-09");
  const lt7 = at(addDays(AS_OF, -6)), d7 = at(addDays(AS_OF, -7)), d29 = at(addDays(AS_OF, -29)), d30 = at(addDays(AS_OF, -30)), never = at(null, 0);
  assert.deepEqual([lt7.data_grade, lt7.forecast_units, lt7.history_days], ["UNKNOWN", null, 6]); assert.ok(lt7.reason_flags.includes("COLD_START_LT7D"));
  assert.deepEqual([d7.data_grade, d7.forecast_units], ["PARTIAL", 5]); assert.deepEqual([d29.data_grade, d29.forecast_units], ["PARTIAL", 5]);
  assert.ok(d7.reason_flags.includes("PARTIAL_HISTORY_7_29D"));
  assert.deepEqual([d30.data_grade, d30.forecast_units], ["FULL", 5]);
  assert.deepEqual([never.data_grade, never.forecast_units, never.history_days], ["UNKNOWN", null, null]); assert.ok(never.reason_flags.includes("NO_CANONICAL_SALES"));
  // PARTIAL / UNKNOWN are not decision-grade for capital / purchase engines
  assert.equal(decisionUnits(d7), null); assert.equal(decisionUnits(lt7), null); assert.equal(decisionUnits(never), null); assert.equal(decisionUnits(d30), 5);
  // manual override never changes the model or effective forecast
  for (const manual of [null, 0, 3, 12, 500]) {
    const f = forecastV2(agg({ manualOverride: manual }), AS_OF, "2026-08-09");
    assert.equal(f.forecast_units, 12); assert.equal(f.model_forecast, 12); assert.equal(f.effective_forecast, 12); assert.equal(f.manual_override, manual);
    assert.equal(f.manual_override_units, manual); assert.equal(f.reason_flags.includes("MANUAL_OVERRIDE_NOT_APPLIED"), manual != null && manual !== 12);
  }
  // demand estimate is separate: UNKNOWN without full stock history / < 10 in-stock days, and never changes forecast_units
  assert.equal(full.demand_estimate_units, 10 / 20 * 30);
  const noStock = forecastV2(agg({ stockKnownDays: 12 }), AS_OF, "2026-08-09"), fewIn = forecastV2(agg({ inStockDays: 9, unitsOnInStockDays: 9 }), AS_OF, "2026-08-09");
  assert.equal(noStock.demand_estimate_units, null); assert.ok(noStock.reason_flags.includes("DEMAND_ESTIMATE_NO_STOCK_HISTORY"));
  assert.equal(fewIn.demand_estimate_units, null); assert.ok(fewIn.reason_flags.includes("DEMAND_ESTIMATE_LT10_IN_STOCK_DAYS"));
  for (const f of [noStock, fewIn, forecastV2(agg({ unitsOnInStockDays: 900 }), AS_OF, "2026-08-09")]) { assert.equal(f.forecast_units, 12); assert.equal(f.effective_forecast, 12); }
  // zero sales in 30 days on a mature SKU is a real 0, not unknown; stale watermark flagged
  const zero = forecastV2(agg({ units30: 0 }), AS_OF, "2026-08-01");
  assert.deepEqual([zero.forecast_units, zero.data_grade], [0, "FULL"]); assert.ok(zero.reason_flags.includes("NO_SALES_LAST_30D") && zero.reason_flags.includes("SOURCE_STALE"));
  // deterministic
  assert.deepEqual(forecastV2(agg(), AS_OF, "2026-08-09"), forecastV2(agg(), AS_OF, "2026-08-09"));
  // M7 is structurally isolated from production V2
  for (const f of ["lib/forecast/v2.ts", "lib/forecast/v2-loader.ts"]) assert.ok(!/from "[^"]*(m7-shadow|candidates)"/.test(readFileSync(f, "utf8")), `${f} must not import experimental models`);
  assert.throws(() => m7ForwardCutoffs("2026-12-01", "2026-06-01"), /m7_pre_discovery_cutoff/);
  assert.deepEqual(m7ForwardCutoffs("2026-10-06"), [], "no forward sample exists on the discovery day");
  assert.deepEqual(m7ForwardCutoffs("2026-11-06"), [M7_DISCOVERY_CUTOFF], "first forward cutoff becomes scorable once its 30-day target has elapsed");
}

async function main() {
  pure();
  resetSeed();
  const data = dataset();
  const pg = new PGlite();
  try {
    await loadPglite(pg, data);
    await pg.exec(`alter table public."Product" add column sku text; update public."Product" set sku = upper(id); insert into public."Product" (id, sku) values ('p05', 'P05'), ('p99', 'P99');`);
    const run = async () => (await pg.query<ForecastV2Row>(FORECAST_V2_SQL, [AS_OF, null])).rows;
    const rows = await run();
    assert.equal(rows.length, 15);
    const sql = rowsToForecasts(rows, AS_OF), watermark = rows[0].watermark;
    assert.equal(watermark, addDays(AS_OF, -1));
    const products = [...new Set(rows.map(r => r.productId))];
    const graded = { FULL: 0, PARTIAL: 0, UNKNOWN: 0 };
    let demand = 0;
    for (const pid of products) {
      const manual = data.manual.find(m => m.productId === pid)?.value ?? null;
      const ref = forecastV2(aggregatesFromRows({ productId: pid, sku: pid.toUpperCase(), manualOverride: manual,
        sales: data.canonical.filter(r => r.productId === pid).map(r => ({ day: r.day, units: r.units })),
        stock: data.stock.filter(s => s.productId === pid).map(s => ({ day: s.day, unitsOpen: s.unitsOpen, unitsEod: s.unitsEod })) }, AS_OF), AS_OF, watermark);
      const got = sql.get(pid)!;
      for (const k of Object.keys(ref) as (keyof typeof ref)[]) {
        if (typeof ref[k] === "number" || typeof got[k] === "number") close(got[k], ref[k], `${pid} ${k}`); else assert.deepEqual(got[k], ref[k], `${pid} ${k}`);
      }
      graded[ref.data_grade]++;
      if (ref.demand_estimate_units != null) {
        demand++;
        const sd = stockAdjustedDemand(data.canonical.filter(r => r.productId === pid).map(r => ({ day: r.day, units: r.units })),
          data.stock.filter(s => s.productId === pid && s.day < AS_OF).sort((a, b) => a.day < b.day ? -1 : 1), addDays(AS_OF, -30), AS_OF);
        close(ref.demand_estimate_units, sd.estimate, `${pid} demand == stockAdjustedDemand`);
      }
    }
    assert.ok(graded.FULL > 5 && graded.UNKNOWN >= 1 && demand > 0, JSON.stringify({ graded, demand }));
    // a young SKU (p07 first sale 2026-07-20) is PARTIAL at 2026-08-10 and UNKNOWN at 2026-07-25
    assert.equal(sql.get("p07")!.data_grade, "PARTIAL");
    const young = rowsToForecasts((await pg.query<ForecastV2Row>(FORECAST_V2_SQL, ["2026-07-25", ["p07"]])).rows, "2026-07-25");
    assert.deepEqual([young.size, young.get("p07")!.data_grade, young.get("p07")!.forecast_units], [1, "UNKNOWN", null]);
    // duplicate Trendyol / legacy UNION rows, cancellations and manual edits cannot move V2
    await pg.exec(`insert into public."TrendyolSalesRecord" select "productId", "orderDate", quantity * 5, 'Delivered' from public."MarketplaceSalesRecord" where "productId" is not null;
      insert into public."MarketplaceSalesRecord" values ('p01', '2026-08-05', 999, 'İade-İptal');
      insert into public.fm_sales_canonical_snapshot values ('p01', ' sku-1 ', 'TRENDYOL', '2026-08-05', 777, 777, null, 'DEDUP_DROPPED', now());`);
    const after = rowsToForecasts(await run(), AS_OF);
    for (const pid of products) assert.deepEqual({ ...after.get(pid)!, manual_override: null, manual_override_units: null, reason_flags: [] },
      { ...sql.get(pid)!, manual_override: null, manual_override_units: null, reason_flags: [] }, `duplicate source immunity ${pid}`);
    await pg.exec(`update public."Product" set "onlineSalesPotential" = 10000`);
    const manualAfter = rowsToForecasts(await run(), AS_OF);
    for (const pid of products) {
      assert.equal(manualAfter.get(pid)!.forecast_units, sql.get(pid)!.forecast_units, `manual cannot move forecast ${pid}`);
      assert.equal(manualAfter.get(pid)!.effective_forecast, sql.get(pid)!.forecast_units);
    }

    // M7 shadow: SQL == TS (test-only pre-discovery window to exercise it), and running it does not change V2
    const asOf = "2026-10-06", disc = "2026-07-07";
    const ts = m7ForwardReport(data, asOf, disc, { allowPreDiscoveryForTests: true });
    const m7 = (await pg.query<Record<string, unknown>>(m7ForwardSql(asOf, disc, { allowPreDiscoveryForTests: true }))).rows;
    const nonEmpty = ts.rows.filter(r => r.n > 0), key = (r: Record<string, unknown> | M7Row) => `${r.model}|${r.scope}`;
    assert.deepEqual(m7.map(key).sort(), nonEmpty.map(key).sort());
    for (const r of m7) {
      const t = nonEmpty.find(x => key(x) === key(r))! as M7Row;
      for (const f of ["n", "sumActual", "sumForecast", "wape", "bias", "catOverRate", "excessUnits", "factor"] as const) close(r[f], t[f], `m7 ${key(r)} ${f}`);
    }
    assert.ok(nonEmpty.some(r => r.model === "M7_a_shrink" && r.factor != null && r.factor < 1), "shrink exercised");
    assert.equal(ts.status, "INSUFFICIENT_FORWARD_SAMPLE");
    assert.deepEqual(rowsToForecasts(await run(), AS_OF), manualAfter, "M7 telemetry does not change V2");
    console.log(`Forecast V2: contract + cold start + override/demand isolation + flag OK; loader SQL == reference for ${products.length} products ` +
      `(${JSON.stringify(graded)}, demand ${demand}); duplicate-source immunity; M7 forward SQL == TS (${m7.length} rows)`);
  } finally { await pg.close(); }
}
main().then(() => process.exit(process.exitCode ?? 0)).catch(e => { console.error(e); process.exit(1); });

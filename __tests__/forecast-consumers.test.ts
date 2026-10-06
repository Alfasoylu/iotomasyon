import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { FORECAST_CONSUMERS } from "../lib/forecast/consumer-audit";
import { compareLegacyV2, forecastV2View, selectMonthlyDemand, v2DecisionDemand, type ForecastV2Map } from "../lib/forecast/selection";
import { forecastV2, forecastV2Enabled, type ForecastV2Aggregates } from "../lib/forecast/v2";
import { debtGate, NEW_ORDER_DEBT_LIMIT_TRY } from "../lib/cfo-agent/debt-policy";

// Forecast V2 consumer integration: the audited call-site registry is complete and enforced (MIGRATE_V2 sites gate on the flag through
// lib/forecast/consumer, others do not import it), flag OFF returns the legacy value untouched, flag ON uses FULL-grade V2 only (PARTIAL /
// UNKNOWN / manual / demand estimate never become decision units), experimental models stay out of production code, and the 5M TL debt
// gate is untouched. Run with: node --import tsx __tests__/forecast-consumers.test.ts
const src = (f: string) => readFileSync(f, "utf8");
const agg = (o: Partial<ForecastV2Aggregates>): ForecastV2Aggregates => ({ productId: "x", sku: "X", units30: 0, units90: 0, firstSaleDay: "2025-01-01",
  stockKnownDays: 30, inStockDays: 30, unitsOnInStockDays: 0, outOfStockDays: 0, manualOverride: null, ...o });

async function main() {
  // 1. registry: files exist, ids unique, decisions enforced in source
  assert.equal(new Set(FORECAST_CONSUMERS.map(c => c.id)).size, FORECAST_CONSUMERS.length);
  for (const c of FORECAST_CONSUMERS) {
    assert.ok(existsSync(c.file), c.file);
    const s = src(c.file), usesBridge = /from "@\/lib\/forecast\/consumer"/.test(s);
    if (c.decision === "MIGRATE_V2" && c.file.endsWith("importer-view-client.tsx")) {
      assert.ok(/m\.forecastV2 \? m\.effectiveMonthlyUnits : Math\.max\(m\.forecastMonthlyUnits, manualOnline\)/.test(s), "client recompute gated");
      assert.ok(/!p\.forecastV2 && p\.stockQuantity === 0/.test(s), "legacy lifetime hint gated");
    } else if (c.decision === "MIGRATE_V2") {
      assert.ok(usesBridge && /await forecastV2ForConsumers\(\)/.test(s), `${c.file} must load V2 through the flag-gated bridge`);
      assert.ok(/\bv2\s*\?/.test(s), `${c.file} must keep the legacy branch for v2 == null`);
    } else assert.ok(!usesBridge, `${c.file} is ${c.decision} and must not use V2`);
    assert.ok(!/from "[^"]*forecast\/(m7-shadow|candidates)"/.test(s), `${c.file} must not import experimental models`);
  }
  // every caller of the legacy engine is audited
  const callers = execSync(`grep -rlE "forecastMonthlySales\\(|effectiveMonthlyUnits as pickEffectiveMonthly" app lib services components || true`, { encoding: "utf8" })
    .split("\n").filter(f => f && !f.startsWith("lib/forecast/") && f !== "lib/sales-forecast.ts");
  for (const f of callers) assert.ok(FORECAST_CONSUMERS.some(c => c.file === f), `unaudited legacy forecast consumer: ${f}`);
  // production V2 path never imports experimental models
  for (const f of ["lib/forecast/v2.ts", "lib/forecast/v2-loader.ts", "lib/forecast/selection.ts", "lib/forecast/consumer.ts"])
    assert.ok(!/from "[^"]*(m7-shadow|candidates)"/.test(src(f)), f);

  // 2. flag OFF → legacy value untouched (and the bridge returns null without touching the database)
  for (const legacy of [0, 1, 7.5, 42, 10_000]) assert.equal(selectMonthlyDemand(null, "p", () => legacy), legacy);
  for (const off of [{}, { FORECAST_V2_ENABLED: "" }, { FORECAST_V2_ENABLED: "false" }, { FORECAST_V2_ENABLED: "1" }, { FORECAST_V2_ENABLED: "TRUE" }])
    assert.equal(forecastV2Enabled(off), false, JSON.stringify(off));
  assert.equal(forecastV2Enabled({ FORECAST_V2_ENABLED: "true" }), true);
  // the bridge (server-only, imports Prisma) returns null before any database access while the flag is off
  assert.ok(/if \(!forecastV2Enabled\(\)\) return null;\s*return loadForecastV2\(prisma\);/.test(src("lib/forecast/consumer.ts")), "bridge gates before loading");

  // 3. flag ON → canonical true30, FULL only; manual / demand estimate / PARTIAL / UNKNOWN never become decision units
  const asOf = "2026-08-10";
  const map: ForecastV2Map = new Map([
    ["full", forecastV2(agg({ productId: "full", units30: 24, manualOverride: 500, unitsOnInStockDays: 300 }), asOf, "2026-08-09")],
    ["partial", forecastV2(agg({ productId: "partial", units30: 9, firstSaleDay: "2026-07-25", manualOverride: 80 }), asOf, "2026-08-09")],
    ["new", forecastV2(agg({ productId: "new", units30: 4, firstSaleDay: "2026-08-07" }), asOf, "2026-08-09")],
    ["never", forecastV2(agg({ productId: "never", firstSaleDay: null, manualOverride: 30 }), asOf, "2026-08-09")],
  ]);
  assert.equal(selectMonthlyDemand(map, "full", () => 999), 24, "V2 replaces legacy only when on");
  assert.equal(map.get("full")!.demand_estimate_units, 300, "demand estimate exists but is not used");
  assert.deepEqual(["partial", "new", "never", "missing"].map(id => v2DecisionDemand(map, id)), [0, 0, 0, 0], "PARTIAL / UNKNOWN / missing → 0");
  assert.deepEqual([map.get("partial")!.forecast_units, map.get("partial")!.data_grade], [9, "PARTIAL"], "PARTIAL shows observed units");
  assert.equal(map.get("new")!.forecast_units, null);
  assert.equal(forecastV2View(map, "full")!.decisionUnits, 24); assert.equal(forecastV2View(map, "partial")!.decisionUnits, 0);
  assert.deepEqual(compareLegacyV2(100, 24), { absDiff: -76, pctDiff: -0.76, gt25pct: true, gt2x: true });
  assert.deepEqual(compareLegacyV2(10, 11), { absDiff: 1, pctDiff: 0.1, gt25pct: false, gt2x: false });
  assert.deepEqual(compareLegacyV2(0, 2), { absDiff: 2, pctDiff: null, gt25pct: true, gt2x: false }, "2x needs ≥ 3 units difference");
  assert.equal(compareLegacyV2(5, null).absDiff, null);

  // 4. 5M TL debt gate untouched and independent of the forecast
  assert.equal(NEW_ORDER_DEBT_LIMIT_TRY, 5_000_000);
  assert.equal(debtGate(9_240_000, true).open, false); assert.equal(debtGate(4_999_999, true).open, true); assert.equal(debtGate(4_999_999, false).open, false);
  assert.ok(!/forecast/.test(src("lib/cfo-agent/debt-policy.ts")), "debt gate does not depend on forecasts");
  const po = src("lib/actions/purchase-order-actions.ts");
  assert.ok(/readOrderDebtGate/.test(po) && /order_debt_gate/.test(po) && !/forecast/.test(po), "PO creation still enforces the debt gate, no forecast bypass");
  for (const c of FORECAST_CONSUMERS) assert.ok(!/purchaseOrder(Item)?\.create\(|importDecisionSnapshot\.(update|delete)|(insert into|update|delete from) (public\.)?cfo_order_line/i.test(src(c.file)) || c.id === "import-snapshot" || c.decision !== "MIGRATE_V2",
    `${c.file}: migrated consumers must not create purchase orders or rewrite stored recommendations`);
  console.log(`Forecast consumers: ${FORECAST_CONSUMERS.length} audited call sites enforced; flag OFF = legacy; flag ON = FULL-grade V2 only; debt gate unaffected`);
}
main().then(() => process.exit(process.exitCode ?? 0)).catch(e => { console.error(e); process.exit(1); });

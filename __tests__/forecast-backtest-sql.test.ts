import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { cutoffSchedule, runBacktest } from "../lib/forecast/backtest";
import { compareRows, close, dataset, LAST, loadPglite } from "./forecast-fixture";
import { backtestSql, backtestSqlHash } from "../lib/forecast/backtest-sql";

// Parity: the production SQL port (lib/forecast/backtest-sql.ts) == the TypeScript reference (lib/forecast/backtest.ts) on a seeded
// synthetic dataset in PostgreSQL (PGlite), section by section: long benchmark, waterfall, stock-aware short benchmark (+ exclusions), today.
// The dataset exercises: duplicate legacy sources, 'İade-İptal' (Turkish İ) statuses, unmapped raw SKUs, a legacy business line,
// multiple channels, revenue ties, stock-outs, products without stock logs and manual potentials.
// Run with: node --import tsx __tests__/forecast-backtest-sql.test.ts
async function main() {
  const data = dataset();
  const longCutoffs = cutoffSchedule("2025-03-04", LAST, 14), shortCutoffs = cutoffSchedule("2026-06-16", LAST, 7), todayCutoff = "2026-10-06";
  const ts = runBacktest(data, { longCutoffs, shortCutoffs, todayCutoff, mode: "economic_time" });
  assert.ok(ts.meta.samples.long > 300 && ts.meta.samples.waterfall > 200 && ts.meta.samples.short > 20, JSON.stringify(ts.meta.samples));

  const pg = new PGlite();
  try {
    await loadPglite(pg, data);
    const sql = backtestSql({ longCutoffs, shortCutoffs, todayCutoff });
    compareRows("long", (await pg.query<Record<string, unknown>>(sql.long)).rows, ts.long);
    compareRows("waterfall", (await pg.query<Record<string, unknown>>(sql.waterfall)).rows, ts.waterfall);
    const short = (await pg.query<Record<string, unknown>>(sql.short)).rows;
    compareRows("short", short.filter(r => r.section === "short"), ts.short);
    const excl = JSON.parse(String(short.find(r => r.section === "short_exclusions")!.segment));
    assert.deepEqual(excl, { short: ts.meta.samples.short, short_no_stock_coverage: ts.meta.exclusions.short_no_stock_coverage,
      short_lt10_in_stock_days_training: ts.meta.exclusions.short_lt10_in_stock_days_training, short_target_lt10_in_stock_days: ts.meta.exclusions.short_target_lt10_in_stock_days });
    const today = (await pg.query<Record<string, unknown>>(sql.today)).rows;
    assert.equal(today.length, ts.today.length);
    for (const t of ts.today) {
      const r = today.find(x => x.layer === t.layer)!;
      close(r.n, t.n, `today ${t.layer} n`); close(r.sumForecast, t.sumForecast, `today ${t.layer} sum`); close(r.nManualKnown, t.nManualKnown, `today ${t.layer} manual`);
    }
    const meta = (await pg.query<{ meta: Record<string, unknown> }>(sql.meta)).rows[0].meta;
    assert.equal(meta.version, ts.meta.version);
    assert.equal((meta.long_universe as { observations: number }).observations, ts.meta.samples.long);

    // the dataset actually exercises the layers it claims to
    const all = (m: string) => ts.waterfall.find(r => r.model === m && r.dim === "all")!.sumForecast;
    assert.ok(all("L1_union_dedupe_gap") > all("L0_canonical_true30"), "duplicate source inflates");
    assert.ok(all("L2_union_status_filter_leak") > all("L1_union_dedupe_gap"), "'İade-İptal' leaks through ILIKE");
    assert.ok(ts.today.find(t => t.layer === "L5_manual_override_max")!.sumForecast >= ts.today.find(t => t.layer === "L4_max_blend_seasonal")!.sumForecast);
    assert.ok(ts.short.some(r => r.dim === "stock_state" && r.segment === "constrained_pre_cutoff"), "stock-outs present");
    assert.ok(["before_trendyol_api", "transition", "trendyol_api_full_window"].every(e => ts.waterfall.some(r => r.dim === "source_era" && r.segment === e)));
    assert.ok(ts.long.some(r => r.dim === "business_line" && r.segment === "legacy") && ts.long.some(r => r.dim === "lifecycle" && r.segment === "new_lt90d"));
    // reproducibility: rendered SQL is deterministic and validated
    assert.equal(backtestSqlHash({ longCutoffs, shortCutoffs, todayCutoff }), backtestSqlHash({ longCutoffs, shortCutoffs, todayCutoff }));
    assert.throws(() => backtestSql({ longCutoffs: ["2026-01-01'); drop table x; --"], shortCutoffs, todayCutoff }), /invalid_cutoff/);
    console.log(`Forecast backtest SQL parity: long ${ts.long.length}, waterfall ${ts.waterfall.length}, short ${ts.short.length} metric rows + exclusions + today levels identical to the TS reference`);
  } finally { await pg.close(); }
}
main().then(() => process.exit(process.exitCode ?? 0)).catch(e => { console.error(e); process.exit(1); });

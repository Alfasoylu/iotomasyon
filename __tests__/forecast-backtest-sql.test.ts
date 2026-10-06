import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { addDays } from "../lib/forecast/models";
import { cutoffSchedule, runBacktest, type BacktestData, type CanonicalRow, type MetricRow } from "../lib/forecast/backtest";
import { backtestSql, backtestSqlHash } from "../lib/forecast/backtest-sql";

// Parity: the production SQL port (lib/forecast/backtest-sql.ts) == the TypeScript reference (lib/forecast/backtest.ts) on a seeded
// synthetic dataset in PostgreSQL (PGlite), section by section: long benchmark, waterfall, stock-aware short benchmark (+ exclusions), today.
// The dataset exercises: duplicate legacy sources, 'İade-İptal' (Turkish İ) statuses, unmapped raw SKUs, a legacy business line,
// multiple channels, revenue ties, stock-outs, products without stock logs and manual potentials.
// Run with: node --import tsx __tests__/forecast-backtest-sql.test.ts
let seed = 20261006;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const norm = (s: string) => s.trim().toUpperCase();
const CHANNELS = ["TRENDYOL", "HEPSIBURADA", "N11", "AMAZON"];
const START = "2024-09-01", LAST = "2026-10-05";

function dataset() {
  const canonical: (CanonicalRow & { skuRaw: string })[] = [], union: BacktestData["union"] = [], stock: BacktestData["stock"] = [], manual: BacktestData["manual"] = [];
  const products = Array.from({ length: 14 }, (_, i) => ({ id: `p${String(i).padStart(2, "0")}`, raw: ` sku-${i} `, rate: [0.05, 0.2, 0.6, 1.5, 3][i % 5], legacy: i === 13,
    from: i === 7 ? "2026-07-20" : START, stockLog: i % 4 !== 3 }));
  const raws = [{ raw: "raw-x", rate: 0.3 }, { raw: "raw-y", rate: 0.1 }];
  for (let d = START; d <= LAST; d = addDays(d, 1)) {
    const season = 1 + 0.5 * Math.sin((Number(d.slice(5, 7)) / 12) * 2 * Math.PI);
    for (const p of products) {
      if (d < p.from) continue;
      const outOfStock = p.id === "p02" && d >= "2026-08-01" && d < "2026-08-20";
      for (const ch of CHANNELS) {
        if (rnd() > p.rate * season / CHANNELS.length * 1.6 || outOfStock) continue;
        const u = 1 + Math.floor(rnd() * 3), price = p.id === "p04" ? 100 : 50 + Math.floor(rnd() * 200);
        canonical.push({ key: `P:${p.id}`, productId: p.id, rawKey: `R:${norm(p.raw)}`, skuRaw: p.raw, channel: ch, day: d, units: u, revenue: u * price,
          legacy: p.legacy, knownAt: `${addDays(d, 1)}T06:00:00.000Z` });
        union.push({ productId: p.id, day: d, units: u, status: ch === "TRENDYOL" ? "Onaylandı" : null });
        if (ch === "TRENDYOL" && d >= "2026-05-04") union.push({ productId: p.id, day: d, units: u, status: "Delivered" }); // duplicate source
        if (rnd() < 0.05) union.push({ productId: p.id, day: d, units: 1, status: rnd() < 0.5 ? "İade-İptal" : "Cancelled" });
      }
    }
    for (const r of raws) if (rnd() < r.rate) canonical.push({ key: `R:${norm(r.raw)}`, productId: null, rawKey: `R:${norm(r.raw)}`, skuRaw: r.raw, channel: "N11", day: d,
      units: 1, revenue: 80, legacy: false, knownAt: `${addDays(d, 1)}T06:00:00.000Z` });
  }
  for (const p of products) {
    if (p.stockLog) {
      let level = 20;
      for (let d = "2026-05-17"; d <= LAST; d = addDays(d, 1)) {
        if (rnd() > 0.15 && !(p.id === "p02" && (d === "2026-08-01" || d === "2026-08-20"))) continue;
        const open = level; level = p.id === "p02" && d >= "2026-08-01" && d < "2026-08-20" ? 0 : Math.max(0, level - 1 - Math.floor(rnd() * 6) + (rnd() < 0.3 ? 15 : 0));
        stock.push({ productId: p.id, day: d, unitsOpen: open, unitsEod: level, knownAt: `${d}T23:00:00.000Z` });
      }
    }
    if (p.id !== "p05") manual.push({ productId: p.id, value: p.id === "p06" ? null : Math.floor(rnd() * 40), knownAt: "2026-10-06T09:00:00.000Z" });
  }
  return { canonical, union, stock, manual };
}

const close = (a: unknown, b: unknown, path: string) => {
  if (typeof a === "number" || typeof b === "number" || (typeof a === "string" && /^-?\d/.test(a))) {
    const x = Number(a), y = Number(b);
    assert.ok(Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y)), `${path}: sql ${a} vs ts ${b}`);
  } else assert.equal(a ?? null, b ?? null, path);
};
const FIELDS = ["n", "sumActual", "sumForecast", "sumAbsError", "mae", "wape", "bias", "overRate", "underRate", "catOverRate", "revWape", "revBias", "revN"] as const;
function compareRows(section: string, sqlRows: Record<string, unknown>[], ts: MetricRow[]) {
  const key = (r: Record<string, unknown> | MetricRow) => `${r.model}|${r.target}|${r.dim}|${r.segment}`;
  const tsMap = new Map(ts.map(r => [key(r), r]));
  assert.deepEqual(sqlRows.map(key).sort(), [...tsMap.keys()].sort(), `${section}: same groups`);
  for (const r of sqlRows) for (const f of FIELDS) close(r[f], tsMap.get(key(r))![f], `${section} ${key(r)} ${f}`);
}

async function main() {
  const data = dataset();
  const longCutoffs = cutoffSchedule("2025-03-04", LAST, 14), shortCutoffs = cutoffSchedule("2026-06-16", LAST, 7), todayCutoff = "2026-10-06";
  const ts = runBacktest(data, { longCutoffs, shortCutoffs, todayCutoff, mode: "economic_time" });
  assert.ok(ts.meta.samples.long > 300 && ts.meta.samples.waterfall > 200 && ts.meta.samples.short > 20, JSON.stringify(ts.meta.samples));

  const pg = new PGlite();
  try {
    await pg.exec(`create function public.cfo_norm(t text) returns text language sql immutable as 'select upper(trim(t))';
      create table public.fm_sales_canonical_snapshot (product_id text, sku_raw text, channel text, economic_date date, units_counted numeric,
        revenue_incl_vat_try numeric, legacy_business text, disposition text, known_at timestamp);
      create table public."MarketplaceSalesRecord" ("productId" text, "orderDate" timestamp, quantity int, status text);
      create table public."TrendyolSalesRecord" ("productId" text, "orderDate" timestamp, quantity int, status text);
      create table public."HepsiburadaSalesRecord" ("productId" text, "orderDate" timestamp, quantity int, status text);
      create table public.fm_stock_sku_day (product_id text, economic_date date, units_open int, units_eod int, known_at_max timestamp, primary key (product_id, economic_date));
      create table public."Product" (id text primary key, "onlineSalesPotential" int);
      create table public.fm_ingest_run (id text, kind text, started_at timestamp, finished_at timestamp, definition_version int);
      insert into public.fm_ingest_run values ('run-1', 'backfill', '2026-10-05', '2026-10-05', 1);`);
    for (const r of data.canonical) await pg.query(`insert into public.fm_sales_canonical_snapshot values ($1,$2,$3,$4,$5,$6,$7,'COUNTED',$8)`,
      [r.productId, (r as { skuRaw: string }).skuRaw, r.channel, r.day, r.units, r.revenue, r.legacy ? "TEXTILE_ARMINE" : null, r.knownAt]);
    // a non-counted row must be ignored
    await pg.query(`insert into public.fm_sales_canonical_snapshot values ('p01',' sku-1 ','TRENDYOL','2026-09-01',999,999,null,'DEDUP_DROPPED',now())`);
    // legacy sources: split the union across the three tables (Delivered duplicates → Trendyol API table)
    for (const [i, r] of data.union.entries()) {
      const table = r.status === "Delivered" ? "TrendyolSalesRecord" : i % 7 === 0 ? "HepsiburadaSalesRecord" : "MarketplaceSalesRecord";
      await pg.query(`insert into public."${table}" values ($1, $2::timestamp + interval '13 hours', $3, $4)`, [r.productId, r.day, r.units, r.status]);
    }
    await pg.query(`insert into public."MarketplaceSalesRecord" values (null, '2026-09-01', 50, null)`); // unmapped row: ignored like production
    for (const s of data.stock) await pg.query(`insert into public.fm_stock_sku_day values ($1,$2,$3,$4,$5)`, [s.productId, s.day, s.unitsOpen, s.unitsEod, s.knownAt]);
    for (const m of data.manual) await pg.query(`insert into public."Product" values ($1,$2)`, [m.productId, m.value]);

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

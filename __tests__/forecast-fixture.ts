import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { addDays } from "../lib/forecast/models";
import type { BacktestData, CanonicalRow, MetricRow } from "../lib/forecast/backtest";

// Shared seeded synthetic dataset + PGlite loader for the forecast SQL/TS parity tests (not a test file itself).
let seed = 20261006;
export const resetSeed = () => { seed = 20261006; };
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const norm = (s: string) => s.trim().toUpperCase();
const CHANNELS = ["TRENDYOL", "HEPSIBURADA", "N11", "AMAZON"];
export const START = "2024-09-01", LAST = "2026-10-05";

export function dataset() {
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

export const close = (a: unknown, b: unknown, path: string) => {
  if (typeof a === "number" || typeof b === "number" || (typeof a === "string" && /^-?\d/.test(a))) {
    const x = Number(a), y = Number(b);
    assert.ok(Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y)), `${path}: sql ${a} vs ts ${b}`);
  } else assert.equal(a ?? null, b ?? null, path);
};
export const FIELDS = ["n", "sumActual", "sumForecast", "sumAbsError", "mae", "wape", "bias", "overRate", "underRate", "catOverRate", "revWape", "revBias", "revN"] as const;
export function compareRows(section: string, sqlRows: Record<string, unknown>[], ts: (Record<string, unknown> | MetricRow)[], fields: readonly string[] = FIELDS) {
  const key = (r: Record<string, unknown> | MetricRow) => `${r.model}|${r.target}|${r.dim}|${r.segment}`;
  const tsMap = new Map(ts.map(r => [key(r), r as Record<string, unknown>]));
  assert.deepEqual(sqlRows.map(key).sort(), [...tsMap.keys()].sort(), `${section}: same groups`);
  for (const r of sqlRows) for (const f of fields) close(r[f], tsMap.get(key(r))![f], `${section} ${key(r)} ${f}`);
}

/** Creates the production-shaped tables in an empty PGlite and loads the dataset. */
export async function loadPglite(pg: PGlite, data: ReturnType<typeof dataset>) {
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

}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Step 1E — stock level chain → EOD memory (sparse + carry-forward company total); balance memory from cfo_snapshot v2 only.
const SQL = (n: string) => readFileSync(`prisma/migrations/${n}/migration.sql`, "utf8");
const db = new PGlite();
type Row = Record<string, unknown>;
const q = async (sql: string): Promise<Row[]> => (await db.query<Row>(sql)).rows;

async function main() {
  await db.exec(`create role cfo_acceptance_reader login nosuperuser nobypassrls; grant usage on schema public to cfo_acceptance_reader;
    create table "Product"(id text primary key, sku text);
    create table "XmlStockChangeLog"(id text primary key, "productId" text, "previousQty" int, "newQty" int, delta int, "syncedAt" timestamp);
    create table cfo_snapshot(id text primary key, "takenAt" timestamp, "netWorthTry" numeric, "cashTry" numeric, "receivablesTry" numeric, "stockTry" numeric, "debtTry" numeric);
    insert into "Product" values ('p1','SKU-1'),('p2','SKU-2'),('p3','SKU-3-NO-LOG');
    -- p1: 10→7 (05-17), 7→5 and 5→9 same day (05-19), p2 starts 20→18 on 05-19. p3 never logged.
    insert into "XmlStockChangeLog" values
      ('a','p1',10,7,-3,'2026-05-17 09:00'),('b','p1',7,5,-2,'2026-05-19 08:00'),('c','p1',5,9,4,'2026-05-19 18:00'),
      ('d','p2',20,18,-2,'2026-05-19 10:00');
    insert into cfo_snapshot values
      ('v1m','2026-09-10 08:00',554507.62,78333.54,1312994.91,13130432.65,5686820.83),   -- v1 morning
      ('v2e','2026-09-10 19:38',4176641.32,200868.60,1201162.85,13945575.36,9401290.49), -- v2 rebuilt the same evening (before policy start)
      ('x1','2026-09-11 07:00',1,1,1,1,1),('x2','2026-09-11 09:00',2534786.60,200868.60,1201162.85,13926652.64,9401290.49),
      ('y','2026-09-13 09:00',2625304.39,199924.05,1201162.85,14018114.98,9401290.49);`);
  await db.exec(SQL("20261005220000_fm_memory_schema"));
  await db.exec(SQL("20261005250000_fm_stock_balance"));
  await db.exec(SQL("20261005250000_fm_stock_balance")); // idempotent DDL

  // Stock: sparse EOD levels (last log of the day wins; opening = first previousQty of the day).
  assert.deepEqual(await q(`select * from fm_stock_refresh()`), [{ sku_day_rows: 3, company_day_rows: 3 }]);
  const sku = await q(`select product_id, economic_date::text d, units_eod, units_open, change_count from fm_stock_sku_day order by 1,2`);
  assert.deepEqual(sku, [
    { product_id: "p1", d: "2026-05-17", units_eod: 7, units_open: 10, change_count: 1 },
    { product_id: "p1", d: "2026-05-19", units_eod: 9, units_open: 7, change_count: 2 },
    { product_id: "p2", d: "2026-05-19", units_eod: 18, units_open: 20, change_count: 1 }]);
  // Company: 05-17 p1=7; 05-18 carry-forward p1=7; 05-19 p1=9+p2=18=27. p3 (never logged) excluded and flagged.
  const co = await q(`select economic_date::text d, units_total_logged::int u, products_logged p, products_changed c, flags from fm_stock_company_day order by 1`);
  assert.deepEqual(co.map(r => [r.d, r.u, r.p, r.c]), [["2026-05-17", 7, 1, 1], ["2026-05-18", 7, 1, 0], ["2026-05-19", 27, 2, 2]]);
  assert.deepEqual(co[0].flags, ["stock_unlogged_products_excluded"]);
  await q(`select * from fm_stock_refresh()`); // idempotent
  assert.equal((await q(`select count(*)::int n from fm_stock_sku_day`))[0].n, 3);
  assert.equal((await q(`select count(*)::int n from fm_stock_company_day`))[0].n, 3);
  assert.deepEqual((await q(`select inventory_units_grade g from fm_memory_stock_company_day order by economic_date`)).map(r => r.g), ["B", "B", "B"]);

  // Balance: v1 and the 09-10 evening rebuild are NOT ingested; one row per day (last snapshot), 5 metrics; gaps stay absent.
  assert.equal(Number((await q(`select fm_balance_refresh() n`))[0].n), 10);
  assert.equal(Number((await q(`select fm_balance_refresh() n`))[0].n), 10); // idempotent
  assert.equal((await q(`select count(*)::int n from fm_balance_day where economic_date < '2026-09-11'`))[0].n, 0);
  assert.deepEqual((await q(`select distinct economic_date::text d from fm_balance_day order by 1`)).map(r => r.d), ["2026-09-11", "2026-09-13"]);
  const nc = await q(`select economic_date::text d, value_try::float v, definition_version dv, grade from fm_memory_balance_day where metric_key='net_capital_try' order by 1`);
  assert.deepEqual(nc, [{ d: "2026-09-11", v: 2534786.6, dv: 2, grade: "C" }, { d: "2026-09-13", v: 2625304.39, dv: 2, grade: "C" }]);
  assert.equal((await q(`select count(*)::int n from fm_balance_day where economic_date='2026-09-12'`))[0].n, 0, "gap day is unknown, never carried forward");

  // Hardening: RLS on, reader SELECT-only, no PUBLIC execute on writers.
  for (const t of ["fm_stock_sku_day", "fm_stock_company_day", "fm_balance_day"]) {
    assert.equal((await q(`select relrowsecurity r from pg_class where oid='public.${t}'::regclass`))[0].r, true);
    assert.equal((await q(`select has_table_privilege('cfo_acceptance_reader','public.${t}','SELECT') p`))[0].p, true);
    for (const p of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]) assert.equal((await q(`select has_table_privilege('cfo_acceptance_reader','public.${t}','${p}') p`))[0].p, false);
  }
  assert.equal((await q(`select has_function_privilege('cfo_acceptance_reader','public.fm_balance_refresh(date)','EXECUTE') p`))[0].p, false);
  assert.equal((await q(`select has_function_privilege('cfo_acceptance_reader','public.fm_stock_refresh()','EXECUTE') p`))[0].p, false);
  // Raw sources untouched.
  assert.equal((await q(`select count(*)::int n from "XmlStockChangeLog"`))[0].n, 4);
  assert.equal((await q(`select count(*)::int n from cfo_snapshot`))[0].n, 5);
  console.log("FM stock + balance memory: EOD chain, carry-forward total, v2-only balances, gaps unknown, hardening passed");
}
main().catch(e => { console.error(e); process.exitCode = 1; });

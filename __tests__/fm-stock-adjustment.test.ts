import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Observed (XML chain) vs adjusted (chain + documented count adjustments) stock truth — never mixed.
const SQL = (n: string) => readFileSync(`prisma/migrations/${n}/migration.sql`, "utf8");
const db = new PGlite();
type Row = Record<string, unknown>;
const q = async (sql: string): Promise<Row[]> => (await db.query<Row>(sql)).rows;

async function main() {
  await db.exec(`create role cfo_acceptance_reader login nosuperuser nobypassrls; grant usage on schema public to cfo_acceptance_reader;
    create table "Product"(id text primary key, sku text, "stockQuantity" int);
    create table "XmlStockChangeLog"(id text primary key, "productId" text, "previousQty" int, "newQty" int, delta int, "syncedAt" timestamp);
    create table cfo_snapshot(id text primary key, "takenAt" timestamp, "netWorthTry" numeric, "cashTry" numeric, "receivablesTry" numeric, "stockTry" numeric, "debtTry" numeric);
    -- p1: chain ends 9; AL-CAM03-like count on 05-21 (9 → 12). p2: matches. p3: no chain. p4: chain 4 but Product 6, NO adjustment.
    insert into "Product" values ('p1','AL-CAM03',12),('p2','SKU-2',18),('p3','NOLOG',5),('p4','SKU-4',6);
    insert into "XmlStockChangeLog" values
      ('a','p1',10,7,-3,'2026-05-17 09:00'),('b','p1',7,9,2,'2026-05-19 08:00'),
      ('c','p2',20,18,-2,'2026-05-19 10:00'),('d','p2',18,19,1,'2026-05-22 10:00'),('e','p2',19,18,-1,'2026-05-23 10:00'),
      ('f','p4',5,4,-1,'2026-05-20 10:00');`);
  await db.exec(SQL("20261005220000_fm_memory_schema"));
  await db.exec(SQL("20261005250000_fm_stock_balance"));
  await db.exec(SQL("20261005280000_fm_stock_adjustment"));
  await db.exec(SQL("20261005280000_fm_stock_adjustment")); // idempotent
  await q(`select * from fm_stock_refresh()`);

  // The migration seeds the AL-CAM03 adjustment (documented provenance), exactly once.
  const seed = await q(`select adjustment_key, kind, units_before, units_after, delta, economic_date::text d, applied_at::text applied, xml_last_qty, resolution, counted_by, source from fm_stock_adjustment`);
  assert.deepEqual(seed, [{ adjustment_key: "AL-CAM03:2026-09-11:PHYSICAL_COUNT", kind: "PHYSICAL_COUNT", units_before: 1497, units_after: 1940, delta: 443, d: "2026-09-11", applied: "2026-09-12 05:11:25.17", xml_last_qty: 1497, resolution: "EXPLAINED", counted_by: "Alperen", source: "cfo_change_log" }]);

  // Test-scope adjustment on p1 (count 05-21, +3) to exercise the views with the fixture's dates.
  await db.exec(`insert into fm_stock_adjustment (adjustment_key, product_id, sku, economic_date, kind, units_before, units_after, applied_at, source, source_ref, resolution)
    values ('T:p1:05-21','p1','AL-CAM03', '2026-05-21','PHYSICAL_COUNT',9,12,'2026-05-22 06:00','test','t','EXPLAINED')`);
  await db.exec(`delete from fm_stock_adjustment where adjustment_key like 'AL-CAM03:%'`); // fixture isolation (test DB only)

  // Observed series is untouched by the adjustment; adjusted series adds it only from the count date, never backwards.
  const observed = await q(`select economic_date::text d, units_total_logged::int u from fm_memory_stock_company_day order by 1`);
  const adjusted = await q(`select economic_date::text d, units_observed_xml::int o, units_adjustments_cum::int a, units_adjusted::int u, flags from fm_memory_stock_adjusted_company_day order by 1`);
  const obsMap = Object.fromEntries(observed.map(r => [r.d, r.u]));
  for (const r of adjusted) assert.equal(r.o, obsMap[r.d as string], "observed sütunu gözlenen seriyle aynı");
  const byDate = Object.fromEntries(adjusted.map(r => [r.d, r]));
  assert.equal((byDate["2026-05-20"] as Row).a, 0); assert.equal((byDate["2026-05-20"] as Row).u, (byDate["2026-05-20"] as Row).o);
  assert.equal((byDate["2026-05-21"] as Row).a, 3); assert.equal((byDate["2026-05-21"] as Row).u, Number((byDate["2026-05-21"] as Row).o) + 3);
  assert.equal((byDate["2026-05-23"] as Row).a, 3);
  assert((byDate["2026-05-23"] as Row).flags && ((byDate["2026-05-23"] as Row).flags as string[]).includes("manual_count_adjustment"));
  assert(!((byDate["2026-05-20"] as Row).flags as string[]).includes("manual_count_adjustment"), "sayımdan önce bayrak/uygulama yok");

  // Reconciliation: explained vs unexplained are distinguished.
  const rec = Object.fromEntries((await q(`select product_id, status, unexplained_diff::int d, expected_qty::int e from fm_stock_reconciliation`)).map(r => [r.product_id, r]));
  assert.deepEqual(rec.p1, { product_id: "p1", status: "MATCH_AFTER_ADJUSTMENT", d: 0, e: 12 });
  assert.equal((rec.p2 as Row).status, "MATCH");
  assert.deepEqual(rec.p4, { product_id: "p4", status: "UNEXPLAINED", d: 2, e: 4 });
  assert.equal(rec.p3, undefined, "zinciri olmayan ürün mutabakata girmez (stock_unlogged_products_excluded)");

  // Constraints, flag dictionary, security.
  await assert.rejects(db.exec(`insert into fm_stock_adjustment (adjustment_key, product_id, economic_date, kind, units_before, units_after, applied_at, source, source_ref, resolution) values ('x','p1','2026-05-21','PHYSICAL_COUNT',1,2,'2026-05-20','s','r','EXPLAINED')`), "applied_at count tarihinden önce olamaz");
  assert.equal((await q(`select count(*)::int n from fm_quality_flag where flag='manual_count_adjustment'`))[0].n, 1);
  assert.equal((await q(`select relrowsecurity r from pg_class where oid='public.fm_stock_adjustment'::regclass`))[0].r, true);
  for (const p of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]) assert.equal((await q(`select has_table_privilege('cfo_acceptance_reader','public.fm_stock_adjustment','${p}') p`))[0].p, false);
  assert.equal((await q(`select has_table_privilege('cfo_acceptance_reader','public.fm_stock_reconciliation','SELECT') p`))[0].p, true);
  // Raw sources untouched.
  assert.equal((await q(`select count(*)::int n from "XmlStockChangeLog"`))[0].n, 6);
  assert.equal((await q(`select "stockQuantity" q from "Product" where id='p1'`))[0].q, 12);
  console.log("FM stock adjustment: observed vs adjusted separated, no backdating, reconciliation explained/unexplained, provenance seed, security passed");
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.close());

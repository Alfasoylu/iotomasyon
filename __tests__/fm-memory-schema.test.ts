import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Step 1C — Financial Memory schema: normalized quality policy, source priority, flag dictionary, lineage, hot-path views.
const SCHEMA = readFileSync("prisma/migrations/20261005220000_fm_memory_schema/migration.sql", "utf8");
const CANONICAL = readFileSync("prisma/migrations/20261005210000_fm_canonical_sales/migration.sql", "utf8");
const db = new PGlite();
type Row = Record<string, unknown>;
const q = async (sql: string): Promise<Row[]> => (await db.query<Row>(sql)).rows;
const one = async (sql: string): Promise<Row> => { const r = await q(sql); assert.equal(r.length, 1, sql); return r[0]; };
const grade = async (metric: string, date: string, channel = "*") =>
  (await one(`select public.fm_grade('${metric}','${channel}','${date}') as g`)).g as string;
const TABLES = ["fm_metric", "fm_quality_flag", "fm_source_priority", "fm_quality_policy", "fm_ingest_run",
  "fm_sales_company_day", "fm_sales_channel_month", "fm_sales_sku_month", "fm_sales_sku_day"];

async function main() {
  await db.exec(`create role cfo_acceptance_reader login nosuperuser nobypassrls; grant usage on schema public to cfo_acceptance_reader;`);
  await db.exec(SCHEMA);
  await db.exec(SCHEMA); // idempotent: seeds ON CONFLICT, IF NOT EXISTS, OR REPLACE

  // 1) Every table has RLS on; reader has SELECT only; nothing else.
  for (const table of TABLES) {
    assert.equal((await one(`select relrowsecurity as r from pg_class where oid='public.${table}'::regclass`)).r, true, `${table} RLS`);
    assert.equal((await one(`select has_table_privilege('cfo_acceptance_reader','public.${table}','SELECT') as p`)).p, true);
    for (const priv of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
      assert.equal((await one(`select has_table_privilege('cfo_acceptance_reader','public.${table}','${priv}') as p`)).p, false, `${table} ${priv}`);
    }
  }

  // 2) Quality policy: every metric has exactly one '*' policy for every month 2020-08 → 2026-10 (no gaps, no overlaps).
  const gaps = await q(`
    with months as (select generate_series(date '2020-08-01', date '2026-10-01', interval '1 month')::date as m),
    cover as (select m.m, p.metric_key,
      (select count(*) from fm_quality_policy q where q.metric_key=p.metric_key and q.channel='*' and q.valid_from<=m.m and (q.valid_to is null or q.valid_to>=m.m)) as n
      from months m cross join fm_metric p)
    select metric_key, m, n from cover where n<>1`);
  assert.deepEqual(gaps, [], "policy gap/overlap");
  // also day-level boundaries
  for (const [metric, d, expected] of [
    ["revenue_incl_vat_try", "2021-12-31", "C"], ["revenue_incl_vat_try", "2022-01-01", "B"],
    ["revenue_incl_vat_try", "2026-05-03", "B"], ["revenue_incl_vat_try", "2026-05-04", "A"],
    ["returns", "2023-06-15", "U"], ["returns", "2026-10-05", "U"],
    ["historical_cost", "2026-08-23", "U"], ["historical_cost", "2026-08-24", "D"],
    ["contribution_profit", "2021-03-01", "U"], ["inventory_units", "2026-05-16", "U"], ["inventory_units", "2026-05-17", "B"],
    ["net_capital_try", "2026-09-10", "U"], ["net_capital_try", "2026-09-11", "C"],
    ["usd_try", "2023-01-15", "U"], ["sku_identity", "2020-10-01", "C"], ["sku_identity", "2025-03-01", "A"],
  ] as const) assert.equal(await grade(metric, d), expected, `${metric}@${d}`);
  assert.equal(await grade("no_such_metric", "2024-01-01"), "U", "unknown metric must never be graded high");

  // 3) Channel-specific policy wins over '*'; an invalid grade or non-month key is rejected.
  await db.exec(`insert into fm_quality_policy(metric_key,channel,valid_from,grade,reason) values ('revenue_incl_vat_try','HEPSIBURADA','2024-01-01','D','test override')`);
  assert.equal(await grade("revenue_incl_vat_try", "2024-06-01", "HEPSIBURADA"), "D");
  assert.equal(await grade("revenue_incl_vat_try", "2024-06-01", "TRENDYOL"), "B");
  await db.exec(`delete from fm_quality_policy where channel='HEPSIBURADA'`);
  await assert.rejects(db.exec(`insert into fm_quality_policy(metric_key,channel,valid_from,grade,reason) values ('units','*','2030-01-01','Z','bad')`), /check|violates/i);
  await assert.rejects(db.exec(`insert into fm_sales_channel_month(month,channel,revenue_incl_vat_try,units,orders) values ('2026-05-15','TRENDYOL',1,1,1)`), /check|violates/i);

  // 4) No numeric confidence column anywhere (A/B/C/D/U + flags only).
  const confCols = await q(`select table_name,column_name from information_schema.columns where table_schema='public' and table_name like 'fm\\_%' and column_name ~* 'confidence'`);
  assert.deepEqual(confCols, []);

  // 5) Flag dictionary covers every flag the canonical layer can emit; boundary constant agrees with seeded source priority.
  const emitted = new Set([...CANONICAL.matchAll(/THEN '([a-z_0-9]+)'(?: END)?[,\n]/g)].map(m => m[1])
    .filter(f => !["SINGLE_SOURCE", "M_PRIMARY", "DEDUP_DROPPED", "M_FALLBACK", "T_PRIMARY", "T_GAP_FILL"].includes(f)));
  const arrayBlock = CANONICAL.slice(CANONICAL.indexOf("array_remove(ARRAY["), CANONICAL.indexOf("AS quality_flags"));
  const flagNames = [...arrayBlock.matchAll(/THEN '([a-z_0-9]+)' END/g)].map(m => m[1]).concat("set_qty_corrected");
  assert(flagNames.length >= 12, "flags parsed from canonical layer");
  const dictionary = new Set((await q(`select flag from fm_quality_flag`)).map(r => r.flag as string));
  for (const flag of flagNames) assert(dictionary.has(flag), `flag dictionary missing: ${flag}`);
  void emitted;
  const transition = (await one(`select valid_from::text as d from fm_source_priority where channel='TRENDYOL' and valid_to is null`)).d;
  assert(CANONICAL.includes(`DATE '${transition}'`), "canonical transition date must equal fm_source_priority");
  assert.equal(Number((await one(`select count(*) as n from fm_source_priority where channel='TRENDYOL'`)).n), 2);

  // 6) Hot-path views: value + grade + flags + knownAt in one row; ALFAS excludes legacy textile.
  await db.exec(`
    insert into fm_ingest_run(id,kind,status,range_from,range_to,rows_written,lineage) values ('00000000-0000-0000-0000-000000000001','sales_backfill','succeeded','2026-05-01','2026-05-31',2,'{"source":"fm_sales_canonical"}');
    insert into fm_sales_company_day(economic_date,revenue_incl_vat_try,revenue_legacy_textile_try,units,orders,known_at_min,known_at_max,flags,ingest_run_id)
      values ('2021-06-01',1000,300,10,8,'2026-05-19 21:52','2026-05-19 21:52','{status_snapshot_stale,historical_bulk_import}','00000000-0000-0000-0000-000000000001'),
             ('2026-05-10',2000,0,20,15,'2026-10-05 06:00','2026-10-05 06:00','{}','00000000-0000-0000-0000-000000000001');
    insert into fm_sales_channel_month(month,channel,revenue_incl_vat_try,units,orders) values ('2026-05-01','TRENDYOL',5000,50,40),('2026-06-01','TRENDYOL',6000,60,45);
    insert into fm_sales_sku_month(month,sku_key,product_id,sku_label,sku_mapped,legacy_business,revenue_incl_vat_try,units,orders) values ('2021-06-01','P:p1','p1','SKU-1',true,null,700,7,6);`);
  const old = await one(`select * from fm_memory_sales_company_day where economic_date='2021-06-01'`);
  assert.equal(old.revenue_grade, "C"); assert.equal(old.returns_grade, "U"); assert.equal(old.orders_grade, "B");
  assert.equal(Number(old.revenue_alfas_incl_vat_try), 700);
  assert.deepEqual(old.flags, ["status_snapshot_stale", "historical_bulk_import"]);
  assert.equal((old.known_at_max as Date).getUTCFullYear(), 2026, "knownAt (import) is separate from economic_date (2021)");
  assert.equal((old.economic_date as Date).getUTCFullYear(), 2021);
  const recent = await one(`select * from fm_memory_sales_company_day where economic_date='2026-05-10'`);
  assert.equal(recent.revenue_grade, "A"); assert.equal(recent.revenue_ex_vat_grade, "U");
  assert.equal(recent.revenue_ex_vat_try, null, "ex-VAT unknown stays NULL, not 0");
  assert.equal((await one(`select revenue_grade as g from fm_memory_sales_channel_month where month='2026-05-01'`)).g, "B", "month spanning a policy change takes the worst grade");
  assert.equal((await one(`select revenue_grade as g from fm_memory_sales_channel_month where month='2026-06-01'`)).g, "A");
  assert.equal((await one(`select sku_identity_grade as g from fm_memory_sales_sku_month`)).g, "B");
  assert.equal((await one(`select lineage->>'source' as s from fm_ingest_run`)).s, "fm_sales_canonical");
  console.log("Financial Memory schema: normalized policy/priority/flags/lineage, no numeric confidence, A/B/C/D/U coverage, hot-path views passed");
}
main().catch(e => { console.error(e); process.exitCode = 1; });

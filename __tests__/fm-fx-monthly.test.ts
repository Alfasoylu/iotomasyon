import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Step 1F — fm_fx_monthly schema, grade policy (A where TCMB loaded, U otherwise), reader hardening, idempotent policy update.
const SQL = (n: string) => readFileSync(`prisma/migrations/${n}/migration.sql`, "utf8");
const db = new PGlite();
type Row = Record<string, unknown>;
const q = async (sql: string): Promise<Row[]> => (await db.query<Row>(sql)).rows;
const grade = async (d: string) => (await q(`select public.fm_grade('usd_try','*','${d}') as g`))[0].g as string;

async function main() {
  await db.exec(`create role cfo_acceptance_reader login nosuperuser nobypassrls; grant usage on schema public to cfo_acceptance_reader;`);
  await db.exec(SQL("20261005220000_fm_memory_schema"));
  await db.exec(SQL("20261005240000_fm_fx_monthly"));
  await db.exec(SQL("20261005240000_fm_fx_monthly")); // idempotent

  assert.equal(await grade("2020-08-01"), "A"); assert.equal(await grade("2026-09-30"), "A");
  assert.equal(await grade("2026-10-01"), "U"); assert.equal(await grade("2020-07-31"), "U");
  const overlaps = await q(`select count(*)::int n from fm_quality_policy where metric_key='usd_try'`);
  assert.equal(overlaps[0].n, 2, "exactly the A range and the U tail");

  assert.equal((await q(`select relrowsecurity r from pg_class where oid='public.fm_fx_monthly'::regclass`))[0].r, true);
  assert.equal((await q(`select has_table_privilege('cfo_acceptance_reader','public.fm_fx_monthly','SELECT') p`))[0].p, true);
  for (const p of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
    assert.equal((await q(`select has_table_privilege('cfo_acceptance_reader','public.fm_fx_monthly','${p}') p`))[0].p, false);
  }

  // Constraints: positive rate, first-of-month key, reference date inside [month-1d, month+14d].
  await db.exec(`insert into fm_fx_monthly values ('2026-08-01', 47.7206, '2026-08-14', '2026/151', true, 'u', null)`);
  await assert.rejects(db.exec(`insert into fm_fx_monthly values ('2026-09-15', 40, '2026-09-15', 'x', false, 'u', null)`));
  await assert.rejects(db.exec(`insert into fm_fx_monthly values ('2026-09-01', 0, '2026-09-15', 'x', false, 'u', null)`));
  await assert.rejects(db.exec(`insert into fm_fx_monthly values ('2026-09-01', 40, '2026-10-20', 'x', false, 'u', null)`));

  // The view lists every month; months without a TCMB row stay NULL (no fallback) with their policy grade.
  const v = await q(`select month::text m, usd_try_forex_buying r, usd_try_grade g from fm_memory_fx_monthly where month in ('2026-08-01','2026-09-01') order by 1`);
  assert.equal(Number(v[0].r), 47.7206); assert.equal(v[0].g, "A");
  assert.equal(v[1].r, null, "missing month is NULL, never filled");
  console.log("FM FX monthly schema: grades, constraints, RLS, reader SELECT-only, no fallback passed");
}
main().catch(e => { console.error(e); process.exitCode = 1; });

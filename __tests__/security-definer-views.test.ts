import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// SECURITY DEFINER views: anon/authenticated denied; postgres/service_role/reader unchanged; future objects do not auto-open.
const MIGRATION = readFileSync("prisma/migrations/20261005290000_security_definer_views_lockdown/migration.sql", "utf8");
const db = new PGlite();
type Row = Record<string, unknown>;
const q = async (sql: string): Promise<Row[]> => (await db.query<Row>(sql)).rows;
const can = async (role: string, obj: string, priv = "SELECT") => (await q(`select has_table_privilege('${role}','${obj}','${priv}') p`))[0].p as boolean;
async function denied(role: string, sql: string) {
  await db.exec(`set role ${role}`);
  try { await db.exec(sql); assert.fail(`beklenen yetki hatası yok: ${role}: ${sql}`); }
  catch (e) { assert.match(String((e as Error).message), /permission denied/i); }
  finally { await db.exec("reset role"); }
}
const DEFINER = ["cfo_servet", "cfo_satis_siparis", "cfo_nakit_kapisi"];

async function main() {
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create role cfo_acceptance_reader login nosuperuser nobypassrls;
    grant usage on schema public to anon, authenticated, service_role, cfo_acceptance_reader;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
    create table cfo_snapshot(id int, net numeric); insert into cfo_snapshot values (1, 123456);
    alter table cfo_snapshot enable row level security;               -- deny-all for anon (no policy) — but definer views bypass it
    ${DEFINER.map(v => `create view ${v} as select * from cfo_snapshot;`).join("\n")}
    create view fm_memory_inv with (security_invoker = true) as select * from cfo_snapshot;
    grant select on ${DEFINER.join(", ")}, fm_memory_inv, cfo_snapshot to cfo_acceptance_reader;
  `);
  // BEFORE: the leak is real — anon reads financial data through a definer view despite table RLS.
  await db.exec("set role anon"); assert.equal((await db.query("select net from cfo_servet")).rows.length, 1, "öncesi: anon definer view'dan okuyabiliyor"); await db.exec("reset role");
  for (const v of DEFINER) assert.equal(await can("authenticated", v), true);

  await db.exec(MIGRATION); await db.exec(MIGRATION); // idempotent

  for (const v of DEFINER) {
    for (const role of ["anon", "authenticated"]) for (const p of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) assert.equal(await can(role, v, p), false, `${v} ${role} ${p} kapalı`);
    await denied("anon", `select * from ${v}`); await denied("authenticated", `select * from ${v}`);
    // application/service/reader roles unchanged
    assert.equal(await can("service_role", v), true, `${v} service_role korunur`);
    assert.equal(await can("cfo_acceptance_reader", v), true, `${v} reader korunur`);
    await db.exec("set role cfo_acceptance_reader"); assert.equal((await db.query(`select net from ${v}`)).rows.length, 1); await db.exec("reset role");
    await db.exec("set role service_role"); assert.equal((await db.query(`select net from ${v}`)).rows.length, 1); await db.exec("reset role");
    assert.equal((await db.query(`select net from ${v}`)).rows.length, 1, "owner/postgres (Prisma) okur");
  }
  // security_invoker views are untouched by the view loop (they were already RLS-safe).
  assert.equal(await can("service_role", "fm_memory_inv"), true);

  // Default privileges: objects created AFTER the migration do not auto-open to anon/authenticated; service_role keeps its default.
  await db.exec(`create table new_table(id int); create view new_view as select 1 as x; create sequence new_seq; create function new_fn() returns int language sql as $$ select 1 $$;`);
  for (const role of ["anon", "authenticated"]) {
    assert.equal(await can(role, "new_table"), false); assert.equal(await can(role, "new_view"), false);
    assert.doesNotMatch(String((await q(`select proacl::text a from pg_proc where proname='new_fn'`))[0].a), new RegExp(`${role}=`), `new_fn ${role} doğrudan grant almaz`);
    assert.equal((await q(`select has_sequence_privilege('${role}','new_seq','USAGE') p`))[0].p, false);
  }
  assert.equal(await can("service_role", "new_table"), true, "service_role varsayılanı korunur");
  assert.match(String((await q(`select proacl::text a from pg_proc where proname='new_fn'`))[0].a), /service_role=X/, "service_role fonksiyon varsayılanı korunur");
  // Prisma-style workflow still works for the owner: create → RLS on → write → read.
  await db.exec(`create table app_table(id serial primary key, v text); alter table app_table enable row level security; insert into app_table(v) values ('x');`);
  assert.equal((await db.query("select v from app_table")).rows.length, 1);

  // No-op on a database without the roles (CI / preview).
  const clean = new PGlite(); await clean.exec(`create view v1 as select 1 as x;`); await clean.exec(MIGRATION); await clean.close();
  console.log("Security definer views: anon/authenticated denied, postgres/service_role/reader unchanged, defaults closed for new objects, idempotent passed");
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.close());

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// anon/authenticated lockdown: 3 RLS-less tables + 5 write functions; app/service roles and the reader keep working.
const MIGRATION = readFileSync("prisma/migrations/20261005270000_security_anon_lockdown/migration.sql", "utf8");
const TABLES = ["cfo_xml_urun_degisim", "cfo_stok_sicrama", "cfo_backfill_trendyol_pid_20260922"];
const FUNCS = ["cfo_take_snapshot", "cfo_ay_kazanan_yaz", "cfo_kilometre_yaz", "cfo_sicrama_kapat", "cfo_stok_sicrama_kaydet"];
const db = new PGlite();
type Row = Record<string, unknown>;
const q = async (sql: string): Promise<Row[]> => (await db.query<Row>(sql)).rows;
async function denied(role: string, sql: string, why: string) {
  await db.exec(`set role ${role}`);
  try { await db.exec(sql); assert.fail(`beklenen yetki hatası yok: ${why}`); }
  catch (e) { assert.match(String((e as Error).message), /permission denied/i, why); }
  finally { await db.exec("reset role"); }
}

async function main() {
  // Supabase-like fixture: default privileges hand anon/authenticated/service_role everything (the cause of the exposure).
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create role cfo_acceptance_reader login nosuperuser nobypassrls; grant usage on schema public to anon, authenticated, service_role, cfo_acceptance_reader;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    create table cfo_snapshot(id int);
    ${TABLES.map(t => `create table ${t}(id int); insert into ${t} values (1);`).join("\n")}
    grant select on ${TABLES.join(", ")} to cfo_acceptance_reader;
    ${FUNCS.map((f, i) => `create function ${f}() returns void language sql as $$ insert into cfo_snapshot values (${i}) $$;`).join("\n")}
    create function cfo_nakit_projeksiyon() returns int language sql stable as $$ select 1 $$;
  `);
  // BEFORE: the exposure is real.
  for (const t of TABLES) {
    assert.equal((await q(`select has_table_privilege('anon','${t}','INSERT') p`))[0].p, true, `${t} anon yazabiliyor (öncesi)`);
    assert.equal((await q(`select relrowsecurity r from pg_class where oid='${t}'::regclass`))[0].r, false);
  }
  for (const f of FUNCS) assert.equal((await q(`select has_function_privilege('anon','${f}()','EXECUTE') p`))[0].p, true);

  await db.exec(MIGRATION); await db.exec(MIGRATION); // idempotent

  for (const t of TABLES) {
    assert.equal((await q(`select relrowsecurity r from pg_class where oid='${t}'::regclass`))[0].r, true, `${t} RLS açık`);
    for (const role of ["anon", "authenticated"]) {
      for (const priv of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
        assert.equal((await q(`select has_table_privilege('${role}','${t}','${priv}') p`))[0].p, false, `${t} ${role} ${priv} kapalı`);
      }
    }
    await denied("anon", `select * from ${t}`, `${t} anon SELECT`);
    await denied("authenticated", `insert into ${t} values (2)`, `${t} authenticated INSERT`);
    await denied("anon", `delete from ${t}`, `${t} anon DELETE`);
    // reader keeps SELECT (policy), app/service roles unaffected
    await db.exec("set role cfo_acceptance_reader");
    assert.equal((await db.query(`select id from ${t}`)).rows.length, 1, `${t} reader SELECT korunur`);
    await db.exec("reset role");
    assert.equal((await q(`select has_table_privilege('service_role','${t}','INSERT') p`))[0].p, true, "service_role yetkisi korunur");
    await db.exec("set role service_role"); await db.exec(`insert into ${t} values (3)`); await db.exec("reset role");
    await db.exec(`insert into ${t} values (4)`); // owner/postgres
  }
  for (const f of FUNCS) {
    for (const role of ["anon", "authenticated"]) assert.equal((await q(`select has_function_privilege('${role}','${f}()','EXECUTE') p`))[0].p, false, `${f} ${role} EXECUTE kapalı`);
    assert.equal((await q(`select has_function_privilege('service_role','${f}()','EXECUTE') p`))[0].p, true, `${f} service_role korunur`);
    await denied("anon", `select ${f}()`, `${f} anon`);
    await db.exec("set role service_role"); await db.exec(`select ${f}()`); await db.exec("reset role");
  }
  // Read-only helpers are untouched.
  assert.equal((await q(`select has_function_privilege('anon','cfo_nakit_projeksiyon()','EXECUTE') p`))[0].p, true);

  // No-op when the objects/roles do not exist (clean / preview database).
  const clean = new PGlite(); await clean.exec(MIGRATION); await clean.close();
  console.log("Security anon lockdown: RLS on, anon/authenticated closed, reader+service roles preserved, idempotent, no-op on clean DB passed");
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.close());

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

async function main() {
  const sql = readFileSync("scripts/ai-cfo-reader-rls.sql", "utf8");
  const db = new PGlite();
  const count = async (query: string) => (await db.query<{ n: number }>(query)).rows[0].n;
  try {
    await db.exec(`create role cfo_acceptance_reader login noinherit;
      create role app_reader;
      create table "Product"(id int); insert into "Product" values(1),(2);
      create table cfo_bank_account(id int); insert into cfo_bank_account values(1);
      create table cfo_ungranted(id int); insert into cfo_ungranted values(1);
      create table cfo_run(id int); insert into cfo_run values(1);
      create table pdks_private(id int); insert into pdks_private values(1);
      alter table "Product" enable row level security;
      alter table cfo_bank_account enable row level security;
      alter table cfo_ungranted enable row level security;
      alter table cfo_run enable row level security;
      alter table pdks_private enable row level security;
      grant usage on schema public to cfo_acceptance_reader,app_reader;
      grant select on "Product",cfo_bank_account,cfo_run,pdks_private to cfo_acceptance_reader;
      grant select on "Product" to app_reader;
      create policy app_existing on "Product" for select to app_reader using (id=1);`);
    await db.exec("set role cfo_acceptance_reader");
    assert.equal(await count('select count(*)::int n from "Product"'), 0);
    await db.exec("reset role");
    await db.exec(sql);
    await db.exec(sql);
    assert.equal(await count("select count(*)::int n from pg_policies where policyname='cfo_acceptance_reader_select'"), 2);
    await db.exec("set role cfo_acceptance_reader");
    assert.equal(await count('select count(*)::int n from "Product"'), 2);
    assert.equal(await count("select count(*)::int n from cfo_bank_account"), 1);
    await assert.rejects(() => db.exec('update "Product" set id=9'), /permission denied/i);
    console.log("PASS reader sees granted business rows; repeat setup is idempotent; writes remain denied");
    assert.equal(await count("select count(*)::int n from cfo_run"), 0);
    assert.equal(await count("select count(*)::int n from pdks_private"), 0);
    await db.exec("reset role; set role app_reader");
    assert.equal(await count('select count(*)::int n from "Product"'), 1);
    await db.exec("reset role");
    assert.equal(await count("select count(*)::int n from pg_policies where tablename='cfo_ungranted'"), 0);
    console.log("PASS existing role policy, ungranted sources, PDKS and agent stores unchanged");
    await db.exec("alter role cfo_acceptance_reader createrole");
    await assert.rejects(() => db.exec(sql), /Guvenli cfo_acceptance_reader/);
    await db.exec("rollback; alter role cfo_acceptance_reader nocreaterole");
    console.log("PASS unsafe reader role refused");
    await db.exec(`drop policy cfo_acceptance_reader_select on "Product";
      drop policy cfo_acceptance_reader_select on cfo_bank_account;
      create policy cfo_acceptance_reader_select on cfo_bank_account for select to app_reader using (true)`);
    await assert.rejects(() => db.exec(sql), /Ayni adli farkli politika/);
    await db.exec("rollback");
    assert.equal(await count("select count(*)::int n from pg_policies where tablename='Product' and policyname='cfo_acceptance_reader_select'"), 0);
    console.log("PASS policy-name conflict refused with complete rollback");
    await db.exec("drop policy cfo_acceptance_reader_select on cfo_bank_account; grant update on cfo_bank_account to cfo_acceptance_reader");
    await assert.rejects(() => db.exec(sql), /Reader yazma yetkisi/);
    await db.exec("rollback");
    assert.equal(await count("select count(*)::int n from pg_policies where policyname='cfo_acceptance_reader_select'"), 0);
    console.log("PASS accidental business write privilege blocks setup atomically");
  } finally { await db.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

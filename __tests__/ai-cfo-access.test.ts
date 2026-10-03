import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { cfoReaderOptions, checkCfoReaderAccess, cfoAccessFailure } from "../lib/cfo-agent/access-check";
import type { ReadSource, Row } from "../lib/cfo-agent/sources";

async function main() {
  assert.throws(() => cfoReaderOptions(undefined), /secret_missing/);
  assert.throws(() => cfoReaderOptions("postgresql://postgres:example@db.example.com:5432/postgres"), /session_pooler_required/);
  const prefix = "postgresql://cfo_acceptance_reader.abcdefghijklmnopqrst:";
  const suffix = "@aws-1-eu-north-1.pooler.supabase.com:5432/postgres";
  assert.throws(() => cfoReaderOptions(prefix + "BURAYA_YENI_SIFREN" + suffix), /password_placeholder/);
  assert.deepEqual(cfoReaderOptions(prefix + "fictional-fixture" + suffix + "?sslmode=disable").ssl, { rejectUnauthorized: true });
  assert.equal(cfoAccessFailure({ code: "28P01", message: "sensitive driver text" }), "authentication_failed");
  assert.equal(cfoAccessFailure({ message: "sensitive driver text" }), "connection_check_failed");
  console.log("OK credential placeholders/master role refused; TLS cannot be disabled; driver messages never escape");
  const pg = new PGlite();
  const db: ReadSource = { async query<T extends Row>(sql: string, ...params: unknown[]) {
    return (await pg.query(sql, params)).rows as T[];
  } };
  try {
    await pg.exec(`create role cfo_acceptance_reader login;
      create table public."Product" (id int); insert into public."Product" values(1);
      grant usage on schema public to cfo_acceptance_reader;
      grant select on public."Product" to cfo_acceptance_reader;
      set role cfo_acceptance_reader; set default_transaction_read_only=on;`);
    const result = await checkCfoReaderAccess(db);
    assert.equal(result.transactionReadOnly, true); assert.equal(result.productRowsVisible, true);
    assert.equal(result.sources.find(row => row.source === "Product")?.columns[0].name, "id");
    assert(result.missingOrUnreadable.includes("cfo_satis_birim_duz"));
    console.log("OK real PostgreSQL reader reports missing sources and completes READ ONLY / ROLLBACK");
    await pg.exec("set default_transaction_read_only=off; reset role;");
    await pg.exec(`create view cfo_satis_birim_duz as select id as adet_duz, id as tutar_duz from "Product";
      grant select on cfo_satis_birim_duz to cfo_acceptance_reader;
      set role cfo_acceptance_reader; set default_transaction_read_only=on;`);
    const audited = await checkCfoReaderAccess(db);
    assert.equal(audited.canonicalDefinitions.length, 1);
    assert.equal(audited.canonicalDefinitions[0].source, "cfo_satis_birim_duz");
    assert.match(String(audited.canonicalDefinitions[0].definition), /adet_duz/);
    assert.match(String(audited.canonicalDefinitions[0].definition), /tutar_duz/);
    console.log("OK canonical view catalog audit is bounded and completes READ ONLY / ROLLBACK");
    await pg.exec("set default_transaction_read_only=off; reset role;");
    await pg.exec(`alter table public."Product" enable row level security;
      set role cfo_acceptance_reader; set default_transaction_read_only=on;`);
    assert.equal((await checkCfoReaderAccess(db)).productRowsVisible, false);
    console.log("OK RLS-hidden rows are reported, never presented as verified financial data");
    await pg.exec("set default_transaction_read_only=off; reset role;");
    await pg.exec(`grant update on public."Product" to cfo_acceptance_reader;
      set role cfo_acceptance_reader; set default_transaction_read_only=on;`);
    await assert.rejects(() => checkCfoReaderAccess(db), /business_write_privileges_present/);
    console.log("OK accidental business write grant blocks access check");
    await pg.exec("set default_transaction_read_only=off");
    await assert.rejects(() => checkCfoReaderAccess(db), /reader_default_not_read_only/);
    console.log("OK incorrect read-only default blocks access check");
  } finally { await pg.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });

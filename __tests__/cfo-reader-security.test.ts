import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { checkCfoReaderAccess, CfoAccessError, CFO_WRITE_FUNCTIONS } from "../lib/cfo-agent/access-check";
import type { ReadSource, Row } from "../lib/cfo-agent/sources";

// Step 1A — reader hardening, executed against a real PostgreSQL engine (PGlite).
const MIGRATION = readFileSync("prisma/migrations/20261005200000_cfo_reader_security/migration.sql", "utf8");
const NEW_TABLES = ["TrendyolReturnRecord", "HepsiburadaReturnRecord", "trendyol_settlement_line", "trendyol_invoice",
  "trendyol_invoice_line", "trendyol_finance_import", "MonthlyExchangeRate", "StockAdjustmentLog", "SupplierProduct",
  "EntegraImportLog", "MarketplaceProductMapping"];

const db = new PGlite();
const asReader: ReadSource = { async query<T extends Row>(sql: string, ...params: unknown[]): Promise<T[]> {
  return (await db.query<T>(sql, params as unknown[])).rows;
} };

// PGlite does not apply role-level GUCs on SET ROLE, so emulate the login-time default.
async function asReaderSession() { await db.exec("SET ROLE cfo_acceptance_reader; SET default_transaction_read_only = on"); }
async function endReaderSession() { await db.exec("RESET default_transaction_read_only; RESET ROLE"); }

// Privilege checks run WITHOUT the read-only default on purpose: the denial must come from
// missing privileges, not from the (session-revocable) read-only setting.
async function expectDenied(sql: string, why: string) {
  await db.exec("SET ROLE cfo_acceptance_reader");
  try { await db.exec(sql); assert.fail(`beklenen yetki hatası yok: ${why}`); }
  catch (error) { assert.match(String((error as Error).message), /permission denied/i, why); }
  finally { await db.exec("RESET ROLE"); }
}

async function main() {
  // Static guarantees on the migration text itself.
  assert(!/GRANT\s+(?!SELECT\b)[A-Z]/i.test(MIGRATION.replace(/--.*$/gm, "")), "migration reader'a SELECT dışında GRANT vermemeli");
  assert(!/\bTO\s+(anon|authenticated|public)\b/i.test(MIGRATION.replace(/--.*$/gm, "")), "anon/authenticated/public'e yetki yok");
  for (const table of NEW_TABLES) assert(MIGRATION.includes(`'${table}'`), `migration ${table} içermeli`);
  for (const fn of CFO_WRITE_FUNCTIONS) assert(MIGRATION.includes(`'${fn}'`), `migration ${fn} içermeli`);

  // Fixture reproducing the production state found in Phase 0B.
  await db.exec(`
    create role cfo_acceptance_reader login nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
    alter role cfo_acceptance_reader set default_transaction_read_only = on;
    grant usage on schema public to cfo_acceptance_reader;
    create table cfo_secret(key text primary key, value text, scope text);
    insert into cfo_secret values ('svc','sentinel-secret-value','x');
    alter table cfo_secret enable row level security;
    grant select on cfo_secret to cfo_acceptance_reader;
    create policy cfo_acceptance_reader_select on cfo_secret for select to cfo_acceptance_reader using (true);
    create table "Product"(sku text);
    alter table "Product" enable row level security;
    grant select on "Product" to cfo_acceptance_reader;
    create policy cfo_acceptance_reader_select on "Product" for select to cfo_acceptance_reader using (true);
    insert into "Product" values ('SKU-1');
    create table cfo_snapshot(id int);
    create function cfo_take_snapshot() returns void language sql as $$ insert into cfo_snapshot values (1) $$;
    create function cfo_ay_kazanan_yaz() returns void language sql as $$ insert into cfo_snapshot values (2) $$;
    create function cfo_kilometre_yaz() returns void language sql as $$ insert into cfo_snapshot values (3) $$;
    create function cfo_sicrama_kapat() returns void language sql as $$ insert into cfo_snapshot values (4) $$;
    create function cfo_stok_sicrama_kaydet() returns void language sql as $$ insert into cfo_snapshot values (5) $$;
    create function cfo_nakit_projeksiyon() returns int language sql stable as $$ select 1 $$;
  `);
  for (const table of NEW_TABLES) await db.exec(`create table "${table}"(id int); insert into "${table}" values (1); alter table "${table}" enable row level security;`);

  // BEFORE: the access check must flag the secret exposure.
  await asReaderSession();
  await assert.rejects(checkCfoReaderAccess(asReader), (e: unknown) => e instanceof CfoAccessError && e.code === "reader_secret_access_present");
  assert.equal((await db.query("select value from cfo_secret")).rows.length, 1, "fixture: önce sır okunabiliyor");
  await endReaderSession();

  // Apply the migration twice (idempotent).
  await db.exec(MIGRATION);
  await db.exec(MIGRATION);

  // AFTER: secrets unreadable by every path, the 11 data tables readable, nothing writable.
  await expectDenied("select value from cfo_secret", "cfo_secret SELECT kapalı");
  await expectDenied("select key from cfo_secret", "cfo_secret kolon SELECT kapalı");
  for (const table of NEW_TABLES) {
    await asReaderSession();
    assert.equal((await db.query(`select id from "${table}"`)).rows.length, 1, `${table} okunabilmeli (RLS policy dahil)`);
    await endReaderSession();
    await expectDenied(`insert into "${table}" values (2)`, `${table} INSERT kapalı`);
    await expectDenied(`update "${table}" set id = 9`, `${table} UPDATE kapalı`);
    await expectDenied(`delete from "${table}"`, `${table} DELETE kapalı`);
    await expectDenied(`truncate "${table}"`, `${table} TRUNCATE kapalı`);
  }
  await expectDenied("create table reader_made(x int)", "reader tablo oluşturamaz");
  for (const fn of CFO_WRITE_FUNCTIONS) await expectDenied(`select ${fn}()`, `${fn} EXECUTE kapalı`);
  assert.equal((await db.query("select count(*)::int as n from cfo_snapshot")).rows[0] && (await db.query<{ n: number }>("select count(*)::int as n from cfo_snapshot")).rows[0].n, 0, "yazan fonksiyon hiç çalışmadı");
  await asReaderSession();
  assert.equal((await db.query<{ v: number }>("select cfo_nakit_projeksiyon() as v")).rows[0].v, 1, "okuyan fonksiyon çalışmaya devam eder");
  assert.equal((await db.query("select sku from \"Product\"")).rows.length, 1, "mevcut Product erişimi korunur");
  const result = await checkCfoReaderAccess(asReader);
  await endReaderSession();
  assert.equal(result.readerRoleVerified, true);
  assert.equal(result.transactionReadOnly, true);

  // Production parity: the reader policy is kept but closed (USING false) — never dropped — and nothing grants the reader a path.
  const pol = (await db.query<{ qual: string; n: number }>(`select max(qual) as qual, count(*)::int as n from pg_policies where tablename = 'cfo_secret'`)).rows[0];
  assert.deepEqual(pol, { qual: "false", n: 1 }, "cfo_secret policy USING (false) olarak korunur (DROP edilmez)");
  assert.equal((await db.query<{ p: boolean }>(`select has_table_privilege('cfo_acceptance_reader','public.cfo_secret','SELECT') as p`)).rows[0].p, false);

  // Application-like roles (postgres / service_role are BYPASSRLS + privileged) are unaffected by the policy change.
  await db.exec(`create role app_like nologin bypassrls; grant select, insert on cfo_secret to app_like;`);
  await db.exec(`set role app_like`);
  assert.equal((await db.query("select value from cfo_secret")).rows.length, 1, "BYPASSRLS uygulama rolü sırrı okuyabilir");
  await db.exec(`reset role`);

  // The owner (production app) keeps full access to the secret table.
  assert.equal((await db.query("select value from cfo_secret")).rows.length, 1, "uygulama/owner sır erişimi bozulmadı");

  // Migration is a no-op when the role does not exist (CI / preview databases).
  const clean = new PGlite();
  await clean.exec(MIGRATION);
  await clean.close();
  console.log("CFO reader security: secret closed, 11 SELECT-only tables, write functions revoked, idempotent, no-op without role passed");
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.close());

import assert from "node:assert/strict";
import { constants, createDecipheriv, generateKeyPairSync, privateDecrypt } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { collectCfoAdapterAudit } from "../lib/cfo-agent/adapter-audit";
import { encryptCfoDiagnostic, writeCfoDiagnostic } from "../lib/cfo-agent/diagnostic-report";
import type { ReadSource, Row } from "../lib/cfo-agent/sources";

async function main() {
  const pair = generateKeyPairSync("rsa", { modulusLength: 3072, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
  const plain = { amount: 123.45, definition: "private fixture definition" };
  const encrypted = encryptCfoDiagnostic(plain, pair.publicKey);
  const decrypt = (value: typeof encrypted) => {
    const key = privateDecrypt({ key: pair.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(value.wrappedKey, "base64"));
    const cipher = createDecipheriv("aes-256-gcm", key, Buffer.from(value.iv, "base64"));
    cipher.setAAD(Buffer.from(value.aad, "base64")); cipher.setAuthTag(Buffer.from(value.tag, "base64"));
    return JSON.parse(Buffer.concat([cipher.update(Buffer.from(value.ciphertext, "base64")), cipher.final()]).toString("utf8"));
  };
  assert.deepEqual(decrypt(encrypted), plain);
  assert(!JSON.stringify(encrypted).includes(plain.definition));
  assert(!JSON.stringify(encrypted).includes("123.45"));
  assert.notEqual(encrypted.ciphertext, encryptCfoDiagnostic(plain, pair.publicKey).ciphertext);
  console.log("OK RSA-OAEP/AES-GCM recipient-only roundtrip; values absent; fresh nonces");
  assert.throws(() => decrypt({ ...encrypted, tag: Buffer.alloc(16).toString("base64") }));
  assert.throws(() => decrypt({ ...encrypted, aad: Buffer.from("altered").toString("base64") }));
  console.log("OK authentication rejects modified ciphertext metadata");
  const weak = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
  assert.throws(() => encryptCfoDiagnostic(plain, weak.publicKey), /diagnostic_recipient_key_invalid/);
  assert.throws(() => encryptCfoDiagnostic("x".repeat(2_000_001), pair.publicKey), /diagnostic_report_too_large/);
  console.log("OK weak recipient and oversized report refused");
  const dir = await mkdtemp(join(tmpdir(), "cfo-audit-test-"));
  try {
    const output = join(dir, "report.enc.json"), recipient = join(dir, "public.pem");
    await writeFile(recipient, pair.publicKey);
    await assert.rejects(() => writeCfoDiagnostic(output, plain, { CI: "true" }), /diagnostic_recipient_required_in_ci/);
    await writeCfoDiagnostic(output, plain, { CI: "true", AI_CFO_DIAGNOSTIC_PUBLIC_KEY_FILE: recipient });
    assert.deepEqual(decrypt(JSON.parse(await readFile(output, "utf8"))), plain);
    assert.equal((await stat(output)).mode & 0o777, 0o600);
    await assert.rejects(() => writeCfoDiagnostic(output, plain, {}), /EEXIST/);
    console.log("OK CI fail-closed, encrypted 0600 report, existing file never overwritten");
  } finally { await rm(dir, { recursive: true, force: true }); }
  const pg = new PGlite(), queries: string[] = [];
  const db: ReadSource = { async query<T extends Row>(sql: string, ...params: unknown[]) {
    queries.push(sql); return (await pg.query<T>(sql, params)).rows;
  } };
  try {
    await pg.exec(`create table cfo_kargo_tarife (pazaryeri text,alt_sinir numeric,ust_sinir numeric,tarife numeric);
      insert into cfo_kargo_tarife select 'FIXTURE',i,i+1,1 from generate_series(1,501)i;
      create table cfo_set_bilesen_maliyet (grup text,model text,maliyet_try_kdv_dahil numeric);
      insert into cfo_set_bilesen_maliyet values('disk','fixture',null);
      create table cfo_set_fiyat (sku text,kar numeric);
      insert into cfo_set_fiyat values('SET-fixture',null);
      create table "Product" (sku text,"mainProductId" text,"stockQuantity" integer,"unitCostTry" numeric,"isActive" boolean,"productKind" text);
      insert into "Product" values('SET-fixture','parent',999,null,true,'LISTING_PACKAGE');
      create table forbidden_mutations(id integer);
      create function cfo_nakit_projeksiyon(integer) returns numeric language plpgsql volatile as $$begin insert into forbidden_mutations values(1); return 1; end;$$;`);
    const report = await collectCfoAdapterAudit(db);
    const tariff = report.configuration.cfo_kargo_tarife as { count: number; truncated: boolean; rows: Row[] };
    assert.equal(tariff.count, 501); assert.equal(tariff.rows.length, 500); assert.equal(tariff.truncated, true);
    assert.equal((report.configuration.cfo_set_bilesen_maliyet as { rows: Row[] }).rows[0].maliyet_try_kdv_dahil, null);
    assert.equal(report.functions[0].volatility, "v");
    assert.equal((await pg.query<{ count: number }>("select count(*)::int as count from forbidden_mutations")).rows[0].count, 0);
    assert(queries.includes("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")); assert.equal(queries.at(-1), "ROLLBACK");
    assert(queries.every(q => !/from\s+(?:public\.)?"?(?:MarketplaceSalesRecord|TrendyolSalesRecord|Customer)\b/i.test(q)));
    console.log("OK bounded config/catalog audit; unknown cost preserved; no functions executed or raw orders queried");
    await pg.exec(`create role fixture_audit_reader; grant usage on schema public to fixture_audit_reader;
      grant select on "Product",cfo_kargo_tarife to fixture_audit_reader;
      set role fixture_audit_reader; set default_transaction_read_only=on;`);
    const limited = await collectCfoAdapterAudit(db);
    assert.deepEqual(limited.configuration.cfo_set_bilesen_maliyet, { unavailable: true });
    assert.deepEqual(limited.migrations, { unavailable: true });
    console.log("OK unreadable config and migration history explicitly unavailable, never guessed");
  } finally { await pg.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

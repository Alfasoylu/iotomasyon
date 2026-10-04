import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import type { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import { toDateOnlyTr, toDecimalTr, hazirlaBankaDosyasi } from "../lib/banka/parse";
import { validateBalance } from "../lib/banka/balance";
import { writeBalance } from "../lib/banka/write-balance";
import { signPreview, verifyPreview } from "../lib/banka/confirmation";
import { insertSql } from "../lib/banka/sql";

async function main() {
  assert.equal(toDateOnlyTr("31/02/2026"), null);
  assert.equal(toDateOnlyTr("29/02/2024")?.toISOString().slice(0, 10), "2024-02-29");
  for (const junk of ["12oops", "1,2,3", "1.23.456,00", "Infinity"]) assert.equal(toDecimalTr(junk), null);
  assert.equal(toDecimalTr("1,234.56"), 1234.56);
  assert.equal(toDecimalTr("1.234"), 1234);
  assert.equal(toDecimalTr("0"), 0);
  assert.equal(toDecimalTr("-1.234,56"), -1234.56);
  const now = new Date("2026-10-04T10:00:00Z");
  const base = { id: "example", balance: "-123,45", asOf: "2026-09-30T10:00:00Z", expectedUpdatedAt: "2026-10-03T10:00:00Z", confirmed: true };
  const input = validateBalance(base, now);
  assert.equal(input.asOf.toISOString(), "2026-09-30T10:00:00.000Z");
  assert.equal(input.amount, -123.45);
  assert.throws(() => validateBalance({ ...base, balance: "100abc" }, now));
  assert.throws(() => validateBalance({ ...base, confirmed: false }, now));
  assert.throws(() => validateBalance({ ...base, asOf: "2026-10-05T10:00:00Z" }, now));
  process.env.SESSION_SECRET = "synthetic-test-key-that-never-reaches-production";
  const token = signPreview("user-a", "file-bank-mapping", now.getTime());
  assert(verifyPreview(token, "user-a", "file-bank-mapping", now.getTime()));
  assert(!verifyPreview(token, "user-b", "file-bank-mapping", now.getTime()));
  assert(!verifyPreview(token, "user-a", "changed", now.getTime()));
  assert(!verifyPreview(token, "user-a", "file-bank-mapping", now.getTime() + 16 * 60_000));
  assert(!verifyPreview("invalid", "user-a", "file-bank-mapping", now.getTime()));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Tarih", "Açıklama", "Tutar", "Bakiye"],
    ["04/10/2026", "Örnek", "1.234,56", "1.400,00"],
    ["03/10/2026", "Örnek 2", "-100,00", "165,44"],
    ["31/02/2026", "Geçersiz", "20", "20"],
    [new Date("2026-10-04T00:00:00Z"), "Excel tarih hücresi", 12.5, 100.5],
  ]), "Hareketler");
  const parsed = hazirlaBankaDosyasi(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  assert.equal(parsed.satirlar.length, 3);
  assert.equal(parsed.satirlar[2].tarih.toISOString().slice(0, 10), "2026-10-04");
  assert.equal(parsed.satirlar[2].tutarTry, 12.5);
  assert.equal(parsed.satirlar[0].tutarTry, 1234.56);
  assert.equal(parsed.atlanan.length, 1);

  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE accounts (id text primary key, name text, active boolean, balance numeric, updated timestamptz, asof timestamptz);
      CREATE TABLE audit (oldvalue text, newvalue text CHECK(newvalue != '999'), source text);
      INSERT INTO accounts VALUES ('example','Örnek hesap',true,50,'2026-10-03T10:00:00Z','2026-09-01T10:00:00Z');
      CREATE TABLE cfo_banka_hareket (banka text, hesap text, tarih date, valor date, aciklama text, tutar_try numeric, bakiye_try numeric, karsi_taraf text, ref_no text, kaynak_dosya text, import_id bigint, satir_hash text unique);`);
    const bridge = { $transaction: async (fn: (tx: unknown) => Promise<unknown>) => db.transaction(async pg => fn({
      cfoBankAccount: {
        findUnique: async ({where}: {where:{id:string}}) => {
          const row = (await pg.query<{name:string;active:boolean;balance:string}>("SELECT name, active, balance FROM accounts WHERE id=$1", [where.id])).rows[0];
          return row && {name:row.name,isActive:row.active,balanceTry:row.balance};
        },
        updateMany: async ({where,data}: {where:{id:string;updatedAt:Date};data:{balanceTry:number;lastUpdatedAt:Date}}) => {
          const rows = await pg.query("UPDATE accounts SET balance=$1, asof=$2, updated='2026-10-04T10:00:00Z' WHERE id=$3 AND active AND updated=$4 RETURNING id", [data.balanceTry,data.lastUpdatedAt,where.id,where.updatedAt]);
          return {count:rows.rows.length};
        },
      },
      cfoChangeLog: { create: async ({data}: {data:{oldValue:string;newValue:string;source:string}}) => pg.query("INSERT INTO audit VALUES ($1,$2,$3)", [data.oldValue,data.newValue,data.source]) },
    })) } as unknown as Pick<PrismaClient, "$transaction">;
    assert.equal(await writeBalance(bridge, input, "synthetic@example.test"), true);
    const current = (await db.query<{balance:string;asof:Date}>("SELECT balance, asof FROM accounts")).rows[0];
    assert.equal(Number(current.balance), -123.45);
    assert.equal(new Date(current.asof).toISOString(), input.asOf.toISOString());
    assert.equal(await writeBalance(bridge, input, "synthetic@example.test"), false, "stale preview cannot overwrite a newer update");
    assert.equal((await db.query("SELECT * FROM audit")).rows.length, 1);
    const rejected = {...input, amount:999, expectedUpdatedAt:"2026-10-04T10:00:00Z"};
    await assert.rejects(() => writeBalance(bridge, rejected, "synthetic@example.test"));
    assert.equal(Number((await db.query<{balance:string}>("SELECT balance FROM accounts")).rows[0].balance), -123.45, "audit failure rolls back balance");
    const values = [["Örnek"],[null],["2026-10-04"],[null],["Örnek hareket"],[25],[75],[null],[null],["example.csv"],[null],["synthetic-hash"]];
    await db.query(insertSql(), values);
    await db.query(insertSql(), values);
    assert.equal((await db.query("SELECT * FROM cfo_banka_hareket")).rows.length, 1, "same statement row is not inserted twice");
    console.log("Bank safety: dates, money, XLSX, confirmation, stale balances, concurrency, atomic audit and duplicate inserts passed");
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

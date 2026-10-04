import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import type { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import { toDateOnlyTr, toDecimalTr, hazirlaBankaDosyasi } from "../lib/banka/parse";
import { validateBalance } from "../lib/banka/balance";
import { writeBalance } from "../lib/banka/write-balance";
import { signPreview, verifyPreview } from "../lib/banka/confirmation";
import { statementBalance } from "../lib/banka/statement-balance";
import { kayitlaraDonustur, filterAlreadyStored } from "../lib/banka/records";
import { assertTryCurrency } from "../lib/banka/currency";
import { readBankFile } from "../lib/banka/file";
import { insertSql, INSERT_COLS } from "../lib/banka/sql";

async function main() {
  assert.equal(toDateOnlyTr("31/02/2026"), null);
  assert.equal(toDateOnlyTr("29/02/2024")?.toISOString().slice(0, 10), "2024-02-29");
  for (const junk of ["12oops", "1,2,3", "1.23.456,00", "Infinity"]) assert.equal(toDecimalTr(junk), null);
  assert.equal(toDecimalTr("1,234.56"), 1234.56);
  assert.equal(toDecimalTr("1.234"), 1234);
  assert.equal(toDecimalTr("0"), 0);
  assert.equal(toDecimalTr("-1.234,56"), -1234.56);
  const statementRows = [{tarihIso:"2026-09-01",bakiyeTry:100},{tarihIso:"2026-09-03",bakiyeTry:300}];
  assert.deepEqual(statementBalance(statementRows), {date:"2026-09-03",balance:300});
  assert.deepEqual(statementBalance([...statementRows].reverse()), {date:"2026-09-03",balance:300});
  assert.deepEqual(statementBalance([...statementRows,{tarihIso:"2026-09-03",bakiyeTry:400}]), {date:"2026-09-03",balance:null});
  assert.deepEqual(statementBalance([...statementRows,{tarihIso:"2026-09-04",bakiyeTry:null}]), {date:"2026-09-04",balance:null});
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

  assert.equal(toDecimalTr("- 3.000,00 TL"), -3000);
  assert.throws(() => assertTryCurrency(["Hesap Numarası USD"]), /USD/);
  assert.throws(() => assertTryCurrency([], "Example EUR", "Current"), /EUR/);
  assert.throws(() => assertTryCurrency([], "Example", "Vadesiz DÖVİZ"), /Döviz/);
  const fx = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(fx, XLSX.utils.aoa_to_sheet([
    ["Hesap Numarası", "Example USD"], ["Tarih","Açıklama","İşlem Tutarı","Bakiye"],
    ["04/10/2026","Synthetic transfer",10,20],
  ]), "Hareketler");
  await assert.rejects(() => readBankFile(XLSX.write(fx,{type:"buffer",bookType:"xlsx"}),"fx.xlsx"), /USD/);
  const tl = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(tl, XLSX.utils.aoa_to_sheet([
    ["Tarih","Açıklama","İşlem Tutarı (TL)","Bakiye (TL)"],
    ["04/10/2026","Synthetic transfer",10,20],
  ]), "Hareketler");
  assert.equal((await readBankFile(XLSX.write(tl,{type:"buffer",bookType:"xlsx"}),"tl.xlsx")).satirlar.length,1);

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
    // Missing legacy PDF rows changed daily ordinals; preserve the original stored identities.
    const currentRows = Array.from({length:250},(_,i) => ({tarih:new Date("2026-10-04T00:00:00Z"),valor:null,
      aciklama:`Synthetic description ${i}`,tutarTry:i+1,bakiyeTry:i+100,karsiTaraf:null,refNo:null,hesap:null,dosyaSatiri:i+1}));
    const legacyRows = currentRows.filter((_,i)=>i%2===0 || i===1 || i===3 || i===5).map(row=>({...row,aciklama:`Old truncated ${row.dosyaSatiri}`}));
    const oldRecords = kayitlaraDonustur(legacyRows,"Synthetic recovery","synthetic.pdf");
    const corrected = kayitlaraDonustur(currentRows,"Synthetic recovery","synthetic.pdf",legacyRows);
    const insert = async (rows: typeof corrected) => {
      if(rows.length) await db.query(insertSql(),INSERT_COLS.map(c=>rows.map(row=>c.al({...row,importId:null}))));
    };
    await insert(oldRecords);
    const hashes = new Set(oldRecords.map(row=>row.satirHash));
    assert.equal(filterAlreadyStored(corrected,hashes).length,122);
    await insert(filterAlreadyStored(corrected,hashes));
    const stored = (await db.query<{satir_hash:string}>("SELECT satir_hash FROM cfo_banka_hareket WHERE banka='Synthetic recovery'")).rows;
    assert.equal(stored.length,250);
    assert.equal(filterAlreadyStored(corrected,new Set(stored.map(row=>row.satir_hash))).length,0);
    const altered = kayitlaraDonustur([{...currentRows[0],tutarTry:999}],"Synthetic recovery","synthetic.pdf",legacyRows);
    assert.equal(altered[0].legacyHash,undefined,"changed money must never be hidden by a legacy identity");
    console.log("Bank safety: dates, money, XLSX, confirmation, stale balances, concurrency, atomic audit and duplicate inserts passed");
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

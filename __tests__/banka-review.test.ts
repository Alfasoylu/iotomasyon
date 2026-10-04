import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { bankReview, type BankReviewSource } from "../lib/banka/review";

async function main() {
  const db = new PGlite();
  const source: BankReviewSource = { query: async (sql, ...params) => (await db.query(sql, params)).rows as never };
  try {
    await db.exec(`CREATE TABLE cfo_bank_account(id text, name text, "accountType" text, "balanceTry" numeric, "lastUpdatedAt" timestamptz, "isActive" boolean, "sortOrder" int);
      CREATE TABLE cfo_change_log(id text, "changedAt" timestamptz, area text, kind text, item text, "newValue" text, note text);
      INSERT INTO cfo_bank_account VALUES
      ('a','Example A','Current',50,now(),true,0),
      ('b','Example B','Current',60,now()-interval '8 days',true,1),
      ('c','Example C','Current',NULL,now(),true,2),
      ('d','Example D','Current',70,now()+interval '2 days',true,3),
      ('e','Example E','Current',80,NULL,true,4),
      ('inactive','Inactive','Current',100,now(),false,5);
      INSERT INTO cfo_change_log VALUES
      ('one',now(),'banka','aksiyon','Banka dosyası: Example A','2 hareket eklendi; 1 mükerrer; 3 okunamadı','PRIVATE_FILENAME'),
      ('two',now(),'banka','aksiyon','Banka dosyası: Example B','1 hareket eklendi; 0 mükerrer; 0 okunamadı','OTHER_PRIVATE_FILENAME');`);
    const missing = await bankReview(source);
    assert.equal(missing.statementsAvailable,false);
    assert.equal(missing.summary.activeAccounts,5);
    assert.equal(missing.summary.freshBalances,1);
    assert.equal(missing.summary.balancesNeedingReview,4);
    assert.equal(missing.summary.unreadableRowsAcrossUploads,3);
    assert.equal(missing.summary.uploadedBanks,2);
    assert.equal(missing.banks.find(b=>b.bank==='Example D')?.freshness,'future_timestamp');
    assert.equal(missing.banks.find(b=>b.bank==='Example E')?.freshness,'timestamp_unknown');
    assert(!JSON.stringify(missing).includes('PRIVATE_FILENAME'));
    await db.exec(`CREATE TABLE cfo_banka_hareket(banka text, tarih date, satir_hash text, aciklama text);
      INSERT INTO cfo_banka_hareket VALUES
      ('Example A',current_date,'duplicate','PRIVATE_TRANSACTION'),
      ('Example A',current_date,'duplicate','PRIVATE_TRANSACTION'),
      ('Example A',current_date,NULL,'PRIVATE_TRANSACTION'),
      ('Unmapped',current_date+2,'future','PRIVATE_TRANSACTION');`);
    const report = await db.transaction(async tx => {
      await tx.exec('SET TRANSACTION READ ONLY');
      const readonly: BankReviewSource = { query: async (sql,...params) => (await tx.query(sql,params)).rows as never };
      return bankReview(readonly);
    });
    assert.equal(report.banks[0].movements?.rows,3);
    assert.equal(report.banks[0].movements?.duplicateHashes,1);
    assert.equal(report.banks[0].movements?.missingHashes,1);
    assert.equal(report.statementsWithoutActiveAccount[0].futureRows,1);
    assert(!JSON.stringify(report).includes('PRIVATE_TRANSACTION'));
    await db.exec(`INSERT INTO cfo_change_log VALUES ('unknown',now(),'banka','aksiyon','Banka dosyası: Example A','unknown format',NULL);
      INSERT INTO cfo_bank_account VALUES ('duplicate','Example A','Current',0,now(),true,0);`);
    const unknown = await bankReview(source);
    assert.equal(unknown.summary.unreadableRowsAcrossUploads,null);
    assert.equal(unknown.banks.filter(b=>b.bank==='Example A').every(b=>b.ambiguousName),true);
    await db.exec(`INSERT INTO cfo_bank_account VALUES ('fx','Example USD','Vadesiz DÖVİZ',100,now(),true,9);
      INSERT INTO cfo_banka_hareket VALUES ('Example USD',current_date,'fx-native','PRIVATE_TRANSACTION');`);
    const fxReport = await bankReview(source);
    assert.equal(fxReport.currencyReviewRequired[0].currency,'USD');
    assert.equal(fxReport.banks.find(b=>b.bank==='Example USD')?.movementTryUsable,false);
    assert.equal(fxReport.currencyReviewRequired[0].rows,1);
    console.log('Bank review: actual SQL, read-only transaction, import counts, freshness/unknown/future dates, duplicate/missing hashes, unmapped banks and privacy passed');
  } finally { await db.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});

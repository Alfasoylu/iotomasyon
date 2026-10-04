import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { cfoAcceptanceReconciliation } from "../lib/cfo-agent/acceptance-reconciliation";
import type { CfoAgentSnapshot } from "../lib/cfo-agent/types";
import type { ReadSource, Row } from "../lib/cfo-agent/sources";

const db = new PGlite();
const source: ReadSource = { async query<T extends Row>(sql: string, ...params: unknown[]): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
} };
async function main() {
  await db.exec(`
    create table cfo_satis_birim_duz(channel text,"modelNumber" text,"orderNumber" text,"orderDate" timestamptz,adet_duz numeric,guven text);
    create table cfo_stok_hareket_hiz(sku text,adet30 numeric,gunluk_30g_ihtiyatli numeric,tukenme_gun_ihtiyatli numeric,hizlanma_katsayi numeric);
    create table "Product"(sku text,"stockQuantity" int,"isActive" boolean);
    create table cfo_bank_account("balanceTry" numeric,"lastUpdatedAt" timestamptz,"isActive" boolean);
    insert into cfo_satis_birim_duz values
      ('TRENDYOL','MD-3003B1','private-old','2026-09-03T12:00:00Z',2,'KESIN'),
      ('TRENDYOL','MD-3003B1','private-boundary','2026-09-03T21:00:00Z',3,'KESIN'),
      ('TRENDYOL','MD-3003B1','private-today','2026-10-04T00:00:00Z',100,'KESIN'),
      ('N11','MD-3003B1','private-mixed','2026-10-02T00:00:00Z',9,'KARMA'),
      ('AMAZON','MD-3003B1','private-duplicate','2026-10-02T00:00:00Z',7,'KESIN'),
      ('AMAZON','MD-3003B1','private-duplicate','2026-10-02T00:00:00Z',7,'KESIN');
    insert into cfo_stok_hareket_hiz values ('MD-3003B1',12,0.4,25,1.2),('ANUNNAKI-POINTER',4,0.2,50,1);
    insert into "Product" values ('MD-3003B1',10,true),('ANUNNAKI-POINTER',10,true);
    insert into cfo_bank_account values (100,'2026-10-02T00:00:00Z',true),(200,'2026-09-01T00:00:00Z',true),(null,null,true);
  `);
  const metric = (value: number | null) => ({ value, estimated: true, basis: "gross_incl_vat" as const });
  const snapshot = { generatedAt: "2026-10-04T09:00:00Z", sales: { last30Days: { complete: false } },
    dataQuality: { missingFields: ["cfo_set_bilesen_maliyet.set_sku"] },
    products: [{ sku: "MD-3003B1", channel: "TRENDYOL", salesUnits30: metric(3), xmlUnits30: metric(12),
      xmlVelocity: metric(0.4), salesVelocity: metric(null), velocity: metric(0.4), stockDays: metric(25), stockQty: 10 },
    { sku: "ANUNNAKI-POINTER", channel: "INVENTORY", salesUnits30: metric(null), xmlUnits30: metric(4),
      xmlVelocity: metric(0.2), salesVelocity: metric(null), velocity: metric(0.2), stockDays: metric(50), stockQty: 10 }]
  } as unknown as CfoAgentSnapshot;
  const report = await cfoAcceptanceReconciliation(source, snapshot);
  const md = report.signals[0];
  assert.equal(md.alignment.salesUnits30.status, "match");
  assert.equal(md.demand.selectedSource, "xml_only_sales_incomplete");
  assert.equal(md.alignment.xmlVelocity.status, "match");
  assert.equal(Number(report.canonicalWindows.find(r => r.period === "previous_day30" && r.channel === "TRENDYOL")?.native_units), 5);
  assert.equal(Number(report.canonicalWindows.find(r => r.period === "current30" && r.channel === "TRENDYOL")?.native_units), 3);
  assert.equal(report.bankFreshness?.stale_accounts, 1);
  assert.equal(report.bankFreshness?.missing_balances, 1);
  assert.equal(report.bankFreshness?.missing_timestamps, 1);
  assert.equal(report.setComponentSchemaMissing, true);
  assert.equal(report.productionApproval, false);
  assert(!JSON.stringify(report).includes("private-"));
  assert(!JSON.stringify(report).includes("orderNumber"));
  await db.exec(`alter table cfo_satis_birim_duz alter column "orderDate" type timestamp without time zone using "orderDate" at time zone 'UTC';
    insert into cfo_stok_hareket_hiz values ('MD-3003B1',99,9,1,1);`);
  const changed = await cfoAcceptanceReconciliation(source, snapshot);
  assert.equal(changed.signals[0].alignment.salesUnits30.status, "match");
  assert.equal(changed.signals[0].alignment.xmlVelocity.status, "unknown");
  assert.equal(changed.signals[0].nativeVelocityRows, 2);
  await db.exec(`delete from cfo_stok_hareket_hiz where sku='MD-3003B1' and adet30=99;
    update "Product" set "stockQuantity"=11 where sku='MD-3003B1';`);
  const difference = await cfoAcceptanceReconciliation(source, snapshot);
  assert.equal(difference.signals[0].alignment.stockQty.status, "difference");
  console.log("CFO reconciliation: period boundaries, trust/duplicates, XML fallback, bank freshness, privacy and source drift passed");
}
main().catch(() => { console.error("CFO reconciliation regression failed"); process.exitCode = 1; }).finally(() => db.close());

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Step 1D — month-chunked, resumable, idempotent backfill: canonical → financial memory, with reconciliation.
const read = (name: string) => readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8");
const db = new PGlite();
type Row = Record<string, unknown>;
const q = async (sql: string): Promise<Row[]> => (await db.query<Row>(sql)).rows;
const one = async (sql: string): Promise<Row> => { const r = await q(sql); assert.equal(r.length, 1, sql); return r[0]; };
const num = (v: unknown) => Number(v);
let mSeq = 0, tSeq = 0;
const M = (channel: string, orderNumber: string, date: string, sku: string, qty: number, amount: number, status = "Onaylandı",
  o: { name?: string; customer?: string; imported?: string; pid?: string } = {}) =>
  `insert into "MarketplaceSalesRecord"(id,channel,"orderNumber","externalLineId","orderDate",status,"modelNumber","productName","productId",quantity,"totalAmountTry","grossAmountTry","customerInvoiceName","importedAt")
   values ('m${++mSeq}','${channel}','${orderNumber}','L${mSeq}','${date}','${status}','${sku}','${o.name ?? "Urun"}',${o.pid ? `'${o.pid}'` : "null"},${qty},${amount},${amount / 1.2},${o.customer ? `'${o.customer}'` : "null"},'${o.imported ?? "2026-05-19T21:52:00"}');`;
const T = (orderId: string, lineId: number, date: string, status: string, amount: number, sku = "A") =>
  `insert into "TrendyolSalesRecord"(id,"orderId","lineId","orderDate",status,"merchantSku","productId","productName",quantity,"totalPriceTry","syncedAt")
   values ('t${++tSeq}','${orderId}',${lineId},'${date}','${status}','${sku}','p-${sku}','Urun',1,${amount},'2026-10-05T06:00:00');`;
const RUN = "00000000-0000-0000-0000-0000000000a1";
const TODAY = "2026-10-05";

async function main() {
  await db.exec(`
    create table "Product"(id text primary key, sku text, name text);
    insert into "Product" values ('p-A','A','Urun A'),('p-B','B','Urun B');
    create table "MarketplaceSalesRecord"(id text primary key, channel text, "orderNumber" text, "platformRef" text, "externalLineId" text, "orderDate" timestamp, status text,
      "modelNumber" text, "productName" text, "productId" text, quantity int, "totalAmountTry" numeric, "grossAmountTry" numeric, "vatAmountTry" numeric,
      "customerInvoiceName" text, "importedAt" timestamp);
    create table "TrendyolSalesRecord"(id text primary key, "orderId" text, "lineId" bigint, "orderDate" timestamp, status text, "merchantSku" text, "productId" text,
      "productName" text, quantity int, "totalPriceTry" numeric, "syncedAt" timestamp);
  `);
  await db.exec([
    M("TRENDYOL", "9001-9001", "2021-05-01", "OLD", 1, 120, "Yeni Siparis"),                       // very old: sku_day must NOT be written
    M("TRENDYOL", "1001-5001", "2026-01-10", "A", 1, 100, "Onaylandı", { pid: "p-A" }),
    M("TRENDYOL", "1011-5011", "2026-01-12", "22YT523", 1, 200, "Onaylandı", { name: "Armine Kadın Tunik" }),
    M("TRENDYOL", "1013-6001", "2026-03-05", "B", 1, 800, "Onaylandı", { pid: "p-B" }),
    M("TRENDYOL", "1013-6002", "2026-03-06", "B", 1, 800, "Onaylandı", { pid: "p-B" }),
    M("TRENDYOL", "1013-6003", "2026-03-07", "B", 1, 800, "Onaylandı", { pid: "p-B" }),
    M("TRENDYOL", "1013-6004", "2026-03-08", "B", 4, 250, "Onaylandı", { pid: "p-B" }),             // package: units corrected
    M("TRENDYOL", "1012-5012", "2026-03-20", "A", 1, 0, "İade-İptal", { pid: "p-A" }),             // return signal
    M("IDEASOFT", "ID-1", "2026-04-01", "B", 1, 500, "Yeni Siparis", { pid: "p-B" }),
    M("IDEASOFT", "ID-2", "2026-04-02", "B", 2, 2, "Yeni Siparis", { customer: "test" }),
    M("TRENDYOL", "1005-5005", "2026-05-11", "A", 1, 100, "Onaylandı", { pid: "p-A" }),             // replaced by T
    M("HEPSIBURADA", "HB-1", "2026-05-20", "B", 1, 300, "Onaylandı", { pid: "p-B" }),
    T("7001", 1, "2026-02-12T10:00:00", "Delivered", 80),                                          // Feb gap fill
    T("5005", 1, "2026-05-11T10:00:00", "Delivered", 60), T("5005", 2, "2026-05-11T10:00:00", "Delivered", 40),
    T("7003", 1, "2026-05-15T10:00:00", "Cancelled", 90),                                          // cancel signal
  ].join("\n"));
  await db.exec(read("20261005210000_fm_canonical_sales"));
  await db.exec(read("20261005220000_fm_memory_schema"));
  await db.exec(read("20261005230000_fm_sales_backfill"));
  await db.exec(read("20261005230000_fm_sales_backfill")); // idempotent migration

  await db.exec(`insert into fm_ingest_run(id,kind,status,range_from,range_to) values ('${RUN}','sales_backfill','running','2020-08-01','2026-10-01')`);
  const staged = num((await one(`select fm_backfill_sales_snapshot('${RUN}') as n`)).n);
  assert.equal(staged, num((await one(`select count(*) as n from fm_sales_canonical`)).n), "snapshot = canonical rows");

  // Dry run: reports, writes nothing.
  const dry = (await one(`select fm_backfill_sales_run('${RUN}','2026-01-01','2026-03-01',12,true,'${TODAY}') as r`)).r as { processed: number; chunks: Array<{ revenue_incl_vat_try: number }> };
  assert.equal(dry.processed, 3);
  assert.equal(num((await one(`select count(*) as n from fm_sales_company_day`)).n), 0, "dry run must not write");
  assert.equal(num((await one(`select count(*) as n from fm_ingest_chunk`)).n), 0);

  // Resumable: 2 chunks per call over 2020-08 → 2026-10 (75 months) until finished; completed chunks are skipped.
  let calls = 0, finished = false, totalProcessed = 0;
  while (!finished) {
    const r = (await one(`select fm_backfill_sales_run('${RUN}','2020-08-01','2026-10-01',30,false,'${TODAY}') as r`)).r as { finished: boolean; processed: number; failed: unknown };
    assert.equal(r.failed, null);
    finished = r.finished; totalProcessed += r.processed; calls++;
    assert(calls < 10);
  }
  assert.equal(totalProcessed, 75, "75 monthly chunks 2020-08 → 2026-10");
  const again = (await one(`select fm_backfill_sales_run('${RUN}','2020-08-01','2026-10-01',30,false,'${TODAY}') as r`)).r as { processed: number; skipped_done: number };
  assert.equal(again.processed, 0); assert.equal(again.skipped_done, 75, "re-run skips completed chunks");

  // Reconciliation: snapshot ↔ memory, every month, all grains.
  const recon = await q(`select * from fm_sales_memory_reconciliation_monthly where backfilled order by month`);
  assert(recon.length >= 6);
  for (const r of recon) {
    assert.equal(num(r.diff_company_day), 0, `company_day ${r.month}`); assert.equal(num(r.diff_channel_month), 0, `channel_month ${r.month}`);
    assert.equal(num(r.diff_sku_month), 0, `sku_month ${r.month}`); assert.equal(num(r.diff_units), 0, `units ${r.month}`);
  }
  const total = await one(`select (select sum(revenue_incl_vat_try) from fm_sales_company_day) as cd, (select sum(revenue_incl_vat_try) from fm_sales_canonical) as canon,
                                  (select sum(revenue_incl_vat_try) from fm_sales_channel_month) as cm, (select sum(revenue_incl_vat_try) from fm_sales_sku_month) as sm`);
  assert.equal(num(total.cd), num(total.canon)); assert.equal(num(total.cm), num(total.canon)); assert.equal(num(total.sm), num(total.canon));
  // hand check: M 120+100+200+800*3+250+500+300 = 3870 ; T 80 + 100(5005) = 180 ; no cancelled/returned/test/dup => 4050
  assert.equal(num(total.canon), 4050);

  // Semantics per grain.
  const feb = await one(`select * from fm_sales_company_day where economic_date='2026-02-12'`);
  assert.equal(num(feb.revenue_incl_vat_try), 80); assert.deepEqual(feb.flags, ["ex_vat_unknown", "gap_filled_secondary"]);
  assert.equal(feb.revenue_ex_vat_try, null, "Trendyol API has no ex-VAT: NULL, never 0");
  const jan = await one(`select * from fm_sales_company_day where economic_date='2026-01-10'`);
  assert.equal(num(jan.revenue_ex_vat_try), 100 / 1.2 > 0 ? Number((100 / 1.2).toFixed(2)) : 0);
  const textile = await one(`select revenue_legacy_textile_try as l, revenue_incl_vat_try as r from fm_sales_company_day where economic_date='2026-01-12'`);
  assert.equal(num(textile.l), 200); assert.equal(num(textile.r), 200);
  assert.equal(num((await one(`select return_signal_orders as n from fm_sales_company_day where economic_date='2026-03-20'`)).n), 1, "marketplace İade-İptal is a SIGNAL, not a 0 return");
  assert.equal(num((await one(`select cancel_signal_orders as n from fm_sales_company_day where economic_date='2026-05-15'`)).n), 1);
  const mar = await one(`select units, orders from fm_sales_channel_month where month='2026-03-01' and channel='TRENDYOL'`);
  assert.equal(num(mar.units), 3 + 1, "package row units corrected (4 → 1)"); assert.equal(num(mar.orders), 4);
  const may = await one(`select ex.n::int as parts from (select count(*) as n from fm_sales_channel_month where month='2026-05-01') ex`);
  assert.equal(num(may.parts), 2, "TRENDYOL + HEPSIBURADA in May");
  assert.equal(num((await one(`select count(*) as n from fm_sales_sku_month where sku_key like 'R:%'`)).n), 2, "unmapped codes (OLD, 22YT523) kept as R: keys");
  // sku_day only for the rolling window; 2021 history has none.
  assert.equal(num((await one(`select count(*) as n from fm_sales_sku_day where economic_date < date '${TODAY}' - 400`)).n), 0);
  assert(num((await one(`select count(*) as n from fm_sales_sku_day`)).n) > 0);
  // knownAt separate from economicDate; grade/flags available in the hot-path view.
  const hot = await one(`select revenue_grade, returns_grade, flags, known_at_max from fm_memory_sales_company_day where economic_date='2021-05-01'`);
  assert.equal(hot.revenue_grade, "C"); assert.equal(hot.returns_grade, "U");
  assert((hot.flags as string[]).includes("status_snapshot_stale")); assert.equal((hot.known_at_max as Date).getUTCFullYear(), 2026);

  // Idempotent rewrite: change a raw row, re-snapshot, force-redo one month → no duplicates, value replaced, other months untouched.
  const before = num((await one(`select count(*) as n from fm_sales_company_day`)).n);
  await db.exec(`update "MarketplaceSalesRecord" set "totalAmountTry" = 1000 where "orderNumber"='1001-5001'`);
  await db.exec(`select fm_backfill_sales_snapshot('${RUN}')`);
  await db.exec(`delete from fm_ingest_chunk where chunk = '2026-01-01'`);
  const redo = (await one(`select fm_backfill_sales_run('${RUN}','2026-01-01','2026-01-01',12,false,'${TODAY}') as r`)).r as { processed: number };
  assert.equal(redo.processed, 1);
  assert.equal(num((await one(`select count(*) as n from fm_sales_company_day`)).n), before, "no duplicate rows after re-run");
  assert.equal(num((await one(`select revenue_incl_vat_try as r from fm_sales_company_day where economic_date='2026-01-10'`)).r), 1000);
  assert.equal(num((await one(`select revenue_incl_vat_try as r from fm_sales_company_day where economic_date='2026-03-05'`)).r), 800);

  // Nothing is deleted on rewrite: a vanished key is kept as a stale version (is_current=false) and leaves the hot-path views.
  await db.exec(`delete from "MarketplaceSalesRecord" where "orderNumber"='ID-1'`);
  await db.exec(`select fm_backfill_sales_snapshot('${RUN}')`);
  await db.exec(`delete from fm_ingest_chunk where chunk = '2026-04-01'`);
  await db.exec(`select fm_backfill_sales_run('${RUN}','2026-04-01','2026-04-01',12,false,'${TODAY}')`);
  assert.equal((await one(`select is_current as c from fm_sales_company_day where economic_date='2026-04-01'`)).c, false, "stale version retained, not deleted");
  assert.equal(num((await one(`select count(*) as n from fm_memory_sales_company_day where economic_date='2026-04-01'`)).n), 0, "stale row hidden from hot-path view");
  assert.equal(num((await one(`select count(*) as n from fm_sales_memory_reconciliation_monthly where month='2026-04-01' and diff_company_day<>0`)).n), 0);

  // Failure injection: a month whose memory total cannot be stored must roll back and be reported, not half-written.
  await db.exec(`insert into "MarketplaceSalesRecord"(id,channel,"orderNumber","externalLineId","orderDate",status,"modelNumber",quantity,"totalAmountTry","importedAt") values ('mX','TRENDYOL','1-1','LX','2026-06-02','Onaylandı','A',1,1e20,now())`);
  await db.exec(`select fm_backfill_sales_snapshot('${RUN}')`);
  await db.exec(`delete from fm_ingest_chunk where chunk = '2026-06-01'`);
  const bad = (await one(`select fm_backfill_sales_run('${RUN}','2026-06-01','2026-06-01',12,false,'${TODAY}') as r`)).r as { finished: boolean; failed: { error: string } | null };
  assert.equal(bad.finished, false); assert(bad.failed);
  assert.equal(num((await one(`select count(*) as n from fm_sales_company_day where economic_date >= '2026-06-01' and economic_date < '2026-07-01'`)).n), 0, "failed chunk rolled back");
  assert.equal((await one(`select status from fm_ingest_chunk where chunk='2026-06-01'`)).status, "failed");

  // Raw tables untouched by the whole pipeline.
  assert.equal(num((await one(`select count(*) as n from "MarketplaceSalesRecord"`)).n), mSeq, "raw rows: all inserted (+1 injected, −1 removed by the test itself)");
  assert.equal(num((await one(`select count(*) as n from "TrendyolSalesRecord"`)).n), tSeq);
  console.log("Financial Memory backfill: dry-run, resumable month chunks, idempotent rewrite, per-grain reconciliation, failure rollback passed");
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.close());

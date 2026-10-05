import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// Step 1B — canonical sales layer rules, executed on a real PostgreSQL engine (PGlite)
// with synthetic data that locks every Phase 0B rule.
const MIGRATION = readFileSync("prisma/migrations/20261005210000_fm_canonical_sales/migration.sql", "utf8");
const db = new PGlite();

type Row = Record<string, unknown>;
const q = async (sql: string): Promise<Row[]> => (await db.query<Row>(sql)).rows;
const one = async (sql: string): Promise<Row> => { const rows = await q(sql); assert.equal(rows.length, 1, `expected 1 row: ${sql}`); return rows[0]; };
let mSeq = 0, tSeq = 0;
const M = (channel: string, orderNumber: string, date: string, sku: string, qty: number, amount: number, status = "Onaylandı", extra: { name?: string; customer?: string; imported?: string; ext?: string; gross?: number | null } = {}) =>
  `insert into "MarketplaceSalesRecord"(id,channel,"orderNumber","externalLineId","orderDate",status,"modelNumber","productName",quantity,"totalAmountTry","grossAmountTry","customerInvoiceName","importedAt")
   values ('m${++mSeq}','${channel}','${orderNumber}','${extra.ext ?? `L${mSeq}`}','${date}','${status}','${sku}','${extra.name ?? "Urun"}',${qty},${amount},${extra.gross === undefined ? amount / 1.2 : extra.gross},${extra.customer ? `'${extra.customer}'` : "null"},'${extra.imported ?? "2026-05-19T21:52:00"}');`;
const T = (orderId: string, lineId: number, date: string, status: string, amount: number, sku = "A", qty = 1) =>
  `insert into "TrendyolSalesRecord"(id,"orderId","lineId","orderDate",status,"merchantSku","productId","productName",quantity,"totalPriceTry","syncedAt")
   values ('t${++tSeq}','${orderId}',${lineId},'${date}','${status}','${sku}','p-${sku}','Urun',${qty},${amount},'2026-10-05T06:00:00');`;

async function main() {
  await db.exec(`
    create table "Product"(id text primary key, sku text, name text);
    insert into "Product" values ('p-A','A','Urun A'),('p-C','C','Urun C');
    create table "MarketplaceSalesRecord"(id text primary key, channel text, "orderNumber" text, "platformRef" text, "externalLineId" text, "orderDate" timestamp, status text,
      "modelNumber" text, "productName" text, "productId" text, quantity int, "totalAmountTry" numeric, "grossAmountTry" numeric, "vatAmountTry" numeric,
      "customerInvoiceName" text, "importedAt" timestamp);
    create table "TrendyolSalesRecord"(id text primary key, "orderId" text, "lineId" bigint, "orderDate" timestamp, status text, "merchantSku" text, "productId" text,
      "productName" text, quantity int, "totalPriceTry" numeric, "syncedAt" timestamp);
  `);
  await db.exec([
    // --- Marketplace rows
    M("TRENDYOL", "1001-5001", "2026-01-10", "A", 1, 100),                         // pre-gap, M primary
    M("TRENDYOL", "1002-5002", "2026-02-10", "A", 1, 100),                         // gap window, M has it
    M("TRENDYOL", "1003-5003", "2026-03-15", "A", 1, 100),                         // M primary; T duplicate must drop
    M("TRENDYOL", "1004-5004", "2026-05-10", "A", 1, 0, "İade-İptal"),             // T primary has order; M drops; T line becomes return
    M("TRENDYOL", "1005-5005", "2026-05-11", "A", 1, 100),                         // T primary has order; M drops
    M("TRENDYOL", "1006-5006", "2026-05-12", "A", 1, 100),                         // M-only after transition -> fallback
    M("IDEASOFT", "ID-1", "2026-04-01", "B", 1, 500, "Yeni Siparis"),               // IDEASOFT included
    M("IDEASOFT", "ID-2", "2026-04-02", "B", 2, 2, "Yeni Siparis", { customer: "test" }), // test order excluded
    M("HEPSIBURADA", "HB-1", "2026-05-20", "B", 1, 300),                           // single source
    M("TRENDYOL", "9001-9001", "2021-05-01", "B", 1, 50, "Yeni Siparis"),          // legacy stale status + bulk import
    M("TRENDYOL", "1011-5011", "2026-03-01", "22YT523", 1, 200, "Onaylandı", { name: "Armine Kadın Tunik" }), // legacy textile
    M("TRENDYOL", "1012-5012", "2026-03-20", "A", 1, 0, "İade-İptal"),             // marketplace return pre-transition
    M("TRENDYOL", "1013-6001", "2026-03-05", "BANYO", 1, 800), M("TRENDYOL", "1013-6002", "2026-03-06", "BANYO", 1, 800),
    M("TRENDYOL", "1013-6003", "2026-03-07", "BANYO", 1, 800),
    M("TRENDYOL", "1013-6004", "2026-03-08", "BANYO", 4, 250),                     // package listing: units must be corrected, revenue not
    M("TRENDYOL", "1014-5014", "2026-02-14", "C", 1, 70),                           // lookalike of a gap-fill row
    M("TRENDYOL", "1015-8001", "2026-05-04", "A", 1, 10),                          // transition day: T wins
    M("TRENDYOL", "1016-8002", "2026-05-03", "A", 1, 20),                          // day before transition: M wins
    // --- Trendyol API lines
    T("5003", 1, "2026-03-15T10:00:00", "Delivered", 100),                         // duplicate of m3 -> dropped
    T("5002", 1, "2026-02-10T10:00:00", "Delivered", 100),                         // duplicate of m2 inside gap window -> dropped
    T("7001", 1, "2026-02-12T10:00:00", "Delivered", 80),                          // gap fill
    T("7002", 1, "2026-02-13T10:00:00", "Cancelled", 60),                          // gap fill but cancelled
    T("5004", 1, "2026-05-10T10:00:00", "Delivered", 100),                         // marketplace says İade-İptal
    T("5005", 1, "2026-05-11T10:00:00", "Delivered", 60), T("5005", 2, "2026-05-11T10:00:00", "Delivered", 40),
    T("7003", 1, "2026-05-15T10:00:00", "Cancelled", 90),
    T("0", 1, "2026-09-18T09:09:53", "Delivered", 10),
    T("7004", 1, "2026-02-14T10:00:00", "Delivered", 70, "C"),                     // lookalike of m14 under different key
    T("8001", 1, "2026-05-04T10:00:00", "Delivered", 10),
    T("8002", 1, "2026-05-03T10:00:00", "Delivered", 20),
  ].join("\n"));
  await db.exec(MIGRATION);
  await db.exec(MIGRATION); // idempotent

  const byRule = async (rule: string, disposition?: string) =>
    q(`select * from fm_sales_dispositioned where source_rule='${rule}'${disposition ? ` and disposition='${disposition}'` : ""} order by order_key, line_key`);

  // 1) Same economic sale appears once: no Trendyol order is present from both sources in the canonical layer.
  assert.equal((await q(`select order_key from fm_sales_canonical where channel='TRENDYOL' group by order_key having count(distinct source_system)>1`)).length, 0);
  assert.equal((await q(`select sale_key from fm_sales_canonical group by sale_key having count(*)>1`)).length, 0);

  // 2) Dedupe both directions around the regime boundary (2026-05-04).
  const dropped = (await byRule("DEDUP_DROPPED")).map(r => `${r.source_system}:${r.order_key}`).sort();
  assert.deepEqual(dropped, ["MARKETPLACE:5004", "MARKETPLACE:5005", "MARKETPLACE:8001", "TRENDYOL_API:5002", "TRENDYOL_API:5003", "TRENDYOL_API:8002"]);

  // 3) February-style gap fill: T orders missing from M are added, flagged, and cancelled ones excluded.
  const gap = await byRule("T_GAP_FILL");
  assert.deepEqual(gap.map(r => `${r.order_key}:${r.disposition}`), ["7001:COUNTED", "7002:EXCLUDED_CANCELLED", "7004:COUNTED"]);
  assert((gap[0].quality_flags as string[]).includes("gap_filled_secondary"));
  assert((gap[2].quality_flags as string[]).includes("possible_cross_source_duplicate"), "lookalike gap-fill row must be flagged, never silently dropped");

  // 4) Trendyol primary after 2026-05-04: cancelled excluded, marketplace İade-İptal reconciled onto the T order.
  const tp = await byRule("T_PRIMARY");
  const tpBy = Object.fromEntries(tp.map(r => [`${r.order_key}/${r.line_key}`, r]));
  assert.equal(tpBy["5004/1"].disposition, "EXCLUDED_RETURN");
  assert.equal(tpBy["5004/1"].status_raw, "Delivered", "raw Trendyol status untouched");
  assert((tpBy["5004/1"].quality_flags as string[]).includes("return_from_marketplace_status"));
  assert.equal(tpBy["7003/1"].disposition, "EXCLUDED_CANCELLED");
  assert.equal(tpBy["5005/1"].disposition, "COUNTED");
  assert.equal(tpBy["5005/2"].disposition, "COUNTED");
  assert((tpBy["0/1"].quality_flags as string[]).includes("invalid_order_id"));

  // 5) Marketplace fallback after the transition; marketplace return before it.
  assert.deepEqual((await byRule("M_FALLBACK")).map(r => r.order_key), ["5006"]);
  assert.equal((await one(`select disposition from fm_sales_dispositioned where order_key='5012'`)).disposition, "EXCLUDED_RETURN");

  // 6) IDEASOFT included (flagged), test order excluded, other channels untouched.
  const ideas = await one(`select disposition, quality_flags from fm_sales_canonical where order_key='ID-1'`);
  assert.equal(ideas.disposition, "COUNTED");
  assert((ideas.quality_flags as string[]).includes("ideasoft_v1_excluded"));
  assert.equal((await one(`select disposition from fm_sales_canonical where order_key='ID-2'`)).disposition, "EXCLUDED_TEST");
  assert.equal((await one(`select disposition from fm_sales_canonical where order_key='HB-1'`)).disposition, "COUNTED");

  // 7) Legacy textile tagged (not deleted), stale-status/bulk-import provenance flags on 2021 history.
  const legacy = await one(`select legacy_business, disposition, quality_flags from fm_sales_canonical where order_key='5011'`);
  assert.equal(legacy.legacy_business, "TEXTILE_ARMINE");
  assert.equal(legacy.disposition, "COUNTED");
  const old = await one(`select quality_flags from fm_sales_canonical where order_key='9001'`);
  for (const flag of ["status_snapshot_stale", "historical_bulk_import"]) assert((old.quality_flags as string[]).includes(flag), flag);
  assert.equal((await q(`select 1 from fm_sales_canonical where legacy_business is null and sku_raw='22YT523'`)).length, 0);

  // 8) Package/set quantity correction changes UNITS only; revenue is the raw KDV-dahil amount.
  const pkg = await one(`select quantity_raw, units_counted, revenue_incl_vat_try, quality_flags from fm_sales_canonical where order_key='6004'`);
  assert.equal(Number(pkg.quantity_raw), 4);
  assert.equal(Number(pkg.units_counted), 1);
  assert.equal(Number(pkg.revenue_incl_vat_try), 250);
  assert((pkg.quality_flags as string[]).includes("set_qty_corrected"));
  assert.equal(Number((await one(`select units_counted from fm_sales_canonical where order_key='6001'`)).units_counted), 1);

  // 9) Revenue reconciliation: canonical revenue is explained row-by-row from raw sources.
  const total = await one(`select
      (select sum("totalAmountTry") from "MarketplaceSalesRecord") + (select sum("totalPriceTry") from "TrendyolSalesRecord") as raw,
      (select sum(raw_amount_incl_vat_try) from fm_sales_reconciliation_monthly) as recon,
      (select sum(revenue_incl_vat_try) from fm_sales_canonical) as canonical,
      (select sum(raw_amount_incl_vat_try) from fm_sales_reconciliation_monthly where disposition='COUNTED') as counted,
      (select sum(raw_amount_incl_vat_try) from fm_sales_reconciliation_monthly where disposition<>'COUNTED') as not_counted`);
  assert.equal(Number(total.recon), Number(total.raw), "reconciliation view must account for every raw TL");
  assert.equal(Number(total.canonical), Number(total.counted));
  assert.equal(Number(total.counted) + Number(total.not_counted), Number(total.raw));
  // Hand-computed expectation: M 4480 counted (without dropped/excluded) is spelled out below.
  const expectedCounted = 100 + 100 + 100 + 100 /*5006 fallback*/ + 500 + 300 + 50 + 200 + 2400 + 250 + 70 + 20 /*5 May-03 M*/
    + 80 + 100 /*5005 T*/ + 10 /*order 0*/ + 70 /*7004*/ + 10 /*8001 T*/;
  assert.equal(Number(total.canonical), expectedCounted);
  // Dedupe removed exactly the double-counted TL: T 5002+5003+8002 = 220 and M 5004(0)+5005+8001 = 110.
  assert.equal(Number((await one(`select sum(raw_amount_incl_vat_try) as v from fm_sales_reconciliation_monthly where disposition='DEDUP_DROPPED'`)).v), 330);

  // 10) Layer is read-only views; raw tables untouched.
  assert.equal(Number((await one(`select count(*) as n from "MarketplaceSalesRecord"`)).n), mSeq);
  assert.equal(Number((await one(`select count(*) as n from "TrendyolSalesRecord"`)).n), tSeq);
  console.log("Canonical sales: dedupe/gap-fill/transition/cancel/return/IDEASOFT/legacy/qty-correction/reconciliation passed");
}
main().catch(e => { console.error(e); process.exitCode = 1; });

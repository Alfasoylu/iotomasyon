import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// D-P05 (migration 20261009200000): alfashome.com siparişleri satış katmanına ayrı ALFASHOME kaynağı/kanalı olarak girer. İptal/taslak
// sayılmaz; arşivlenmiş (kurulum dönemi) teyit edilene kadar dışarıda; sipariş toplamı bazlı, KDV hariç %20 varsayılan (bayraklı);
// mevcut kanallar (Trendyol API, pazaryeri, IDEASOFT) birebir aynı kalır. Çalıştır: node --import tsx __tests__/fm-sales-alfashome.test.ts
const mig = (m: string) => readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8");
const db = new PGlite();
type Row = Record<string, unknown>;
const q = async (sql: string): Promise<Row[]> => (await db.query<Row>(sql)).rows;

async function main() {
  await db.exec(`
    create table "Product"(id text primary key, sku text, name text);
    create table "MarketplaceSalesRecord"(id text primary key, channel text, "orderNumber" text, "platformRef" text, "externalLineId" text, "orderDate" timestamp, status text,
      "modelNumber" text, "productName" text, "productId" text, quantity int, "totalAmountTry" numeric, "grossAmountTry" numeric, "vatAmountTry" numeric,
      "customerInvoiceName" text, "importedAt" timestamp);
    create table "TrendyolSalesRecord"(id text primary key, "orderId" text, "lineId" bigint, "orderDate" timestamp, status text, "merchantSku" text, "productId" text,
      "productName" text, quantity int, "totalPriceTry" numeric, "syncedAt" timestamp);
    create table fm_quality_flag(flag text primary key, severity text, description text);
    create table fm_quality_policy(metric_key text, channel text, valid_from date, valid_to date, grade char(1), reason text, primary key (metric_key, channel, valid_from));
    insert into fm_quality_policy values ('revenue_ex_vat_try','*','2026-05-04',null,'U','x');
    insert into "MarketplaceSalesRecord" values ('m1','IDEASOFT','I-1',null,'L1','2026-09-29','Onaylandı','K1','Urun',null,1,3000,2500,500,'','2026-10-05T09:06:00'),
      ('m2','HEPSIBURADA','H-1',null,'L2','2026-10-02','Onaylandı','K1','Urun',null,1,1200,1000,200,'','2026-10-05T09:06:00');
    insert into "TrendyolSalesRecord" values ('t1','9001',1,'2026-10-03T10:00:00','Delivered','K1','p1','Urun',1,600,'2026-10-05T06:00:00');`);
  await db.exec(mig("20261005210000_fm_canonical_sales"));
  await db.exec(mig("20261009120000_fm_kdv_haric_ciro"));
  await db.exec(mig("20261007210000_alfashome_order"));
  await db.exec(`insert into alfashome_order (id, order_no, ordered_at, amount, currency, status, payment_status, item_qty) values
    ('o1', 1, '2026-06-14T09:00:00Z', 2781.50, 'try', 'archived', null, 1),
    ('o4', 4, '2026-09-30T22:30:00Z', 341, 'try', 'pending', null, 1),
    ('o5', 5, '2026-10-02T10:00:00Z', 6355, 'try', 'completed', 'captured', 1),
    ('o7', 7, '2026-10-06T10:00:00Z', 999, 'try', 'canceled', null, 1),
    ('o8', 8, '2026-10-07T10:00:00Z', 50, 'try', 'draft', null, 1),
    ('o9', 9, '2026-10-07T11:00:00Z', 100, 'eur', 'pending', null, 1),
    ('o10', null, null, 70, 'try', 'pending', null, 1);`);
  const before = await q(`select * from fm_sales_canonical order by sale_key`);
  const m = mig("20261009200000_fm_sales_alfashome");
  await db.exec(m); await db.exec(m); // tekrar çalıştırılabilir
  const after = await q(`select * from fm_sales_canonical where source_system <> 'ALFASHOME' order by sale_key`);
  assert.deepEqual(after, before, "mevcut kanallar birebir aynı");

  const d = await q(`select order_key, economic_date::text d, disposition, quality_flags f from fm_sales_dispositioned where source_system = 'ALFASHOME' order by order_key`);
  const by = Object.fromEntries(d.map(r => [r.order_key as string, r]));
  assert.deepEqual(Object.keys(by).sort(), ["AH-1", "AH-4", "AH-5", "AH-7", "AH-8"], "tarihsiz ve TL dışı sipariş katmana girmez");
  assert.equal(by["AH-4"].d, "2026-10-01", "ekonomik gün İstanbul saatiyle (30.09 22:30 UTC = 01.10 01:30 TR)");
  assert.deepEqual(["AH-1", "AH-4", "AH-5", "AH-7", "AH-8"].map(k => by[k].disposition),
    ["EXCLUDED_TEST", "COUNTED", "COUNTED", "EXCLUDED_CANCELLED", "EXCLUDED_CANCELLED"]);
  assert.ok((by["AH-1"].f as string[]).includes("alfashome_archived_unverified"));

  const c = await q(`select order_key, channel, revenue_incl_vat_try r, amount_ex_vat_try e, units_counted u, quality_flags f from fm_sales_canonical
    where source_system = 'ALFASHOME' and disposition = 'COUNTED' order by order_key`);
  assert.deepEqual(c.map(r => [r.order_key, r.channel, Number(r.r), Number(r.e), Number(r.u)]),
    [["AH-4", "ALFASHOME", 341, 284.17, 1], ["AH-5", "ALFASHOME", 6355, 5295.83, 1]], "sipariş toplamı; KDV hariç %20");
  for (const r of c) assert.ok((r.f as string[]).includes("alfashome_order_level") && (r.f as string[]).includes("ex_vat_default_rate"));

  const ekim = (await q(`select sum(revenue_incl_vat_try)::numeric r from fm_sales_canonical where economic_date >= '2026-10-01' and disposition = 'COUNTED'`))[0];
  assert.equal(Number(ekim.r), 1200 + 600 + 341 + 6355, "Ekim cirosu Alfashome dahil; IDEASOFT (soyluelektronik.com) ayrı mağaza, çakışma yok");
  const pol = await q(`select grade from fm_quality_policy where metric_key = 'revenue_incl_vat_try' and channel = 'ALFASHOME'`);
  assert.deepEqual(pol.map(r => r.grade), ["B"]);
  assert.equal((await q(`select 1 from fm_quality_flag where flag in ('alfashome_order_level','alfashome_archived_unverified')`)).length, 2);
  console.log("ALFASHOME satış kaynağı: durum sınıfları, İstanbul günü, sipariş toplamı + KDV hariç varsayılan, mevcut kanallar aynı, idempotent passed");
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.close());

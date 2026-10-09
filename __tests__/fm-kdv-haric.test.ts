import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

// KDV hariç ciro (RF-20261008-025, migration 20261009120000): Trendyol API satırlarında kaynakta olmayan KDV hariç tutar SKU'nun pazaryeri
// KDV oranından (2023-07-10 sonrası, baskın ≥ %80), yoksa %20 varsayılanla türetilir. Kaynak değer varsa dokunulmaz; diğer her sütun aynı.
// Çalıştır: node --import tsx __tests__/fm-kdv-haric.test.ts
const BASE = readFileSync("prisma/migrations/20261005210000_fm_canonical_sales/migration.sql", "utf8");
const KDV = readFileSync("prisma/migrations/20261009120000_fm_kdv_haric_ciro/migration.sql", "utf8");
const db = new PGlite();
type Row = Record<string, unknown>;
const q = async (sql: string): Promise<Row[]> => (await db.query<Row>(sql)).rows;
let mSeq = 0, tSeq = 0;
// gross = KDV hariç (kaynak); rate: KDV oranı %
const M = (orderNumber: string, date: string, sku: string, amount: number, rate: number | null, channel = "HEPSIBURADA") =>
  `insert into "MarketplaceSalesRecord"(id,channel,"orderNumber","externalLineId","orderDate",status,"modelNumber","productName",quantity,"totalAmountTry","grossAmountTry","importedAt")
   values ('m${++mSeq}','${channel}','${orderNumber}','L${mSeq}','${date}','Onaylandı','${sku}','Urun',1,${amount},${rate == null ? "null" : Math.round((amount / (1 + rate / 100)) * 100) / 100},'2026-05-19T21:52:00');`;
const T = (orderId: string, date: string, sku: string, amount: number, qty = 1) =>
  `insert into "TrendyolSalesRecord"(id,"orderId","lineId","orderDate",status,"merchantSku","productId","productName",quantity,"totalPriceTry","syncedAt")
   values ('t${++tSeq}','${orderId}',1,'${date}','Delivered','${sku}','p-${sku}','Urun',${qty},${amount},'2026-10-05T06:00:00');`;

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
    insert into fm_quality_policy values ('revenue_ex_vat_try','*','2026-05-04',null,'U','Trendyol API satırlarında KDV hariç tutar yok'),
      ('revenue_ex_vat_try','*','2022-01-01','2026-05-03','B','KDV hariç Marketplace''te %89-100 dolu');
  `);
  await db.exec([
    // SKU K20: pazaryerinde %20 → Trendyol satırı /1,20
    M("H1", "2024-01-10", "K20", 120, 20), M("H2", "2025-03-10", "K20", 240, 20),
    // SKU K10: %10 ürün → /1,10
    M("H3", "2025-02-01", "K10", 110, 10), M("H4", "2025-02-02", "K10", 220, 10), M("H5", "2025-02-03", "K10", 330, 10), M("H6", "2025-02-04", "K10", 440, 10),
    M("H7", "2025-02-05", "K10", 550, 20),                     // 4/5 = %80 → baskın %10 kalır
    // SKU ESKI: yalnız 2023-07-10 öncesi %18 → öğrenilmez, varsayılan %20 (eski oranla türetilmez)
    M("H8", "2023-01-10", "ESKI", 118, 18), M("H9", "2023-06-30", "ESKI", 236, 18),
    // SKU KARMA: 1×%20, 1×%10 → baskın oran yok (%50) → varsayılan
    M("H10", "2025-01-01", "KARMA", 120, 20), M("H11", "2025-01-02", "KARMA", 110, 10),
    // Kaynakta KDV hariç tutarı OLMAYAN pazaryeri satırı (Amazon FBA gibi) → türetilir; kaynak değeri olan satır aynen kalır
    M("FBA1", "2026-09-07", "K20", 60, null, "AMAZON_FBA"),
    // Trendyol API satırları (2026-05-04 sonrası birincil; KDV hariç yok)
    T("9001", "2026-09-10T10:00:00", "K20", 600), T("9002", "2026-09-11T10:00:00", "K10", 550), T("9003", "2026-09-12T10:00:00", "ESKI", 360),
    T("9004", "2026-09-13T10:00:00", "KARMA", 240), T("9005", "2026-09-14T10:00:00", "YENI", 1200),
    // set/paket adet düzeltmesi bayrağı korunur: tek adetli tipik fiyat 300, 4 adet × 75 → adet 1'e düzelir
    T("9101", "2026-08-01T10:00:00", "SET", 300), T("9102", "2026-08-02T10:00:00", "SET", 300), T("9103", "2026-08-03T10:00:00", "SET", 300),
    T("9104", "2026-08-04T10:00:00", "SET", 300, 4),
  ].join("\n"));
  await db.exec(BASE);
  const strip = (r: Row) => { const { amount_ex_vat_try: _a, vat_try: _v, quality_flags: _f, ...rest } = r; void _a; void _v; void _f; return rest; };
  const before = await q(`select * from fm_sales_canonical order by sale_key`);
  await db.exec(KDV);
  await db.exec(KDV); // idempotent
  const after = await q(`select * from fm_sales_canonical order by sale_key`);
  assert.equal(after.length, before.length, "satır sayısı aynı");
  assert.deepEqual(after.map(strip), before.map(strip), "KDV hariç / KDV / bayrak dışında her sütun aynı");

  const row = async (orderKey: string) => {
    const r = (await q(`select amount_incl_vat_try a, amount_ex_vat_try e, vat_try v, quality_flags f from fm_sales_canonical where order_key = '${orderKey}'`))[0];
    return { a: Number(r.a), e: r.e == null ? null : Number(r.e), v: r.v == null ? null : Number(r.v), f: (r.f as string[] | null) ?? [] };
  };
  const k20 = await row("9001");
  assert.deepEqual([k20.e, k20.v], [500, 100]);
  assert.ok(k20.f.includes("ex_vat_derived_sku") && !k20.f.includes("ex_vat_unknown"), "kaynak bayrağı türetme yoluyla değişir");
  assert.deepEqual([(await row("9002")).e, (await row("9002")).v], [500, 50], "%10 ürün kendi oranıyla");
  const eski = await row("9003");
  assert.deepEqual([eski.e, eski.f.includes("ex_vat_default_rate")], [300, true], "2023-07-10 öncesi %18 öğrenilmez → %20 varsayılan");
  assert.ok((await row("9004")).f.includes("ex_vat_default_rate"), "baskın oran < %80 → varsayılan");
  const yeni = await row("9005");
  assert.deepEqual([yeni.e, yeni.v, yeni.f.includes("ex_vat_default_rate")], [1000, 200, true], "geçmişi olmayan SKU → varsayılan");
  const fba = await row("FBA1");
  assert.deepEqual([fba.e, fba.f.includes("ex_vat_derived_sku")], [50, true], "kaynakta boş pazaryeri satırı da türetilir");
  const src = await row("H2");
  assert.deepEqual([src.e, src.f.includes("ex_vat_derived_sku") || src.f.includes("ex_vat_default_rate")], [200, false], "kaynak değer korunur");
  const set = await row("9104");
  assert.ok(set.f.includes("set_qty_corrected") && set.f.includes("ex_vat_default_rate"), "adet düzeltme bayrağı korunur");
  // Kimlik: sayılan satırlarda KDV hariç + KDV = KDV dahil (kuruş)
  const bad = await q(`select order_key from fm_sales_canonical where disposition = 'COUNTED' and amount_incl_vat_try is not null
    and (amount_ex_vat_try is null or vat_try is null or abs(amount_ex_vat_try + vat_try - amount_incl_vat_try) > 0.01) and order_key like '9%'`);
  assert.deepEqual(bad, [], "türetilen satırda KDV hariç + KDV = KDV dahil");
  const pol = (await q(`select grade, reason from fm_quality_policy where metric_key = 'revenue_ex_vat_try' and valid_from = '2026-05-04'`))[0];
  assert.equal(String(pol.grade), "B");
  assert.match(String(pol.reason), /türetilir/);
  assert.equal((await q(`select 1 from fm_quality_flag where flag in ('ex_vat_derived_sku','ex_vat_default_rate')`)).length, 2);
  console.log("KDV hariç ciro: SKU oranı (2023-07-10 sonrası, ≥%80) → %20 varsayılan, kaynak korunur, diğer sütunlar aynı, kimlik, kalite notu passed");
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => db.close());

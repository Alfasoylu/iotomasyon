import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { bootstrap } from "../scripts/schema-baseline/bootstrap";
import { getCfoConfig } from "../lib/cfo-agent/config";
import { priceFloor, FINANCIAL_CONTRACT } from "../lib/cfo-agent/calculations";
import { assumedShippingChannel, shippingBandsFor, shippingChannelFor, shippingTariffSql, type ShippingOptions } from "../lib/cfo-agent/shipping";
import { resolveCfoSourceProfile, ALFAS_SOURCE_PROFILE } from "../lib/cfo-agent/reviewed-sources";
import type { ReadSource, Row } from "../lib/cfo-agent/sources";

// AI CFO V1 step 7 — kargo / SET / cash-projection column mapping (decisions 2026-10-06), proven on the clean-DB
// reproduction of production (baseline + production-applied migrations): the reviewed profile's view/function hashes
// match there exactly, so the REAL snapshot code runs against the REAL cfo_satis_* views, cfo_nakit_kapisi and
// cfo_nakit_projeksiyon. Tariff rows mirror production cfo_kargo_tarife (measured Trendyol invoice bands).
// Run with: node --conditions=react-server --import tsx __tests__/ai-cfo-source-mapping.test.ts
const TARIFF = `insert into cfo_kargo_tarife (id,pazaryeri,band,alt_sinir,ust_sinir,tarife,ek_maliyet,toplam,olcum_adet,kaynak,gecerli_tarih) values
  (1,'TRENDYOL','<200',0,200,41.60,12.01,53.61,768,'fixture','2026-09-09'),(2,'TRENDYOL','200-250',200,250,80.92,12.01,92.93,74,'fixture','2026-09-09'),
  (3,'TRENDYOL','250-350',250,350,79.88,12.01,91.89,471,'fixture','2026-09-09'),(4,'TRENDYOL','350-750',350,750,94.24,12.01,106.25,372,'fixture','2026-09-09'),
  (5,'TRENDYOL','750-1500',750,1500,101.40,12.01,113.41,613,'fixture','2026-09-09'),(6,'TRENDYOL','1500+',1500,null,142.90,12.01,154.91,182,'fixture','2026-09-09'),
  (7,'TRENDYOL','IADE',null,null,120.77,0,120.77,172,'fixture','2026-09-09'),(8,'TRENDYOL','KUSURLU',null,null,199.19,0,199.19,62,'fixture','2026-09-09')`;
const BANDS = [[0, 200, 53.61], [200, 250, 92.93], [250, 350, 91.89], [350, 750, 106.25], [750, 1500, 113.41], [1500, null, 154.91]]
  .map(([min, max, shipping]) => ({ min: min as number, max: max as number | null, shipping: shipping as number }));

function pure() {
  // channel assumption: only the '*' row with a known cost basis yields a fallback
  assert.equal(assumedShippingChannel([{ channel: "*", cost_basis: "TRENDYOL_ANLASMALI" }]), "TRENDYOL");
  assert.equal(assumedShippingChannel([{ channel: "*", cost_basis: "BILINMEYEN" }]), null);
  assert.equal(assumedShippingChannel([{ channel: "*", cost_basis: "TRENDYOL_ANLASMALI" }, { channel: "*", cost_basis: "X" }]), null, "ambiguous assumption");
  assert.equal(assumedShippingChannel(null), null);
  const rows: Row[] = [{ min_try: 0, max_try: 200, kargo_try: 53.61, channel: "TRENDYOL", effective_from: "2026-09-09" },
    { min_try: null, max_try: null, kargo_try: 120.77, channel: "TRENDYOL", effective_from: "2026-09-09" }];
  const opts = { fallbackChannel: "TRENDYOL", effectiveRemap: { "2026-09-09": "2026-06-19" } };
  assert.deepEqual(shippingChannelFor(rows, "TRENDYOL", opts), { channel: "TRENDYOL", assumed: false });
  assert.deepEqual(shippingChannelFor(rows, "HEPSIBURADA", opts), { channel: "TRENDYOL", assumed: true });
  assert.deepEqual(shippingChannelFor(rows, "HEPSIBURADA", {}), { channel: "HEPSIBURADA", assumed: false }, "no assumption → no other channel's bands");
  assert.deepEqual(shippingChannelFor(rows, "AMAZON_FBA", opts), { channel: "AMAZON_FBA", assumed: false }, "marketplace-fulfilled: never our cargo cost");
  // measurement-window correction: valid from 19.06, not before; return/faulty rows never become a sales band
  assert.deepEqual(shippingBandsFor(rows, "TRENDYOL", "2026-07-01", opts), [{ min: 0, max: 200, shipping: 53.61 }]);
  assert.deepEqual(shippingBandsFor(rows, "TRENDYOL", "2026-06-18", opts), []);
  assert.deepEqual(shippingBandsFor(rows, "TRENDYOL", "2026-07-01", {}), [], "without the correction the bands start 09.09");
  for (const bad of [{ fallbackChannel: "x'; select 1; --" }, { effectiveRemap: { "2026-09-09": "2026-10-01" } }, { effectiveRemap: { "09.09.2026": "2026-06-19" } }])
    assert.throws(() => shippingBandsFor(rows, "TRENDYOL", "2026-07-01", bad as never), /invalid_shipping/);
  // the band total already carries the measured processing fee: the constant 12.29 is not added twice
  const withFee = priceFloor(200, 0.18, 0.4, BANDS, false).value!, measured = priceFloor(200, 0.18, 0.4, BANDS, true).value!;
  assert.ok(Math.abs(withFee - measured - Number(FINANCIAL_CONTRACT.orderProcessingTry) / 0.82) < 0.02, `${withFee} vs ${measured}`);
  // profile resolution: default on, explicit off, explicit name kept
  assert.equal(resolveCfoSourceProfile({}), ALFAS_SOURCE_PROFILE);
  assert.equal(resolveCfoSourceProfile({ AI_CFO_SOURCE_PROFILE: "off" }), undefined);
  assert.equal(resolveCfoSourceProfile({ AI_CFO_SOURCE_PROFILE: ALFAS_SOURCE_PROFILE }), ALFAS_SOURCE_PROFILE);
}

async function main() {
  pure();
  const pg = new PGlite({ extensions: { vector } });
  try {
    await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create role cfo_acceptance_reader login nosuperuser nobypassrls;`);
    const res = await bootstrap({ exec: s => pg.exec(s), query: <T,>(s: string, p?: unknown[]) => pg.query<T>(s, p) });
    for (const m of res.pendingInProduction) await pg.exec(readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8"));
    await pg.exec("set search_path = public");
    await pg.exec(`${TARIFF};
      insert into "Product" (id,sku,name,"updatedAt","stockQuantity","unitCostTry","weightKg","sellingPriceTry","isActive") values
        ('p1','MD-X','Kamera','2026-10-01',20,200,0.4,600,true),('p2','ANKIPSET03K1TB','Set','2026-10-01',2,1,5,17266,true);
      insert into cfo_set_fiyat (sku,kanal,kapasite,fiyat,maliyet,kargo,kar,pazaryeri) values ('ANKIPSET03K1TB',3,'1TB',17266,10002,250,3874.02,'TRENDYOL+AMAZON');
      insert into cfo_bank_account (id,name,"updatedAt","balanceTry","lastUpdatedAt","isActive","accountType","kmhLimitTry")
        values ('b1','Banka','2026-10-06',100000,now(),true,'TICARI',500000);
      insert into cfo_receivable (id,channel,"dueDate","amountTry","updatedAt","isCollected") values ('r1','TRENDYOL',current_date+5,40000,now(),false);
      insert into cfo_cash_event (id,"eventDate",kind,description,"updatedAt","outflowTry","isSettled") values ('e1',current_date+3,'KREDI_TAKSITI','taksit',now(),250000,false);`);
    const sales = (channel: string, prefix: string, day: string, n: number, total: number, qty = 1, rate = 0.18) => pg.exec(`insert into "MarketplaceSalesRecord"
      (id,channel,"orderNumber","orderDate",quantity,"modelNumber","totalAmountTry","commissionTry",status)
      select '${prefix}'||i,'${channel}','${prefix}'||i,'${day}',${qty},'MD-X',${total},${total * rate},'Teslim Edildi' from generate_series(1,${n}) i`);
    await sales("TRENDYOL", "t", "2026-09-28 10:00", 12, 300);
    await sales("HEPSIBURADA", "h", "2026-09-28 11:00", 12, 300);
    // multi-unit lines at 20% (inside the outlier band): the old rule would have blended them in (weighted 19%); the sample rule
    // (adet_duz=1, guven='YUKSEK') excludes them, so the measured Trendyol rate stays exactly 18%
    await sales("TRENDYOL", "tm", "2026-09-29 10:00", 6, 600, 2, 0.2);
    await sales("AMAZON_FBA", "f", "2026-09-29 12:00", 2, 300, 1, 0);

    const db: ReadSource = { async query<T extends Row>(sql: string, ...params: unknown[]) { return (await pg.query<T>(sql, params)).rows; } };
    // SQL tariff selection on the real table with the reviewed column names
    const cols = { min_try: `"alt_sinir"`, max_try: `"ust_sinir"`, kargo_try: `"toplam"` };
    const tariffAt = async (channel: string, gross: number, at: string, opts: ShippingOptions = { fallbackChannel: "TRENDYOL", effectiveRemap: { "2026-09-09": "2026-06-19" } }) => {
      const sql = shippingTariffSql(cols, "s.gross", "s.ch", "s.at", { channel: `"pazaryeri"`, effectiveFrom: `"gecerli_tarih"` }, opts);
      return (await pg.query<{ v: string | null }>(`select ${sql} as v from (select $1::text ch,$2::numeric gross,$3::timestamp at) s`, [channel, gross, at])).rows[0].v;
    };
    assert.equal(Number(await tariffAt("TRENDYOL", 300, "2026-07-01")), 91.89);
    assert.equal(Number(await tariffAt("TRENDYOL", 1600, "2026-09-30")), 154.91);
    assert.equal(Number(await tariffAt("TRENDYOL", 199.99, "2026-06-19")), 53.61, "valid from the measurement start");
    assert.equal(await tariffAt("TRENDYOL", 300, "2026-06-18"), null, "before the measurement window: unknown");
    assert.equal(Number(await tariffAt("HEPSIBURADA", 300, "2026-07-01")), 91.89, "channel assumption: Trendyol contracted cost");
    assert.equal(await tariffAt("AMAZON_FBA", 300, "2026-07-01"), null, "Amazon ships FBA orders: shipping stays unknown");
    assert.equal(await tariffAt("HEPSIBURADA", 300, "2026-07-01", { fallbackChannel: null, effectiveRemap: { "2026-09-09": "2026-06-19" } }), null);
    assert.equal(await tariffAt("TRENDYOL", 300, "2026-07-01", { fallbackChannel: "TRENDYOL", effectiveRemap: {} }), null, "uncorrected: bands start 09.09");

    const { buildCfoAgentSnapshot } = await import("../lib/cfo-agent/snapshot");
    const config = getCfoConfig({ AI_CFO_CANONICAL_SALES_VALIDATED: "true" });
    const now = new Date("2026-10-06T08:00:00Z");
    const s = await buildCfoAgentSnapshot({ db, now, config, compact: false });
    const missing = s.dataQuality.missingFields;
    assert.ok(!missing.some(f => f.startsWith("reviewed_source_changed")), `reviewed profile valid by default: ${missing.join(",")}`);
    assert.equal(s.calculationVersion, "alfas-gross-v7");

    // cash projection: real cfo_nakit_projeksiyon pozisyon = commercial bank cash + receivables/estimated collections − outflows; no overdraft
    const [native] = (await pg.query<{ m: string }>("select min(pozisyon) m from cfo_nakit_projeksiyon(120)")).rows;
    assert.equal(s.cash.minimumProjectedPosition.value, Number(native.m));
    assert.ok(s.cash.minimumProjectedPosition.value! < 0, "outflow exceeds cash: negative position stays negative (unused KMH 500k is not cash)");
    assert.equal(s.cash.minimumProjectedPosition.estimated, true);
    assert.match(s.cash.minimumProjectedPosition.reason ?? "", /excludes_overdraft/);
    assert.equal(s.cash.cash.value, 100000);
    assert.equal(s.cash.generalUnusedOverdraft.value, 500000);

    // price floors: Trendyol own bands; Hepsiburada priced with Trendyol bands, labelled as an assumption
    const ty = s.products.find(p => p.sku === "MD-X" && p.channel === "TRENDYOL"), hb = s.products.find(p => p.sku === "MD-X" && p.channel === "HEPSIBURADA");
    // Direct Hepsiburada API table is empty (sales arrive via Entegra): not a stale source, and the HB channel's
    // freshness follows Entegra instead of being permanently stale (production 2026-10-07 false alarm).
    const entegra = s.dataQuality.sourceWatermarks.find(w => w.source === "Entegra");
    assert.ok(entegra, "Entegra watermark present");
    assert.ok(!s.dataQuality.sourceWatermarks.some(w => w.source === "Hepsiburada"), "unconfigured direct HB source is not a watermark");
    assert.ok(!s.dataQuality.staleSources.includes("Hepsiburada"), "unconfigured direct HB source is not stale");
    assert.equal(hb!.sourceFresh, entegra!.stale === false, "HB channel freshness follows Entegra");
    assert.ok(ty && hb, `product signals: ${s.products.map(p => `${p.sku}/${p.channel}`).join(",")}`);
    assert.ok(ty!.commissionRate.value != null, "measured commission");
    const trust = (await pg.query<{ g: string; a: number; n: number }>(`select guven::text g, adet_duz a, count(*)::int n from cfo_satis_birim_duz where channel='TRENDYOL' group by 1,2 order by 2`)).rows;
    assert.deepEqual(trust, [{ g: "YUKSEK", a: 1, n: 12 }, { g: "YUKSEK", a: 2, n: 6 }], "fixture: single- and multi-unit YUKSEK lines");
    assert.ok(Math.abs(ty!.commissionRate.value! - 0.18) < 1e-9, `commission sample = adet_duz=1 & guven=YUKSEK only (got ${ty!.commissionRate.value})`);
    // rows the sample rule excludes (multi-unit) are not "outliers": only MAD rejections inside the eligible sample count
    assert.equal(s.dataQuality.commissionCoverage.find(c => c.channel === "TRENDYOL")?.outliers, 0, "excluded multi-unit lines are not reported as outliers");
    // FBA stock lives in Amazon warehouses: with FBA inventory unknown, our XML stock never yields FBA stock-days (no false STOCKOUT)
    const fba = s.products.find(p => p.sku === "MD-X" && p.channel === "AMAZON_FBA");
    assert.ok(fba && s.dataQuality.fbaInventoryUnknown, `FBA product signal present: ${s.products.map(p => `${p.sku}/${p.channel}`).join(",")}`);
    assert.deepEqual([fba!.stockDays.value, fba!.stockDays.reason], [null, "fba_inventory_unknown"]);
    assert.notEqual(ty!.stockDays.reason, "fba_inventory_unknown");
    assert.equal(ty!.priceFloor.value, priceFloor(200, ty!.commissionRate.value, 0.4, BANDS, true).value);
    assert.equal(ty!.priceFloor.reason, undefined);
    assert.ok(hb!.commissionRate.value != null, "measured commission (Hepsiburada)");
    assert.equal(hb!.priceFloor.value, priceFloor(200, hb!.commissionRate.value, 0.4, BANDS, true).value);
    assert.equal(hb!.priceFloor.reason, "shipping_channel_assumption:TRENDYOL");
    assert.equal(hb!.zeroCommissionFloor.reason, "shipping_channel_assumption:TRENDYOL");
    assert.equal(hb!.zeroCommissionFloor.value, priceFloor(200, 0, 0.4, BANDS, true).value);

    // SET: the set's own cost from cfo_set_fiyat, never Product.unitCostTry (1)
    assert.equal(s.inventory.knownCostValue.value, 20 * 200 + 2 * 10002);
    assert.ok(!missing.some(f => f.startsWith("inventory_cost_unknown")));

    // AI_CFO_SOURCE_PROFILE=off: no reviewed mapping → projection/floors/set cost unknown (fail closed, nothing guessed)
    process.env.AI_CFO_SOURCE_PROFILE = "off";
    const off = await buildCfoAgentSnapshot({ db, now, config, compact: false });
    delete process.env.AI_CFO_SOURCE_PROFILE;
    assert.equal(off.cash.minimumProjectedPosition.value, null);
    assert.ok(off.dataQuality.missingFields.includes("projection_position_column_unvalidated"));
    const offTy = off.products.find(p => p.sku === "MD-X" && p.channel === "TRENDYOL");
    assert.ok(offTy);
    assert.deepEqual([offTy!.priceFloor.value, offTy!.priceFloor.reason], [null, "shipping_band_unavailable"]);
    assert.equal(off.inventory.costValue.value, null, "set cost unknown without the reviewed binding");
    console.log("AI CFO source mapping: kargo bands (toplam, measured fee once, 19.06 validity, Trendyol assumption for other channels), SET cost from cfo_set_fiyat, cash projection pozisyon (no overdraft), default reviewed profile + off switch passed");
  } finally { await pg.close(); }
}
main().then(() => process.exit(process.exitCode ?? 0)).catch(e => { console.error(e); process.exit(1); });

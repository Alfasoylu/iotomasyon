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
    assert.equal(s.calculationVersion, "alfas-gross-v10");

    // Maliyet kapsamı TEK tanım (cfo_maliyet_kapsami_at, 2026-10-08): motor sayıyı fonksiyondan asOf ile alır; ciro dört parçaya
    // ayrılır ve toplamı cirodur; görünüm aynı fonksiyonun now() çağrısıdır; anon/authenticated/PUBLIC okuyamaz.
    type Cov = { kapsam_pct: string; ciro_try: string; kapsanan_try: string; guvenilmez_try: string; eslesmeyen_try: string; maliyetsiz_try: string; eslesme_pct: string; pencere_bas: string; pencere_bit: string };
    const [cov] = (await pg.query<Cov>(`select pencere_bas::text, pencere_bit::text, kapsam_pct::text, ciro_try::text, kapsanan_try::text, guvenilmez_try::text,
      eslesmeyen_try::text, maliyetsiz_try::text, eslesme_pct::text from cfo_maliyet_kapsami_at($1::timestamptz)`, [now.toISOString()])).rows;
    assert.deepEqual([cov.pencere_bas, cov.pencere_bit], ["2026-09-06", "2026-10-05"], "son 30 tam gün, bugün hariç");
    assert.ok(Number(cov.ciro_try) > 0, "fikstür satışları pencerede");
    assert.equal(s.dataQuality.costCoveragePct, Number(cov.kapsam_pct), "motor kapsamı fonksiyondan okur");
    assert.equal(s.dataQuality.matchingCoveragePct, Number(cov.eslesme_pct));
    assert.equal(Number(cov.kapsanan_try) + Number(cov.guvenilmez_try) + Number(cov.eslesmeyen_try) + Number(cov.maliyetsiz_try), Number(cov.ciro_try), "parçalar ciroyu tam tutar");
    assert.equal((await pg.query("select * from cfo_maliyet_kapsami")).rows.length, 1, "görünüm tek satır");
    const covAcl = (await pg.query<{ g: string }>(`select grantee g from information_schema.role_table_grants where table_name='cfo_maliyet_kapsami' and grantee in ('anon','authenticated','PUBLIC')`)).rows;
    assert.deepEqual(covAcl, []);
    const covExec = (await pg.query<{ a: boolean; u: boolean }>(`select has_function_privilege('anon','public.cfo_maliyet_kapsami_at(timestamptz)','execute') a,
      has_function_privilege('authenticated','public.cfo_maliyet_kapsami_at(timestamptz)','execute') u`)).rows[0];
    assert.deepEqual([covExec.a, covExec.u], [false, false], "fonksiyonu anon/authenticated çalıştıramaz");

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
    // Weekly Entegra upload (2026-10-07): last order 2026-09-29, now 2026-10-06 (~6.9 days) is still fresh under the
    // 8-day weekly threshold; two days later it is stale. Days the upload has not reached keep periods incomplete.
    assert.equal(entegra!.stale, false, "Entegra within the weekly window is fresh");
    assert.equal(s.sales.yesterday.complete, false, "a day the weekly upload has not reached stays incomplete (no false revenue drop)");
    const late = await buildCfoAgentSnapshot({ db, now: new Date("2026-10-08T08:00:00Z"), config, compact: false });
    assert.equal(late.dataQuality.sourceWatermarks.find(w => w.source === "Entegra")?.stale, true, "Entegra older than 8 days is stale");
    assert.ok(late.dataQuality.staleSources.includes("Entegra"));
    // Gap between weekly Entegra uploads (2026-10-07): days after Entegra's last complete day (latest order 09-29 is the
    // partial upload day → cutoff 09-28) come from the Trendyol API × Entegra's trailing 28-day all/Trendyol ratio
    // (09-28: 3600 TY + 3600 HB → 2). Cancelled API lines are ignored; the result is flagged estimated.
    assert.equal(s.sales.yesterday.grossRevenue.estimated, false, "no API rows yet → no estimate");
    await pg.exec(`insert into "TrendyolSalesRecord" (id,"orderId","lineId","orderDate",status,"productName",quantity,"unitPriceTry","totalPriceTry","syncedAt") values
      ('ty1','9001',1,'2026-10-05 10:00','Delivered','MD-X',1,1000,1000,'2026-10-06 07:00'),
      ('ty2','9002',1,'2026-10-05 11:00','Cancelled','MD-X',1,5000,5000,'2026-10-06 07:00')`);
    const gap = await buildCfoAgentSnapshot({ db, now, config, compact: false });
    assert.equal(gap.sales.yesterday.grossRevenue.value, 2000, "1000 TY API × ratio 2 (cancelled excluded)");
    assert.equal(gap.sales.yesterday.grossRevenue.estimated, true);
    assert.equal(gap.sales.yesterday.grossRevenue.reason, "entegra_gap_estimated_from_trendyol_api");
    assert.equal(gap.sales.last7Days.grossRevenue.value, 2000, "partial upload day 09-29 (4200 Entegra) replaced by the estimate");
    assert.equal(gap.sales.last7Days.complete, false, "estimated days still need full day coverage");

    // Girdi şartnamesi Blok A eki + B + C (2026-10-07): production şemasının görünümlerinden salt-okunur yüklenir.
    const { loadCfoContext } = await import("../lib/cfo-agent/context");
    await pg.exec(`insert into cfo_change_log (id,"changedAt",area,item,"newValue",source,kind) values ('cl_t1',now(),'veri','nakit açığı ölçüldü','Açık 533.740 TL','test','bulgu')`);
    const ctx = await loadCfoContext(late, config, db);
    const q = (e: { query: string }) => e.query;
    assert.ok(ctx.state.some(e => q(e) === "tazelik.susan_kurallar" && String(e.value).includes("Entegra bayat → PRICE_BELOW_FLOOR")), "Entegra bayatken susan kurallar Blok B'de");
    assert.ok(ctx.state.some(e => q(e).startsWith("nakit_kapisi.")), "nakit kapısı satırları");
    assert.ok(ctx.state.some(e => q(e).startsWith("kaynak.")), "kaynak yeterliliği satırları");
    assert.ok(ctx.memory.some(e => q(e).startsWith("defter.cl_t1.veri/bulgu") && e.value === "Açık 533.740 TL"), "defter Blok C'de");
    assert.match(ctx.tables, /KARGO TARİFESİ \(cfo_kargo_tarife\)/);
    assert.ok(ctx.state.some(e => q(e) === "banka.son_girilen_toplam_try" && typeof e.value === "number"), "banka ileri taşıma: son girilen toplam");
    assert.ok(ctx.state.some(e => q(e).startsWith("banka.ileri_tasinan_toplam_try") && e.measured === false), "ileri taşınan toplam TAHMİNİ");
    assert.ok(new Set([...ctx.state, ...ctx.memory].map(e => e.id)).size === ctx.state.length + ctx.memory.length, "bağlam kanıt id'leri benzersiz");
    // Kanal sözlüğü + kaldıraç merdiveni (2026-10-07): el kitabı sahibinin üretimde tuttuğu tablolar; şema artık migration'dan
    // (20261007220000_cfo_ledger_tables_capture, CHECK kısıtlarıyla). Hakediş bankası YALNIZ sözlükten: sözlükte yok / banka
    // ölçülmedi → eşlenmez, nedeniyle raporlanır; bankasız çıkış hiçbir hesaba atanmaz, yalnız şirket toplamından düşülür.
    await pg.exec(`insert into cfo_kanal_sozluk (yazim,kanonik,banka,kaynak_tablo,guven) values ('Idefix','IDEFIX','Banka','cfo_receivable','OLCULDU'),('TEMU','TEMU',null,'cfo_receivable','OLCULMEDI');
      insert into cfo_kaldirac_basamak (basamak,ad,durum,tl_kapasite,tl_maliyet,kaynak,guven,note) values
        (3,'Trendyol erken odeme','BOSTA',250000,null,'test','TAHMINI','en ucuz bos basamak'),(7,'Sahsi hesaplar','BILINCLI_TUTULUYOR',1550000,null,'test','OLCULDU','hedef sahsi kartlari kapatmak');
      update cfo_bank_account set "lastUpdatedAt"='2026-10-04 10:00' where id='b1';
      insert into cfo_receivable (id,channel,"dueDate","amountTry","updatedAt","isCollected") values
        ('r2','Idefix','2026-10-06',5000,now(),false),('r3','TEMU','2026-10-06',3000,now(),false),('r4','YeniKanal','2026-10-06',2000,now(),false);
      insert into cfo_cash_event (id,"eventDate",kind,description,"updatedAt","outflowTry","isSettled",bank) values
        ('e2','2026-10-07','SABIT_GIDER','sabit gider kalani',now(),100000,true,null);`);
    const ctx2 = await loadCfoContext(late, config, db);
    const v = (key: string) => ctx2.state.find(e => q(e).startsWith(key))?.value;
    assert.equal(v("banka.Banka.ileri_tasinan_try"), 100000 + 5000, "Idefix hakedişi sözlükteki bankaya gider");
    assert.equal(v("banka.hesabi_belirsiz_try"), 3000 + 2000 - 100000, "ölçülmemiş/sözlükte olmayan hakediş ve bankasız çıkış hesaba atanmaz");
    assert.equal(v("banka.ileri_tasinan_toplam_try"), 105000 + 3000 + 2000 - 100000, "şirket toplamı = hesaplar + hesabı belirsiz");
    const unm = String(v("banka.eslenmeyen_kalemler"));
    assert.match(unm, /TEMU hakediş 3000 TRY — sözlükte banka ölçülmedi \(OLCULMEDI\)/);
    assert.match(unm, /YeniKanal hakediş 2000 TRY — sözlükte yok: YeniKanal/);
    assert.match(unm, /sabit gider kalani -100000 TRY — takvimde banka yok/);
    assert.match(String(v("merdiven.7.Sahsi hesaplar.durum")), /^BILINCLI_TUTULUYOR \(ÖNERME\)/, "bilinçli tutulan basamak işaretli");
    // Gelecek ithalat (2026-10-07): proje beklenen cirosu + konteynerdeki katalogda olmayan yeni ürünler CFO bağlamında
    await pg.exec(`insert into cfo_import_project (id,code,status,"etaDate","expectedRevenueTry","expectedProfitTry","salesMonths","dataTag","updatedAt")
        values ('ip1','KONT-1','YOLDA','2026-11-01',600000,240000,6,'KESIN',now()),('ip2','ESKI','TESLIM_ALINDI',null,999,null,null,'KESIN',now());
      insert into urun_aday (sku,satis_try,adet,durum) values ('YENI-1',100,50,'TASLAK'),('MD-X',200,10,'HAZIR'),('RED-1',999,9,'REDDEDILDI');`);
    const ctx3 = await loadCfoContext(late, config, db);
    const w = (key: string) => ctx3.state.find(e => q(e).startsWith(key))?.value;
    assert.equal(w("ithalat.KONT-1.aylik_ciro_katkisi_try"), 100000, "600.000 / 6 ay");
    assert.equal(w("ithalat.ESKI."), undefined, "teslim alınmış proje gelecek ciro değildir");
    assert.equal(w("ithalat.yeni_urun.liste_fiyatli_brut_try"), 100 * 50 + 200 * 10, "reddedilen aday sayılmaz");
    assert.equal(w("ithalat.yeni_urun.katalogda_olmayan"), "1/2 ürün, 60 adet", "MD-X katalogda var");
    // ALFASHOME kanalı (2026-10-07): tablo üretimde (bootstrap'ta da var). Boş tablo → "hiç senkron yok", ölçüm sayılmaz.
    // Ödenmiş + iptal olmayan ciro sayılır.
    assert.match(String(w("alfashome.senkron")), /hiç senkron yok/, "boş tablo: senkron hiç çalışmadı diye bildirilir");
    await pg.exec(`insert into alfashome_order (id,ordered_at,amount,status,payment_status,item_qty,synced_at) values
      ('o1','2026-10-06 10:00+03',1000,'pending','captured',2,'2026-10-08 06:00+03'),
      ('o2','2026-10-07 11:00+03',500,'pending','awaiting',1,'2026-10-08 06:00+03'),
      ('o3','2026-10-05 09:00+03',700,'canceled','canceled',1,'2026-10-08 06:00+03'),
      ('o4','2026-08-01 09:00+03',9000,'completed','captured',3,'2026-10-08 06:00+03');`);
    const ctx4 = await loadCfoContext(late, config, db);
    const x = (key: string) => ctx4.state.find(e => q(e).startsWith(key))?.value;
    assert.equal(x("alfashome.ciro_son_30_gun_try"), 1000, "ödeme bekleyen, iptal ve 30 günden eski sayılmaz");
    assert.equal(x("alfashome.odeme_bekleyen_son_30_gun_try"), 500);
    assert.equal(x("alfashome.siparis_son_30_gun"), 1);
    assert.equal(x("alfashome.son_siparis"), "2026-10-07");
    assert.equal(v("merdiven.3.Trendyol erken odeme.kapasite_try"), 250000);
    assert.equal(ctx2.state.find(e => q(e).startsWith("merdiven.3."))?.measured, false, "TAHMINI basamak ölçülmemiş sayılır");

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

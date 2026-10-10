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
    // Satır sınıflaması (20261008200000): toplam fonksiyonu satırlardan alır — eski (190000) gövdeyle birebir aynı sonuç; satır
    // toplamları dört parçaya eşit; anon/authenticated çalıştıramaz; kapsam eşik altındaysa motor kapatan listeyi aynı satırlardan kurar.
    const full = async () => (await pg.query<Record<string, unknown>>(`select row_to_json(k)::text j from cfo_maliyet_kapsami_at($1::timestamptz) k`, [now.toISOString()])).rows[0];
    const viaRows = await full();
    await pg.exec(readFileSync("prisma/migrations/20261008190000_cfo_maliyet_kapsami_satir_kimligi/migration.sql", "utf8"));
    assert.deepEqual(await full(), viaRows, "satır fonksiyonu üzerinden toplam = eski tek parça gövde");
    await pg.exec(readFileSync("prisma/migrations/20261008200000_cfo_maliyet_kapsami_satir/migration.sql", "utf8"));
    const bucket = (await pg.query<{ durum: string; t: string }>(`select durum, sum(tutar)::text t from cfo_maliyet_kapsami_satir($1::timestamptz) group by durum`, [now.toISOString()])).rows;
    const tb = (d: string) => Number(bucket.find(b => b.durum === d)?.t ?? 0);
    assert.deepEqual([tb("kapsanan"), tb("guvenilmez"), tb("eslesmeyen"), tb("maliyetsiz")].map(v => Math.round(v * 100) / 100),
      [Number(cov.kapsanan_try), Number(cov.guvenilmez_try), Number(cov.eslesmeyen_try), Number(cov.maliyetsiz_try)], "satır toplamları = kovalar");
    const rowExec = (await pg.query<{ a: boolean; u: boolean }>(`select has_function_privilege('anon','public.cfo_maliyet_kapsami_satir(timestamptz)','execute') a,
      has_function_privilege('authenticated','public.cfo_maliyet_kapsami_satir(timestamptz)','execute') u`)).rows[0];
    assert.deepEqual([rowExec.a, rowExec.u], [false, false], "satır fonksiyonunu anon/authenticated çalıştıramaz");
    const strict = await buildCfoAgentSnapshot({ db, now, config: { ...config, minCostCoveragePct: 100 }, compact: false });
    const g = strict.dataQuality.costCoverageGap;
    if (Number(cov.kapsam_pct) < 100) {
      assert.ok(g && g.items.length > 0, "eşik altı → kapatan liste");
      assert.equal(g!.gapTry, Math.max(0, Math.ceil(Number(cov.ciro_try) - Number(cov.kapsanan_try))));
      assert.ok(g!.items.every(i => ["maliyetsiz", "eslesmeyen", "guvenilmez"].includes(i.durum)));
    }
    assert.equal(s.dataQuality.costCoveragePct! >= config.minCostCoveragePct ? s.dataQuality.costCoverageGap : undefined, undefined, "eşik üstünde liste yok");

    // Metrik mutabakatı (CFO-001 PR-A): scripts/cfo/metric-reconciliation.sql üretim kopyasında hatasız çalışır, tek satır döner;
    // net sermaye varyantları kendi bileşenlerinden tutarlı (dar + yoldaki ödenmiş = geniş), kredi servet satırı = kalan anapara.
    const [rec] = (await pg.query<Record<string, string | number | null>>(readFileSync("scripts/cfo/metric-reconciliation.sql", "utf8"))).rows;
    assert.ok(rec && "net_dar_bugunku" in rec && "borc_finansal_sirket" in rec && "tcmb_aylik" in rec, "mutabakat satırı");
    assert.equal(Math.round((Number(rec.net_dar_bugunku) + Number(rec.yolda_odenmis)) * 100), Math.round(Number(rec.net_genis_bugunku) * 100), "geniş = dar + yoldaki ödenmiş");
    assert.equal(Number(rec.kredi_servet_fark), 0, "override yokken kredi satırı = kalan anapara");
    assert.ok(Number(rec.stok_lcnrv) <= Number(rec.stok_maliyet) + 0.01, "LCNRV maliyeti aşmaz");
    // Kredi borcu = kalan anapara (CFO-004, migration 20261009100000): remainingOverride bir TAKSİT SAYISIDIR, TL olarak toplanmaz.
    const loanLine = async () => Number((await pg.query<{ t: string }>(`select tutar::text t from cfo_servet_kalem where sira = 7`)).rows[0].t);
    const loanBefore = await loanLine();
    await pg.exec(`insert into cfo_loan (id,bank,name,"remainingTry","remainingOverride","updatedAt") values ('ov1','Test','Override kredisi',500000,12,now())`);
    assert.equal(await loanLine(), loanBefore - 500000, "override=12 taksit iken borç 500.000 TL artar (12 TL değil)");
    const [after] = (await pg.query<Record<string, string>>(readFileSync("scripts/cfo/metric-reconciliation.sql", "utf8"))).rows;
    assert.equal(Number(after.kredi_servet_fark), 0, "mutabakat: kredi satırı = kalan anapara");
    assert.equal(Number(after.kredi_override_sayisi), 1);
    await pg.exec(`delete from cfo_loan where id = 'ov1'`);
    // Kart ertelemesi = KART faizi (CFO-005b): asgariye çekilen kısım kartın akdi oranı × 1,30 (KKDF+BSMV) ile; küresel KMH oranı
    // (cfo_settings 4,5) KULLANILMAZ; kartın oranı yoksa aylık faiz NULL ve gerekçe "BILINMIYOR".
    await pg.exec(`insert into cfo_settings (id,"updatedAt","kmhMonthlyRatePct","netPositionFloorTry","cardMinPct") values ('st2',now(),4.5,0,20);
      insert into cfo_credit_card (id,bank,"statementDebtTry","totalDebtTry","contractMonthlyRatePct","isActive","updatedAt") values ('cc1','TestBank',100000,100000,4.25,true,now());
      insert into cfo_cash_event (id,"eventDate",kind,description,"updatedAt","outflowTry","isSettled") values ('ek1',current_date+1,'KART_ODEMESI','TestBank kart ekstre',now(),100000,false);`);
    const kart = (await pg.query<{ karar: string; yeni_odeme: string; kazanc: string; aylik_faiz: string | null; gerekce: string }>(
      `select karar, yeni_odeme::text, kazanc::text, aylik_faiz::text, gerekce from cfo_kart_karari() where karar = 'ASGARIYE CEK'`)).rows;
    assert.equal(kart.length, 1, "taban deliniyor → kart asgariye çekilir");
    assert.deepEqual([Number(kart[0].yeni_odeme), Number(kart[0].kazanc)], [20000, 80000]);
    // Çarpan 1,20 (KKDF %15 + BSMV %5; karar 2026-10-09, migration 20261009160000 — üretimde uygulandı; yeniden uygulama idempotent)
    assert.equal(Number(kart[0].aylik_faiz), Math.round(80000 * 0.0425 * 1.2 * 100) / 100, "kart akdi × 1,20 — KMH %4,5 değil");
    const BSMV = "20261009160000_cfo_kart_karari_bsmv";
    assert.ok(res.pendingInProduction.includes(BSMV));
    await pg.exec(readFileSync(`prisma/migrations/${BSMV}/migration.sql`, "utf8"));
    const kart12 = (await pg.query<{ aylik_faiz: string; gerekce: string }>(`select aylik_faiz::text, gerekce from cfo_kart_karari() where karar = 'ASGARIYE CEK'`)).rows[0];
    assert.equal(Number(kart12.aylik_faiz), Math.round(80000 * 0.0425 * 1.2 * 100) / 100, "kart akdi × 1,20");
    assert.match(kart12.gerekce, /x 1,20 KKDF\+BSMV/);
    await pg.exec(`update cfo_credit_card set "contractMonthlyRatePct" = null where id = 'cc1'`);
    const kartBilinmiyor = (await pg.query<{ aylik_faiz: string | null; gerekce: string }>(`select aylik_faiz::text, gerekce from cfo_kart_karari() where karar = 'ASGARIYE CEK'`)).rows[0];
    assert.equal(kartBilinmiyor.aylik_faiz, null, "oran yok → faiz UNKNOWN");
    assert.match(kartBilinmiyor.gerekce, /BILINMIYOR/);
    await pg.exec(`delete from cfo_cash_event where id = 'ek1'; delete from cfo_credit_card where id = 'cc1'; delete from cfo_settings where id = 'st2'`);

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
    // Bayatlık kapısı önemlilik eşikli (Cowork CFO 2026-10-08): 419,53 TL'lik bayat hesap CASH_CRITICAL'ı susturmaz, kanıta
    // uyarı olarak girer; materialMinTry (10.000) üstü bayat hesap ya da bakiyesi bilinmeyen hesap kapıyı kapatır.
    await pg.exec(`insert into cfo_bank_account (id,name,"updatedAt","balanceTry","lastUpdatedAt","isActive","accountType")
      values ('b2','Ziraat USD','2026-09-01',419.53,'2026-09-01',true,'TICARI')`);
    const small = await buildCfoAgentSnapshot({ db, now, config, compact: false });
    assert.equal(small.cash.banksFresh, true, "önemsiz bayat hesap kapıyı kapatmaz");
    assert.deepEqual(small.cash.staleBanks, [{ name: "Ziraat USD", balanceTry: 419.53, material: false }]);
    assert.equal(small.cash.summaries.find(e => e.query === "stale_immaterial")?.value, "Ziraat USD (420 TL)");
    assert.ok(!small.dataQuality.staleSources.includes("banks"));
    await pg.exec(`insert into cfo_bank_account (id,name,"updatedAt","balanceTry","lastUpdatedAt","isActive","accountType")
      values ('b3','Garanti','2026-09-01',50000,'2026-09-01',true,'TICARI')`);
    const big = await buildCfoAgentSnapshot({ db, now, config, compact: false });
    assert.equal(big.cash.banksFresh, false, "önemli bayat hesap nakit kurallarını susturur");
    assert.ok(big.dataQuality.staleSources.includes("banks"));
    await pg.exec(`delete from cfo_bank_account where id in ('b2','b3')`);
    // KMH faizi dahil dip (yol haritası 6a): hiçbir KMH limitinin oranı ölçülmemişse kanıt yok (uydurma oran yok); küresel
    // cfo_settings oranı KULLANILMAZ (Cowork 2026-10-08). Hesabın ölçülmüş oranı girilince aşağı yön baz senaryosu (kademeli faiz)
    // CASH_CRITICAL kanıtına eklenir — kanonik dip (projeksiyon) değişmez, faizli dip ondan kötü ya da eşittir.
    const ev = (snap: typeof s, k: string) => snap.cash.summaries.find(e => e.query === k)?.value;
    assert.equal(ev(s, "kmh_dahil_dip"), undefined, "KMH oranı yokken faizli dip yazılmaz");
    await pg.exec(`insert into cfo_settings (id,"updatedAt","kmhMonthlyRatePct") values ('st1',now(),5)`);
    const globalOnly = await buildCfoAgentSnapshot({ db, now, config, compact: false });
    assert.equal(ev(globalOnly, "kmh_dahil_dip"), undefined, "küresel oran banka oranı yerine geçmez");
    await pg.exec(`update cfo_bank_account set "monthlyRatePct" = 5 where id = 'b1'`);
    const withRate = await buildCfoAgentSnapshot({ db, now, config, compact: false });
    assert.equal(ev(withRate, "kmh_orani_olculmemis"), undefined, "tek dilim ölçülmüş → faiz eksiksiz");
    assert.ok(Number(ev(withRate, "kmh_dahil_dip")) <= withRate.cash.minimumProjectedPosition.value!, "faizli dip faizsizden kötü ya da eşit");
    assert.ok(Number(ev(withRate, "kmh_faizi_120g")) > 0, "eksi pozisyon faiz doğurur");
    assert.equal(withRate.cash.minimumWithInterestTry, Number(ev(withRate, "kmh_dahil_dip")), "kural tetiği faizli dibi görür (Cowork 3/3)");
    assert.equal(s.cash.minimumWithInterestTry ?? null, null, "oran yokken tetik yalnız projeksiyon");
    assert.match(String(ev(withRate, "kmh_dahil_fonlama")), /KMH|FONLANAMIYOR|şahsi|gümrük/);
    assert.match(String(ev(withRate, "kmh_dahil_dip_tarih")), /^\d{4}-\d{2}-\d{2}$/);
    await pg.exec(`delete from cfo_settings where id = 'st1'; update cfo_bank_account set "monthlyRatePct" = null where id = 'b1'`);
    // Mükerrer anahtarı platform satır kimliğini içerir (Cowork CFO ölçümü 2026-10-08): aynı siparişte aynı modelin iki satırı
    // ayrı externalLineId ile gelirse (ayrı koli) mükerrer DEĞİL. (kanal, sipariş, externalLineId) tabloda tekil olduğundan gerçek
    // mükerrer yalnız satır kimliği BOŞ satırlarda mümkündür — onlar ayırt edilemez, mükerrer sayılır (ihtiyatlı).
    const dupBefore = s.dataQuality.duplicateCanonicalRows;
    await pg.exec(`insert into "MarketplaceSalesRecord" (id,channel,"orderNumber","orderDate",quantity,"modelNumber","totalAmountTry","commissionTry",status,"externalLineId")
      values ('k1','HEPSIBURADA','KOLI-1','2026-09-30 10:00',1,'MD-X',300,54,'Teslim Edildi','155104'),('k2','HEPSIBURADA','KOLI-1','2026-09-30 10:00',1,'MD-X',300,54,'Teslim Edildi','155582')`);
    const twoParcels = await buildCfoAgentSnapshot({ db, now, config, compact: false });
    assert.equal(twoParcels.dataQuality.duplicateCanonicalRows, dupBefore, "ayrı satır kimliği → mükerrer değil");
    await pg.exec(`insert into "MarketplaceSalesRecord" (id,channel,"orderNumber","orderDate",quantity,"modelNumber","totalAmountTry","commissionTry",status,"externalLineId")
      values ('k3','HEPSIBURADA','KOLI-2','2026-09-30 10:00',1,'MD-X',300,54,'Teslim Edildi',null),('k4','HEPSIBURADA','KOLI-2','2026-09-30 10:00',1,'MD-X',300,54,'Teslim Edildi',null)`);
    const realDup = await buildCfoAgentSnapshot({ db, now, config, compact: false });
    assert.equal(realDup.dataQuality.duplicateCanonicalRows, dupBefore + 2, "satır kimliği boş iki satır → ayırt edilemez, mükerrer");
    await pg.exec(`delete from "MarketplaceSalesRecord" where id in ('k1','k2','k3','k4')`);
    // CFO-028 (Alperen 2026-10-10): EPTT tutarı boşken Entegra oranı × toplam = TAHMİNİ komisyon → kanal marjına girer (estimated),
    // SKU oran ölçümüne girmez (commissionRate UNKNOWN kalır); tek satırda oran da yoksa kanal komisyonu bilinmiyor (0 değil).
    await pg.exec(`insert into "MarketplaceSalesRecord" (id,channel,"orderNumber","orderDate",quantity,"modelNumber","totalAmountTry","commissionTry","commissionPct",status)
      values ('pt1','EPTT','P-1','2026-09-30 10:00',1,'MD-X',500,null,15,'Teslim Edildi'),('pt2','EPTT','P-2','2026-09-30 11:00',1,'MD-X',400,60,15,'Teslim Edildi')`);
    const eptt = await buildCfoAgentSnapshot({ db, now, config, compact: false });
    const epttCh = eptt.channels.find(c => c.channel === "EPTT")?.profitability;
    assert.deepEqual([epttCh?.commission.value, epttCh?.commission.estimated], [60 + 75, true], "EPTT: kayıtlı 60 + tahmini 500×%15 = 135, ölçülmemiş");
    assert.equal(eptt.products.find(p => p.channel === "EPTT" && p.sku === "MD-X")?.commissionRate.value, null, "SKU oran ölçümüne girmez");
    assert.ok(Math.abs(eptt.products.find(p => p.channel === "TRENDYOL" && p.sku === "MD-X")!.commissionRate.value! - 0.18) < 1e-9, "ölçülen kanal oranı değişmez");
    await pg.exec(`insert into "MarketplaceSalesRecord" (id,channel,"orderNumber","orderDate",quantity,"modelNumber","totalAmountTry","commissionTry","commissionPct",status)
      values ('pt3','EPTT','P-3','2026-09-30 12:00',1,'MD-X',300,null,null,'Teslim Edildi')`);
    const epttGap = await buildCfoAgentSnapshot({ db, now, config, compact: false });
    assert.equal(epttGap.channels.find(c => c.channel === "EPTT")?.profitability.commission.value, null, "oranı da olmayan satır → kanal komisyonu bilinmiyor");
    await pg.exec(`delete from "MarketplaceSalesRecord" where id in ('pt1','pt2','pt3')`);
    console.log("AI CFO source mapping: kargo bands (toplam, measured fee once, 19.06 validity, Trendyol assumption for other channels), SET cost from cfo_set_fiyat, EPTT estimated commission (channel only), cash projection pozisyon (no overdraft), default reviewed profile + off switch passed");
  } finally { await pg.close(); }
}
main().then(() => process.exit(process.exitCode ?? 0)).catch(e => { console.error(e); process.exit(1); });

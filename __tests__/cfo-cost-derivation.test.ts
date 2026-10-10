import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite/vector";
import { bootstrap } from "../scripts/schema-baseline/bootstrap";
import { calcImportCost, resolveShipping } from "../lib/importer-cost";
import { COST_DERIVATION_SOURCE, deriveUnitCosts, derivationLog, type CostFx, type CostRow } from "../lib/cfo/cost-derivation";
import { costRowsSql, runCostDerivation, type CostDb } from "../lib/cfo/cost-derivation-data";
import { costJumpSql, evaluateCfoAlarms, type AlarmInput } from "../lib/cfo-agent/health";

// CFO-029: CFO birim maliyeti ithalat motorundan otomatik türetilir. Saf kurallar (gümrük GTİP'ten, tarife/kayıt yoksa atla, kur
// varsayılansa yazma, yurt içi = USD × kur, idempotent, büyük değişim) + üretim kopyasında korumalı yazma, günlük, özet ve cost_jump alarmı.
// Çalıştır: node --conditions=react-server --import tsx __tests__/cfo-cost-derivation.test.ts

// Türkçe tercih kaydı (üretimde "deniz"/"DENIZ" 29 ürün) artık motor tarafından tanınır; ROI'ye düşmez
assert.equal(resolveShipping("deniz", 0.1), "SEA");
assert.equal(resolveShipping("DENİZ", 0.1), "SEA");
assert.equal(resolveShipping(" hava ", 50), "AIR");
assert.equal(resolveShipping("IC_PIYASA", 6), "SEA", "tanınmayan tercih eski kurala düşer (≥5 kg deniz)");

const fx: CostFx = { usdTry: 48.98, rmbPerUsd: 6.7, usdTrySource: "cfo_kur 2026-10", rmbSource: "elle 2026-10" };
const row = (o: Partial<CostRow>): CostRow => ({ sku: "X", sourceCostRmb: 100, weightKg: 1, importPaymentFeePct: 5, shippingMethodPref: null,
  customsRatePct: null, unitCostUsd: null, unitCostTry: null, trendyolPriceTry: null, xmlTrendyolPriceUsd: null, tariffBurdenPct: 47.2, stock: 10, valuedStock: true, ...o });
const engine = (rmb: number, kg: number, cus: number, pref: string | null, ty: number | null) =>
  calcImportCost({ sourceCostRmb: rmb, weightKg: kg, customsRatePct: cus, importPaymentFeePct: 5, shippingMethodPref: pref, rmbUsdRate: 6.7, trendyolPriceTry: ty, usdTryRate: 48.98 })!;

// RMB/USD tek kaynak: bilinmiyorsa (null) ya da USD/TRY varsayılandaysa hiçbir şey yazılmaz — sabit yedek (7,2) yok
assert.equal(deriveUnitCosts([row({})], { ...fx, usdTrySource: "varsayılan" }).status, "kur_bilinmiyor");
const noRmb = deriveUnitCosts([row({})], { ...fx, rmbPerUsd: null, rmbSource: "bilinmiyor" });
assert.deepEqual([noRmb.status, noRmb.updates.length], ["kur_bilinmiyor", 0]);
assert.equal(calcImportCost({ sourceCostRmb: 100, weightKg: 1, customsRatePct: 20, importPaymentFeePct: 5, shippingMethodPref: null, rmbUsdRate: null }), null, "motor: RMB kuru yoksa maliyet null");
assert.equal(calcImportCost({ sourceCostRmb: 100, weightKg: 1, customsRatePct: 20, importPaymentFeePct: 5, shippingMethodPref: null, rmbUsdRate: 0 }), null, "0 kur → null (7,2'ye düşmez)");
// Alperen kuralı: RMB/USD 6,7 (maliyet Excel'i) — 6,8'e göre ürün bedeli 6,8/6,7 kat
assert.ok(Math.abs(engine(100, 1, 20, "SEA", null).productUsd - (100 / 6.7) * 1.05) < 1e-9);

// İthal: gümrük tarifeden (kayıtlıdan farklıysa yazılır), maliyet motordan; TL = round(toplam × kur, 2)
const e1 = engine(275, 0.6, 47.2, null, 4255);
const d1 = deriveUnitCosts([row({ sku: "TT", sourceCostRmb: 275, weightKg: 0.6, customsRatePct: "40", unitCostUsd: "59", unitCostTry: "2861.5", trendyolPriceTry: 4255, stock: 9 })], fx);
assert.equal(d1.updates.length, 1);
const u1 = d1.updates[0];
assert.deepEqual(u1.changes.map(c => [c.field, c.old, c.new]), [["customsRatePct", "40", "47.2"], ["unitCostUsd", "59", (Math.round(e1.totalCostUsd * 1e4) / 1e4).toFixed(4)],
  ["unitCostTry", "2861.5", (Math.round(e1.totalCostUsd * 48.98 * 100) / 100).toFixed(2)]]);
assert.equal(u1.method, e1.shippingMethod);
assert.equal(u1.deltaStockTry, Math.round(9 * (Number(u1.next.unitCostTry) - 2861.5) * 100) / 100);

// Tarife yoksa kayıtlı % kullanılır (değişmez); ikisi de yoksa ATLANIR (varsayılan %30 maliyete yazılmaz)
const d2 = deriveUnitCosts([row({ sku: "A", tariffBurdenPct: null, customsRatePct: "20.0" }), row({ sku: "B", tariffBurdenPct: null, customsRatePct: null })], fx);
assert.deepEqual(d2.updates.map(u => [u.sku, u.changes.map(c => c.field)]), [["A", ["unitCostUsd", "unitCostTry"]]]);
assert.deepEqual(d2.skipped, [{ sku: "B", reason: "gumruk_bilinmiyor" }]);
assert.equal(d2.updates[0].next.unitCostTry, (Math.round(engine(100, 1, 20, null, null).totalCostUsd * 48.98 * 100) / 100).toFixed(2));

// Trendyol fiyatı yoksa XML fiyatı (USD) × kur ile ROI — ithalatçı görünümüyle aynı
const d3 = deriveUnitCosts([row({ sku: "XML", xmlTrendyolPriceUsd: 92.5 })], fx);
assert.equal(d3.updates[0].method, engine(100, 1, 47.2, null, 92.5 * 48.98).shippingMethod);

// İdempotent: türetilmiş değerler tekrar türetildiğinde değişiklik yok
const again = deriveUnitCosts([row({ sku: "TT", sourceCostRmb: 275, weightKg: 0.6, customsRatePct: u1.next.customsRatePct, unitCostUsd: u1.next.unitCostUsd,
  unitCostTry: u1.next.unitCostTry, trendyolPriceTry: 4255, stock: 9 })], fx);
assert.deepEqual([again.updates.length, again.unchanged], [0, 1]);

// Yurt içi (IC_PIYASA): yalnız TL = USD × kur; RMB/gümrük aranmaz
const d4 = deriveUnitCosts([row({ sku: "IST", sourceCostRmb: null, weightKg: null, shippingMethodPref: "IC_PIYASA", unitCostUsd: "1.2", unitCostTry: "58.2", tariffBurdenPct: 39.8, stock: 93 })], fx);
assert.deepEqual(d4.updates.map(u => [u.kind, u.changes.map(c => [c.field, c.new])]), [["YURTICI", [["unitCostTry", "58.78"]]]]);
assert.equal(deriveUnitCosts([row({ sku: "IST0", shippingMethodPref: "IC_PIYASA", unitCostUsd: null })], fx).updates.length, 0, "USD'siz yurt içi ürüne dokunulmaz");
// CFO-025: RMB/ağırlık yok ama USD var → TL = USD × güncel kur (sabit 48,50'de saklı TL kalmaz); USD de yoksa dokunulmaz
const d4u = deriveUnitCosts([row({ sku: "CAM03", sourceCostRmb: null, weightKg: null, unitCostUsd: "10", unitCostTry: "485", stock: 1940 }),
  row({ sku: "NONE", sourceCostRmb: null, weightKg: 0.5, unitCostUsd: null, unitCostTry: "100" })], fx);
assert.deepEqual(d4u.updates.map(u => [u.sku, u.kind, u.changes.map(c => [c.field, c.new]), u.deltaStockTry]), [["CAM03", "USD", [["unitCostTry", "489.80"]], 1940 * 4.8]],
  "yalnız USD: TL = 10 × 48,98; net sermaye 1.940 adeti değerliyor → stok farkı da sayılır (RF-037)");
assert.match(derivationLog(d4u).rows[0].note, /Yalnız USD maliyet .*doğrulanmalı/);
assert.match(derivationLog(d4u).summary, /1 yalnız USD/);

// Büyük değişim: stoklu üründe ≥ %25; net sermayenin değerlemediği stok (kukla adet / sanal stok istisnası) sayılmaz.
// RF-037 (2026-10-10): kural net sermayeyle aynı (cfo_stok_deger.gercek_stok) — önceden "1–999" kuralı 1.194 adetlik gerçek stoğu
// (M-BANYOMİX, net sermayede −83.928 TL) etki toplamından ve cost_jump alarmından düşürüyordu.
const d5 = deriveUnitCosts([row({ sku: "BIG", unitCostUsd: "1", unitCostTry: "10", stock: 4 }), row({ sku: "DROP", unitCostUsd: "1", unitCostTry: "10", stock: 1000, valuedStock: false }),
  row({ sku: "MIX", unitCostUsd: "1", unitCostTry: "10", stock: 1194 })], fx);
assert.deepEqual(d5.bigMovers.map(u => u.sku), ["BIG", "MIX"], "1.000+ adetlik GERÇEK stok da büyük değişimde");
assert.equal(d5.updates.find(u => u.sku === "DROP")!.deltaStockTry, 0);
assert.equal(d5.updates.find(u => u.sku === "MIX")!.deltaStockTry, Math.round(1194 * (Number(d5.updates.find(u => u.sku === "MIX")!.next.unitCostTry) - 10) * 100) / 100);
const log = derivationLog(d5);
assert.equal(log.rows.length, 9, "her ürün için gümrük + USD + TL");
assert.match(log.summary, /^3 ürün \(3 ithal, 0 yurt içi, 0 yalnız USD\), 9 alan; .*%25\+ değişen stoklu ürün 2; .*USD\/TRY 48\.98 \(cfo_kur 2026-10\), RMB\/USD 6\.7 \(elle 2026-10\)/);

async function main() {
  const pg = new PGlite({ extensions: { vector } });
  try {
    await pg.exec(`create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create role cfo_acceptance_reader login nosuperuser nobypassrls;`);
    const res = await bootstrap({ exec: (s: string) => pg.exec(s), query: <T,>(s: string, p?: unknown[]) => pg.query<T>(s, p) });
    for (const m of res.pendingInProduction) await pg.exec(readFileSync(`prisma/migrations/${m}/migration.sql`, "utf8"));
    await pg.exec("set search_path = public");
    const db: CostDb = { query: async <T,>(sql: string, ...p: unknown[]) => (await pg.query<T>(sql, p)).rows };
    const q = async <T,>(s: string) => (await pg.query<T>(s)).rows;

    await pg.exec(`insert into "Product"(id, sku, name, gtip1, "sourceCostRmb", "weightKg", "customsRatePct", "importPaymentFeePct", "shippingMethodPref",
        "unitCostUsd", "unitCostTry", "stockQuantity", "updatedAt") values
      ('t','TT','kilit','8301.40.19.00.19',275,0.6,40,5,null,59,2861.5,9,now()),
      ('c','CAB','kablo','8544.42.90.00.19',2.1,0.04,null,5,'deniz',null,null,70,now()),
      ('n','NOT','tarifesiz',null,10,1,null,null,null,5,250,3,now()),
      ('i','IST','hortum',null,null,null,null,null,'IC_PIYASA',1.2,58.2,93,now()),
      ('g','GRD','korumalı','8301.40.19.00.19',100,1,47.2,5,null,10,500,2,now())`);
    await pg.exec(`insert into "MarketplacePrice"(id, "productId", marketplace, "priceTry", "updatedAt") values ('mp1','t','TRENDYOL',4255,now())`);

    const rows = await q<{ sku: string; yuk: string | null; ty: string | null }>(costRowsSql());
    assert.deepEqual(rows.map(r => [r.sku, r.yuk == null ? null : Number(r.yuk)]), [["CAB", 42], ["GRD", 47.2], ["IST", null], ["NOT", null], ["TT", 47.2]],
      "gümrük yükü cfo_gtip_tarife en uzun önek (KDV + ÖTV dahil)");
    assert.equal(Number(rows.find(r => r.sku === "TT")!.ty), 4255);

    // Eşzamanlılık koruması: türetme okuduktan sonra GRD elle düzeltilirse ona dokunulmaz
    const realQuery = db.query;
    let tampered = false;
    const guarded: CostDb = { query: async <T,>(sql: string, ...p: unknown[]) => {
      if (!tampered && sql.startsWith("WITH v AS")) { tampered = true; await pg.exec(`update "Product" set "unitCostTry" = 501 where sku = 'GRD'`); }
      return realQuery<T>(sql, ...p);
    } };
    const r1 = await runCostDerivation(guarded, fx);
    assert.deepEqual([r1.status, r1.planned, r1.updated, r1.skipped], ["ok", 4, 3, 1], "NOT (tarife + kayıt yok) atlandı; GRD koruma nedeniyle yazılmadı");
    const p = Object.fromEntries((await q<{ sku: string; cus: string | null; usd: string | null; tl: string | null }>(
      `select sku, "customsRatePct"::text cus, "unitCostUsd"::text usd, "unitCostTry"::text tl from "Product"`)).map(r => [r.sku, r]));
    assert.equal(Number(p.TT.cus), 47.2);
    assert.equal(Number(p.TT.tl), Math.round(engine(275, 0.6, 47.2, null, 4255).totalCostUsd * 48.98 * 100) / 100);
    assert.equal(Number(p.CAB.tl), Math.round(engine(2.1, 0.04, 42, "SEA", null).totalCostUsd * 48.98 * 100) / 100, "'deniz' tercihi deniz navlunu");
    assert.equal(Number(p.IST.tl), 58.78);
    assert.deepEqual([Number(p.GRD.tl), Number(p.NOT.tl)], [501, 250], "korunan ve atlanan ürün değişmedi");

    const logs = await q<{ item: string; kind: string; area: string; source: string }>(`select item, kind, area, source from cfo_change_log where source = '${COST_DERIVATION_SOURCE}' order by item`);
    assert.ok(logs.every(l => l.area === "maliyet"));
    assert.deepEqual(logs.filter(l => l.kind === "duzeltme").map(l => l.item),
      ["CAB customsRatePct", "CAB unitCostTry", "CAB unitCostUsd", "IST unitCostTry", "TT customsRatePct", "TT unitCostTry", "TT unitCostUsd"], "GRD için günlük satırı yok");
    assert.equal(logs.filter(l => l.kind === "analiz").length, 1, "koşu başına bir özet");

    // İkinci koşu: GRD yeni değerinden türetilir; diğerleri değişmez. Üçüncü koşu: hiçbir şey yazılmaz
    const r2 = await runCostDerivation(db, fx);
    assert.deepEqual([r2.planned, r2.updated], [1, 1]);
    const r3 = await runCostDerivation(db, fx);
    assert.deepEqual([r3.planned, r3.updated], [0, 0]);
    assert.equal((await q<{ n: number }>(`select count(*)::int n from cfo_change_log where source = '${COST_DERIVATION_SOURCE}' and kind = 'analiz'`))[0].n, 2, "değişiklik yoksa özet de yok");
    assert.deepEqual((await runCostDerivation(db, { ...fx, usdTrySource: "varsayılan" })).status, "kur_bilinmiyor");
    assert.deepEqual((await runCostDerivation(db, { ...fx, rmbPerUsd: null, rmbSource: "bilinmiyor" })).status, "kur_bilinmiyor");

    // cost_jump: GRD 501 → ~178 TL (stok 2, %25+) — alarm ve en büyük etki
    const [j] = await q<{ big: number; delta: string; worst: string; day: string }>(costJumpSql());
    assert.ok(j.big >= 1, `büyük değişim sayıldı: ${JSON.stringify(j)}`);
    const base: AlarmInput = { now: new Date(), engineEnabled: true, runs: [{ status: "completed", generatedAt: new Date(), finishedAt: new Date(), error: null }],
      minPosition: null, floorTry: -3_000_000, payments: [], sources: [], staleBankAccounts: [] };
    const a = evaluateCfoAlarms({ ...base, costJump: { big: j.big, deltaTry: Number(j.delta), worst: j.worst, day: j.day } });
    assert.deepEqual(a.map(x => x.code), ["cost_jump"]);
    assert.match(a[0].message, /stoklu üründe birim maliyet %25\+ değişti/);
    assert.deepEqual(evaluateCfoAlarms({ ...base, costJump: { big: 0, deltaTry: 49_999, worst: null, day: null } }), [], "eşik altı alarm yok");
    assert.equal(evaluateCfoAlarms({ ...base, costJump: { big: 0, deltaTry: -60_000, worst: null, day: "2026-10-10" } })[0].key, "cost_jump:2026-10-10");
  } finally { await pg.close(); }
}

main().then(() => console.log("CFO-029 maliyet türetme: Türkçe tercih, kur kapısı, GTİP gümrüğü, atlama, yurt içi, idempotent, korumalı yazma, günlük/özet, cost_jump passed"),
  e => { console.error(e); process.exitCode = 1; });

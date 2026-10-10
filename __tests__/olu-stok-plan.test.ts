/**
 * Ölü stok eylem planı (lib/olu-stok/plan.ts) — saf öneri motoru: başabaş tabanı, yaşa göre indirim adımı, tabanın altına inmeme,
 * maliyet/komisyon bilinmiyorsa fiyat önerisi yok, satışsız üründe yeni ilan + mükerrer ilan uyarısı, içerik eksikleri, öncelik.
 * Çalıştır: node --import tsx __tests__/olu-stok-plan.test.ts
 */
import assert from "node:assert/strict";
import { DUPLICATE_LISTING_RISK, distinctListingErrors, economicsFromNetRate, titleSimilarity, floorPrice, independentCode, planAll, planFor, stepPct, type ChannelEconomics, type DeadStockRow } from "../lib/olu-stok/plan";

const TY: ChannelEconomics = { channel: "TRENDYOL", commissionRate: 0.2, serviceFeeRate: 0.05, shippingTry: 50 };
const PTT: ChannelEconomics = { channel: "PTTAVM", commissionRate: null, serviceFeeRate: 0, shippingTry: 50 };
const row = (o: Partial<DeadStockRow> = {}): DeadStockRow => ({ sku: "A", name: "Ürün", stock: 10, unitCostTry: 100, boundCapitalTry: 1000,
  units90: 2, daysSinceSale: 30, avgPrice90Try: 400, descriptionLength: 500, hasImage: true, hasBarcode: true, alarm: "SARI", ...o });

// Taban: (100 + 50) / (1 − 0,20 − 0,05) = 200
assert.equal(floorPrice(100, TY), 200);
assert.equal(floorPrice(null, TY), null);
assert.equal(floorPrice(100, PTT), null, "komisyon bilinmiyorsa taban yok");
assert.deepEqual([stepPct(30), stepPct(60), stepPct(120), stepPct(null)], [10, 15, 20, 20]);

// İndirim: 400 × 0,90 = 360 (taban 200 üstünde)
const p = planFor(row(), [TY]);
assert.deepEqual(p.actions, [{ kind: "PRICE_DROP", channel: "TRENDYOL", fromTry: 400, toTry: 360, floorTry: 200, stepPct: 10 }]);
// Tabanın altına inmez: 210 × 0,80 = 168 → 200
assert.deepEqual(planFor(row({ avgPrice90Try: 210, daysSinceSale: 200 }), [TY]).actions[0], { kind: "PRICE_DROP", channel: "TRENDYOL", fromTry: 210, toTry: 200, floorTry: 200, stepPct: 20 });
// Fiyat zaten tabanda/altında → indirim önerisi yok
assert.equal(planFor(row({ avgPrice90Try: 200 }), [TY]).actions.filter(a => a.kind === "PRICE_DROP").length, 0);
// Maliyet yok → PRICE_UNKNOWN (indirim uydurulmaz); PttAVM komisyonu bilinmiyor → PRICE_UNKNOWN
assert.deepEqual(planFor(row({ unitCostTry: null }), [TY]).actions[0], { kind: "PRICE_UNKNOWN", channel: "TRENDYOL", reason: "birim maliyet yok" });
assert.equal(planFor(row(), [PTT]).actions[0].kind, "PRICE_UNKNOWN");
// Satışsız ve stoklu → yeni ilan (+ mükerrer ilan uyarısı); içerik eksikleri
const q = planFor(row({ units90: 0, avgPrice90Try: null, descriptionLength: 0, hasImage: false, hasBarcode: false }), [TY]);
assert.deepEqual(q.actions.map(a => a.kind === "CONTENT" ? `CONTENT:${a.field}` : a.kind), ["NEW_LISTING", "CONTENT:description", "CONTENT:image", "CONTENT:barcode"]);
assert.equal((q.actions[0] as { risk: string }).risk, DUPLICATE_LISTING_RISK);
// Öncelik: kırmızı ve yaşlı önde
const all = planAll([row({ sku: "S", boundCapitalTry: 1000 }), row({ sku: "K", boundCapitalTry: 600, alarm: "KIRMIZI", daysSinceSale: 130 })], [TY]);
assert.deepEqual(all.map(x => [x.sku, x.priority]), [["K", 2400], ["S", 1000]]);
console.log("Ölü stok planı: başabaş tabanı, yaşa göre adım, taban koruması, bilinmeyen maliyet/komisyon, yeni ilan + mükerrer uyarısı, içerik, öncelik passed");

// Kalibre net oran → taban: 100 / 0,626 = 159,75; bağımsız kod
assert.equal(floorPrice(100, economicsFromNetRate("TRENDYOL", 0.626)), 159.75);
assert.equal(economicsFromNetRate("PTTAVM", null).commissionRate, null);
assert.equal(independentCode("AB 12/ç"), "ALFOS-AB12c");
assert.equal(independentCode("X".repeat(60)).length, 40);
console.log("Ölü stok planı: net oran tabanı + bağımsız kod passed");

// Bağımsız ilan farklılığı: aynı/benzer başlık ve aynı görsel reddedilir
assert.equal(titleSimilarity("Akıllı Priz Wi-Fi 16A", "akıllı priz wifi 16a"), 0.5, "3 ortak / 6 kelime");
assert.equal(titleSimilarity("Akıllı Priz", "Güneş Paneli"), 0);
const orig = { titles: ["Tuya Akıllı Priz 16A Enerji Ölçerli"], images: ["https://cdn.x.com/a.jpg?v=1"] };
assert.match(distinctListingErrors(orig, { title: "Tuya Akıllı Priz 16A Enerji Ölçerli Beyaz", images: ["https://cdn.x.com/n.jpg"] })[0], /çok benziyor/);
assert.match(distinctListingErrors(orig, { title: "Wi-Fi Uzaktan Kontrollü Fiş, Tüketim Takipli", images: ["http://cdn.x.com/a.jpg"] })[0], /görsel mevcut ilanla aynı/);
assert.deepEqual(distinctListingErrors(orig, { title: "Wi-Fi Uzaktan Kontrollü Fiş, Tüketim Takipli", images: ["https://cdn.y.com/ai-1.jpg"] }), []);
console.log("Ölü stok planı: bağımsız ilan başlık/görsel farklılığı passed");

/**
 * Value of Information engine (lib/cfo/voi.ts) — saf, DB yok. Fikstürler 07.10 üretim şekli.
 * Çalıştır: node --import tsx __tests__/cfo-voi.test.ts
 */
import assert from "node:assert/strict";
import { decideAction, deadPriceVoi, financeFileVoi, importStatusVoi, rankVoi, skuCostVoi, staleBalanceVoi, textQuestionVoi, tlAmounts } from "../lib/cfo/voi";
import { classifySku } from "../lib/cfo/capital-efficiency";

const H = 0.51667 / 12;

// Eylem kuralı: karar değişmiyorsa sorma; değer dikkat maliyetinin altındaysa sorma; çözen kişiye göre ASK/RESEARCH
assert.equal(decideAction(1_000_000, false, "OWNER"), "DECIDE_NOW", "bilgi kararı değiştirmiyorsa değeri ne olursa olsun sorulmaz");
assert.equal(decideAction(1500, true, "OWNER"), "DECIDE_NOW", "2.000 TL dikkat maliyetinin altı");
assert.equal(decideAction(50_000, true, "OWNER"), "ASK_FIRST");
assert.equal(decideAction(50_000, true, "CFO"), "RESEARCH_FIRST");
assert.equal(decideAction(null, true, "OWNER"), "ASK_FIRST", "ölçülemeyen ama karar etkileyen → sor (sıralamada ölçülenlerin arkasında)");

// TL ayrıştırma (Türkçe biçim)
assert.deepEqual(tlAmounts("01.11de zirve fon ihtiyaci 3.408.171 TL. Limitler (KMH 1.359.300 + Ziraat 750.000 TL)"), [3408171, 750000]);
assert.deepEqual(tlAmounts("15.874 TL bekleniyordu, 993,57 TL geldi"), [15874, 993.57]);
assert.deepEqual(tlAmounts("tutar yok"), []);

// Maliyeti bilinmeyen SKU: iki uçta sınıf farklıysa değer; aynıysa DECIDE_NOW
const classify = (unitCost: number, r: { sku: string; stock: number; unitNet: number; dailyVelocity: number }) => {
  const x = classifySku({ id: r.sku, name: r.sku, unitCost, ...r }, H);
  return { cls: x.cls, dragMonthlyTry: x.dragMonthlyTry, capitalTry: x.capitalTry };
};
// 255500909890: 945 adet, net 91,09, ayda 0,67 satış → her iki uçta LIQUIDATE → bilgi kararı değiştirmez
const [same] = skuCostVoi([{ sku: "255500909890", stock: 945, unitNet: 91.09, dailyVelocity: 0.0222 }], { p25: 0.45, p75: 0.8 }, classify);
assert.equal(same.decisionFlips, false); assert.equal(same.action, "DECIDE_NOW");
// orta hızlı ürün: düşük maliyette KEEP/SCALE, yüksek maliyette TRIM → karar değişir
const [flip] = skuCostVoi([{ sku: "MID", stock: 1000, unitNet: 100, dailyVelocity: 1 }], { p25: 0.3, p75: 0.95 }, classify);
assert.equal(flip.decisionFlips, true);
assert.ok(flip.voiTry! > 2000, `değer ${flip.voiTry}`); assert.equal(flip.action, "ASK_FIRST");

// Satış kanıtı olmayan ölü stok: EVPI = aralık/8, CFO kendisi araştırır
const [dead] = deadPriceVoi([{ sku: "TTLOCKSIYAHKAPISILINDIR", stock: 9, unitCost: 2861.5 }]);
assert.equal(dead.voiTry, Math.round(9 * 2861.5 / 8)); assert.equal(dead.action, "RESEARCH_FIRST");

// Bayat bakiye: 30 gün brüt hareket × bayat gün oranı; açığın ≥ %25'i sapabiliyorsa karar değişir
const st = staleBalanceVoi([{ name: "Ziraat USD (şirket)", staleDays: 22, grossFlow30Try: 15000 }, { name: "Ziraat", staleDays: 3, grossFlow30Try: 2_100_000 },
  { name: "Yapı Kredi", staleDays: 20, grossFlow30Try: 268668 }], 379787, H, 25);
assert.equal(st.length, 2, "7 günden taze hesap sorulmaz");
assert.equal(st.find(s => s.unknown.startsWith("Ziraat USD"))!.action, "DECIDE_NOW", "küçük sapma açığı değiştirmez");
assert.equal(st.find(s => s.unknown.startsWith("Yapı Kredi"))!.action, "ASK_FIRST");

// Varışı geçmiş ithalat (07.26sea: 6,04M kâr / 6 ay) → yüksek değer, sor
const [imp] = importStatusVoi([{ code: "07.26sea", status: "YOLDA", eta: "2026-10-05", monthlyProfitTry: 6040000 / 6 }, { code: "FUT", status: "YOLDA", eta: "2026-12-01", monthlyProfitTry: 1 }], "2026-10-07");
assert.equal(imp.voiTry, Math.round(6040000 / 6 / 4)); assert.equal(imp.action, "ASK_FIRST");

// Bayat Trendyol dosyası (27 gün, aylık ~1,5M) → ±2 puan × satış
assert.equal(financeFileVoi(27, 1512257)[0].voiTry, Math.round(1512257 * 0.02));
assert.deepEqual(financeFileVoi(5, 1512257), [], "taze dosya UNKNOWN değil");

// Metin sorular: nakit alanı → tutar × aylık eşik; veri alanı → CFO araştırır; tutarsız → ölçülemedi
const tq = textQuestionVoi([
  { id: "fon", question: "01.11de zirve fon ihtiyaci 3.408.171 TL. Kaynak?", area: "nakit" },
  { id: "koctas", question: "Koçtaş 15.874 TL bekleniyordu, 993,57 TL geldi", area: "alacak" },
  { id: "veri", question: "Monitor neden no_actionable döndü?", area: "veri" },
  { id: "kucuk", question: "Kasa farkı 300 TL nereden?", area: "nakit" },
], H);
assert.equal(tq.find(q => q.questionId === "fon")!.voiTry, Math.round(3408171 * H));
assert.equal(tq.find(q => q.questionId === "veri")!.voiTry, null); assert.equal(tq.find(q => q.questionId === "veri")!.action, "RESEARCH_FIRST");
assert.equal(tq.find(q => q.questionId === "kucuk")!.action, "DECIDE_NOW", "13 TL değerinde soru Alperen'e sorulmaz");

// Sıralama + dikkat bütçesi
const r = rankVoi([...tq, imp, ...financeFileVoi(27, 1512257), flip, same, dead, ...st], { askMinTry: 2000, askBudget: 3, horizonMonths: 3 });
assert.equal(r.ask[0].key, "import-status:07.26sea", "en yüksek değer başta");
assert.equal(r.ask.length, 3, "dikkat bütçesi");
assert.ok(r.suppressedAsk.length >= 1, "bütçe dışı ASK bastırılır");
assert.ok(r.decideNow.some(i => i.questionId === "kucuk"));
assert.ok(r.unmeasured.some(i => i.questionId === "veri"));
assert.ok(r.totalVoiTry > 0);
console.log("CFO VOI: decide/ask/research rule, TR amount parsing, SKU cost flip, dead price EVPI, stale balance, import status, finance file, text questions, attention budget passed");

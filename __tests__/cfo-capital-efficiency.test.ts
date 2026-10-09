/**
 * Sermaye verimliliği + marjinal tahsis (lib/cfo/capital-efficiency.ts) — saf, DB yok. Fikstürler 07.10 üretim şekli.
 * Çalıştır: node --import tsx __tests__/cfo-capital-efficiency.test.ts
 */
import assert from "node:assert/strict";
import { allocate, classifySku, hurdleRate, type DebtInput, type SkuInput } from "../lib/cfo/capital-efficiency";

const debts: DebtInput[] = [
  { name: "Garanti ticari", kind: "LOAN", payoffTry: 1001950, monthlyRate: 0.51667 / 12, monthlyPaymentTry: 137314 },
  { name: "Yapı Kredi ticari", kind: "LOAN", payoffTry: 269773, monthlyRate: 0.50171 / 12, monthlyPaymentTry: 33112 },
  { name: "Ziraat Kredi 2", kind: "LOAN", payoffTry: 1000000, monthlyRate: 0.34 / 12, monthlyPaymentTry: 29750 },
  { name: "Şahsi KMH", kind: "KMH", payoffTry: 50000, monthlyRate: 0.06, monthlyPaymentTry: null, personal: true },
];
const h = hurdleRate(debts);
assert.equal(h.source, "Garanti ticari", "şahsi borç eşik olmaz; en pahalı kapatılabilir ticari borç");
assert.ok(Math.abs(h.monthly! - 0.0430558) < 1e-6);
assert.deepEqual(hurdleRate([]), { monthly: null, source: null }, "faiz bilinmiyorsa UNKNOWN");

const H = h.monthly!;
const sku = (o: Partial<SkuInput> & Pick<SkuInput, "sku">): SkuInput => ({ id: o.sku, name: o.sku, stock: 0, unitCost: 100, unitNet: 150, dailyVelocity: 1, ...o });

// 40005100051: 2.558 adet, maliyet 485, net 654, ayda 139 → %1,9/ay < eşik, 552 gün örtü → TRIM
const trim = classifySku(sku({ sku: "40005100051", stock: 2558, unitCost: 485, unitNet: 654, dailyVelocity: 139 / 30 }), H);
assert.equal(trim.cls, "TRIM");
assert.ok(Math.abs(trim.rocMonthly! - 0.01894) < 1e-4);
assert.equal(trim.excessUnits, Math.floor(2558 - (139 / 30) * 97), "hedef örtü 97 gün üstü fazla");
assert.ok(trim.dragMonthlyTry > 29000 && trim.dragMonthlyTry < 31000, "1,24M × %4,3 − 23,5k katkı ≈ 30k/ay değer kaybı");
assert.ok(trim.breakEvenDiscount! > 0.2 && trim.breakEvenDiscount! < 0.3, "≈ 7,8 ay ortalama bekleme → ~%28 indirime kadar tasfiye elde tutmaktan iyi");
assert.ok(trim.releaseCashTry > 900000, "fazla stok tasfiyesi nakit açığa çıkarır");

// AL-CAM03: 1.940 adet, ayda 0,3 satış → LIQUIDATE, tüm stok fazla, indirim üst sınırla
const dead = classifySku(sku({ sku: "AL-CAM03", stock: 1940, unitCost: 485, unitNet: 1264, dailyVelocity: 0.3 / 30 }), H);
assert.equal(dead.cls, "LIQUIDATE");
assert.equal(dead.excessUnits, 1940);
assert.equal(dead.releaseCashTry, Math.round(1940 * 1264 * 0.5 * 100) / 100, "maxDiscount %50 tavanı");

// Negatif birim marj: her satış zarar → FIX_PRICE (fiyat değişikliği insan onayı ister — yalnız öneri)
const neg = classifySku(sku({ sku: "TE-SACBAKIMTARAK", stock: 864, unitCost: 26, unitNet: -13, dailyVelocity: 105 / 30 }), H);
assert.equal(neg.cls, "FIX_PRICE");
assert.match(neg.reason, /39 TL zarar/);

// Yıldız: yüksek getiri, örtü hedefin altında → SCALE + stok tamamlama sermayesi
const star = classifySku(sku({ sku: "STAR", stock: 20, unitCost: 100, unitNet: 180, dailyVelocity: 1 }), H);
assert.equal(star.cls, "SCALE");
assert.equal(star.restockCapitalTry, (97 - 20) * 100);
assert.ok(Math.abs(star.marginalReturnMonthly! - 0.8 * 30 / 97) < 1e-9);

// Maliyet yok → UNKNOWN; satış kanıtı yok ve hız 0 → LIQUIDATE (değer bilinmiyor)
assert.equal(classifySku(sku({ sku: "X", stock: 5, unitCost: null }), H).cls, "UNKNOWN");
assert.equal(classifySku(sku({ sku: "Y", stock: 5, unitNet: null, dailyVelocity: 0 }), H).cls, "LIQUIDATE");
assert.equal(classifySku(sku({ sku: "Z", stock: 5, unitNet: null, dailyVelocity: 0.5 }), H).cls, "UNKNOWN");

// Tahsis: likidite açığı önce; sonra risk ayarlı getiriye göre (yıldız %24,7 × 0,6 = %14,8 > borç %4,3)
const a = allocate([sku({ sku: "STAR", stock: 20, unitCost: 100, unitNet: 180, dailyVelocity: 1 }),
  sku({ sku: "40005100051", stock: 2558, unitCost: 485, unitNet: 654, dailyVelocity: 139 / 30 })], debts, { liquidityGapTry: 379787, budgetTry: 500000 });
assert.deepEqual(a.plan.map(p => p.use.kind), ["LIQUIDITY", "RESTOCK", "DEBT_PAYOFF"]);
assert.equal(a.plan[0].amountTry, 379787);
assert.equal(a.plan[1].amountTry, 7700);
assert.equal(a.plan[2].use.label, "Garanti ticari kapat", "en pahalı borç ilk");
assert.equal(a.plan.reduce((s, p) => s + p.amountTry, 0), 500000, "bütçe aşılmaz");
assert.ok(a.uses.every(u => u.label !== "Şahsi KMH kapat"), "şahsi borç önerilmez");
assert.equal(a.portfolio.TRIM.n, 1);
assert.ok(a.releasableCashTry > 900000);
assert.ok(a.dragMonthlyTry > 29000);
// likidite açığı yoksa ilk sırada getiri
assert.equal(allocate([], debts, { liquidityGapTry: 0, budgetTry: 100000 }).plan[0].use.kind, "DEBT_PAYOFF");
// stres açığı bazdan büyükse likidite rezervi stres kadar → nakit tüketen kullanımlar geriye itilir
const st = allocate([], debts, { liquidityGapTry: 50000, budgetTry: 100000, stressGapTry: 80000 });
assert.equal(st.plan[0].use.kind, "LIQUIDITY"); assert.equal(st.plan[0].amountTry, 80000); assert.match(st.plan[0].use.label, /makul streste/);
assert.equal(st.plan[1].amountTry, 20000, "kalan bütçe borca");
assert.equal(allocate([], debts, { liquidityGapTry: 50000, budgetTry: 100000, stressGapTry: 10000 }).plan[0].amountTry, 50000, "stres bazdan küçükse baz geçerli");

// CFO-014: eşik faiz bilinmiyorsa %4 uydurulmaz — büyüt/azalt kararı yok, taşıma maliyeti 0, tasfiye en kötü indirimle; FIX_PRICE/LIQUIDATE eşikten bağımsız
const nh = classifySku(sku({ sku: "STAR", stock: 20, unitCost: 100, unitNet: 180, dailyVelocity: 1 }), null);
assert.equal(nh.cls, "UNKNOWN"); assert.match(nh.reason, /eşik faiz bilinmiyor/); assert.equal(nh.dragMonthlyTry, 0);
assert.equal(classifySku(sku({ sku: "TE-SACBAKIMTARAK", stock: 864, unitCost: 26, unitNet: -13, dailyVelocity: 105 / 30 }), null).cls, "FIX_PRICE");
const deadNh = classifySku(sku({ sku: "AL-CAM03", stock: 1940, unitCost: 485, unitNet: 1264, dailyVelocity: 0.3 / 30 }), null);
assert.equal(deadNh.cls, "LIQUIDATE"); assert.equal(deadNh.dragMonthlyTry, 0);
const noHurdle = allocate([sku({ sku: "STAR", stock: 20, unitCost: 100, unitNet: 180, dailyVelocity: 1 })], [], { liquidityGapTry: 0, budgetTry: 100000 });
assert.equal(noHurdle.hurdleMonthly, null); assert.deepEqual(noHurdle.plan, [], "eşik yokken stok yenileme önerilmez");

console.log("CFO capital efficiency: hurdle from priciest company debt, TRIM/LIQUIDATE/FIX_PRICE/SCALE/UNKNOWN, break-even discount, liquidity-first allocation (stress gap) passed");

/**
 * Kredi kartı borç maliyeti (lib/cfo/card-cost.ts) + sermaye motoru ve VOI'ye etkisi — saf, DB yok.
 * Devreden bakiyeler 07.10 üretim kart notlarındaki ölçümler (ekran: "son ekstreden kalan borç"); akdi faiz örnek (girilmemiş).
 * Çalıştır: node --import tsx __tests__/cfo-card-cost.test.ts
 */
import assert from "node:assert/strict";
import { CARD_TAX, cardCarry, cardEffectiveMonthlyRate, isPersonalCard } from "../lib/cfo/card-cost";
import { allocate, hurdleRate, type DebtInput } from "../lib/cfo/capital-efficiency";
import { cardCostVoi } from "../lib/cfo/voi";

// Efektif oran = akdi × (1 + KKDF + BSMV)
assert.equal(CARD_TAX.kkdf + CARD_TAX.bsmv, 0.3);
assert.ok(Math.abs(cardEffectiveMonthlyRate(4.25)! - 0.05525) < 1e-12);
assert.equal(cardEffectiveMonthlyRate(null), null); assert.equal(cardEffectiveMonthlyRate(0), null);
assert.equal(isPersonalCard("Alp"), true); assert.equal(isPersonalCard("Alfa — Alperen (ana kart)"), false);

// Faiz yalnız devreden bakiyede; bilinmeyen 0 sayılmaz, ayrı raporlanır
const c = cardCarry([
  { name: "Garanti ana", personal: false, totalDebtTry: 618576, revolvingTry: 618576.31, contractMonthlyRatePct: 4.25 },
  { name: "Enpara", personal: false, totalDebtTry: 523978, revolvingTry: 405120.28, contractMonthlyRatePct: null },
  { name: "Ziraat", personal: false, totalDebtTry: 789661, revolvingTry: null, contractMonthlyRatePct: null },
  { name: "Tam ödenen", personal: false, totalDebtTry: 50000, revolvingTry: 0, contractMonthlyRatePct: 4.25 },
]);
assert.equal(c.interestMonthlyTry, Math.round(618576.31 * 0.05525), "yalnız devreden + oranı bilinen");
assert.equal(c.revolvingTry, Math.round(618576.31 + 405120.28));
assert.equal(c.revolvingWithoutRateTry, Math.round(405120.28));
assert.equal(c.unknownRevolvingCards, 1);
assert.equal(c.perCard[3].interestMonthlyTry, 0, "dönem içi harcama faizsiz");

// Sermaye motoru: devreden kart en pahalı borçsa eşik getiri odur ve kapama planına girer
const loan: DebtInput = { name: "Garanti — kredi", kind: "LOAN", payoffTry: 1_000_000, monthlyRate: 0.51667 / 12, monthlyPaymentTry: 60000 };
const card: DebtInput = { name: "Garanti ana kart", kind: "CARD", payoffTry: 618576, monthlyRate: cardEffectiveMonthlyRate(4.25), monthlyPaymentTry: null };
const personal: DebtInput = { ...card, name: "Akbank Alp kart", payoffTry: 119419, monthlyRate: cardEffectiveMonthlyRate(5), personal: true };
assert.equal(hurdleRate([loan, card, personal]).source, "Garanti ana kart", "şahsi kart eşik dışı; ticari kart kredinin üstünde");
const plan = allocate([], [loan, card, personal], { liquidityGapTry: 0, budgetTry: 700_000 }).plan;
assert.equal(plan[0].use.kind, "DEBT_PAYOFF"); assert.match(plan[0].use.label, /devreden bakiyesini kapat/);
assert.equal(plan[0].amountTry, 618576); assert.equal(plan[1].use.label, "Garanti — kredi kapat");
assert.ok(!plan.some(p => p.use.label.includes("Akbank Alp")), "şahsi borç şirket tahsisine girmez");

// VOI: devreden ya da oran bilinmiyorsa sor; ikisi de biliniyorsa ya da borç yoksa soru yok
const v = cardCostVoi([
  { name: "Ziraat", totalDebtTry: 789661, revolvingTry: null, contractMonthlyRatePct: null },
  { name: "Enpara", totalDebtTry: 523978, revolvingTry: 405120, contractMonthlyRatePct: null },
  { name: "Garanti", totalDebtTry: 618576, revolvingTry: 618576, contractMonthlyRatePct: 4.25 },
  { name: "Boş", totalDebtTry: 0, revolvingTry: null, contractMonthlyRatePct: null },
], 0.043);
assert.deepEqual(v.map(i => i.key), ["card-cost:Ziraat", "card-cost:Enpara"]);
assert.equal(v[0].voiTry, Math.round(789661 * 0.043 * 3 / 4)); assert.equal(v[0].action, "ASK_FIRST");
assert.match(v[1].unknown, /akdi faiz/);
console.log("CFO card cost: effective rate (KKDF+BSMV), revolving-only interest, unknowns kept separate, card in hurdle + payoff plan, card VOI passed");

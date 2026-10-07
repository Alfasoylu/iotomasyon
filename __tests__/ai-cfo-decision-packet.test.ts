/**
 * AI CFO maliyet/görev ayrımı (2026-10-07): rule card'lar, önemli değişiklik kapısı, küçük karar paketi, bütçe kapıları,
 * maliyet verimliliği özeti. DB/ağ yok. Çalıştır: node --conditions=react-server --import tsx __tests__/ai-cfo-decision-packet.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RULE_CARDS } from "../lib/cfo-agent/rule-cards";
import { buildDecisionPacket, cardsFor, CARDS_FOR_RULE, estimateTokens, SCHEDULED_SYSTEM_PROMPT } from "../lib/cfo-agent/decision-packet";
import { decisionInputHash, decisionTypeOf, impactBucket, materialChange } from "../lib/cfo-agent/materiality";
import { budgetBlock, type BudgetTotals } from "../lib/cfo-agent/budget";
import { getCfoConfig } from "../lib/cfo-agent/config";
import { costEfficiency } from "../lib/cfo-agent/cost-efficiency";
import { evidence } from "../lib/cfo-agent/evidence";
import type { Anomaly, Evidence } from "../lib/cfo-agent/types";

let failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); console.log(`  OK   ${name}`); } catch (e) { failed++; console.error(`  FAIL ${name}\n         ${e instanceof Error ? e.stack ?? e.message : e}`); }
}
const AT = "2026-10-07T05:00:00.000Z";
// Üretim şekilli fikstür: 07.10 16:59 koşusundaki STOCKOUT/PRICE_BELOW_FLOOR kanıt sorguları gibi uzun sorgu metinleri.
function anomaly(i: number, rule = "STOCKOUT", impact: number | null = 120000, nEvidence = 6): { a: Anomaly; ev: Evidence[] } {
  const sku = `MD-30${i}3B1`;
  const ev = Array.from({ length: nEvidence }, (_, k) => evidence("cfo_satis_birim_duz", `product.${sku}.TRENDYOL.metric_${k}.stockDays/velocity/unitProfit (son 30 gün, adet_duz=1)`, 1234.56 + k * 17.3, k % 2 ? "TRY" : "days", AT, k !== 3));
  return { ev, a: { id: `a_${i}`, rule, severity: i === 0 ? "critical" : "warning", category: rule === "STOCKOUT" ? "inventory" : "pricing", entityType: "sku", entityId: `sku:${sku}`,
    period: "2026-10", fingerprint: `${rule}:${sku}:2026-10`, cooldownKey: `${rule}:${sku}`, evidenceIds: ev.map(e => e.id), actionable: true,
    impact: impact == null ? null : { value: impact, formula: "x", inputs: {}, basis: "gross_incl_vat", estimated: true, kind: "lost_profit" }, weight: 1, existingRecordIds: [] } };
}

check("rule card'lar el kitabından BİREBİR ve küçük (≤1.250 bayt ≈ ≤500 token); her kural bir karta eşli", () => {
  const handbook = readFileSync("lib/cfo-agent/handbook-core.md", "utf8");
  for (const [id, text] of Object.entries(RULE_CARDS)) {
    for (const para of text.split("\n\n")) assert.ok(handbook.includes(para.trim()), `${id}: el kitabında olmayan paragraf: ${para.slice(0, 60)}`);
    assert.ok(Buffer.byteLength(text, "utf8") <= 1250, `${id} ${Buffer.byteLength(text, "utf8")} bayt`);
    assert.ok(estimateTokens(text) <= 500, `${id} tahmini ${estimateTokens(text)} token`);
  }
  for (const ids of Object.values(CARDS_FOR_RULE)) for (const id of ids) assert.ok(id in RULE_CARDS, id);
  assert.deepEqual(cardsFor([anomaly(0).a]), ["STOCKOUT"]);
  assert.deepEqual(cardsFor([anomaly(0, "DEAD_STOCK").a]), ["DEAD_STOCK", "CAPITAL_ALLOCATION"]);
  assert.deepEqual(cardsFor([{ ...anomaly(0).a, rule: "GOAL_OFF_TRACK" }]), ["CASH_SHORTFALL", "CAPITAL_ALLOCATION"]);
  // rule-cards.ts .md'den üretilmiş olmalı
  const md = readFileSync("lib/cfo-agent/rule-cards.md", "utf8");
  for (const [id, text] of Object.entries(RULE_CARDS)) assert.ok(md.includes(`## CARD ${id} `) && md.includes(text), `${id}: rule-cards.ts yeniden üretilmedi (npm run gen:handbook)`);
});

check("tutucu token tahmini ölçülenin altına düşmez (07.10: ≈17 KB → 5.559 token)", () => {
  assert.ok(estimateTokens("x".repeat(17000)) >= 5559);
});

check("önemli değişiklik: yeni / önem arttı / etki ≥1 kova ve ≥10.000 TL arttı; aksi halde çağrı yok", () => {
  const { a } = anomaly(1, "STOCKOUT", 100000);
  assert.equal(materialChange(a, undefined, 10000), "new");
  assert.equal(materialChange(a, { severity: "warning", impact: 100000 }, 10000), null, "aynı anomali hâlâ açık → çağrı yok");
  assert.equal(materialChange({ ...a, severity: "critical" }, { severity: "warning", impact: 100000 }, 10000), "severity_up");
  assert.equal(materialChange(a, { severity: "warning", impact: 70000 }, 10000), "impact_up", "+%43 ve +30.000 TL");
  assert.equal(materialChange(a, { severity: "warning", impact: 95000 }, 10000), null, "+%5 kova değiştirmez");
  assert.equal(materialChange({ ...a, impact: { ...a.impact!, value: 30000 } }, { severity: "warning", impact: 22000 }, 10000), null, "kova arttı ama < 10.000 TL");
  assert.equal(materialChange({ ...a, severity: "info" }, { severity: "warning", impact: 100000 }, 10000), null, "önem azaldı → çağrı yok");
  assert.equal(impactBucket(null), null); assert.equal(impactBucket(100000), impactBucket(101000), "küçük oynama aynı kova");
});

check("karar girdisi hash'i: zaman damgası/asOf/kanıt sırası/tazelik değişince aynı; önem, kova, kart, sürüm değişince farklı", () => {
  const { a } = anomaly(0), { a: b } = anomaly(1);
  const h = (list: Anomaly[], o: Partial<Parameters<typeof decisionInputHash>[0]> = {}) => decisionInputHash({ mode: "scheduled", decisionType: decisionTypeOf(list[0]), anomalies: list, cards: ["STOCKOUT"], versions: { prompt: "s1" }, ...o });
  const base = h([a, b]);
  assert.equal(h([b, a]), base, "sıra");
  assert.equal(h([{ ...a, evidenceIds: [...a.evidenceIds].reverse(), period: "2026-11" }, b]), base, "kanıt sırası / dönem");
  assert.equal(h([{ ...a, impact: { ...a.impact!, value: 121000 } }, b]), base, "aynı kova");
  assert.notEqual(h([{ ...a, severity: "warning" }, b]), base);
  assert.notEqual(h([{ ...a, impact: { ...a.impact!, value: 400000 } }, b]), base);
  assert.notEqual(h([a, b], { cards: ["PRICE_FLOOR"] }), base);
  assert.notEqual(h([a, b], { versions: { prompt: "s2" } }), base);
  assert.equal(decisionTypeOf(a), "INVENTORY"); assert.equal(decisionTypeOf(anomaly(0, "PRICE_BELOW_FLOOR").a), "PRICING"); assert.equal(decisionTypeOf(undefined), "DATA");
});

check("karar paketi: ≤3 anomali, anomali başına ≤6 kanıt, ≤2 kart, ≤2 önceki karar; el kitabı/snapshot yok; p50 < 4.000, en kötü < 8.000 token", () => {
  const items = Array.from({ length: 8 }, (_, i) => anomaly(i, i % 3 ? "STOCKOUT" : "PRICE_BELOW_FLOOR", 50000 + i * 1000, 10));
  const evidenceAll = items.flatMap(x => x.ev);
  const memory = [0, 1, 2].map(i => ({ source: "cfo_insight", entityId: `sku:MD-30${i}3B1`, text: "Stok yenileme siparişini nakit kapısı açılınca ver; taban fiyatın altına inme. ".repeat(4), asOf: AT }));
  const extras = [evidence("cfo_kaldirac_basamak", "merdiven.3.Trendyol erken odeme (BOSTA) kapasite", 250000, "TRY", AT, false)];
  // tipik: tek anomali, 4 kanıt
  const typical = buildDecisionPacket({ decisionType: "INVENTORY", anomalies: [{ anomaly: { ...items[1].a, evidenceIds: items[1].a.evidenceIds.slice(0, 4) }, reason: "new" }],
    evidence: evidenceAll, memory: memory.slice(0, 1), extras: [] }, 8000);
  assert.ok(typical.fits && typical.estimatedTokens < 4000, `p50 paketi ${typical.estimatedTokens} token`);
  // en kötü: 8 aday, her biri 10 kanıt, 3 hafıza, ek
  const worst = buildDecisionPacket({ decisionType: "INVENTORY", anomalies: items.map(x => ({ anomaly: x.a, reason: "new" as const })), evidence: evidenceAll, memory, extras }, 8000);
  assert.ok(worst.fits && worst.estimatedTokens < 8000, `en kötü paket ${worst.estimatedTokens} token`);
  assert.equal(worst.packet.top_anomalies.length, 3); assert.ok(worst.packet.top_anomalies.every(t => t.evidence_ids.length <= 6));
  assert.ok(worst.packet.relevant_rule_cards.length <= 2 && worst.packet.previous_decisions.length <= 2);
  const json = JSON.stringify(worst.packet);
  for (const forbidden of ["El Kitabı v33", "sourceWatermarks", "profitability", "cfo_change_log", "soru."]) assert.ok(!json.includes(forbidden), forbidden);
  assert.ok(!SCHEDULED_SYSTEM_PROMPT.includes("El Kitabı"), "planlı sistem talimatı el kitabını taşımaz");
  // sınır küçükse paket küçülür (kanıt → kart → anomali → hafıza); en küçük basamak da sığmazsa fits=false (sınır yükselmez)
  const small = buildDecisionPacket({ decisionType: "INVENTORY", anomalies: items.map(x => ({ anomaly: x.a, reason: "new" as const })), evidence: evidenceAll, memory, extras }, 1800);
  assert.ok(small.shrinkLevel > 0 && small.packet.top_anomalies.length < 3, `küçüldü: seviye ${small.shrinkLevel}`);
  const tiny = buildDecisionPacket({ decisionType: "INVENTORY", anomalies: items.map(x => ({ anomaly: x.a, reason: "new" as const })), evidence: evidenceAll, memory, extras }, 500);
  assert.equal(tiny.fits, false); assert.equal(tiny.shrinkLevel, 4);
});

check("bütçe kapıları: sıra ve modlar (planlı hakkı yalnız zamanlanmış koşuyu bağlar; derin inceleme ayrı bütçe)", () => {
  const c = getCfoConfig({});
  const t = (o: Partial<BudgetTotals> = {}): BudgetTotals => ({ callsToday: 0, scheduledCallsToday: 0, deepCallsToday: 0, spentToday: 0, spentThisMonth: 0, deepSpentThisMonth: 0, ...o });
  assert.equal(budgetBlock(c, t(), null), "billing_unconfigured");
  assert.equal(budgetBlock(c, t(), 0.5), null);
  assert.equal(budgetBlock(c, t({ scheduledCallsToday: 1 }), 0.5), "blocked_by_scheduled_limit");
  assert.equal(budgetBlock(c, t({ scheduledCallsToday: 1, callsToday: 1 }), 0.5, "scheduled", true), null, "elle monitor");
  assert.equal(budgetBlock(c, t({ callsToday: 2 }), 0.5, "scheduled", true), "blocked_by_daily_limit");
  assert.equal(budgetBlock(c, t(), 2.5), "blocked_by_run_cost");
  assert.equal(budgetBlock(c, t({ spentToday: 4.8 }), 0.5), "blocked_by_daily_budget");
  assert.equal(budgetBlock(c, t({ spentThisMonth: 299.8 }), 0.5), "blocked_by_budget");
  assert.equal(budgetBlock(c, t({ callsToday: 2, scheduledCallsToday: 1, spentToday: 5 }), 5, "deep_review"), null, "derin inceleme planlı sınırlardan bağımsız");
  assert.equal(budgetBlock(c, t({ deepCallsToday: 2 }), 5, "deep_review"), "blocked_by_daily_limit");
  assert.equal(budgetBlock(c, t(), 9, "deep_review"), "blocked_by_run_cost");
  assert.equal(budgetBlock(c, t({ deepSpentThisMonth: 96 }), 5, "deep_review"), "blocked_by_budget");
  assert.deepEqual([c.scheduledMaxInputTokens, c.scheduledMaxOutputTokens, c.maxCallsPerDay, c.maxScheduledCallsPerDay, c.monthlyBudgetTry], [8000, 700, 2, 1, 300]);
});

check("maliyet verimliliği: monitor ≠ AI çağrısı; kaçınma nedenleri; içgörü başına maliyet", () => {
  const d = (h: number) => new Date(Date.UTC(2026, 9, 7, h));
  const runs = [["completed", 6], ["no_material_change", 8], ["same_input", 9], ["cooldown", 10], ["open_task", 11], ["blocked_by_scheduled_limit", 12], ["data_quality_only", 13], ["running", 14], ["no_actionable_anomaly", 1]]
    .map(([status, h]) => ({ status: status as string, generatedAt: d(h as number) }));
  const usage = [{ status: "completed", createdAt: d(6), inputTokens: 3000, outputTokens: 450, cacheReadTokens: 0, cacheWriteTokens: 0, estimatedCost: 0.79, reservedCostTry: null },
    { status: "blocked_by_scheduled_limit", createdAt: d(12), inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, estimatedCost: 0, reservedCostTry: null }];
  const e = costEfficiency(runs, usage, [{ createdAt: d(6) }], d(5));
  assert.deepEqual([e.monitorRuns, e.aiCalls, e.inputTokens, e.outputTokens, e.costTry, e.acceptedInsights, e.costPerAcceptedInsight], [7, 1, 3000, 450, 0.79, 1, 0.79]);
  assert.deepEqual(e.avoided, { same_input: 1, no_material_change: 1, cooldown: 1, open_task: 1, data_quality: 1, no_actionable: 0, budget: 1 });
  assert.equal(e.callsAvoided, 6);
  assert.equal(costEfficiency(runs, usage, [], d(5)).costPerAcceptedInsight, null);
});

if (failed) { console.error(`\n${failed} test başarısız`); process.exit(1); }
console.log("\nAI CFO decision packet / materiality / rule cards / budget gates / cost efficiency: tüm testler geçti");

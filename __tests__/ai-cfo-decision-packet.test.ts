/**
 * AI CFO maliyet/görev ayrımı (2026-10-07): rule card'lar, önemli değişiklik kapısı, küçük karar paketi, bütçe kapıları,
 * maliyet verimliliği özeti. DB/ağ yok. Çalıştır: node --conditions=react-server --import tsx __tests__/ai-cfo-decision-packet.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CORE_RULES, RULE_CARD_SECTIONS, RULE_CARDS } from "../lib/cfo-agent/rule-cards";
import { buildDecisionPacket, cardsFor, CARDS_FOR_RULE, estimateTokens, SCHEDULED_SYSTEM_PROMPT } from "../lib/cfo-agent/decision-packet";
import { decisionInputHash, decisionTypeOf, impactBucket, materialChange } from "../lib/cfo-agent/materiality";
import { budgetBlock, type BudgetTotals } from "../lib/cfo-agent/budget";
import { getCfoConfig } from "../lib/cfo-agent/config";
import { costEfficiency } from "../lib/cfo-agent/cost-efficiency";
import { importProjectEvidence } from "../lib/cfo-agent/import-revenue";
import { alfashomeEvidence } from "../lib/cfo-agent/alfashome-sales";
import { capitalConfigEvidence } from "../lib/cfo-agent/capital-config";
import { capitalScore, freeCapital } from "../lib/capital/score";
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

check("rule card'lar (v1, el kitabı §7'den birebir): kart ≤800 token, madde sayısı = §7 numarası sayısı; eşleme Rule Cards v1", () => {
  const md = readFileSync("lib/cfo-agent/rule-cards.md", "utf8");
  for (const [id, text] of Object.entries(RULE_CARDS)) {
    assert.ok(estimateTokens(text) <= 800, `${id} tahmini ${estimateTokens(text)} token`);
    const items = text.split("\n").filter(l => l.startsWith("- ")).length;
    assert.equal(items, RULE_CARD_SECTIONS[id as keyof typeof RULE_CARDS].length, `${id}: madde sayısı §7 numaralarıyla aynı`);
    assert.ok(md.includes(text), `${id}: rule-cards.ts yeniden üretilmedi (npm run gen:handbook)`);
  }
  // el kitabı sahibinin ölçtüğü baytlar (Rule Cards v1) — metin birebir kopyalanmış
  assert.deepEqual(Object.fromEntries(Object.entries(RULE_CARDS).map(([k, v]) => [k, Buffer.byteLength(v, "utf8")])),
    { STOCKOUT: 1026, DEAD_STOCK: 1253, PRICE_FLOOR: 1292, CASH_SHORTFALL: 1722, CAPITAL_ALLOCATION: 1453, DEBT_GATE: 1893, DATA_QUALITY: 810 });
  // handbook-core.md'de de geçen §7 maddeleri (A6+A9) oradaki metinle aynı
  const handbook = readFileSync("lib/cfo-agent/handbook-core.md", "utf8");
  for (const line of ["🔴 **STOK DÜŞÜŞÜ SATIŞ DEĞİLDİR** (§4C, §9).", "🔴 **Net nakit pozisyonu −3.000.000 ₺ altına inemez.**", "🔴 **TAKSİTLİ NAKİT AVANS, ŞAHSİ KMH'DEN ÖNCE GELİR.**"])
    assert.ok(handbook.includes(line) && Object.values(RULE_CARDS).some(t => t.includes(line)), line);
  assert.ok(CORE_RULES.includes("SEN İTAAT EDEN BİR PERSONEL DEĞİLSİN") && SCHEDULED_SYSTEM_PROMPT.includes(CORE_RULES), "ortak çekirdek talimatta, bir kez");
  assert.ok(estimateTokens(CORE_RULES) <= 300);
  for (const ids of Object.values(CARDS_FOR_RULE)) for (const id of ids) { assert.ok(id in RULE_CARDS, id); assert.notEqual(id, "DATA_QUALITY", "DATA_QUALITY kartı planlı yolda yok"); }
  assert.deepEqual(cardsFor([anomaly(0).a]), ["STOCKOUT"]);
  assert.deepEqual(cardsFor([anomaly(0, "DEAD_STOCK").a]), ["DEAD_STOCK"]);
  assert.deepEqual(cardsFor([anomaly(0, "MARGIN_DROP").a]), ["PRICE_FLOOR"]);
  assert.deepEqual(cardsFor([{ ...anomaly(0).a, rule: "GOAL_OFF_TRACK" }]), ["CASH_SHORTFALL", "CAPITAL_ALLOCATION"]);
  assert.deepEqual(cardsFor([anomaly(0, "REVENUE_DEVIATION").a]), [], "eşlemesi olmayan kural kartsız");
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
  assert.ok(!SCHEDULED_SYSTEM_PROMPT.includes("El Kitabı v33 — AI CFO Blok A"), "planlı sistem talimatı el kitabının tamamını taşımaz");
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

check("ithalat beklenen ciro: proje başına durum/ciro/kâr/aylık katkı TAHMİNİ; varışı geçmiş YOLDA kaydı işaretlenir", () => {
  const ev = importProjectEvidence([
    { code: "07.26sea", status: "YOLDA", eta: "2026-10-05", revenue: 15474895, profit: 6039484, months: 6, tag: "KESIN" },
    { code: "ROMANYA-PARCA", status: "GUMRUKTE", eta: null, revenue: 3343000, profit: null, months: null, tag: "KESIN" },
  ], "2026-10-07T12:00:00.000Z");
  const v = (q: string) => ev.find(e => e.query.startsWith(q));
  assert.match(String(v("ithalat.07.26sea.durum")?.value), /varış tarihi geçti — durum güncellenmeli/);
  assert.equal(v("ithalat.07.26sea.durum")?.measured, false, "bayat kayıt ölçülmüş sayılmaz");
  assert.equal(v("ithalat.07.26sea.aylik_ciro_katkisi_try")?.value, Math.round(15474895 / 6));
  assert.equal(v("ithalat.07.26sea.beklenen_kar_try")?.measured, false, "plan TAHMİNİdir");
  assert.equal(v("ithalat.ROMANYA-PARCA.aylik_ciro_katkisi_try"), undefined, "satış ayı yoksa aylık katkı uydurulmaz");
  assert.equal(v("ithalat.toplam_beklenen_ciro_try")?.value, 15474895 + 3343000);
  assert.doesNotMatch(String(v("ithalat.ROMANYA-PARCA.durum")?.value), /geçti/, "varış tarihi yoksa bayat sayılmaz");
});

check("ALFASHOME kanalı: senkron tazeliği kanıtın ölçülmüşlüğünü belirler; senkron yoksa BAYAT/hiç", () => {
  const at = "2026-10-07T12:00:00.000Z";
  const fresh = alfashomeEvidence({ n30: 12, rev30: 18450.5, mtd: 4200, pending30: 1500, lastOrder: "2026-10-06T10:00:00.000Z", lastSync: "2026-10-07T06:00:00.000Z" }, at);
  const v = (list: typeof fresh, q: string) => list.find(e => e.query.startsWith(q));
  assert.equal(v(fresh, "alfashome.ciro_son_30_gun_try")?.value, 18450.5); assert.equal(v(fresh, "alfashome.ciro_son_30_gun_try")?.measured, true);
  assert.equal(v(fresh, "alfashome.son_siparis")?.value, "2026-10-06");
  const stale = alfashomeEvidence({ n30: 0, rev30: null, mtd: null, pending30: null, lastOrder: null, lastSync: "2026-10-01T06:00:00.000Z" }, at);
  assert.match(String(v(stale, "alfashome.senkron")?.value), /BAYAT/); assert.equal(v(stale, "alfashome.ciro_son_30_gun_try")?.measured, false, "bayat senkron ölçüm sayılmaz");
  assert.equal(v(stale, "alfashome.ciro_son_30_gun_try")?.value, 0);
  assert.match(String(v(alfashomeEvidence({ n30: 0, rev30: null, mtd: null, pending30: null, lastOrder: null, lastSync: null }, at), "alfashome.senkron")?.value), /hiç senkron yok/);
});

check("sermaye: tek skor/serbest sermaye kuralı (sayfa + dashboard + CFO aynı) ve CFO sermaye ayarını görür", () => {
  // Serbest sermaye: rezerv SERBEST kısmın yüzdesi (eski Yönetici Paneli toplamın yüzdesini alıyordu).
  assert.deepEqual(freeCapital(5_000_000, 4_000_000, 20), { total: 5_000_000, locked: 4_000_000, available: 1_000_000, reserve: 200_000, deployable: 800_000 });
  assert.deepEqual(freeCapital(1_000_000, 2_000_000, 20), { total: 1_000_000, locked: 2_000_000, available: 0, reserve: 0, deployable: 0 }, "stok > sermaye → negatif serbest yok");
  const full = capitalScore({ annualRoiPct: 60, deadRatio: 0, urgentCount: 0, liquidationCount: 0 });
  assert.deepEqual([full.total, full.label, full.tone], [100, "Mükemmel", "ok"]);
  const s = capitalScore({ annualRoiPct: 30, deadRatio: 0.25, urgentCount: 3, liquidationCount: 10 });
  assert.deepEqual([s.roi, s.dead, s.urgent, s.liquidation, s.total, s.label], [25, 12.5, 7, 10, 55, "İyi"]);
  assert.equal(capitalScore({ annualRoiPct: -40, deadRatio: 2, urgentCount: 50, liquidationCount: 99 }).total, 0, "alt sınır 0");
  const ev = capitalConfigEvidence({ totalTry: 5_000_000, reservePct: 20, updatedAt: "2026-09-01T00:00:00.000Z" }, 4_357_225.37, AT);
  const v = (q: string) => ev.find(e => e.query.startsWith(q));
  assert.equal(v("sermaye.stokta_bagli_try")?.value, 4_357_225); assert.equal(v("sermaye.stokta_bagli_try")?.measured, true);
  assert.equal(v("sermaye.ayar_toplam_try")?.measured, false, "elle girilen çerçeve ölçüm değildir");
  assert.equal(v("sermaye.kullanilabilir_try")?.value, 514_220);
  assert.deepEqual(capitalConfigEvidence(null, null, AT), [], "ayar ve görünüm yoksa kanıt yok");
});

if (failed) { console.error(`\n${failed} test başarısız`); process.exit(1); }
console.log("\nAI CFO decision packet / materiality / rule cards / budget gates / cost efficiency: tüm testler geçti");

/**
 * AI CFO runner (V1 yeniden inşası adım 4/9 + V2 Goal Engine) — orkestrasyon ve çıktı denetimi.
 * DB/ağ gerektirmez: store, kilit, sağlayıcı, snapshot ve hedefler enjekte edilir. Sentetik veri.
 * Çalıştır: node --conditions=react-server --import tsx __tests__/ai-cfo-runner.test.ts
 */
import assert from "node:assert/strict";
import { runCfoDeepReview, runCfoMonitor, runCfoMorningBrief, type RunnerDependencies, runPeriodKey } from "../lib/cfo-agent/runner";
import { safeAiCfoRun } from "../lib/cfo-agent/ai-trigger";
import type { BudgetTotals } from "../lib/cfo-agent/budget";
import type { RunMeta } from "../lib/cfo-agent/store";
import { validateAiOutput } from "../lib/cfo-agent/validate-ai-output";
import { goalAnomalies } from "../lib/cfo-agent/goal-anomalies";
import { getCfoConfig } from "../lib/cfo-agent/config";
import { ProviderError, reasoningPayload } from "../lib/cfo-agent/provider";
import { createMonitorLock, LockError } from "../lib/cfo-agent/lock";
import { metric, unknown } from "../lib/cfo-agent/calculations";
import { evidence } from "../lib/cfo-agent/evidence";
import { systemText } from "../lib/cfo-agent/provider";
import { HANDBOOK_CORE } from "../lib/cfo-agent/handbook-core";
import type { CfoStore, UsageWrite } from "../lib/cfo-agent/store";
import type { AiInsight, Anomaly, CfoAgentSnapshot, Metric } from "../lib/cfo-agent/types";
import type { GoalRow } from "../lib/fm/goals";

let failed = 0;
async function check(name: string, fn: () => unknown) {
  try { await fn(); console.log(`  OK   ${name}`); } catch (e) { failed++; console.error(`  FAIL ${name}\n         ${e instanceof Error ? e.stack ?? e.message : e}`); }
}
const NOW = new Date("2026-10-06T08:00:00Z"); // 11:00 İstanbul
const config = getCfoConfig({ AI_CFO_MONITOR_ENABLED: "true", AI_CFO_ENABLED: "true", AI_CFO_PROVIDER: "anthropic",
  AI_CFO_CI_BUILD_VERIFIED: "true", AI_CFO_LIVE_ACCEPTANCE_VERIFIED: "true", AI_CFO_SHADOW_WEEK_APPROVED: "true",
  AI_CFO_INPUT_PRICE_USD_PER_MILLION: "3", AI_CFO_OUTPUT_PRICE_USD_PER_MILLION: "15", AI_CFO_BILLING_USD_TRY: "48" });

function snapshot(): CfoAgentSnapshot {
  const zero: Metric = metric(0);
  const period = { grossRevenue: zero, orders: 0, aov: zero, complete: true };
  return {
    schemaVersion: "2", calculationVersion: "alfas-gross-v4", generatedAt: NOW.toISOString(), timezone: "Europe/Istanbul", currency: "TRY", accountingBasis: "gross_incl_vat",
    dataQuality: { staleSources: [], missingFields: [], costCoveragePct: 100, matchingCoveragePct: 100, sourceWatermarks: [], excludedDummyStock: 0, zeroStockSkuCount: 0,
      commissionCoverage: [], fbaInventoryUnknown: true, duplicateCanonicalRows: 0, excludedUntrustedRows: 0 },
    sales: { lastHour: period, today: period, yesterday: period, last7Days: period, last30Days: period, monthToDate: period, comparisons: [] },
    profitability: { grossRevenue: zero, revenueExVat: zero, vat: zero, refunds: zero, productCost: zero, commission: zero, shipping: zero, advertising: zero,
      otherVariableCosts: zero, contributionProfit: zero, contributionMargin: zero },
    profitabilityByPeriod: {}, channels: [],
    inventory: { costValue: zero, knownCostValue: zero, retailValue: zero, stockoutRiskValue: zero, deadStockValue: zero },
    products: [], deadStock: [],
    cash: { generalUnusedOverdraft: zero, totalCardDebt: zero, activeCards: 0, cash: zero, minimumProjectedPosition: metric(1000000), purposeLimit: zero, banksFresh: true, summaries: [] },
    procurement: { riskySkuCount: 0, openOrders: 0 }, importPipeline: { inboundSkuCount: 0, coveragePct: zero },
    returns: { currentRate: unknown("no_sample"), previousRate: unknown("no_sample"), sample: 0, complete: false }, evidence: [],
  };
}
const goal = (o: Partial<GoalRow> = {}): GoalRow => ({
  goal_key: "revenue_month_usd", goal_version: 1, kind: "revenue_month", title: "Aylık ciro hedefi", target_value: "100000.00", target_currency: "USD", deadline: null,
  as_of: "2026-10-06", period_start: "2026-10-01", period_end: "2026-10-31", state: "OFF_TRACK", observed_value_try: "309926.92", observed_on: "2026-10-05",
  target_value_try: "4855850.00", fx_usd_try: "48.5585", fx_month: "2026-09-01", progress_pct: "6.38", gap_try: "4545923.08", current_rate_try_per_day: "61985.38",
  required_rate_try_per_day: "174843.20", projected_value_try: "1921546.90", projected_on: "2026-10-31", grade: "B", flags: ["goal_fx_prior_month"], ...o,
});

function fakeStore() {
  const usage: UsageWrite[] = [], insights: AiInsight[] = [], finished: { status: string; error?: string }[] = [], saved: Anomaly[][] = [], metas: (RunMeta | undefined)[] = [];
  const begun = new Set<string>(), periods: string[] = [];
  let totals: BudgetTotals = { callsToday: 0, scheduledCallsToday: 0, deepCallsToday: 0, spentToday: 0, spentThisMonth: 0, deepSpentThisMonth: 0 }, recent: { createdAt: Date; impact: number | null } | null = null;
  let evaluations = { hashes: new Set<string>(), byKey: new Map<string, { severity: "info" | "warning" | "critical"; impact: number | null }>() };
  const store: CfoStore = {
    async begin(type, period) { const k = `${type}:${period}`; if (begun.has(k)) return null; begun.add(k); periods.push(period); return `run-${begun.size}`; },
    async snapshot(_id, _s, _h, _a, sent, meta) { saved.push(sent); metas.push(meta); },
    async evaluations() { return evaluations; },
    async recent() { return recent; },
    async totals() { return totals; },
    async usage(_run, data) { usage.push({ ...data }); return `u-${usage.length}`; },
    async updateUsage(id, data) { usage[Number(id.slice(2)) - 1] = { ...data }; },
    async insights(_run, list) { insights.push(...list); },
    async finish(_id, status, _now, _avoided, _saved, error) { finished.push({ status, error }); },
  };
  return { store, usage, insights, finished, saved, metas, periods, setTotals: (t: Partial<BudgetTotals>) => { totals = { ...totals, ...t }; },
    setRecent: (r: typeof recent) => { recent = r; }, setEvaluations: (e: typeof evaluations) => { evaluations = e; } };
}
const freeLock = () => ({ async acquire() { return true; }, async release() {} });

// Planlı (SCHEDULED_CFO) model yanıtı: kısa alanlar; severity/category kod ekler.
function aiSched(a: Anomaly, s: CfoAgentSnapshot, o: Record<string, unknown> = {}) {
  const n = s.evidence.find(e => a.evidenceIds.includes(e.id) && typeof e.value === "number")?.value ?? "";
  return JSON.stringify({ insights: [{ anomalyId: a.id, decision: "Ciro hedefi için hızlı ürün stoğunu koru", why: `Ay başından beri ciro ${n} TL.`,
    risk: "Ay hedefi kaçar.", next_action: "Hızlı satan ürünlerin stok ve fiyatını gözden geçir.", confidence: "high", evidence_ids: a.evidenceIds.slice(0, 2), ...o }] });
}
// Model yanıtı (derin inceleme şeması): anomaly'nin kendi kanıtındaki sayıları kullanır.
function aiFor(a: Anomaly, s: CfoAgentSnapshot, o: Record<string, unknown> = {}) {
  const proof = s.evidence.filter(e => a.evidenceIds.includes(e.id) && typeof e.value === "number");
  const n = proof[0]?.value ?? "";
  return JSON.stringify({ insights: [{ anomalyId: a.id, severity: a.severity, category: a.category, title: "Ciro hedefinin gerisinde",
    observation: `Ay başından beri ciro ${n} TL.`, recommendation: "Kanal kapsamını ve stoktaki hızlı ürünleri gözden geçir.",
    riskIfIgnored: "Ay hedefi kaçar.", confidence: "high", evidenceIds: a.evidenceIds.slice(0, 2), ...o }] });
}

async function main() {
  console.log("\nAI CFO runner testleri\n");
  const s0 = snapshot();
  const g0 = goalAnomalies([goal()], NOW);
  s0.evidence.push(...g0.evidence);
  const revenue = g0.anomalies[0];

  await check("Goal Engine → anomaly: OFF_TRACK/AT_RISK/NOT_MET gönderilir; UNKNOWN, kalite U ve bayat gözlem gönderilmez", () => {
    assert.equal(revenue.id, "goal:revenue_month_usd"); assert.equal(revenue.category, "sales"); assert.equal(revenue.severity, "warning");
    assert.equal(revenue.impact, null, "etki modelden veya hedeften türetilmez");
    assert.ok(g0.evidence.every(e => e.measured), "kalite B ölçülmüş sayılır");
    assert.equal(goalAnomalies([goal({ state: "UNKNOWN" })], NOW).anomalies.length, 0);
    assert.equal(goalAnomalies([goal({ grade: "U" })], NOW).anomalies.length, 0);
    assert.equal(goalAnomalies([goal({ state: "ON_TRACK" })], NOW).anomalies.length, 0);
    assert.equal(goalAnomalies([goal({ as_of: "2026-10-01" })], NOW).anomalies.length, 0, "bayat gözlem");
    const floor = goalAnomalies([goal({ goal_key: "net_position_floor_try", kind: "position_floor", grade: "D" })], NOW);
    assert.equal(floor.anomalies[0].severity, "critical"); assert.ok(floor.evidence.every(e => !e.measured), "kalite D tahminidir");
    const nulls = goalAnomalies([goal({ projected_value_try: null, current_rate_try_per_day: null })], NOW);
    assert.ok(!nulls.evidence.some(e => e.query.endsWith(".projected_try")), "bilinmeyen değer kanıt olmaz (0 yazılmaz)");
  });

  await check("çıktı denetimi: uydurma kanıt/sayı, fazladan alan, bozuk JSON, değişmiş severity reddedilir", () => {
    const list = [revenue];
    assert.equal(validateAiOutput(aiFor(revenue, s0), s0, list).insights.length, 1);
    assert.equal(validateAiOutput(aiFor(revenue, s0, { evidenceIds: ["invented"] }), s0, list).insights.length, 0);
    assert.equal(validateAiOutput(aiFor(revenue, s0, { observation: "Kazanç 123456789 TL." }), s0, list).insights.length, 0);
    assert.equal(validateAiOutput(aiFor(revenue, s0, { recommendation: "Fiyatı %15 artır." }), s0, list).insights.length, 0, "türetilmiş yüzde");
    assert.equal(validateAiOutput(aiFor(revenue, s0, { financialImpact: 100 }), s0, list).insights.length, 0);
    assert.equal(validateAiOutput(aiFor(revenue, s0, { severity: "critical" }), s0, list).insights.length, 0);
    assert.equal(validateAiOutput("{bozuk", s0, list).insights.length, 0);
    // Türkçe sayı biçimi kanıttaki değerle eşleşir
    assert.equal(validateAiOutput(aiFor(revenue, s0, { observation: "Ay başından beri ciro 309.926,92 TL." }), s0, list).insights.length, 1);
    // Sağlayıcı şeması maxItems taşıyamaz: 3'ten fazla içgörü tümden atılmaz, fazlası reddedilir.
    const one = JSON.parse(aiFor(revenue, s0)).insights[0];
    const four = validateAiOutput(JSON.stringify({ insights: [one, one, one, one] }), s0, list);
    assert.equal(four.insights.length, 1);
    assert.equal(four.rejected, 3, "1 fazla + 2 tekrar");
    assert.deepEqual(four.reasons, { over_limit: 1, duplicate: 2 });
    assert.deepEqual(validateAiOutput("{bozuk", s0, list).reasons, { invalid_json: 1 });
    assert.deepEqual(validateAiOutput(aiFor(revenue, s0, { observation: "Kazanç 123456789 TL." }), s0, list).reasons, { fabricated_number: 1 });
  });

  const provider = { async countInput() { return 1000; }, async generate(i: { packet?: unknown }) { return { text: i.packet ? aiSched(revenue, s0) : aiFor(revenue, s0), inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0, requestId: "test" }; } };
  // Girdi şartnamesi Blok B/C — defterde ölçülmüş açık (533.740) ve nakit kapısı satırı
  const ctxGap = evidence("cfo_change_log", "defter.cl_1.veri/bulgu: nakit açığı ölçüldü", "Açık 533.740 TL; ölü stok tasfiyesi açığın %174'ünü karşılar", "text", "2026-10-07T05:00:00.000Z", true);
  const ctxCash = evidence("cfo_nakit_kapisi", "nakit_kapisi.nakit_try", 59693.13, "TRY", "2026-10-07T05:00:00.000Z", true);
  const fakeContext = { tables: "KARGO TARİFESİ (cfo_kargo_tarife): TRENDYOL A [0–150] 42,5 TL", state: [ctxCash], memory: [ctxGap] };
  const base: RunnerDependencies = { now: NOW, config, context: async () => fakeContext, snapshot: async () => snapshot(), goals: async () => [goal()], queues: async () => new Map(), memory: async () => [], extras: null, lock: freeLock(), provider };

  await check("kapılar: monitor kapalı → hiç yazma yok; AI kapalı/release kapısı/sağlayıcı yok → deterministik kayıt, çağrı yok", async () => {
    const st = fakeStore();
    assert.equal((await runCfoMonitor({ ...base, store: st.store, config: getCfoConfig({}) })).status, "disabled");
    assert.equal(st.saved.length, 0);
    assert.equal((await runCfoMonitor({ ...base, store: fakeStore().store, config: { ...config, enabled: false } })).status, "ai_disabled");
    assert.equal((await runCfoMonitor({ ...base, store: fakeStore().store, config: { ...config, releaseApproved: false } })).status, "release_gates_pending");
    const noProv = fakeStore();
    assert.equal((await runCfoMonitor({ ...base, store: noProv.store, provider: null })).status, "provider_unavailable");
    assert.equal(noProv.usage.length, 0);
    assert.equal(getCfoConfig({}).enabled, false); assert.equal(getCfoConfig({}).monitorEnabled, false);
  });

  await check("anomaly yoksa model çağrılmaz", async () => {
    const st = fakeStore();
    const r = await runCfoMonitor({ ...base, store: st.store, goals: async () => [goal({ state: "ON_TRACK" })], provider: { ...provider, async generate() { throw new Error("MUST NOT CALL"); } } });
    assert.equal(r.status, "no_actionable_anomaly"); assert.equal(st.usage.length, 0);
  });

  await check("kabul 2: no_actionable_anomaly hangi kuralların veri yüzünden kör olduğunu söyler", async () => {
    const st = fakeStore();
    const stale = snapshot(); stale.dataQuality.staleSources = ["Entegra"]; stale.cash.banksFresh = false;
    const r = await runCfoMonitor({ ...base, store: st.store, snapshot: async () => stale, goals: async () => [goal({ state: "ON_TRACK" })] });
    assert.equal(r.status, "no_actionable_anomaly");
    assert.match(st.finished.at(-1)?.error ?? "", /susan_kurallar: Entegra bayat → PRICE_BELOW_FLOOR.*DEAD_STOCK.*\| banka bakiyesi bayat → CASH_CRITICAL/);
  });

  await check("derin inceleme (elle): içgörü bağlam kanıtına (defter TL'si) ve § kuralına atıf yapabilir; sistem el kitabının tamamını taşır", async () => {
    const st = fakeStore();
    let sentInput: unknown = null;
    const cite = (o: Record<string, unknown>) => JSON.stringify({ insights: [{ ...JSON.parse(aiFor(revenue, s0)).insights[0], ...o }] });
    const ok = cite({ recommendation: "§2E ölü stok tasfiyesi: defterdeki açık 533.740 TL; nakit 59.693,13 TL.", evidenceIds: [...revenue.evidenceIds, ctxGap.id, ctxCash.id] });
    const r = await runCfoDeepReview({ ...base, store: st.store, provider: { ...provider, async countInput(i) { sentInput = i; return 1000; },
      async generate() { return { text: ok, inputTokens: 1000, outputTokens: 200, cacheReadTokens: 900, cacheWriteTokens: 0, requestId: "t" }; } } });
    assert.equal(r.status, "completed"); assert.equal(st.insights.length, 1);
    assert.match(st.periods[0], /:d\d$/, "derin inceleme kendi periodKey'i (':d') ile ayrılır"); assert.equal(st.metas[0]?.mode, "deep_review");
    assert.ok(st.insights[0].recommendation.includes("§2E") && st.insights[0].recommendation.includes("533.740"));
    const payload = reasoningPayload(sentInput as never) as { context?: { state: { id: string }[]; memory: { id: string }[] } };
    assert.deepEqual(payload.context?.memory.map(m => m.id), [ctxGap.id], "Blok C kullanıcı mesajında");
    assert.ok(systemText(sentInput as never).includes(HANDBOOK_CORE) && systemText(sentInput as never).includes("KARGO TARİFESİ"), "Blok A + tablo eki sistemde");
    // bağlamda olmayan rakam ya da bağlam dışı kanıt hâlâ reddedilir
    assert.equal(validateAiOutput(cite({ recommendation: "Açık 999.999 TL." }), s0, [revenue], new Set([ctxGap.id])).reasons.fabricated_number, 1);
    assert.equal(validateAiOutput(cite({ evidenceIds: [...revenue.evidenceIds, ctxGap.id] }), s0, [revenue]).reasons.evidence_not_allowed, 1, "contextIds verilmezse bağlam kanıtı izinsiz");
    assert.equal(validateAiOutput(cite({ recommendation: "Fiyatı %15 artır." }), s0, [revenue]).reasons.fabricated_number, 1, "el kitabındaki küçük tam sayılar serbest değil");
  });

  await check("planlı başarılı çağrı: küçük paket (el kitabı yok, önbellek yok), uzak sayım atlanır, kısa çıktı kaydedilir", async () => {
    const st = fakeStore();
    let sent: { packet?: { relevant_rule_cards: { id: string }[]; top_anomalies: unknown[] } } | null = null;
    const r = await runCfoMonitor({ ...base, store: st.store, provider: { async countInput() { throw new Error("MUST NOT COUNT (estimate < 80%)"); },
      async generate(i) { sent = i as never; return { text: aiSched(revenue, s0), inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0, requestId: "t" }; } } });
    const packet = (sent as unknown as { packet: { relevant_rule_cards: { id: string; text: string }[]; top_anomalies: unknown[] } }).packet;
    assert.ok(packet && packet.top_anomalies.length <= 3, "paket var, ≤3 anomali");
    assert.deepEqual(packet.relevant_rule_cards.map(c => c.id), ["CASH_SHORTFALL", "CAPITAL_ALLOCATION"], "hedef → nakit kartları");
    assert.ok(!systemText(sent as never).includes(HANDBOOK_CORE.slice(0, 200)), "el kitabının tamamı planlı çağrıda yok");
    assert.equal(st.insights[0].title, "Ciro hedefi için hızlı ürün stoğunu koru"); assert.equal(st.insights[0].severity, revenue.severity, "severity anomaliden");
    assert.equal(st.metas[0]?.mode, "scheduled"); assert.ok(st.metas[0]?.decisionInputHash);
    assert.equal(r.status, "completed"); assert.equal(r.insights, 1);
    assert.equal(st.saved[0][0].id, "goal:revenue_month_usd");
    assert.equal(st.usage[0].status, "completed"); assert.equal(st.usage[0].inputTokens, 1000);
    assert.ok((st.usage[0].estimatedCost ?? 0) > 0); assert.ok(st.insights.length <= 2);
    assert.ok(!JSON.stringify(reasoningPayload({ snapshot: s0, anomalies: [revenue], memory: [] })).includes("customer"));
  });

  await check("geçersiz model çıktısı: içgörü kaydedilmez, durum invalid_output", async () => {
    const st = fakeStore();
    const r = await runCfoMonitor({ ...base, store: st.store, provider: { ...provider, async generate() { return { text: aiSched(revenue, s0, { why: "Ciro 999999 TL." }), inputTokens: 900, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0, requestId: null }; } } });
    assert.equal(r.status, "invalid_output"); assert.equal(st.insights.length, 0); assert.equal(st.usage[0].status, "completed");
    assert.equal(st.finished.at(-1)?.error, "rejected_insights:1 (fabricated_number=1)");
  });

  await check("kısmi başarı: geçen içgörü kaydedilir, durum completed, ret nedeni error'da", async () => {
    const st = fakeStore();
    const good = JSON.parse(aiSched(revenue, s0)).insights[0], bad = JSON.parse(aiSched(revenue, s0, { why: "Ciro 999999 TL." })).insights[0];
    const r = await runCfoMonitor({ ...base, store: st.store, provider: { ...provider, async generate() { return { text: JSON.stringify({ insights: [bad, good] }), inputTokens: 900, outputTokens: 300, cacheReadTokens: 0, cacheWriteTokens: 0, requestId: null }; } } });
    assert.equal(r.status, "completed"); assert.equal(r.insights, 1); assert.equal(st.insights.length, 1);
    assert.equal(st.finished.at(-1)?.status, "completed"); assert.equal(st.finished.at(-1)?.error, "rejected_insights:1 (fabricated_number=1)");
    assert.equal(r.error, "rejected_insights:1 (fabricated_number=1)");
  });

  await check("çıktı tavanında kesilen yanıt: invalid_output + output_truncated, kullanım yine ölçülür", async () => {
    const st = fakeStore();
    const r = await runCfoMonitor({ ...base, store: st.store, provider: { ...provider, async generate() { return { text: "", inputTokens: 5559, outputTokens: config.scheduledMaxOutputTokens, cacheReadTokens: 0, cacheWriteTokens: 0, requestId: null }; } } });
    assert.equal(r.status, "invalid_output"); assert.equal(st.finished.at(-1)?.error, "output_truncated");
    assert.equal(st.usage[0].status, "completed"); assert.equal(st.usage[0].outputTokens, 700, "planlı çıktı tavanı 700");
  });

  await check("sert maliyet kapıları: planlı/gün çağrı, koşu başı TL, gün TL, ay TL — hepsi çağrıdan önce", async () => {
    const st = fakeStore(); st.setTotals({ spentThisMonth: 300 });
    assert.equal((await runCfoMonitor({ ...base, store: st.store })).status, "blocked_by_budget");
    assert.equal(st.usage[0].status, "blocked_by_budget");
    const lim = fakeStore(); lim.setTotals({ callsToday: 2 });
    assert.equal((await runCfoMonitor({ ...base, store: lim.store, manual: true })).status, "blocked_by_daily_limit");
    const sched = fakeStore(); sched.setTotals({ scheduledCallsToday: 1, callsToday: 1 });
    assert.equal((await runCfoMonitor({ ...base, store: sched.store })).status, "blocked_by_scheduled_limit", "günde 1 zamanlanmış çağrı");
    assert.notEqual((await runCfoMonitor({ ...base, store: sched.store, manual: true })).status, "blocked_by_scheduled_limit", "elle monitor planlı hakkı kullanmaz");
    const day = fakeStore(); day.setTotals({ spentToday: 5 });
    assert.equal((await runCfoMonitor({ ...base, store: day.store })).status, "blocked_by_daily_budget");
    assert.equal((await runCfoMonitor({ ...base, store: fakeStore().store, config: { ...config, maxCostTryPerRun: 0.01 } })).status, "blocked_by_run_cost");
    const deep = fakeStore(); deep.setTotals({ deepSpentThisMonth: 100 });
    assert.equal((await runCfoDeepReview({ ...base, store: deep.store })).status, "blocked_by_budget", "derin inceleme ayrı aylık bütçe");
    assert.equal(getCfoConfig({}).maxCallsPerDay, 2); assert.equal(getCfoConfig({}).maxScheduledCallsPerDay, 1);
  });

  await check("planlı girdi sınırı: env yükseltemez; paket sığmazsa çağrı yok, tahmin sayıyla yazılır", async () => {
    const env = { AI_CFO_SCHEDULED_MAX_INPUT_TOKENS: "50000", AI_CFO_MAX_INPUT_TOKENS_PER_RUN: "90000", AI_CFO_SCHEDULED_MAX_OUTPUT_TOKENS: "5000", AI_CFO_MAX_CALLS_PER_DAY: "50" };
    assert.deepEqual([getCfoConfig(env).scheduledMaxInputTokens, getCfoConfig(env).scheduledMaxOutputTokens, getCfoConfig(env).maxInputTokens, getCfoConfig(env).maxCallsPerDay], [8000, 700, 50000, 6],
      "büyük env değeri tavana kırpılır, ayar okuması düşmez");
    const st = fakeStore();
    const r = await runCfoMonitor({ ...base, store: st.store, config: { ...config, scheduledMaxInputTokens: 1000 },
      provider: { ...provider, async generate() { throw new Error("MUST NOT CALL"); } } });
    assert.equal(r.status, "blocked_by_input_tokens"); assert.match(r.error ?? "", /^estimated_tokens:\d+ limit:1000 shrink:4$/, "önce küçültülür, sonra bloklanır");
    assert.equal(st.usage.length, 0);
  });

  await check("derin inceleme token sınırı ücretli çağrıdan ve rezervasyondan önce durdurur", async () => {
    const st = fakeStore();
    const blocked = await runCfoDeepReview({ ...base, store: st.store, provider: { ...provider, async countInput() { return config.maxInputTokens; } } });
    assert.equal(blocked.status, "blocked_by_input_tokens");
    assert.equal(blocked.error, `input_tokens:${config.maxInputTokens} reserve:512 limit:${config.maxInputTokens}`, "ölçülen sayı kayda geçer");
    assert.equal(st.usage.length, 0);
  });

  await check("sağlayıcı zaman aşımı: rezervasyon 'failed' kalır, kilit bırakılır, hata kodu sabit", async () => {
    const st = fakeStore(); let released = false;
    const r = await runCfoMonitor({ ...base, store: st.store, lock: { async acquire() { return true; }, async release() { released = true; } },
      provider: { ...provider, async generate() { throw new ProviderError("provider_timeout"); } } });
    assert.equal(r.status, "failed"); assert.equal(r.error, "provider_timeout"); assert.equal(st.usage[0].status, "failed");
    assert.ok((st.usage[0].reservedCostTry ?? 0) > 0); assert.ok(released);
    // HTTP hata yanıtı faturalanmaz: rezerv harcama sayılmaz (günlük/aylık tavanı boşuna doldurmaz)
    const rej = fakeStore();
    const r400 = await runCfoMonitor({ ...base, store: rej.store, provider: { ...provider, async generate() { throw new ProviderError("provider_http_400"); } } });
    assert.equal(r400.error, "provider_http_400");
    assert.deepEqual([rej.usage[0].status, rej.usage[0].estimatedCost, rej.usage[0].reservedCostTry], ["failed", 0, null]);
  });

  await check("soğuma süresi / açık iş: çağrı yok, durum kaçınma nedenini söyler", async () => {
    const st = fakeStore(); st.setRecent({ createdAt: NOW, impact: null });
    assert.equal((await runCfoMonitor({ ...base, store: st.store })).status, "cooldown");
    const q = fakeStore();
    assert.equal((await runCfoMonitor({ ...base, store: q.store, queues: async a => new Map(a.map(x => [x.id, ["cfo_question:1"]])) })).status, "open_task");
  });

  await check("önemli değişiklik kapısı: aynı anomali / aynı girdi hash'i → 0 sağlayıcı çağrısı; önem artınca yeniden", async () => {
    let calls = 0;
    const counting = { ...provider, async generate(i: { packet?: unknown }) { calls++; return provider.generate(i); } };
    const first = fakeStore();
    assert.equal((await runCfoMonitor({ ...base, store: first.store, provider: counting })).status, "completed");
    const hash = first.metas[0]!.decisionInputHash!;
    // Aynı anomali aynı önemle değerlendirilmiş → no_material_change (saat/cron/yalnız tazelik çağrı başlatmaz)
    const same = fakeStore(); same.setEvaluations({ hashes: new Set([hash]), byKey: new Map([[revenue.cooldownKey, { severity: revenue.severity, impact: null }]]) });
    assert.equal((await runCfoMonitor({ ...base, store: same.store, provider: counting })).status, "no_material_change");
    // Anomali kaydı yok ama aynı karar girdisi hash'i değerlendirilmiş → same_input
    const hashOnly = fakeStore(); hashOnly.setEvaluations({ hashes: new Set([hash]), byKey: new Map() });
    assert.equal((await runCfoMonitor({ ...base, store: hashOnly.store, provider: counting })).status, "same_input");
    assert.equal(calls, 1, "aynı karar girdisi için 0 tekrar çağrı");
    // Önem derecesi arttıysa yeniden değerlendirilir
    const up = fakeStore(); up.setEvaluations({ hashes: new Set(), byKey: new Map([[revenue.cooldownKey, { severity: "info", impact: null }]]) });
    assert.equal((await runCfoMonitor({ ...base, store: up.store, provider: counting })).status, "completed"); assert.equal(calls, 2);
  });

  await check("derin inceleme yalnız elle: planlı tetik onu seçemez", async () => {
    assert.deepEqual(await safeAiCfoRun("deep_review"), { status: "failed", error: "deep_review_manual_only" });
  });

  await check("eşzamanlılık ve idempotency: aynı saat ikinci çalışma duplicate; kilit tutuluyorsa locked", async () => {
    const st = fakeStore(); let held = false;
    const lock = () => { let mine = false; return { async acquire() { if (held) return false; held = true; mine = true; return true; }, async release() { if (mine) held = false; } }; };
    const [a, b] = await Promise.all([runCfoMonitor({ ...base, store: st.store, lock: lock() }), runCfoMonitor({ ...base, store: st.store, lock: lock() })]);
    assert.ok([a.status, b.status].includes("locked"));
    assert.equal((await runCfoMonitor({ ...base, store: st.store, lock: lock() })).status, "duplicate");
    await assert.rejects(createMonitorLock({}).acquire(), /session_lock_not_configured/);
    // lock failures surface as fixed, credential-free tags instead of a generic monitor_failed
    const tag = async (env: Record<string, string>) => { try { await createMonitorLock(env).acquire(); return "acquired"; } catch (e) { return (e as { code?: string }).code; } };
    assert.equal(await tag({ AI_CFO_LOCK_SESSION_MODE: "true", AI_CFO_LOCK_DATABASE_URL: "postgresql://u:p@aws-0-eu-north-1.pooler.supabase.com:6543/postgres" }), "transaction_pooler_not_allowed");
    assert.equal(await tag({ AI_CFO_LOCK_SESSION_MODE: "true", AI_CFO_LOCK_DATABASE_URL: "postgresql://u:p@db.abcdefghijklmnopqrst.supabase.co:5432/postgres" }), "lock_direct_host_not_reachable_use_session_pooler");
    assert.equal(await tag({ AI_CFO_LOCK_SESSION_MODE: "true", AI_CFO_LOCK_DATABASE_URL: "not a url" }), "lock_invalid_database_uri");
    assert.equal(await tag({ AI_CFO_LOCK_SESSION_MODE: "true", AI_CFO_LOCK_DATABASE_URL: "postgresql://u:secret-pw@127.0.0.1:1/postgres" }), "lock_network_connection_failed");
    const failedRun = await runCfoMonitor({ ...base, store: fakeStore().store, lock: { async acquire() { throw new LockError("lock_tls_certificate_error"); }, async release() {} } });
    assert.deepEqual([failedRun.status, failedRun.error, failedRun.runId], ["failed", "lock_tls_certificate_error", null], "no run row, diagnostic tag returned");
    assert.ok(!JSON.stringify(failedRun).includes("secret-pw"));
  });

  await check("elle çalıştırma: saatte 3 (20 dk dilim); zamanlanmış koşu saatte 1 kalır", async () => {
    const st = fakeStore(), at = (min: number) => new Date(NOW.getTime() + min * 60000);
    const manual = async (min: number) => (await runCfoMonitor({ ...base, now: at(min), store: st.store, manual: true })).status;
    assert.notEqual(await manual(5), "duplicate"); assert.notEqual(await manual(25), "duplicate"); assert.notEqual(await manual(45), "duplicate");
    assert.equal(await manual(10), "duplicate", "same 20-minute slot");
    assert.notEqual((await runCfoMonitor({ ...base, now: at(50), store: st.store })).status, "duplicate", "scheduled key is separate from manual slots");
    assert.equal((await runCfoMonitor({ ...base, now: at(55), store: st.store })).status, "duplicate", "scheduled stays once per hour");
    assert.deepEqual([runPeriodKey("monitor", { date: "2026-10-07", hour: "2026-10-07T02", minutes: 2 * 60 + 41 }, true),
      runPeriodKey("morning", { date: "2026-10-07", hour: "2026-10-07T10", minutes: 600 }), runPeriodKey("monitor", { date: "2026-10-07", hour: "2026-10-07T02", minutes: 130 })],
      ["2026-10-07T02:m2", "2026-10-07", "2026-10-07T02"]);
  });

  await check("sabah özeti 09:30 İstanbul'dan önce çalışmaz; sonra bağlam + hedeflerle çalışır", async () => {
    assert.equal((await runCfoMorningBrief({ ...base, now: new Date("2026-10-06T06:29:00Z"), store: fakeStore().store })).status, "too_early");
    const st = fakeStore();
    const r = await runCfoMorningBrief({ ...base, store: st.store });
    assert.equal(r.status, "completed");
    assert.deepEqual(st.saved[0].map(a => a.id), ["goal:revenue_month_usd", "morning_context"]);
  });

  if (failed) { console.error(`\n${failed} test başarısız`); process.exitCode = 1; } else console.log("\nAI CFO runner: tüm testler geçti");
}
main().then(() => process.exit(process.exitCode ?? 0)).catch(e => { console.error(e); process.exit(1); });

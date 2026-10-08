/**
 * Deterministik CFO motoru (lib/cfo-agent/runner.ts, 2026-10-08: sitede LLM yok) — orkestrasyon.
 * DB/ağ gerektirmez: store, kilit, snapshot, hedefler, METRIK ve alarm enjekte edilir. Sentetik veri.
 * Çalıştır: node --conditions=react-server --import tsx __tests__/ai-cfo-runner.test.ts
 */
import assert from "node:assert/strict";
import { runCfoEngine, runPeriodKey, type RunnerDependencies } from "../lib/cfo-agent/runner";
import { safeCfoEngineRun } from "../lib/cfo-agent/ai-trigger";
import { getCfoConfig } from "../lib/cfo-agent/config";
import { LockError } from "../lib/cfo-agent/lock";
import { metric, unknown } from "../lib/cfo-agent/calculations";
import type { CfoStore, EngineRecord, PreviousRuns } from "../lib/cfo-agent/store";
import type { CfoAgentSnapshot, Metric } from "../lib/cfo-agent/types";
import type { GoalRow } from "../lib/fm/goals";

let failed = 0;
async function check(name: string, fn: () => unknown) {
  try { await fn(); console.log(`  OK   ${name}`); } catch (e) { failed++; console.error(`  FAIL ${name}\n         ${e instanceof Error ? e.stack ?? e.message : e}`); }
}
const NOW = new Date("2026-10-06T08:00:00Z"); // 11:00 İstanbul
const config = getCfoConfig({ AI_CFO_MONITOR_ENABLED: "true" });

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


/** Nakit dibi tabanın altında (CASH_CRITICAL) + Goal Engine sapması. */
function critical(): CfoAgentSnapshot {
  const s = snapshot();
  s.cash.minimumProjectedPosition = metric(-3379787); s.cash.cash = metric(59693.13); s.cash.purposeLimit = metric(750000);
  return s;
}

function fakeStore(prev: PreviousRuns = { last: null, yesterday: null }) {
  const records: { snapshot: CfoAgentSnapshot | null; data: EngineRecord }[] = [], finished: { status: string; error?: string }[] = [], periods: string[] = [];
  const begun = new Set<string>();
  const store: CfoStore = {
    async begin(period) { if (begun.has(period)) return null; begun.add(period); periods.push(period); return `run-${begun.size}`; },
    async previous() { return prev; },
    async record(_id, snapshot, _hash, data) { records.push({ snapshot, data }); },
    async finish(_id, status, _now, error) { finished.push({ status, error }); },
  };
  return { store, records, finished, periods };
}
const freeLock = () => ({ async acquire() { return true; }, async release() {} });
const deps = (o: Partial<RunnerDependencies> = {}): RunnerDependencies => ({ now: NOW, config, lock: freeLock(), snapshot: async () => critical(), goals: async () => [goal()],
  queues: async () => new Map(), metrics: null, alarms: null, ...o });

async function main() {
  await check("motor bayrağı kapalı → disabled, hiçbir şey yazılmaz", async () => {
    const f = fakeStore();
    assert.deepEqual(await runCfoEngine("scheduled", deps({ config: getCfoConfig({}), store: f.store })), { status: "disabled" });
    assert.equal(f.records.length, 0);
    assert.deepEqual(await safeCfoEngineRun("scheduled"), { status: "disabled" }, "env yokken cron ucu da yazmaz");
  });
  await check("idempotency: saatlik ve her senkron saat başına bir kez; elle 20 dakikalık dilim", () => {
    const p = { hour: "2026-10-06T11", minutes: 11 * 60 + 25 };
    assert.equal(runPeriodKey("scheduled", p), "2026-10-06T11:scheduled");
    assert.equal(runPeriodKey("sync_xml", p), "2026-10-06T11:sync_xml", "senkron koşusu saatlik koşuyla çakışmaz");
    assert.equal(runPeriodKey("manual", p), "2026-10-06T11:m1");
  });
  await check("koşu: her anomali şablonlu bulgu olur; ACİL başta; önceki gün yoksa hepsi 'yeni'; snapshot yazılır", async () => {
    const f = fakeStore();
    const r = await runCfoEngine("scheduled", deps({ store: f.store }));
    assert.equal(r.status, "completed"); assert.deepEqual(f.finished, [{ status: "completed", error: undefined }]);
    const d = f.records[0].data;
    assert.equal(d.findings.length, d.anomalies.length, "görüş kapanmaz: 19 satır gizlenmez");
    assert.deepEqual(d.findings.map(x => x.rule), ["CASH_CRITICAL", "GOAL_OFF_TRACK"]);
    assert.equal(d.findings[0].urgency, "ACIL"); assert.match(d.findings[0].text, /Nakit dibi -3\.379\.787 TL/);
    assert.ok(d.findings.every(x => x.sinceYesterday === "yeni" && /Kanıt: e_/.test(x.text) && /Aciliyet: /.test(x.text)));
    assert.equal(d.material.sinceYesterday, true); assert.equal(d.material.sincePreviousRun, true);
    assert.ok(f.records[0].snapshot, "ilk koşu snapshot yazar"); assert.equal(d.snapshotRef, null);
    assert.equal(d.trigger, "scheduled"); assert.ok(/^[0-9a-f]{64}$/.test(d.decisionInputHash));
  });
  await check("önemli değişiklik BAYRAĞI: dünle aynı girdi → no_material_change; bulgu 'aynı'; snapshot önceki koşuya referans", async () => {
    const first = fakeStore(); await runCfoEngine("scheduled", deps({ store: first.store }));
    const d0 = first.records[0].data;
    const evals = new Map(d0.anomalies.map(a => [a.cooldownKey, { severity: a.severity, impact: a.impact?.value ?? null }]));
    const f = fakeStore({ last: { id: "run-prev", hash: d0.decisionInputHash, snapshotRunId: "run-prev" }, yesterday: { hash: d0.decisionInputHash, evaluations: evals } });
    const r = await runCfoEngine("scheduled", deps({ store: f.store }));
    assert.equal(r.material, false);
    const d = f.records[0].data;
    assert.deepEqual(d.material, { sincePreviousRun: false, sinceYesterday: false, previousRunHash: d0.decisionInputHash, yesterdayHash: d0.decisionInputHash });
    assert.ok(d.findings.every(x => x.sinceYesterday === "ayni"));
    assert.equal(f.records[0].snapshot, null, "aynı girdide 164 kB snapshot yeniden yazılmaz"); assert.equal(d.snapshotRef, "run-prev");
    // dün olup bugün olmayan bulgu "kapandı" listesine girer; önemi artan "değişti"
    evals.set("STOCKOUT|TRENDYOL:OLD", { severity: "warning", impact: 1 });
    evals.set(d0.anomalies[0].cooldownKey, { severity: "warning", impact: null });
    const g = fakeStore({ last: null, yesterday: { hash: "x", evaluations: evals } });
    await runCfoEngine("scheduled", deps({ store: g.store }));
    assert.deepEqual(g.records[0].data.closedSinceYesterday, ["STOCKOUT|TRENDYOL:OLD"]);
    assert.equal(g.records[0].data.findings.find(x => x.cooldownKey === d0.anomalies[0].cooldownKey)?.sinceYesterday, "degisti");
  });
  await check("METRIK satırları ve alarmlar kayda girer; METRIK hatası bulguları engellemez; koşan motor kendini 'bayat' saymaz", async () => {
    const f = fakeStore();
    await runCfoEngine("scheduled", deps({ store: f.store, metrics: async () => [{ source: "cfo_nakit_kapisi", key: "nakit_kapisi.nakit_try", value: 59693, unit: "TRY", measured: true, asOf: "x" }],
      alarms: async () => [{ code: "engine_stale", key: "engine_stale", message: "m" }, { code: "floor_breach", key: "floor_breach", message: "dip" }] }));
    assert.equal(f.records[0].data.metrics.length, 1);
    assert.deepEqual(f.records[0].data.alarms.map(a => a.code), ["floor_breach"]);
    const g = fakeStore();
    const r = await runCfoEngine("scheduled", deps({ store: g.store, metrics: async () => { throw new Error("db url secret"); } }));
    assert.equal(r.status, "completed"); assert.equal(g.records[0].data.metricsError, "context_unavailable");
    assert.ok(!JSON.stringify(g.records[0].data).includes("secret"), "hata metni kayda girmez");
  });
  await check("kilit, tekrar ve hata: sabit teşhis kodu, kaynak metni yok", async () => {
    const f = fakeStore();
    assert.equal((await runCfoEngine("scheduled", deps({ store: f.store, lock: { async acquire() { return false; }, async release() {} } }))).status, "locked");
    await runCfoEngine("scheduled", deps({ store: f.store }));
    assert.equal((await runCfoEngine("scheduled", deps({ store: f.store }))).status, "duplicate");
    const g = fakeStore();
    const r = await runCfoEngine("scheduled", deps({ store: g.store, snapshot: async () => { throw new Error("postgres://user:pw@host"); } }));
    assert.deepEqual([r.status, r.error], ["failed", "engine_failed"]); assert.deepEqual(g.finished, [{ status: "failed", error: "engine_failed" }]);
    const h = fakeStore();
    const l = await runCfoEngine("scheduled", deps({ store: h.store, lock: { async acquire() { throw new LockError("lock_unavailable"); }, async release() {} } }));
    assert.equal(l.error, "lock_unavailable");
  });
  if (failed) { console.error(`\n${failed} test başarısız`); process.exit(1); }
  console.log("\nCFO engine runner: flag, period keys, templated findings for every anomaly, materiality flag, snapshot dedupe, metrics/alarms, lock/duplicate/failure: tüm testler geçti");
}
main();

import "server-only";
import { prisma } from "@/lib/prisma";
import type { GoalRow } from "@/lib/fm/goals";
import { getCfoConfig, type CfoConfig } from "./config";
import { buildCfoAgentSnapshot } from "./snapshot";
import { detectCfoAnomalies, silencedRules } from "./anomalies";
import { loadCfoContext } from "./context";
import { evidence, hashSnapshot } from "./evidence";
import { renderFindings } from "./findings";
import { goalAnomalies } from "./goal-anomalies";
import { loadCfoAlarms, type CfoAlarm } from "./health";
import { createMonitorLock, LockError, type MonitorLock } from "./lock";
import { decisionInputHash, sinceYesterday } from "./materiality";
import { istanbulPeriod } from "./period";
import { existingQueueRecords } from "./queues";
import { cfoStore, type CfoStore, type EngineRecord, type EngineTrigger, type MetricRow } from "./store";
import { CALCULATION_VERSION, type Anomaly, type CfoAgentSnapshot } from "./types";

// DETERMİNİSTİK CFO MOTORU (2026-10-08 mimari kararı: sitede LLM YOK). Saatte bir + senkron sonrası:
//   ölç (snapshot) → tespit et (anomaliler + Goal Engine) → açık işleri eşle → ŞABLONLA bulgu yaz (findings.ts) →
//   önemli değişiklik BAYRAĞI (dünden beri / önceki koşudan beri) → METRIK satırları (CFO bağlamı Blok B) → alarm.
// Tek kayıt: cfo_run (type='engine'); cfo_gun_ozeti görünümü son tamamlanmış koşuyu satırlara açar. Yargı, karar, defter ve
// yeni görev Cowork CFO'nundur (08:00 + 16:49 TR). Motor hiçbir ödeme, sipariş, fiyat ya da kredi işlemi yapmaz.

export const ENGINE_VERSION = "e1";
export type RunnerDependencies = {
  now?: Date; config?: CfoConfig; lock?: MonitorLock; store?: CfoStore;
  snapshot?: () => Promise<CfoAgentSnapshot>; goals?: () => Promise<GoalRow[]>;
  queues?: (anomalies: Anomaly[]) => Promise<Map<string, string[]>>;
  /** METRIK satırları (CFO bağlamı Blok B); null = yok (testler). */
  metrics?: ((snapshot: CfoAgentSnapshot, config: CfoConfig) => Promise<MetricRow[]>) | null;
  alarms?: ((now: Date) => Promise<CfoAlarm[]>) | null;
};
export type RunnerOutcome = { status: string; runId?: string | null; findings?: number; material?: boolean; error?: string };

/** İdempotency dilimi: zamanlanmış ve her senkron tetiği saat başına bir kez; elle 20 dakikalık dilimde bir kez. */
export function runPeriodKey(trigger: EngineTrigger, period: { hour: string; minutes: number }): string {
  return trigger === "manual" ? `${period.hour}:m${Math.floor((period.minutes % 60) / 20)}` : `${period.hour}:${trigger}`;
}

async function readGoals(): Promise<GoalRow[]> {
  try {
    return await prisma.$queryRaw<GoalRow[]>`SELECT goal_key, goal_version, kind, title, target_value, target_currency, deadline, as_of, evaluated_at,
      period_start, period_end, state, observed_value_try, observed_on, target_value_try, fx_usd_try, fx_month, progress_pct, gap_try,
      current_rate_try_per_day, required_rate_try_per_day, projected_value_try, projected_on, grade, flags FROM public.fm_memory_goal`;
  } catch { return []; }
}

async function contextMetrics(snapshot: CfoAgentSnapshot, config: CfoConfig): Promise<MetricRow[]> {
  const ctx = await loadCfoContext(snapshot, config);
  return ctx.state.map(e => ({ source: e.source, key: e.query, value: e.value, unit: e.unit, measured: e.measured, asOf: e.asOf }));
}

export async function runCfoEngine(trigger: EngineTrigger, deps: RunnerDependencies = {}): Promise<RunnerOutcome> {
  const now = deps.now ?? new Date(), config = deps.config ?? getCfoConfig(), period = istanbulPeriod(now);
  if (!config.monitorEnabled) return { status: "disabled" };
  const lock = deps.lock ?? createMonitorLock(), store = deps.store ?? cfoStore;
  let id: string | null = null;
  try {
    if (!await lock.acquire()) return { status: "locked" };
    if (store.sweepStuck) await store.sweepStuck(now).catch(() => 0); // ölü koşular sonsuza dek 'running' kalmasın (CFO-009)
    id = await store.begin(runPeriodKey(trigger, period), now);
    if (!id) return { status: "duplicate" };
    const snapshot = await (deps.snapshot ?? (() => buildCfoAgentSnapshot({ now, config })))();
    const goals = goalAnomalies(await (deps.goals ?? readGoals)(), now);
    snapshot.evidence.push(...goals.evidence);
    const anomalies = [...detectCfoAnomalies(snapshot, config), ...goals.anomalies];
    const queues = await (deps.queues ?? existingQueueRecords)(anomalies);
    for (const a of anomalies) {
      const ids = queues.get(a.id) ?? a.existingRecordIds;
      a.existingRecordIds = ids;
      if (ids.length) { const e = evidence("existing_queue", a.cooldownKey, ids.join(","), "record_ids", snapshot.generatedAt, true); snapshot.evidence.push(e); a.evidenceIds.push(e.id); }
    }
    const hash = decisionInputHash({ anomalies, versions: { calc: CALCULATION_VERSION, engine: ENGINE_VERSION } });
    const prev = await store.previous(now, period.dayStart);
    const yEval = prev.yesterday?.evaluations;
    const findings = renderFindings(anomalies, snapshot.evidence, { cashFloorTry: config.cashFloorTry, coverDays: config.stockoutDays, minCostCoveragePct: config.minCostCoveragePct })
      .map(f => { const a = anomalies.find(x => x.fingerprint === f.fingerprint)!; return { ...f, sinceYesterday: yEval ? sinceYesterday(a, yEval.get(a.cooldownKey), config.materialMinTry) : "yeni" as const }; });
    const present = new Set(anomalies.map(a => a.cooldownKey));
    const closedSinceYesterday = yEval ? [...yEval.keys()].filter(k => !present.has(k)).slice(0, 50) : [];
    let metrics: MetricRow[] = [], metricsError: string | undefined;
    if (deps.metrics !== null) {
      try { metrics = await (deps.metrics ?? contextMetrics)(snapshot, config); }
      catch { metricsError = "context_unavailable"; } // METRIK satırları bulguları engellemez
    }
    let alarms: CfoAlarm[] = [];
    if (deps.alarms !== null) {
      // Motor koşarken "motor bayat" anlamsızdır (kendisi koşuyor); o alarmı yalnız sağlık işi verir.
      try { alarms = (await (deps.alarms ?? loadCfoAlarms)(now)).filter(a => a.code !== "engine_stale"); } catch { alarms = []; }
    }
    const changedSinceRun = prev.last?.hash !== hash;
    const record: EngineRecord = {
      engineVersion: ENGINE_VERSION, trigger, decisionInputHash: hash,
      material: { sincePreviousRun: changedSinceRun, sinceYesterday: prev.yesterday?.hash !== hash, previousRunHash: prev.last?.hash ?? null, yesterdayHash: prev.yesterday?.hash ?? null },
      anomalies, findings, closedSinceYesterday, metrics, ...(metricsError ? { metricsError } : {}), alarms, silenced: silencedRules(snapshot, config),
      snapshotRef: changedSinceRun ? null : prev.last?.snapshotRunId ?? null,
    };
    // Snapshot (~164 kB) yalnız karar girdisi değiştiğinde (ya da önceki koşunun snapshot'ı yoksa) yazılır.
    const keep = changedSinceRun || !record.snapshotRef;
    await store.record(id, keep ? snapshot : null, hashSnapshot(snapshot), { ...record, snapshotRef: keep ? null : record.snapshotRef });
    await store.finish(id, "completed", new Date());
    return { status: "completed", runId: id, findings: findings.length, material: record.material.sinceYesterday };
  } catch (error) {
    // Bağlantı adresi, kimlik bilgisi veya kaynak satırı asla kaydedilmez: yalnız sabit teşhis kodu.
    const code = error instanceof LockError ? error.code : "engine_failed";
    try {
      // Kilit yapılandırma hatası satır açılmadan olur; eskiden iz bırakmıyordu (sağlık "ardışık hata"yı göremiyordu, CFO-009).
      if (!id && error instanceof LockError) id = await store.begin(`${runPeriodKey(trigger, period)}:${code}`, now);
      if (id) await store.finish(id, "failed", new Date(), code);
    } catch { /* kayıt hatası asıl sonucu değiştirmez */ }
    return { status: "failed", runId: id, error: code };
  } finally { await lock.release(); }
}

import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CfoAlarm } from "./health";
import type { Finding } from "./findings";
import type { Evaluation, SinceYesterday } from "./materiality";
import type { Anomaly, CfoAgentSnapshot, Severity } from "./types";
import { CALCULATION_VERSION, SCHEMA_VERSION } from "./types";

// Deterministik motor kayıt deposu (2026-10-08: sitede LLM yok). Her koşu cfo_run'a TEK satır yazar (idempotencyKey 'engine:…';
// type sütununun CHECK'i yalnız monitor/morning kabul ettiği için type='monitor' kalır — şema değişikliği gerekmez):
// bulgular, METRIK satırları, alarmlar, susan kurallar ve önemli değişiklik bayrağı triggerReasons JSON'unda durur —
// cfo_gun_ozeti görünümü buradan okur. cfo_insight / cfo_usage artık yazılmaz (geçmiş kayıt olarak kalır).
// Snapshot (~164 kB) yalnız karar girdisi hash'i değiştiğinde yazılır; değişmediyse snapshotRef önceki koşuyu gösterir.

export const ENGINE_KEY_PREFIX = "engine:";
/** Motor koşularını eski (LLM dönemi) monitor koşularından ayıran filtre. */
export const ENGINE_RUNS = { idempotencyKey: { startsWith: ENGINE_KEY_PREFIX } };
export type EngineTrigger = "scheduled" | "sync_xml" | "sync_trendyol" | "manual";
export type MetricRow = { source: string; key: string; value: string | number | null; unit: string; measured: boolean; asOf: string };
export type EngineFinding = Finding & { sinceYesterday: SinceYesterday };
export type EngineRecord = {
  engineVersion: string; trigger: EngineTrigger; decisionInputHash: string;
  material: { sincePreviousRun: boolean; sinceYesterday: boolean; previousRunHash: string | null; yesterdayHash: string | null };
  anomalies: Anomaly[]; findings: EngineFinding[]; closedSinceYesterday: string[];
  metrics: MetricRow[]; metricsError?: string; alarms: CfoAlarm[]; silenced: string[]; snapshotRef: string | null;
};
export type PreviousRuns = {
  last: { id: string; hash: string | null; snapshotRunId: string | null } | null;
  yesterday: { hash: string | null; evaluations: Map<string, Evaluation> } | null;
};

const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
type Stored = Partial<EngineRecord> | null;

export interface CfoStore {
  begin(period: string, now: Date): Promise<string | null>;
  previous(now: Date, dayStart: Date): Promise<PreviousRuns>;
  record(id: string, snapshot: CfoAgentSnapshot | null, snapshotHash: string, data: EngineRecord): Promise<void>;
  finish(id: string, status: string, now: Date, error?: string): Promise<void>;
}

export const cfoStore: CfoStore = {
  async begin(period, now) {
    try {
      const run = await prisma.cfoRun.create({ data: { type: "monitor", status: "running", periodKey: period, idempotencyKey: `${ENGINE_KEY_PREFIX}${period}`,
        generatedAt: now, startedAt: now, triggerReasons: [], schemaVersion: SCHEMA_VERSION, calculationVersion: CALCULATION_VERSION } });
      return run.id;
    } catch (e) { if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null; throw e; }
  },
  async previous(now, dayStart) {
    const where = { ...ENGINE_RUNS, status: "completed" };
    const [last, yesterday] = await Promise.all([
      prisma.cfoRun.findFirst({ where: { ...where, generatedAt: { lt: now } }, orderBy: { generatedAt: "desc" }, select: { id: true, triggerReasons: true, snapshot: true } }),
      prisma.cfoRun.findFirst({ where: { ...where, generatedAt: { lt: dayStart } }, orderBy: { generatedAt: "desc" }, select: { triggerReasons: true } }),
    ]);
    const lt = last?.triggerReasons as Stored, yt = yesterday?.triggerReasons as Stored;
    const evaluations = new Map<string, Evaluation>();
    for (const a of yt?.anomalies ?? []) if (!evaluations.has(a.cooldownKey)) evaluations.set(a.cooldownKey, { severity: a.severity as Severity, impact: a.impact?.value ?? null });
    return {
      last: last ? { id: last.id, hash: lt?.decisionInputHash ?? null, snapshotRunId: last.snapshot != null ? last.id : lt?.snapshotRef ?? null } : null,
      yesterday: yesterday ? { hash: yt?.decisionInputHash ?? null, evaluations } : null,
    };
  },
  async record(id, snapshot, snapshotHash, data) {
    await prisma.cfoRun.update({ where: { id }, data: { snapshot: snapshot ? json(snapshot) : Prisma.DbNull, snapshotHash, triggerReasons: json(data) } });
  },
  async finish(id, status, now, error) {
    await prisma.cfoRun.update({ where: { id }, data: { status, finishedAt: now, avoidedCalls: 0, avoidedCostTry: null, error: error ?? null } });
  },
};

import "server-only";
import { prisma } from "@/lib/prisma";
import { istanbulPeriod } from "./budget";
import { D } from "./calculations";
import { costEfficiency } from "./cost-efficiency";
import type { Anomaly, CfoAgentSnapshot } from "./types";

// /admin/ai-cfo veri yükleyicisi (salt-okunur). cfo_run/cfo_insight/cfo_usage tabloları üretime adım 8'de gelir;
// o zamana kadar { installed:false } döner ve sayfa sorgu hatası yerine durumu açıklar.
export async function aiCfoTablesInstalled(): Promise<boolean> {
  const [row] = await prisma.$queryRaw<{ ok: boolean }[]>`SELECT to_regclass('public.cfo_run') IS NOT NULL
    AND to_regclass('public.cfo_insight') IS NOT NULL AND to_regclass('public.cfo_usage') IS NOT NULL AS ok`;
  return !!row?.ok;
}

export async function loadCfoControlCenter(now = new Date()) {
  if (!await aiCfoTablesInstalled()) return { installed: false as const };
  const periods = istanbulPeriod(now);
  const since30 = new Date(now.getTime() - 30 * 86400000);
  const [run, lastSnapshot, insights, usage, avoided, runs30, usage30, insights30] = await Promise.all([
    prisma.cfoRun.findFirst({ orderBy: { generatedAt: "desc" }, select: { generatedAt: true, status: true, type: true, error: true } }),
    prisma.cfoRun.findFirst({ where: { snapshotHash: { not: null } }, orderBy: { generatedAt: "desc" }, select: { snapshot: true, triggerReasons: true, generatedAt: true } }),
    prisma.cfoInsight.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.cfoUsage.findMany({ where: { createdAt: { gte: periods.monthStart } }, select: { status: true, createdAt: true, inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheWriteTokens: true, estimatedCost: true, reservedCostTry: true } }),
    prisma.cfoRun.aggregate({ where: { generatedAt: { gte: periods.monthStart } }, _sum: { avoidedCalls: true, avoidedCostTry: true } }),
    prisma.cfoRun.findMany({ where: { generatedAt: { gte: since30 } }, select: { status: true, generatedAt: true } }),
    prisma.cfoUsage.findMany({ where: { createdAt: { gte: since30 } }, select: { status: true, createdAt: true, inputTokens: true, outputTokens: true, cacheReadTokens: true, cacheWriteTokens: true, estimatedCost: true, reservedCostTry: true } }),
    prisma.cfoInsight.findMany({ where: { createdAt: { gte: since30 } }, select: { createdAt: true } }),
  ]);
  const u30 = usage30.map(u => ({ ...u, estimatedCost: u.estimatedCost == null ? null : Number(u.estimatedCost), reservedCostTry: u.reservedCostTry == null ? null : Number(u.reservedCostTry) }));
  const efficiency = { today: costEfficiency(runs30, u30, insights30, periods.dayStart), last30: costEfficiency(runs30, u30, insights30, since30) };
  const snapshot = lastSnapshot?.snapshot as unknown as CfoAgentSnapshot | null;
  const anomalies = ((lastSnapshot?.triggerReasons as { anomalies?: Anomaly[] } | undefined)?.anomalies ?? []);
  const calls = usage.filter(u => ["reserved", "completed", "failed"].includes(u.status));
  return { installed: true as const, run, snapshot, anomalies, insights, efficiency, usage: {
    callsToday: calls.filter(u => u.createdAt >= periods.dayStart).length, callsMonth: calls.length,
    inputTokens: calls.reduce((s, r) => s + r.inputTokens + r.cacheReadTokens + r.cacheWriteTokens, 0), outputTokens: calls.reduce((s, r) => s + r.outputTokens, 0),
    cost: calls.reduce((s, r) => s.add(Number(r.estimatedCost ?? r.reservedCostTry ?? 0)), D(0)).toNumber(), uncertainCosts: calls.filter(r => r.estimatedCost == null).length,
    avoidedCalls: avoided._sum.avoidedCalls ?? 0, avoidedCost: avoided._sum.avoidedCostTry == null ? null : Number(avoided._sum.avoidedCostTry) } };
}

import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { EngineRecord } from "./store";
import type { CfoAgentSnapshot } from "./types";

// /admin/ai-cfo veri yükleyicisi (salt-okunur): son deterministik motor koşusu (bulgular, alarmlar, susan kurallar, önemli
// değişiklik bayrağı) ve son yazılmış snapshot. cfo_run tablosu yoksa { installed:false } döner.
export async function aiCfoTablesInstalled(): Promise<boolean> {
  const [row] = await prisma.$queryRaw<{ ok: boolean }[]>`SELECT to_regclass('public.cfo_run') IS NOT NULL AS ok`;
  return !!row?.ok;
}

export async function loadCfoControlCenter() {
  if (!await aiCfoTablesInstalled()) return { installed: false as const };
  const [run, lastCompleted, lastSnapshot] = await Promise.all([
    prisma.cfoRun.findFirst({ where: { idempotencyKey: { startsWith: "engine:" } }, orderBy: { generatedAt: "desc" }, select: { generatedAt: true, status: true, error: true } }),
    prisma.cfoRun.findFirst({ where: { idempotencyKey: { startsWith: "engine:" }, status: "completed" }, orderBy: { generatedAt: "desc" }, select: { generatedAt: true, finishedAt: true, triggerReasons: true } }),
    prisma.cfoRun.findFirst({ where: { idempotencyKey: { startsWith: "engine:" }, snapshot: { not: Prisma.DbNull } }, orderBy: { generatedAt: "desc" }, select: { snapshot: true } }),
  ]);
  const record = (lastCompleted?.triggerReasons ?? null) as Partial<EngineRecord> | null;
  return { installed: true as const, run, completedAt: lastCompleted?.finishedAt ?? lastCompleted?.generatedAt ?? null, record,
    snapshot: (lastSnapshot?.snapshot ?? null) as unknown as CfoAgentSnapshot | null };
}

import { prisma } from "@/lib/prisma";
import { getCfoConfig } from "./config";

// AI CFO sağlık alarmı (2026-10-07): monitörün kendisi izlenmezse sessizlik "her şey yolunda" ile "monitör ölü"
// arasında ayırt edilemez. Saatlik GitHub Actions işi /api/cron/ai-cfo-health'i çağırır; alarm varsa 503 → iş kırmızı →
// GitHub depo sahibine e-posta gönderir. Aynı alarmlar /admin/ai-cfo'da gösterilir. Yalnız okur, hiçbir şey yazmaz.

export type CfoAlarm = { code: "consecutive_failures" | "no_insight_24h"; message: string };
export type HealthRun = { status: string; generatedAt: Date; error: string | null; insights: number; sentActionable: number };

/** Koşu sonucu "başarısız": hata ya da hiç içgörü geçmeyen model çıktısı. */
const FAILED = new Set(["failed", "invalid_output"]);
/** Model çağrısına hiç ulaşmayan, sağlık açısından nötr durumlar. */
const NEUTRAL = new Set(["running"]);

export function evaluateCfoAlarms(runs: HealthRun[], lastInsightAt: Date | null, aiActive: boolean, now: Date): CfoAlarm[] {
  const alarms: CfoAlarm[] = [];
  const recent = runs.filter(r => !NEUTRAL.has(r.status)).sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());
  const [last, prev] = recent;
  if (last && prev && FAILED.has(last.status) && FAILED.has(prev.status)) {
    alarms.push({ code: "consecutive_failures", message: `Son iki koşu başarısız: ${[last, prev].map(r => `${r.status}${r.error ? ` (${r.error})` : ""}`).join(" · ")}` });
  }
  const dayAgo = now.getTime() - 24 * 3600000;
  const triedToday = recent.some(r => r.generatedAt.getTime() >= dayAgo && r.sentActionable > 0);
  if (aiActive && triedToday && (!lastInsightAt || lastInsightAt.getTime() < dayAgo)) {
    alarms.push({ code: "no_insight_24h", message: `24 saattir içgörü yok; son içgörü: ${lastInsightAt ? lastInsightAt.toISOString() : "hiç"}` });
  }
  return alarms;
}

export async function loadCfoAlarms(now = new Date(), env: Record<string, string | undefined> = process.env): Promise<CfoAlarm[]> {
  const config = getCfoConfig(env);
  const since = new Date(now.getTime() - 48 * 3600000);
  const rows = await prisma.cfoRun.findMany({ where: { generatedAt: { gte: since } }, orderBy: { generatedAt: "desc" }, take: 50,
    select: { status: true, generatedAt: true, error: true, triggerReasons: true, _count: { select: { insights: true } } } });
  const last = await prisma.cfoInsight.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  const runs: HealthRun[] = rows.map(r => ({ status: r.status, generatedAt: r.generatedAt, error: r.error, insights: r._count.insights,
    sentActionable: ((r.triggerReasons as { sentAnomalies?: { actionable?: boolean }[] } | null)?.sentAnomalies ?? []).filter(a => a.actionable).length }));
  return evaluateCfoAlarms(runs, last?.createdAt ?? null, config.monitorEnabled && config.enabled && config.releaseApproved, now);
}

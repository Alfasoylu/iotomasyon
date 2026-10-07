// /admin/ai-cfo COST EFFICIENCY (2026-10-07 maliyet/görev ayrımı). Saf: cfo_run / cfo_usage / cfo_insight satırlarından
// "bugün" ve "son 30 gün" özetleri. Monitor koşusu ≠ AI çağrısı: çağrı yapılmayan koşular nedenine göre sayılır.

export type EffRun = { status: string; generatedAt: Date };
export type EffUsage = { status: string; createdAt: Date; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number;
  estimatedCost: number | null; reservedCostTry: number | null };
export type EffInsight = { createdAt: Date };

const BUDGET = new Set(["blocked_by_budget", "blocked_by_daily_limit", "blocked_by_scheduled_limit", "blocked_by_run_cost", "blocked_by_daily_budget", "billing_unconfigured"]);
export const AVOIDED_REASONS = { same_input: ["same_input"], no_material_change: ["no_material_change"], cooldown: ["cooldown"], open_task: ["open_task"],
  data_quality: ["data_quality_only"], no_actionable: ["no_actionable_anomaly"] } as const;
/** Sağlayıcıya ulaşan (ya da ulaşmak üzere rezerve edilmiş) çağrı; blok kayıtları çağrı değildir. */
const CALL = new Set(["reserved", "completed", "failed"]);

export type CostEfficiency = {
  monitorRuns: number; aiCalls: number; callsAvoided: number; inputTokens: number; outputTokens: number; cacheReadTokens: number;
  costTry: number; acceptedInsights: number; costPerAcceptedInsight: number | null;
  avoided: Record<keyof typeof AVOIDED_REASONS | "budget", number>;
};

export function costEfficiency(runs: EffRun[], usage: EffUsage[], insights: EffInsight[], since: Date): CostEfficiency {
  const r = runs.filter(x => x.generatedAt >= since && x.status !== "running");
  const calls = usage.filter(u => u.createdAt >= since && CALL.has(u.status));
  const count = (statuses: readonly string[]) => r.filter(x => statuses.includes(x.status)).length;
  const avoided = { ...Object.fromEntries(Object.entries(AVOIDED_REASONS).map(([k, v]) => [k, count(v)])), budget: r.filter(x => BUDGET.has(x.status)).length } as CostEfficiency["avoided"];
  const costTry = Math.round(calls.reduce((s, u) => s + Number(u.estimatedCost ?? u.reservedCostTry ?? 0), 0) * 100) / 100;
  const accepted = insights.filter(i => i.createdAt >= since).length;
  return { monitorRuns: r.length, aiCalls: calls.length, callsAvoided: Object.values(avoided).reduce((s, n) => s + n, 0),
    inputTokens: calls.reduce((s, u) => s + u.inputTokens, 0), outputTokens: calls.reduce((s, u) => s + u.outputTokens, 0),
    cacheReadTokens: calls.reduce((s, u) => s + u.cacheReadTokens, 0), costTry, acceptedInsights: accepted,
    costPerAcceptedInsight: accepted ? Math.round((costTry / accepted) * 100) / 100 : null, avoided };
}

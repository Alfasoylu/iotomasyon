import { z } from "zod";

const schema = z.object({
  releaseApproved: z.boolean().default(false), enabled: z.boolean().default(false), monitorEnabled: z.boolean().default(false),
  provider: z.enum(["anthropic", "disabled"]).default("disabled"),
  model: z.string().min(1).default("claude-sonnet-4-6"),
  maxCallsPerDay: z.coerce.number().int().min(0).max(24).default(6),
  // Girdi şartnamesi (2026-10-07): Blok A el kitabı v33 birebir ≈ 8.300 token (önbellekli) + talimat/tablolar ≈ 1.200
  // + anomali/kanıt + Blok B/C. 07.10 üretimde 20.000 sınırı aşıldı (Türkçe metin + kanıt id'leri tahminden pahalı) →
  // varsayılan 32.000, üst sınır 50.000. Gerçek sayı her blokta cfo_run.error'a yazılır (input_tokens:N limit:M).
  maxInputTokens: z.coerce.number().int().min(500).max(50000).default(32000),
  // 3 Turkish insights in JSON need ~1200–1500 tokens; 800 truncated the first production answer (stop_reason max_tokens).
  maxOutputTokens: z.coerce.number().int().min(100).max(2000).default(1500),
  monthlyBudgetTry: z.coerce.number().min(0).default(3000),
  inputPriceUsdPerMillion: z.coerce.number().min(0).optional(),
  outputPriceUsdPerMillion: z.coerce.number().min(0).optional(),
  usdTryRate: z.coerce.number().positive().optional(),
  timeoutMs: z.coerce.number().int().min(1000).max(60000).default(30000),
  revenueDeviationPct: z.coerce.number().positive().default(20),
  minRevenueDifferenceTry: z.coerce.number().min(0).default(10000),
  marginDropPoints: z.coerce.number().positive().default(5),
  minCostCoveragePct: z.coerce.number().min(0).max(100).default(95),
  stockoutDays: z.coerce.number().positive().default(21),
  // Aylık para maliyeti (DEAD_STOCK TL etkisi): el kitabı §7 para maliyeti merdiveninin en ucuz basamağı (Ziraat Kredi 2 %2,83).
  moneyCostMonthlyPct: z.coerce.number().positive().max(20).default(2.83),
  returnMinSample: z.coerce.number().int().positive().default(30),
  returnIncreasePoints: z.coerce.number().positive().default(5),
  cooldownHours: z.coerce.number().min(72).default(72),
  cashFloorTry: z.coerce.number().max(0).default(-3000000),
  // Live view definitions are not in this repository. These declarations MUST
  // be confirmed by the CFO; unknown semantics never become a financial zero.
  canonicalValidated: z.boolean().default(false),
  grossIncludesRefunds: z.boolean().optional(),
});
export type CfoConfig = z.infer<typeof schema>;
export function getCfoConfig(env: Record<string, string | undefined> = process.env): CfoConfig {
  return schema.parse({
    releaseApproved: env.AI_CFO_CI_BUILD_VERIFIED === "true" && env.AI_CFO_LIVE_ACCEPTANCE_VERIFIED === "true" && env.AI_CFO_SHADOW_WEEK_APPROVED === "true",
    enabled: env.AI_CFO_ENABLED === "true", monitorEnabled: env.AI_CFO_MONITOR_ENABLED === "true",
    provider: env.AI_CFO_PROVIDER, model: env.AI_CFO_MODEL,
    maxCallsPerDay: env.AI_CFO_MAX_CALLS_PER_DAY, maxInputTokens: env.AI_CFO_MAX_INPUT_TOKENS_PER_RUN,
    maxOutputTokens: env.AI_CFO_MAX_OUTPUT_TOKENS, monthlyBudgetTry: env.AI_CFO_MONTHLY_BUDGET_TRY,
    inputPriceUsdPerMillion: env.AI_CFO_INPUT_PRICE_USD_PER_MILLION,
    outputPriceUsdPerMillion: env.AI_CFO_OUTPUT_PRICE_USD_PER_MILLION,
    usdTryRate: env.AI_CFO_BILLING_USD_TRY, timeoutMs: env.AI_CFO_TIMEOUT_MS,
    revenueDeviationPct: env.AI_CFO_REVENUE_DEVIATION_PCT,
    minRevenueDifferenceTry: env.AI_CFO_MIN_REVENUE_DIFFERENCE_TRY,
    marginDropPoints: env.AI_CFO_MARGIN_DROP_POINTS, minCostCoveragePct: env.AI_CFO_MIN_COST_COVERAGE_PCT,
    stockoutDays: env.AI_CFO_STOCKOUT_DAYS, moneyCostMonthlyPct: env.AI_CFO_MONEY_COST_MONTHLY_PCT, returnMinSample: env.AI_CFO_RETURN_MIN_SAMPLE,
    returnIncreasePoints: env.AI_CFO_RETURN_INCREASE_POINTS, cooldownHours: env.AI_CFO_COOLDOWN_HOURS,
    cashFloorTry: env.AI_CFO_CASH_FLOOR_TRY,
    canonicalValidated: env.AI_CFO_CANONICAL_SALES_VALIDATED === "true",
    grossIncludesRefunds: env.AI_CFO_GROSS_INCLUDES_REFUNDS === undefined ? undefined : env.AI_CFO_GROSS_INCLUDES_REFUNDS === "true",
  });
}
export function billingConfigured(c: CfoConfig): boolean {
  return c.inputPriceUsdPerMillion !== undefined && c.outputPriceUsdPerMillion !== undefined && c.usdTryRate !== undefined;
}

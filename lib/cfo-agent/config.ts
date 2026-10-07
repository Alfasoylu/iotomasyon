import { z } from "zod";

// Maliyet ve görev ayrımı (2026-10-07): AI CFO iki modda çalışır.
//  • SCHEDULED_CFO (cron + "Monitor'ü çalıştır"): küçük karar paketi, rule card'lar, SERT girdi 8.000 / çıktı 700 token.
//    Env bu tavanları yalnız DÜŞÜREBİLİR (getCfoConfig kırpar); runner girdi büyürse bağlamı küçültür, sınırı asla yükseltmez.
//  • MANUAL_DEEP_REVIEW (yalnız elle): el kitabının tamamı + Blok B/C; maxInputTokens/maxOutputTokens bu modundur, ayrı bütçe.
export const SCHEDULED_INPUT_HARD_LIMIT = 8000;
export const SCHEDULED_OUTPUT_HARD_LIMIT = 700;

const schema = z.object({
  releaseApproved: z.boolean().default(false), enabled: z.boolean().default(false), monitorEnabled: z.boolean().default(false),
  provider: z.enum(["anthropic", "disabled"]).default("disabled"),
  model: z.string().min(1).default("claude-sonnet-4-6"),
  /** Planlı + elle monitor çağrıları (derin inceleme hariç), İstanbul günü. */
  maxCallsPerDay: z.coerce.number().int().min(0).max(6).default(2),
  /** Yalnız zamanlanmış (cron) koşuların sağlayıcı çağrısı / gün. */
  maxScheduledCallsPerDay: z.coerce.number().int().min(0).max(2).default(1),
  scheduledMaxInputTokens: z.coerce.number().int().min(1000).max(SCHEDULED_INPUT_HARD_LIMIT).default(SCHEDULED_INPUT_HARD_LIMIT),
  scheduledMaxOutputTokens: z.coerce.number().int().min(200).max(SCHEDULED_OUTPUT_HARD_LIMIT).default(SCHEDULED_OUTPUT_HARD_LIMIT),
  /** Koşu başı / gün TL tavanı (planlı + elle monitor). Aylık bütçe tek koruma değildir. */
  maxCostTryPerRun: z.coerce.number().min(0).default(2),
  maxCostTryPerDay: z.coerce.number().min(0).default(5),
  /** Önemli değişiklik kapısı: TL etkisi en az bir ~%25 kova VE en az bu kadar artmalı; değerlendirme geriye bakışı (gün). */
  materialMinTry: z.coerce.number().min(0).default(10000),
  materialLookbackDays: z.coerce.number().int().min(1).max(60).default(14),
  /** MANUAL_DEEP_REVIEW: ayrı günlük çağrı, koşu başı ve aylık bütçe. */
  deepMaxCallsPerDay: z.coerce.number().int().min(0).max(4).default(2),
  deepMaxCostTryPerRun: z.coerce.number().min(0).default(8),
  deepMonthlyBudgetTry: z.coerce.number().min(0).default(100),
  // YALNIZ MANUAL_DEEP_REVIEW: Blok A el kitabı v33 birebir (~9.500 token) + Blok B/C (~25.000 toplam). Varsayılan 32.000,
  // üst sınır 50.000. Planlı mod bu ayarı KULLANMAZ (scheduledMaxInputTokens, sert 8.000). Blokta sayı cfo_run.error'a yazılır.
  maxInputTokens: z.coerce.number().int().min(500).max(50000).default(32000),
  // YALNIZ MANUAL_DEEP_REVIEW: 3 Turkish insights in JSON need ~1200–1500 tokens (800 truncated the first production answer).
  maxOutputTokens: z.coerce.number().int().min(100).max(2000).default(1500),
  /** Tüm modlar dahil aylık tavan. */
  monthlyBudgetTry: z.coerce.number().min(0).default(300),
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
/** Planlı tavanlar env ile yükseltilemez: büyük değer hata değil, tavana kırpılır (ayar okuması düşmez). */
const capped = (v: string | undefined, max: number) => (v === undefined || v.trim() === "" || !Number.isFinite(Number(v)) ? v : String(Math.min(Number(v), max)));
export function getCfoConfig(env: Record<string, string | undefined> = process.env): CfoConfig {
  return schema.parse({
    maxScheduledCallsPerDay: env.AI_CFO_MAX_SCHEDULED_CALLS_PER_DAY,
    scheduledMaxInputTokens: capped(env.AI_CFO_SCHEDULED_MAX_INPUT_TOKENS, SCHEDULED_INPUT_HARD_LIMIT),
    scheduledMaxOutputTokens: capped(env.AI_CFO_SCHEDULED_MAX_OUTPUT_TOKENS, SCHEDULED_OUTPUT_HARD_LIMIT),
    maxCostTryPerRun: env.AI_CFO_MAX_COST_TRY_PER_RUN, maxCostTryPerDay: env.AI_CFO_MAX_COST_TRY_PER_DAY,
    materialMinTry: env.AI_CFO_MATERIAL_MIN_TRY, materialLookbackDays: env.AI_CFO_MATERIAL_LOOKBACK_DAYS,
    deepMaxCallsPerDay: env.AI_CFO_DEEP_MAX_CALLS_PER_DAY, deepMaxCostTryPerRun: env.AI_CFO_DEEP_MAX_COST_TRY_PER_RUN,
    deepMonthlyBudgetTry: env.AI_CFO_DEEP_MONTHLY_BUDGET_TRY,
    releaseApproved: env.AI_CFO_CI_BUILD_VERIFIED === "true" && env.AI_CFO_LIVE_ACCEPTANCE_VERIFIED === "true" && env.AI_CFO_SHADOW_WEEK_APPROVED === "true",
    enabled: env.AI_CFO_ENABLED === "true", monitorEnabled: env.AI_CFO_MONITOR_ENABLED === "true",
    provider: env.AI_CFO_PROVIDER, model: env.AI_CFO_MODEL,
    // Production env'deki eski/büyük değerler (ör. 50000, 6) ayar okumasını düşürmesin: tavana kırpılır.
    maxCallsPerDay: capped(env.AI_CFO_MAX_CALLS_PER_DAY, 6), maxInputTokens: capped(env.AI_CFO_MAX_INPUT_TOKENS_PER_RUN, 50000),
    maxOutputTokens: capped(env.AI_CFO_MAX_OUTPUT_TOKENS, 2000), monthlyBudgetTry: env.AI_CFO_MONTHLY_BUDGET_TRY,
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

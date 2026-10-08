import { z } from "zod";

// Deterministik CFO motoru ayarları (2026-10-08: sitede LLM yok — sağlayıcı, model, token ve bütçe ayarları kaldırıldı).
// AI_CFO_MONITOR_ENABLED motoru açar/kapatır; diğerleri kural eşikleridir.
const schema = z.object({
  monitorEnabled: z.boolean().default(false),
  /** Önemli değişiklik bayrağı: TL etkisi en az bir ~%25 kova VE en az bu kadar artmalı ("dünden beri değişti"). */
  materialMinTry: z.coerce.number().min(0).default(10000),
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
    materialMinTry: env.AI_CFO_MATERIAL_MIN_TRY,
    monitorEnabled: env.AI_CFO_MONITOR_ENABLED === "true",
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

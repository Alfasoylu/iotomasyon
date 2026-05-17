/**
 * Phase 11C — Import Decision Engine
 *
 * Replicates the Excel workbook (Top.ürünler sheet) business logic in TypeScript.
 *
 * Formula set (dimensionally correct — all USD):
 *   air_landed = (source_usd + AIR_FREIGHT_PER_KG × weight_kg) × (1 + customs_pct / 100)
 *   sea_landed = (source_usd + SEA_FREIGHT_PER_KG × weight_kg) × (1 + customs_pct / 100)
 *   net_revenue_usd = (selling_try × (1 - commission_pct/100) - domestic_shipping_try) / usd_try_rate
 *   profit_ratio    = net_revenue_usd / landed_cost_usd
 *   monthly_profit  = landed_cost × (ratio - 1) × monthly_units
 *   air_capital     = landed_cost × AIR_CAPITAL_MONTHS × monthly_units
 *   sea_capital     = landed_cost × SEA_CAPITAL_MONTHS × monthly_units
 *   air_annual_roi  = ratio ^ (365 / AIR_CYCLE_DAYS)
 *   sea_annual_roi  = ratio ^ (365 / SEA_CYCLE_DAYS)
 *   sea_wins        = sea_annual_roi / air_annual_roi >= SEA_WIN_THRESHOLD
 *   annual_profit   = monthly_profit × 12
 *   decision        = ALWAYS_STOCK if annual_profit/capital > 2,
 *                     BUY_SMALL if > 1.4,
 *                     DO_NOT_BUY otherwise
 */

// ── Constants ──────────────────────────────────────────────────────────────────

/** Air freight cost per kg in USD (source: workbook Top.ürünler) */
export const AIR_FREIGHT_PER_KG = 8;

/** Sea freight cost per kg in USD (source: workbook Envanter sheet) */
export const SEA_FREIGHT_PER_KG = 2;

/** Air inventory cycle in days — capital lock period for air shipments */
export const AIR_CYCLE_DAYS = 120;

/** Sea inventory cycle in days — capital lock period for sea shipments */
export const SEA_CYCLE_DAYS = 210;

/** Air capital multiplier (cycle_days / 30, rounded to nearest integer) */
export const AIR_CAPITAL_MONTHS = 4; // 120 days ≈ 4 months

/** Sea capital multiplier */
export const SEA_CAPITAL_MONTHS = 7; // 210 days = 7 months

/** Sea method is preferred when its annual ROI exceeds air by this ratio */
export const SEA_WIN_THRESHOLD = 1.1;

/** ALWAYS_STOCK threshold: annual_profit/capital > 2 */
export const ALWAYS_STOCK_THRESHOLD = 2.0;

/** BUY_SMALL threshold: annual_profit/capital > 1.4 */
export const BUY_SMALL_THRESHOLD = 1.4;

// ── Types ──────────────────────────────────────────────────────────────────────

export type ImportRecommendation =
  | "ALWAYS_STOCK"
  | "BUY_SMALL"
  | "DO_NOT_BUY"
  | "MISSING_DATA";

export const RECOMMENDATION_LABELS: Record<ImportRecommendation, string> = {
  ALWAYS_STOCK: "HEP STOKTA OLMALI",
  BUY_SMALL: "AZ AL",
  DO_NOT_BUY: "ALMA",
  MISSING_DATA: "VERİ EKSİK",
};

export const RECOMMENDATION_TONES: Record<ImportRecommendation, string> = {
  ALWAYS_STOCK: "success",
  BUY_SMALL: "warning",
  DO_NOT_BUY: "danger",
  MISSING_DATA: "default",
};

export interface ImportDecisionInput {
  /** USD source purchase price per unit (importUnitCostUsd or unitCostUsd) */
  sourcePriceUsd: number | null;
  /** Product weight in kilograms */
  weightKg: number | null;
  /** Turkish customs duty rate as a percentage (e.g. 20 = 20%) */
  customsRatePct: number | null;
  /** Owner shipping preference: 'AIR', 'SEA', or null (system decides) */
  shippingMethodPref: string | null;
  /** Marketplace selling price in TRY */
  sellingPriceTry: number | null;
  /** Marketplace commission percentage */
  commissionPct: number | null;
  /** Domestic shipping cost in TRY (kargo) */
  domesticShippingTry: number | null;
  /** USD/TRY exchange rate from MonthlyExchangeRate */
  usdTryRate: number;
  /** Total monthly demand in units (online + wholesale + installer) */
  monthlyUnits: number | null;
}

export interface ShippingScenario {
  method: "AIR" | "SEA";
  /** Landed cost per unit in USD including freight and customs */
  landedCostUsd: number;
  /** Net revenue per unit in USD after commission and domestic shipping */
  netRevenueUsd: number;
  /** Profit ratio = net_revenue / landed_cost (> 1 means profitable) */
  profitRatio: number;
  /** Monthly profit in USD */
  monthlyProfitUsd: number;
  /** Required working capital in USD to sustain one inventory cycle */
  requiredCapitalUsd: number;
  /** Annual ROI multiplier (ratio ^ (365 / cycle_days)) */
  annualRoiMultiplier: number;
  /** Inventory cycle in days */
  inventoryDays: number;
  /** Annual profit in USD = monthly_profit × 12 */
  annualProfitUsd: number;
}

export interface ImportDecisionResult {
  /** False if any required input is missing */
  hasData: boolean;
  /** Missing field names when hasData is false */
  missingFields: string[];
  air: ShippingScenario | null;
  sea: ShippingScenario | null;
  /** Which method is better based on annual ROI comparison */
  recommendedMethod: "AIR" | "SEA" | null;
  /** Effective method: owner preference if set, otherwise recommendedMethod */
  effectiveMethod: "AIR" | "SEA" | null;
  effectiveScenario: ShippingScenario | null;
  decision: ImportRecommendation;
  /** Decision score for ranking: (annual/capital) × (30/roi_days) */
  score: number;
}

// ── Engine ─────────────────────────────────────────────────────────────────────

function calcScenario(
  method: "AIR" | "SEA",
  sourcePriceUsd: number,
  weightKg: number,
  customsRatePct: number,
  netRevenueUsd: number,
  monthlyUnits: number,
): ShippingScenario {
  const freightPerKg = method === "AIR" ? AIR_FREIGHT_PER_KG : SEA_FREIGHT_PER_KG;
  const cycleDays = method === "AIR" ? AIR_CYCLE_DAYS : SEA_CYCLE_DAYS;
  const capitalMonths = method === "AIR" ? AIR_CAPITAL_MONTHS : SEA_CAPITAL_MONTHS;

  const landedCostUsd =
    (sourcePriceUsd + freightPerKg * weightKg) * (1 + customsRatePct / 100);

  const profitRatio = landedCostUsd > 0 ? netRevenueUsd / landedCostUsd : 0;
  const monthlyProfitUsd = landedCostUsd * (profitRatio - 1) * monthlyUnits;
  const requiredCapitalUsd = landedCostUsd * capitalMonths * monthlyUnits;
  const annualRoiMultiplier = profitRatio > 0 ? Math.pow(profitRatio, 365 / cycleDays) : 0;
  const annualProfitUsd = monthlyProfitUsd * 12;

  return {
    method,
    landedCostUsd,
    netRevenueUsd,
    profitRatio,
    monthlyProfitUsd,
    requiredCapitalUsd,
    annualRoiMultiplier,
    inventoryDays: cycleDays,
    annualProfitUsd,
  };
}

export function calculateImportDecision(
  input: ImportDecisionInput,
): ImportDecisionResult {
  const missingFields: string[] = [];

  if (input.sourcePriceUsd == null || input.sourcePriceUsd <= 0) missingFields.push("Kaynak fiyat (USD)");
  if (input.weightKg == null || input.weightKg <= 0) missingFields.push("Ağırlık (kg)");
  if (input.customsRatePct == null) missingFields.push("Gümrük oranı (%)");
  if (input.sellingPriceTry == null || input.sellingPriceTry <= 0) missingFields.push("Satış fiyatı (₺)");
  if (input.monthlyUnits == null || input.monthlyUnits <= 0) missingFields.push("Aylık satış tahmini");

  if (missingFields.length > 0) {
    return {
      hasData: false,
      missingFields,
      air: null,
      sea: null,
      recommendedMethod: null,
      effectiveMethod: null,
      effectiveScenario: null,
      decision: "MISSING_DATA",
      score: 0,
    };
  }

  // All required fields are present — safe to assert non-null
  const sourcePriceUsd = input.sourcePriceUsd!;
  const weightKg = input.weightKg!;
  const customsRatePct = input.customsRatePct!;
  const sellingPriceTry = input.sellingPriceTry!;
  const monthlyUnits = input.monthlyUnits!;
  const commissionPct = input.commissionPct ?? 0;
  const domesticShippingTry = input.domesticShippingTry ?? 0;

  // Net revenue in USD
  const netRevenueUsd =
    (sellingPriceTry * (1 - commissionPct / 100) - domesticShippingTry) /
    input.usdTryRate;

  const air = calcScenario("AIR", sourcePriceUsd, weightKg, customsRatePct, netRevenueUsd, monthlyUnits);
  const sea = calcScenario("SEA", sourcePriceUsd, weightKg, customsRatePct, netRevenueUsd, monthlyUnits);

  // Sea wins if its annual ROI is >= 10% better than air
  const recommendedMethod: "AIR" | "SEA" =
    air.annualRoiMultiplier > 0 &&
    sea.annualRoiMultiplier / air.annualRoiMultiplier >= SEA_WIN_THRESHOLD
      ? "SEA"
      : "AIR";

  // Owner preference overrides system recommendation
  const ownerPref = input.shippingMethodPref?.toUpperCase();
  const effectiveMethod: "AIR" | "SEA" =
    ownerPref === "AIR" || ownerPref === "SEA" ? ownerPref : recommendedMethod;

  const effectiveScenario = effectiveMethod === "AIR" ? air : sea;

  // Decision based on annual profit / required capital ratio
  const annualProfitUsd = effectiveScenario.annualProfitUsd;
  const requiredCapitalUsd = effectiveScenario.requiredCapitalUsd;

  let decision: ImportRecommendation = "DO_NOT_BUY";
  let score = 0;

  if (requiredCapitalUsd > 0 && annualProfitUsd > 0) {
    const ratio = annualProfitUsd / requiredCapitalUsd;
    score = ratio * (30 / effectiveScenario.inventoryDays);

    if (ratio > ALWAYS_STOCK_THRESHOLD) {
      decision = "ALWAYS_STOCK";
    } else if (ratio > BUY_SMALL_THRESHOLD) {
      decision = "BUY_SMALL";
    } else {
      decision = "DO_NOT_BUY";
    }
  }

  return {
    hasData: true,
    missingFields: [],
    air,
    sea,
    recommendedMethod,
    effectiveMethod,
    effectiveScenario,
    decision,
    score,
  };
}

/** Default USD/TRY fallback rate if MonthlyExchangeRate table has no entries */
export const DEFAULT_USD_TRY_RATE = 45;

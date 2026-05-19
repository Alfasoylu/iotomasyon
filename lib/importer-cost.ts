import { calcShippingFromPriceTiers } from "./marketplace-pricing";

/**
 * lib/importer-cost.ts — Phase 79: İthalatçı Görünümü
 *
 * Single source of truth for all import economics calculations.
 * Pure functions — no DB calls, no side effects.
 *
 * Formulas:
 *   productUsd   = (sourceCostRmb / rmbUsdRate) × (1 + paymentFeePct/100)
 *   freightUsd   = weightKg × freightPerKg  (AIR: $8/kg, SEA: $1/kg)
 *   customsUsd   = (productUsd + freightUsd) × (customsRatePct/100)
 *   totalCostUsd = productUsd + freightUsd + customsUsd
 *
 *   commission   = trendyolPriceTry × 0.20
 *   shippingTry  = price-tier (Pazaryeri kanonik formülü):
 *                    < $5   → $1.2 × usdTryRate
 *                    $5–7.5 → $2.0 × usdTryRate
 *                    > $7.5 → $3.3 × usdTryRate
 *   netRevenueTry = trendyolPriceTry − commission − shippingTry
 *   netRevenueUsd = netRevenueTry / usdTryRate
 *   netProfitUsd  = netRevenueUsd − totalCostUsd
 *
 * NOT: Eski sabit fee (`>250₺ → 150₺`) kaldırıldı; yerini `calcShippingFromPriceTiers`
 * (Pazaryeri Fiyatlandırması ile birebir tutarlı) aldı.
 *
 *   marginPct    = (netProfitUsd / totalCostUsd) × 100
 *                  ("alış fiyatını yüzde kaç büyüttük")
 *
 *   annualRoiPct = ((netRevenueUsd / totalCostUsd) ^ (365 / cycleDays) − 1) × 100
 *                  ("sermaye 1 yılda yüzde kaç büyür")
 *                  cycleDays: AIR=120, SEA=210
 */

// ── Constants ──────────────────────────────────────────────────────────────────

export const DEFAULT_RMB_USD_RATE = 7.2;
export const DEFAULT_USD_TRY_RATE = 45;
export const DEFAULT_CUSTOMS_PCT = 30;        // %
export const AIR_FREIGHT_PER_KG = 8;          // USD/kg
export const SEA_FREIGHT_PER_KG = 1;          // USD/kg
export const SEA_AUTO_WEIGHT_KG = 5;          // ≥5 kg → auto SEA
export const AIR_CYCLE_DAYS = 120;
export const SEA_CYCLE_DAYS = 210;
export const TRENDYOL_COMMISSION_PCT = 20;

// ── Types ──────────────────────────────────────────────────────────────────────

export type ShippingMethod = "AIR" | "SEA";

export type DecisionLabel =
  | "Al"
  | "Bekle"
  | "Veri Eksik"
  | "Zarar"
  | "Stok Fazla"
  | "Fiyat Yok"
  | "Maliyet Yok"
  | "Yüksek ROI"
  | "Nakit Dönüş Hızlı";

export interface ImportCostResult {
  shippingMethod: ShippingMethod;
  productUsd: number;
  freightUsd: number;
  customsUsd: number;
  totalCostUsd: number;
}

export interface RevenueResult {
  netRevenueTry: number;
  netRevenueUsd: number;
}

export interface ProfitResult {
  netProfitUsd: number;
  marginPct: number;       // profit / cost × 100
  annualRoiPct: number;    // compounded annual ROI based on cycle days
}

export interface BudgetParams {
  totalBudgetUsd: number;
  minRoiPct: number;
  targetStockDays: number;
  maxBudgetSharePct: number;   // max % of total budget to one product
  minOrderQty: number;
}

export const DEFAULT_BUDGET_PARAMS: BudgetParams = {
  totalBudgetUsd: 10_000,
  minRoiPct: 30,
  targetStockDays: 45,
  maxBudgetSharePct: 20,
  minOrderQty: 10,
};

// ── Helpers ────────────────────────────────────────────────────────────────────

export function resolveShipping(
  pref: string | null | undefined,
  weightKg: number,
): ShippingMethod {
  const up = pref?.toUpperCase();
  if (up === "SEA") return "SEA";
  if (up === "AIR") return "AIR";
  return weightKg >= SEA_AUTO_WEIGHT_KG ? "SEA" : "AIR";
}

// ── Core cost formula ──────────────────────────────────────────────────────────

export function calcImportCost(input: {
  sourceCostRmb: number | null;
  weightKg: number | null;
  customsRatePct: number | null;
  importPaymentFeePct: number | null;
  shippingMethodPref: string | null;
  rmbUsdRate: number;
}): ImportCostResult | null {
  const { sourceCostRmb, weightKg, customsRatePct, importPaymentFeePct, shippingMethodPref, rmbUsdRate } = input;
  if (!sourceCostRmb || sourceCostRmb <= 0) return null;
  if (!weightKg || weightKg <= 0) return null;

  const shippingMethod = resolveShipping(shippingMethodPref, weightKg);
  const freightPerKg = shippingMethod === "SEA" ? SEA_FREIGHT_PER_KG : AIR_FREIGHT_PER_KG;
  const customsPct = customsRatePct != null ? customsRatePct : DEFAULT_CUSTOMS_PCT;
  const payFeePct = importPaymentFeePct != null ? importPaymentFeePct : 0;
  const rate = rmbUsdRate > 0 ? rmbUsdRate : DEFAULT_RMB_USD_RATE;

  const productUsd = (sourceCostRmb / rate) * (1 + payFeePct / 100);
  const freightUsd = weightKg * freightPerKg;
  const customsUsd = (productUsd + freightUsd) * (customsPct / 100);
  const totalCostUsd = productUsd + freightUsd + customsUsd;

  return { shippingMethod, productUsd, freightUsd, customsUsd, totalCostUsd };
}

// ── Revenue formula ────────────────────────────────────────────────────────────

/**
 * Trendyol net kalan geliri hesaplar.
 * Kargo formülü Pazaryeri Fiyatlandırması ile birebir aynı
 * (calcShippingFromPriceTiers — lib/marketplace-pricing.ts).
 */
export function calcRevenue(input: {
  trendyolPriceTry: number | null;
  usdTryRate: number;
}): RevenueResult | null {
  const { trendyolPriceTry, usdTryRate } = input;
  if (!trendyolPriceTry || trendyolPriceTry <= 0) return null;
  const rate = usdTryRate > 0 ? usdTryRate : DEFAULT_USD_TRY_RATE;

  const commission = trendyolPriceTry * (TRENDYOL_COMMISSION_PCT / 100);
  const shippingTry = calcShippingFromPriceTiers(trendyolPriceTry, rate);
  const netRevenueTry = trendyolPriceTry - commission - shippingTry;
  const netRevenueUsd = netRevenueTry / rate;

  return { netRevenueTry, netRevenueUsd };
}

// ── Profit + ROI ───────────────────────────────────────────────────────────────

export function calcProfit(
  cost: ImportCostResult,
  revenue: RevenueResult,
): ProfitResult {
  const netProfitUsd = revenue.netRevenueUsd - cost.totalCostUsd;
  const marginPct = (netProfitUsd / cost.totalCostUsd) * 100;

  // Annual ROI: compounded return based on inventory cycle
  // ratio = netRevenue / cost (must be > 0 for ROI to make sense)
  const ratio = revenue.netRevenueUsd / cost.totalCostUsd;
  const cycleDays = cost.shippingMethod === "SEA" ? SEA_CYCLE_DAYS : AIR_CYCLE_DAYS;
  const annualRoiPct = (Math.pow(Math.max(ratio, 0.001), 365 / cycleDays) - 1) * 100;

  return { netProfitUsd, marginPct, annualRoiPct };
}

// ── Stock days ─────────────────────────────────────────────────────────────────

export function calcStockDays(stockQuantity: number, t30g: number): number | null {
  if (t30g <= 0) return null;
  const dailySales = t30g / 30;
  return Math.round(stockQuantity / dailySales);
}

// ── Decision label ─────────────────────────────────────────────────────────────

export function calcDecisionLabel(params: {
  hasCost: boolean;
  hasTrendyolPrice: boolean;
  netProfitUsd: number | null;
  annualRoiPct: number | null;
  stockDays: number | null;
  targetStockDays: number;
  recommendedQty: number;
  t30g: number;
}): DecisionLabel {
  const { hasCost, hasTrendyolPrice, netProfitUsd, annualRoiPct, stockDays, targetStockDays, recommendedQty, t30g } = params;

  if (!hasCost) return "Maliyet Yok";
  if (!hasTrendyolPrice) return "Fiyat Yok";
  if (netProfitUsd != null && netProfitUsd <= 0) return "Zarar";
  if (t30g === 0) return "Veri Eksik";
  if (stockDays != null && stockDays > targetStockDays * 1.5) return "Stok Fazla";
  if (annualRoiPct != null && annualRoiPct > 150) return "Yüksek ROI";
  if (stockDays != null && stockDays < 15 && netProfitUsd != null && netProfitUsd > 0) return "Nakit Dönüş Hızlı";
  if (recommendedQty > 0) return "Al";
  if (netProfitUsd != null && netProfitUsd > 0) return "Bekle";
  return "Veri Eksik";
}

// ── Health score (0–100) ───────────────────────────────────────────────────────

export function calcHealthScore(params: {
  hasRmb: boolean;
  hasWeight: boolean;
  hasTrendyolPrice: boolean;
  netProfitUsd: number | null;
  marginPct: number | null;
  t30g: number;
  stockDays: number | null;
}): number {
  let score = 0;

  // Data completeness: 30 pts
  if (params.hasRmb) score += 10;
  if (params.hasWeight) score += 10;
  if (params.hasTrendyolPrice) score += 10;

  // Profitability: 40 pts (capped)
  if (params.netProfitUsd != null && params.netProfitUsd > 0 && params.marginPct != null) {
    score += Math.min(40, Math.max(0, params.marginPct * 0.8));
  }

  // Sales velocity: 15 pts
  if (params.t30g > 0) {
    score += Math.min(15, params.t30g * 1.5);
  }

  // Stock health: 15 pts
  const sd = params.stockDays;
  if (sd != null) {
    if (sd >= 15 && sd <= 60) score += 15;
    else if (sd >= 7 && sd < 15) score += 8;
    else if (sd > 60 && sd <= 90) score += 5;
  }

  return Math.round(Math.min(100, Math.max(0, score)));
}

// ── Budget allocation ──────────────────────────────────────────────────────────

export interface ProductForAllocation {
  id: string;
  stockQuantity: number;
  t30g: number;
  totalCostUsd: number | null;
  netProfitUsd: number | null;
  annualRoiPct: number | null;
  score: number; // pre-computed health/priority score
}

export interface AllocationResult {
  recommendedQty: number;
  neededQty: number;
  budgetCost: number;
}

/**
 * Distribute budget across eligible products.
 * Returns a Map<productId, AllocationResult>.
 */
export function allocateBudget(
  products: ProductForAllocation[],
  params: BudgetParams,
): Map<string, AllocationResult> {
  const result = new Map<string, AllocationResult>();

  // Phase 1: qualify & compute needs
  type Candidate = ProductForAllocation & { neededQty: number };
  const candidates: Candidate[] = [];

  for (const p of products) {
    result.set(p.id, { recommendedQty: 0, neededQty: 0, budgetCost: 0 });

    if (!p.totalCostUsd || p.totalCostUsd <= 0) continue;
    if (!p.netProfitUsd || p.netProfitUsd <= 0) continue;
    if (p.t30g <= 0) continue;
    if (!p.annualRoiPct || p.annualRoiPct < params.minRoiPct) continue;

    const dailySales = p.t30g / 30;
    const targetQty = dailySales * params.targetStockDays;
    const neededQty = Math.max(0, targetQty - p.stockQuantity);
    if (neededQty <= 0) continue;

    candidates.push({ ...p, neededQty });
  }

  // Phase 2: sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  // Phase 3: distribute budget
  let remaining = params.totalBudgetUsd;

  for (const c of candidates) {
    if (remaining <= 0) break;

    const maxForProduct = (params.totalBudgetUsd * params.maxBudgetSharePct) / 100;
    const budgetHere = Math.min(remaining, maxForProduct);
    const maxByBudget = Math.floor(budgetHere / c.totalCostUsd!);
    if (maxByBudget <= 0) continue;

    const rawQty = Math.ceil(c.neededQty);
    const qty = Math.max(params.minOrderQty, Math.min(rawQty, maxByBudget));
    const cost = qty * c.totalCostUsd!;

    result.set(c.id, { recommendedQty: qty, neededQty: Math.ceil(c.neededQty), budgetCost: cost });
    remaining -= cost;
  }

  return result;
}

/**
 * Phase 9 — Sales Potential Engine
 *
 * Pure calculation module. No DB access, no server-only imports.
 * Depends on profitability.ts for per-unit profit figures.
 *
 * Channels:
 *   online      → marketplace channel (uses marketplace price + commission)
 *   wholesale   → wholesale channel (uses wholesale price, no commission)
 *   installer   → security/installer channel (uses wholesale price, treated as wholesale)
 *
 * Investment score (0–100):
 *   Based on monthly ROI = projected monthly profit / locked stock capital × 100
 *   Capped at 30 % monthly ROI → score 100.
 *   A score of 20+ with profitability = BUY signal.
 *
 * BUY signals:
 *   BUY          — profitable, has demand, investmentScore ≥ 20 OR stock ≤ minimum
 *   WAIT         — profitable, has demand, score < 20 (not urgent yet)
 *   DO_NOT_BUY   — unprofitable on all channels with data
 *   UNKNOWN      — no demand estimates entered
 */

import { calculateProfitability, type ProfitabilityInput } from "./profitability";

export type BuySignal = "BUY" | "WAIT" | "DO_NOT_BUY" | "UNKNOWN";

export type SalesPotentialInput = ProfitabilityInput & {
  onlineSalesPotential?: number | null;
  wholesaleSalesPotential?: number | null;
  installerSalesPotential?: number | null;
  stockQuantity?: number | null;
  minimumStock?: number | null;
};

export type SalesPotentialResult = {
  onlineMonthlyRevenue: number;
  wholesaleMonthlyRevenue: number;
  installerMonthlyRevenue: number;
  projectedMonthlyRevenue: number;

  onlineMonthlyProfit: number;
  wholesaleMonthlyProfit: number;
  installerMonthlyProfit: number;
  projectedMonthlyProfit: number;

  totalMonthlyUnits: number;
  turnoverMonths: number | null;   // months to sell current stock at this rate

  investmentScore: number;         // 0–100
  buySignal: BuySignal;
};

function n(v: number | null | undefined, fallback = 0): number {
  if (v == null || !isFinite(v)) return fallback;
  return v;
}

export function calculateSalesPotential(input: SalesPotentialInput): SalesPotentialResult {
  const onlineUnits = Math.max(0, Math.round(n(input.onlineSalesPotential)));
  const wholesaleUnits = Math.max(0, Math.round(n(input.wholesaleSalesPotential)));
  const installerUnits = Math.max(0, Math.round(n(input.installerSalesPotential)));
  const totalMonthlyUnits = onlineUnits + wholesaleUnits + installerUnits;

  const profitability = calculateProfitability(input);

  const onlineUnitProfit = profitability.marketplace?.netProfit ?? 0;
  const wholesaleUnitProfit = profitability.wholesale?.netProfit ?? 0;
  const installerUnitProfit = profitability.wholesale?.netProfit ?? 0; // installers on wholesale terms

  const onlineUnitRevenue = n(input.marketplacePriceTry);
  const wholesaleUnitRevenue = n(input.wholesalePriceTry);
  const installerUnitRevenue = n(input.wholesalePriceTry);

  const onlineMonthlyRevenue = onlineUnits * onlineUnitRevenue;
  const wholesaleMonthlyRevenue = wholesaleUnits * wholesaleUnitRevenue;
  const installerMonthlyRevenue = installerUnits * installerUnitRevenue;
  const projectedMonthlyRevenue = onlineMonthlyRevenue + wholesaleMonthlyRevenue + installerMonthlyRevenue;

  const onlineMonthlyProfit = onlineUnits * onlineUnitProfit;
  const wholesaleMonthlyProfit = wholesaleUnits * wholesaleUnitProfit;
  const installerMonthlyProfit = installerUnits * installerUnitProfit;
  const projectedMonthlyProfit = onlineMonthlyProfit + wholesaleMonthlyProfit + installerMonthlyProfit;

  // Turnover: months to sell current stock
  const stock = Math.max(0, n(input.stockQuantity));
  const turnoverMonths =
    totalMonthlyUnits > 0 && stock > 0 ? stock / totalMonthlyUnits : null;

  // Investment score: monthly profit / locked capital, normalized to 0–100
  const unitCost = n(input.unitCostTry);
  const lockedCapital = stock * unitCost;
  const monthlyROI = lockedCapital > 0 ? (projectedMonthlyProfit / lockedCapital) * 100 : 0;
  const investmentScore = Math.max(0, Math.min(100, Math.round((monthlyROI / 30) * 100)));

  // BUY signal logic
  const hasDemand = totalMonthlyUnits > 0;
  const hasAnyPriceData =
    profitability.marketplace != null ||
    profitability.wholesale != null ||
    profitability.retail != null;
  const isProfitable =
    (profitability.marketplace?.profitable ?? false) ||
    (profitability.wholesale?.profitable ?? false) ||
    (profitability.retail?.profitable ?? false);
  const isLowStock = stock <= Math.max(0, n(input.minimumStock));

  let buySignal: BuySignal;
  if (!hasDemand || !hasAnyPriceData) {
    buySignal = "UNKNOWN";
  } else if (!isProfitable) {
    buySignal = "DO_NOT_BUY";
  } else if (isLowStock || investmentScore >= 20) {
    buySignal = "BUY";
  } else {
    buySignal = "WAIT";
  }

  return {
    onlineMonthlyRevenue,
    wholesaleMonthlyRevenue,
    installerMonthlyRevenue,
    projectedMonthlyRevenue,
    onlineMonthlyProfit,
    wholesaleMonthlyProfit,
    installerMonthlyProfit,
    projectedMonthlyProfit,
    totalMonthlyUnits,
    turnoverMonths,
    investmentScore,
    buySignal,
  };
}

export const BUY_SIGNAL_LABELS: Record<BuySignal, string> = {
  BUY: "SATIN AL",
  WAIT: "BEKLE",
  DO_NOT_BUY: "ALMA",
  UNKNOWN: "Veri yok",
};

export const BUY_SIGNAL_TONES: Record<BuySignal, "success" | "warning" | "danger" | "default"> = {
  BUY: "success",
  WAIT: "warning",
  DO_NOT_BUY: "danger",
  UNKNOWN: "default",
};

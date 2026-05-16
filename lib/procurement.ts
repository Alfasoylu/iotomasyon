/**
 * Phase 19 — Procurement Intelligence Engine
 *
 * Pure calculation module. No DB access, no server-only imports.
 * Derives reorder urgency from existing inventory + sales potential data.
 *
 * Urgency levels:
 *   CRITICAL  — stock is at 0 (or below minimum) with BUY signal
 *   HIGH      — days of stock remaining ≤ reorderLeadTime × 1.5
 *   MEDIUM    — days of stock remaining ≤ reorderLeadTime × 3
 *   LOW       — days of stock remaining ≤ reorderLeadTime × 6
 *   OK        — adequately stocked relative to demand + lead time
 *   UNKNOWN   — missing demand or lead time data
 *
 * Suggested order quantity: cover `targetCoverageMo` months of demand (default 3)
 * after current stock is depleted at current demand rate.
 */

import { calculateSalesPotential, type SalesPotentialInput, type BuySignal } from "./sales-potential";

export type ReorderUrgency = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "OK" | "UNKNOWN";

export type ProcurementInput = SalesPotentialInput & {
  reorderLeadTime?: number | null; // in days
  name?: string;
  sku?: string;
};

export type ProcurementResult = {
  /** Days of stock remaining at current demand rate. null if demand = 0 or stock = 0. */
  daysOfStockRemaining: number | null;
  /** Reorder urgency classification */
  reorderUrgency: ReorderUrgency;
  /** Suggested quantity to order to achieve targetCoverageMo months of stock */
  suggestedOrderQty: number;
  /** Estimated purchase cost for suggested order (suggestedOrderQty × unitCostTry) */
  suggestedOrderCost: number;
  /** Projected monthly profit contribution (from sales potential engine) */
  projectedMonthlyProfit: number;
  /** Investment score (0–100) from sales potential engine */
  investmentScore: number;
  /** BUY/WAIT/DO_NOT_BUY/UNKNOWN signal */
  buySignal: BuySignal;
  /** Total monthly units demand */
  totalMonthlyUnits: number;
};

function n(v: number | null | undefined, fallback = 0): number {
  if (v == null || !isFinite(v)) return fallback;
  return v;
}

const URGENCY_ORDER: Record<ReorderUrgency, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  OK: 4,
  UNKNOWN: 5,
};

export function urgencyRank(u: ReorderUrgency): number {
  return URGENCY_ORDER[u];
}

export function calculateProcurement(
  input: ProcurementInput,
  targetCoverageMo = 3
): ProcurementResult {
  const sp = calculateSalesPotential(input);

  const stock = Math.max(0, n(input.stockQuantity));
  const leadTimeDays = n(input.reorderLeadTime, 0);
  const unitCost = n(input.unitCostTry, 0);

  const { totalMonthlyUnits, projectedMonthlyProfit, investmentScore, buySignal } = sp;

  // Days of stock remaining
  const dailyDemand = totalMonthlyUnits / 30;
  const daysOfStockRemaining =
    dailyDemand > 0 && stock > 0 ? stock / dailyDemand : null;

  // Urgency classification
  let reorderUrgency: ReorderUrgency;

  if (totalMonthlyUnits === 0 || leadTimeDays === 0) {
    // If no demand data or no lead time, we can still flag zero stock
    if (stock === 0 && buySignal === "BUY") {
      reorderUrgency = "CRITICAL";
    } else {
      reorderUrgency = "UNKNOWN";
    }
  } else {
    const daysRemaining = daysOfStockRemaining ?? 0;

    if (stock === 0) {
      reorderUrgency = "CRITICAL";
    } else if (daysRemaining <= leadTimeDays * 1.5) {
      reorderUrgency = "HIGH";
    } else if (daysRemaining <= leadTimeDays * 3) {
      reorderUrgency = "MEDIUM";
    } else if (daysRemaining <= leadTimeDays * 6) {
      reorderUrgency = "LOW";
    } else {
      reorderUrgency = "OK";
    }
  }

  // Suggested order quantity:
  // We want to have `targetCoverageMo` months of stock AFTER the order arrives.
  // Demand during lead time (transit consumption): dailyDemand × leadTimeDays
  // Target on-hand after order arrives: targetCoverageMo × totalMonthlyUnits
  // Stock at time of arrival: max(0, stock - dailyDemand × leadTimeDays)
  // So: orderQty = target + transitConsumption - currentStock (min 0)
  const transitConsumption =
    dailyDemand > 0 ? Math.ceil(dailyDemand * leadTimeDays) : 0;
  const targetStock = Math.ceil(targetCoverageMo * totalMonthlyUnits);
  const stockAtArrival = Math.max(0, stock - transitConsumption);
  const suggestedOrderQty = Math.max(0, targetStock - stockAtArrival);

  const suggestedOrderCost = suggestedOrderQty * unitCost;

  return {
    daysOfStockRemaining,
    reorderUrgency,
    suggestedOrderQty,
    suggestedOrderCost,
    projectedMonthlyProfit,
    investmentScore,
    buySignal,
    totalMonthlyUnits,
  };
}

export const URGENCY_LABELS: Record<ReorderUrgency, string> = {
  CRITICAL: "KRİTİK",
  HIGH: "YÜKSEK",
  MEDIUM: "ORTA",
  LOW: "DÜŞÜK",
  OK: "YETERLİ",
  UNKNOWN: "Veri yok",
};

export const URGENCY_TONES: Record<ReorderUrgency, "success" | "warning" | "danger" | "default"> = {
  CRITICAL: "danger",
  HIGH: "danger",
  MEDIUM: "warning",
  LOW: "warning",
  OK: "success",
  UNKNOWN: "default",
};

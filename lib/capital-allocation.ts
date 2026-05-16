/**
 * Phase 10 — Capital Allocation Engine (ADMIN ONLY)
 *
 * Pure calculation module. No DB access, no server-only imports.
 *
 * Algorithm:
 *  1. Calculate locked capital: SUM(stockQuantity × unitCostTry) across all products
 *  2. Available capital = totalCapital - lockedCapital
 *  3. Deployable capital = available × (1 - reservePct/100)
 *  4. For each product with demand + cost + score:
 *     - targetStock = totalMonthlyDemand × desiredTurnoverMonths
 *     - reorderQty = max(0, targetStock - currentStock)
 *     - reorderCost = reorderQty × unitCostTry
 *  5. Rank by investmentScore DESC
 *  6. Allocate deployable capital greedily in rank order
 *  7. For partial allocations: floor(remaining / unitCostTry) units
 *
 * Safety rules:
 *  - deployableCapital is always < availableCapital (reserve enforced)
 *  - suggestions are read-only — admin must approve before any purchase
 *  - products with missing cost OR zero demand are excluded
 */

export type ProductForAllocation = {
  id: string;
  name: string;
  sku: string;
  unitCostTry?: number | null;
  stockQuantity: number;
  minimumStock: number;
  onlineSalesPotential?: number | null;
  wholesaleSalesPotential?: number | null;
  installerSalesPotential?: number | null;
  investmentScore: number; // 0–100 from Phase 9
  marketplacePriceTry?: number | null;
  wholesalePriceTry?: number | null;
  sellingPriceTry?: number | null;
};

export type AllocationSuggestion = {
  product: ProductForAllocation;
  currentStockValue: number;
  totalMonthlyDemand: number;
  targetStock: number;
  reorderQty: number;
  reorderCost: number;
  allocatedAmount: number;
  allocatedQty: number;
  expectedMonthlyROI: number | null; // %
};

export type CapitalAllocationResult = {
  totalCapital: number;
  lockedCapital: number;
  availableCapital: number;
  reserveAmount: number;
  deployableCapital: number;
  allocatedTotal: number;
  remainingAfterAllocation: number;
  suggestions: AllocationSuggestion[];
  skippedCount: number; // products excluded (no cost / no demand)
};

function n(v: number | null | undefined, fallback = 0): number {
  if (v == null || !isFinite(v)) return fallback;
  return v;
}

export function calculateCapitalAllocation(
  products: ProductForAllocation[],
  totalCapitalTry: number,
  reservePct: number,
  desiredTurnoverMonths: number,
): CapitalAllocationResult {
  // Step 1: locked capital
  const lockedCapital = products.reduce((sum, p) => {
    return sum + p.stockQuantity * n(p.unitCostTry);
  }, 0);

  const availableCapital = Math.max(0, totalCapitalTry - lockedCapital);
  const reserveAmount = availableCapital * (reservePct / 100);
  const deployableCapital = Math.max(0, availableCapital - reserveAmount);

  // Step 2: filter eligible products
  const eligible = products.filter(
    (p) => n(p.unitCostTry) > 0 &&
      (n(p.onlineSalesPotential) + n(p.wholesaleSalesPotential) + n(p.installerSalesPotential)) > 0,
  );
  const skippedCount = products.length - eligible.length;

  // Step 3: rank by investmentScore DESC, then by reorderQty need
  const ranked = [...eligible].sort((a, b) => b.investmentScore - a.investmentScore);

  // Step 4: greedy allocation
  let remaining = deployableCapital;
  const suggestions: AllocationSuggestion[] = [];

  for (const p of ranked) {
    const unitCost = n(p.unitCostTry);
    const totalMonthlyDemand =
      n(p.onlineSalesPotential) +
      n(p.wholesaleSalesPotential) +
      n(p.installerSalesPotential);
    const targetStock = Math.ceil(totalMonthlyDemand * desiredTurnoverMonths);
    const reorderQty = Math.max(0, targetStock - p.stockQuantity);
    const reorderCost = reorderQty * unitCost;

    if (reorderQty === 0) continue; // already well-stocked

    const allocatedAmount = Math.min(reorderCost, remaining);
    const allocatedQty = unitCost > 0 ? Math.floor(allocatedAmount / unitCost) : 0;
    const actualAllocated = allocatedQty * unitCost;

    if (allocatedQty === 0) continue; // can't afford even 1 unit

    // Expected monthly ROI on this allocation
    const price =
      n(p.marketplacePriceTry) ||
      n(p.wholesalePriceTry) ||
      n(p.sellingPriceTry);
    const grossMonthlyProfit = totalMonthlyDemand * (price - unitCost);
    const expectedMonthlyROI =
      actualAllocated > 0 ? (grossMonthlyProfit / actualAllocated) * 100 : null;

    suggestions.push({
      product: p,
      currentStockValue: p.stockQuantity * unitCost,
      totalMonthlyDemand,
      targetStock,
      reorderQty,
      reorderCost,
      allocatedAmount: actualAllocated,
      allocatedQty,
      expectedMonthlyROI,
    });

    remaining -= actualAllocated;
    if (remaining < unitCost) break; // can't buy even 1 more of anything
  }

  const allocatedTotal = deployableCapital - remaining;

  return {
    totalCapital: totalCapitalTry,
    lockedCapital,
    availableCapital,
    reserveAmount,
    deployableCapital,
    allocatedTotal,
    remainingAfterAllocation: remaining,
    suggestions,
    skippedCount,
  };
}

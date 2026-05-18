import "server-only";

/**
 * Finance Visibility Gate — central decision point for financial / import
 * intelligence visibility.
 *
 * Source of truth: docs/PERMISSION-MODEL.md → "Import Intelligence Secrecy Rule"
 *
 * Restricted fields (any of these visible only if canViewFinance === true):
 * - unitCostTry, sourceCostRmb, importUnitCostUsd, importPaymentFeePct
 * - landed cost, wholesalePriceTry (contains margin signal)
 * - net profit, margin, ROI
 * - supplier cost, freight, customs
 * - capital allocation, import decision outputs
 * - private notes, import snapshots
 *
 * Today this is gated by EXECUTIVE_READ (the broadest "owner intelligence"
 * permission). Future Phase 57 will split into productFinance.read /
 * import.read / profitability.read. When that split lands, only this file
 * needs to change — all call-sites will keep working.
 */

import { checkPermission } from "@/lib/auth";
import type { ResolvedUser } from "@/lib/permissions";
import { PERMISSIONS } from "@/lib/permissions";

export type FinanceGate = {
  /** True iff user can see any cost/profit/import intelligence field. */
  canViewFinance: boolean;
};

/**
 * Resolve whether the given user can view restricted financial / import data.
 *
 * Defaults to false (deny). Returns true only when the user holds EXECUTIVE_READ
 * (ADMIN always satisfies this via the ADMIN bypass).
 */
export async function resolveFinanceGate(
  user: ResolvedUser,
): Promise<FinanceGate> {
  const canViewFinance = await checkPermission(user, PERMISSIONS.EXECUTIVE_READ);
  return { canViewFinance };
}

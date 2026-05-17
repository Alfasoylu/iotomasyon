/**
 * Phase 30 — Marketplace Margin Policy Service
 *
 * Resolves effective shipping cost and commission rate for a product+platform
 * pair using a three-tier precedence:
 *
 *   1. Product override   (shippingCostOverride / marketplaceCommissionOverride)
 *   2. Product generic    (shippingCost / marketplaceCommission)
 *   3. Platform standard  (MarketplacePlatformPolicy row)
 *   4. System default     (shipping=0, commission=20%)
 *
 * Pure computation — no DB access. Caller loads platform policy from DB.
 */

export type PolicySource =
  | "product_override"   // shippingCostOverride / marketplaceCommissionOverride set
  | "product_value"      // shippingCost / marketplaceCommission set (no override)
  | "platform_standard"  // MarketplacePlatformPolicy row value
  | "system_default";    // hardcoded fallback

export type EffectiveMarginPolicy = {
  /** Final shipping cost used in calculation (TRY) */
  shippingTry: number;
  shippingSource: PolicySource;

  /** Final marketplace commission % used in calculation */
  commissionPct: number;
  commissionSource: PolicySource;

  /** Payment processing fee % */
  paymentFeePct: number;

  /** Return/defect reserve % */
  returnReservePct: number;

  /** VAT rate % */
  vatPct: number;
};

export type ProductPolicyInput = {
  shippingCost?: number | null;
  shippingCostOverride?: number | null;
  marketplaceCommission?: number | null;
  marketplaceCommissionOverride?: number | null;
  vatRate?: number | null;
  paymentFeeRate?: number | null;
  returnReserveRate?: number | null;
};

export type PlatformPolicyInput = {
  standardShippingTry?: number | null;
  standardCommissionPct?: number | null;
  paymentFeePct?: number | null;
  returnReservePct?: number | null;
  vatPct?: number | null;
} | null;

function n(v: number | null | undefined, fallback = 0): number {
  if (v == null || !isFinite(v as number)) return fallback;
  return v as number;
}

export function resolveMarginPolicy(
  product: ProductPolicyInput,
  platformPolicy: PlatformPolicyInput,
): EffectiveMarginPolicy {
  // ── Shipping resolution ──────────────────────────────────────────────────
  let shippingTry: number;
  let shippingSource: PolicySource;

  if (product.shippingCostOverride != null && product.shippingCostOverride > 0) {
    shippingTry = product.shippingCostOverride;
    shippingSource = "product_override";
  } else if (product.shippingCost != null && product.shippingCost > 0) {
    shippingTry = product.shippingCost;
    shippingSource = "product_value";
  } else if (platformPolicy?.standardShippingTry != null && platformPolicy.standardShippingTry > 0) {
    shippingTry = platformPolicy.standardShippingTry;
    shippingSource = "platform_standard";
  } else {
    shippingTry = 0;
    shippingSource = "system_default";
  }

  // ── Commission resolution ────────────────────────────────────────────────
  let commissionPct: number;
  let commissionSource: PolicySource;

  if (
    product.marketplaceCommissionOverride != null &&
    product.marketplaceCommissionOverride > 0
  ) {
    commissionPct = product.marketplaceCommissionOverride;
    commissionSource = "product_override";
  } else if (product.marketplaceCommission != null && product.marketplaceCommission > 0) {
    commissionPct = product.marketplaceCommission;
    commissionSource = "product_value";
  } else if (
    platformPolicy?.standardCommissionPct != null &&
    platformPolicy.standardCommissionPct > 0
  ) {
    commissionPct = platformPolicy.standardCommissionPct;
    commissionSource = "platform_standard";
  } else {
    commissionPct = 20;
    commissionSource = "system_default";
  }

  // ── Remaining rates: product → platform → default ───────────────────────
  const paymentFeePct = n(
    product.paymentFeeRate ?? platformPolicy?.paymentFeePct,
    0,
  );
  const returnReservePct = n(
    product.returnReserveRate ?? platformPolicy?.returnReservePct,
    0,
  );
  const vatPct = n(
    product.vatRate ?? platformPolicy?.vatPct,
    20,
  );

  return {
    shippingTry,
    shippingSource,
    commissionPct,
    commissionSource,
    paymentFeePct,
    returnReservePct,
    vatPct,
  };
}

/** Human-readable Turkish label for a PolicySource */
export function policySourceLabel(source: PolicySource): string {
  switch (source) {
    case "product_override":  return "Ürün Geçersiz Kılma";
    case "product_value":     return "Ürün Değeri";
    case "platform_standard": return "Platform Standardı";
    case "system_default":    return "Sistem Varsayılanı";
  }
}

/** Badge color class for a PolicySource */
export function policySourceColor(source: PolicySource): string {
  switch (source) {
    case "product_override":  return "bg-blue-100 text-blue-700";
    case "product_value":     return "bg-slate-100 text-slate-700";
    case "platform_standard": return "bg-emerald-100 text-emerald-700";
    case "system_default":    return "bg-amber-100 text-amber-700";
  }
}

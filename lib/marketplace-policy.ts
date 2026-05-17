/**
 * Phase 30 — Marketplace Margin Policy Service
 * Phase 51 — USD-tiered shipping support
 *
 * Resolves effective shipping cost and commission rate for a product+platform
 * pair using a four-tier precedence:
 *
 *   1. Product override   (shippingCostOverride / marketplaceCommissionOverride)
 *   2. Product generic    (shippingCost / marketplaceCommission)
 *   3. Platform tiered    (shippingTiersJson — USD threshold → TRY cost)
 *   4. Platform standard  (standardShippingTry — flat rate)
 *   5. System default     (shipping=0, commission=20%)
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
  /** JSON: [{maxPriceUsd?: number, costUsd: number}[]] */
  shippingTiersJson?: string | null;
} | null;

/** Single tier entry in shippingTiersJson */
export type ShippingTier = {
  /** Upper-bound USD price (exclusive). Omit on the last entry = catch-all. */
  maxPriceUsd?: number;
  /** Shipping cost in USD for this tier. */
  costUsd: number;
};

/**
 * Parse shippingTiersJson. Returns an empty array on any parse failure.
 */
export function parseShippingTiers(json: string | null | undefined): ShippingTier[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is ShippingTier =>
        typeof t === "object" &&
        t !== null &&
        typeof t.costUsd === "number" &&
        (t.maxPriceUsd === undefined || typeof t.maxPriceUsd === "number"),
    );
  } catch {
    return [];
  }
}

/**
 * Resolve tiered shipping cost (TRY) for a given USD selling price.
 * Returns null if no tiers are defined or price context is unavailable.
 */
export function resolveTieredShipping(
  tiers: ShippingTier[],
  sellingPriceUsd: number,
  usdTryRate: number,
): number | null {
  if (tiers.length === 0) return null;
  // Walk tiers in order; last tier without maxPriceUsd is the catch-all
  for (const tier of tiers) {
    if (tier.maxPriceUsd === undefined || sellingPriceUsd < tier.maxPriceUsd) {
      return tier.costUsd * usdTryRate;
    }
  }
  return null;
}

function n(v: number | null | undefined, fallback = 0): number {
  if (v == null || !isFinite(v as number)) return fallback;
  return v as number;
}

/** Optional context for price-aware shipping resolution */
export type MarginPolicyContext = {
  /** Selling price in USD — required for tier lookup */
  sellingPriceUsd?: number | null;
  /** USD→TRY rate — required to convert tier costUsd to TRY */
  usdTryRate?: number;
};

export function resolveMarginPolicy(
  product: ProductPolicyInput,
  platformPolicy: PlatformPolicyInput,
  context?: MarginPolicyContext,
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
  } else {
    // Try tiered shipping from platform policy
    const tiers = parseShippingTiers(platformPolicy?.shippingTiersJson);
    const priceUsd = context?.sellingPriceUsd;
    const rate = context?.usdTryRate ?? 1;

    const tieredCost =
      tiers.length > 0 && priceUsd != null && priceUsd > 0
        ? resolveTieredShipping(tiers, priceUsd, rate)
        : null;

    if (tieredCost != null) {
      shippingTry = tieredCost;
      shippingSource = "platform_standard";
    } else if (platformPolicy?.standardShippingTry != null && platformPolicy.standardShippingTry > 0) {
      shippingTry = platformPolicy.standardShippingTry;
      shippingSource = "platform_standard";
    } else {
      shippingTry = 0;
      shippingSource = "system_default";
    }
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

/** Default Trendyol tier JSON string — use as seed when saving a new policy */
export const DEFAULT_TRENDYOL_TIERS: ShippingTier[] = [
  { maxPriceUsd: 5.0,  costUsd: 1.2 },
  { maxPriceUsd: 7.5,  costUsd: 2.0 },
  { costUsd: 3.3 },
];

export const DEFAULT_TIERS_JSON = JSON.stringify(DEFAULT_TRENDYOL_TIERS);

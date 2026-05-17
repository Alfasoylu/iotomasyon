/**
 * Phase 33 — Marketplace Pricing Normalization
 *
 * Canonical marketplace pricing engine.
 * Resolves effective price, shipping, commission, payment fee, return reserve,
 * and net remaining revenue per marketplace platform.
 *
 * Shipping default tiers (from roadmap spec) in USD, converted via usdTryRate:
 *   effective price (USD) < 5      → shipping = 1.2 USD
 *   effective price (USD) 5–7.5    → shipping = 2.0 USD
 *   effective price (USD) > 7.5    → shipping = 3.3 USD
 *
 * Product-level or platform-policy overrides supersede the tier defaults.
 *
 * Pure computation — no DB access. Caller loads platform policies from DB.
 */

import {
  resolveMarginPolicy,
  type ProductPolicyInput,
  type PlatformPolicyInput,
  type PolicySource,
  policySourceLabel,
  policySourceColor,
} from "./marketplace-policy";

export type PriceSource = "manual" | "xml" | "none";

export type { PolicySource, ProductPolicyInput, PlatformPolicyInput };
export { policySourceLabel, policySourceColor };

// ── Shipping price-tier constants (USD) ─────────────────────────────────────

interface ShippingTier {
  maxUsd: number;
  feeUsd: number;
}

const SHIPPING_TIERS: ShippingTier[] = [
  { maxUsd: 5,   feeUsd: 1.2 },
  { maxUsd: 7.5, feeUsd: 2.0 },
];
const SHIPPING_ABOVE_TIER_USD = 3.3;

// ── Types ────────────────────────────────────────────────────────────────────

export interface MarketplacePricingRow {
  platform: string;
  platformLabel: string;
  /** XML source price converted to TRY (null when XML has no price for this platform) */
  xmlPriceTry: number | null;
  /** Manual override price in TRY (null when not set) */
  manualOverrideTry: number | null;
  /** Effective price used for calculations (manual override beats XML) */
  effectivePriceTry: number | null;
  priceSource: PriceSource;
  /** Resolved shipping cost (TRY) — tier default or policy override */
  shippingTry: number;
  shippingSource: PolicySource | "price_tier";
  /** Commission rate (%) */
  commissionPct: number;
  commissionSource: PolicySource;
  /** Commission amount (TRY) */
  commissionTry: number;
  /** Payment processing fee (TRY) */
  paymentFeeTry: number;
  /** Return reserve (TRY) */
  returnReserveTry: number;
  /** Net remaining = effectivePrice − shipping − commission − paymentFee − returnReserve */
  netRevenueTry: number | null;
  /** Net margin % = netRevenueTry / effectivePriceTry × 100 */
  netMarginPct: number | null;
  hasData: boolean;
}

export interface MarketplacePricingInput {
  platform: string;
  platformLabel: string;
  /** Supplier XML price in USD (null when unavailable for this platform) */
  xmlPriceUsd: number | null;
  /** Manual override price in TRY on this product (null when not set) */
  manualOverrideTry: number | null;
  product: ProductPolicyInput;
  platformPolicy: PlatformPolicyInput;
  usdTryRate: number;
}

// ── Engine ───────────────────────────────────────────────────────────────────

/**
 * Calculate default shipping cost from price-tier table.
 * Input: effective price in TRY + USD/TRY rate.
 * Returns: shipping cost in TRY.
 */
export function calcShippingFromPriceTiers(
  effectivePriceTry: number,
  usdTryRate: number,
): number {
  if (usdTryRate <= 0) return SHIPPING_ABOVE_TIER_USD * 30; // fallback if no rate
  const priceUsd = effectivePriceTry / usdTryRate;
  for (const tier of SHIPPING_TIERS) {
    if (priceUsd < tier.maxUsd) return tier.feeUsd * usdTryRate;
  }
  return SHIPPING_ABOVE_TIER_USD * usdTryRate;
}

/**
 * Compute all pricing fields for one platform row.
 */
export function calcMarketplacePricingRow(
  input: MarketplacePricingInput,
): MarketplacePricingRow {
  const {
    platform,
    platformLabel,
    xmlPriceUsd,
    manualOverrideTry,
    product,
    platformPolicy,
    usdTryRate,
  } = input;

  // ── Price resolution ────────────────────────────────────────────────────
  const xmlPriceTry = xmlPriceUsd != null && xmlPriceUsd > 0
    ? xmlPriceUsd * usdTryRate
    : null;

  let effectivePriceTry: number | null;
  let priceSource: PriceSource;

  if (manualOverrideTry != null && manualOverrideTry > 0) {
    effectivePriceTry = manualOverrideTry;
    priceSource = "manual";
  } else if (xmlPriceTry != null) {
    effectivePriceTry = xmlPriceTry;
    priceSource = "xml";
  } else {
    effectivePriceTry = null;
    priceSource = "none";
  }

  // ── Policy (commission, payment fee, return reserve, VAT) ──────────────
  const policy = resolveMarginPolicy(product, platformPolicy);

  // ── Shipping ─────────────────────────────────────────────────────────────
  let shippingTry: number;
  let shippingSource: PolicySource | "price_tier";

  if (policy.shippingSource !== "system_default") {
    // Product or platform has an explicit shipping value — honour it
    shippingTry = policy.shippingTry;
    shippingSource = policy.shippingSource;
  } else if (effectivePriceTry != null) {
    // Fall back to roadmap price-tier table
    shippingTry = calcShippingFromPriceTiers(effectivePriceTry, usdTryRate);
    shippingSource = "price_tier";
  } else {
    shippingTry = 0;
    shippingSource = "system_default";
  }

  // ── Derived amounts ─────────────────────────────────────────────────────
  if (effectivePriceTry == null) {
    return {
      platform,
      platformLabel,
      xmlPriceTry,
      manualOverrideTry,
      effectivePriceTry: null,
      priceSource,
      shippingTry,
      shippingSource,
      commissionPct: policy.commissionPct,
      commissionSource: policy.commissionSource,
      commissionTry: 0,
      paymentFeeTry: 0,
      returnReserveTry: 0,
      netRevenueTry: null,
      netMarginPct: null,
      hasData: false,
    };
  }

  const commissionTry   = (effectivePriceTry * policy.commissionPct)    / 100;
  const paymentFeeTry   = (effectivePriceTry * policy.paymentFeePct)     / 100;
  const returnReserveTry = (effectivePriceTry * policy.returnReservePct) / 100;
  const netRevenueTry   = effectivePriceTry - shippingTry - commissionTry - paymentFeeTry - returnReserveTry;
  const netMarginPct    = effectivePriceTry > 0
    ? (netRevenueTry / effectivePriceTry) * 100
    : null;

  return {
    platform,
    platformLabel,
    xmlPriceTry,
    manualOverrideTry,
    effectivePriceTry,
    priceSource,
    shippingTry,
    shippingSource,
    commissionPct: policy.commissionPct,
    commissionSource: policy.commissionSource,
    commissionTry,
    paymentFeeTry,
    returnReserveTry,
    netRevenueTry,
    netMarginPct,
    hasData: true,
  };
}

// ── Label helpers ────────────────────────────────────────────────────────────

export function priceSourceLabel(source: PriceSource): string {
  switch (source) {
    case "manual": return "Manuel";
    case "xml":    return "XML";
    case "none":   return "Veri yok";
  }
}

export function priceSourceColor(source: PriceSource): string {
  switch (source) {
    case "manual": return "bg-blue-100 text-blue-700";
    case "xml":    return "bg-slate-100 text-slate-600";
    case "none":   return "bg-amber-100 text-amber-700";
  }
}

export function shippingSourceLabel(source: PolicySource | "price_tier"): string {
  if (source === "price_tier") return "Fiyat Dilimi";
  return policySourceLabel(source);
}

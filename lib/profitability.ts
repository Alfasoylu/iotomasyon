/**
/**
 * Phase 8 — Profitability Engine
 *
 * NOT: Yeni callers `lib/pricing-engine.ts:computeProductEconomics()` tercih
 * etmeli. Bu motor sadece retail/wholesale/marketplace çoklu kanal
 * karşılaştırması yapan eski callers (ProductForm, sales-potential) için
 * korunuyor. Tek-kanal pazaryeri hesabı için pricing-engine kullanın.
 *
 * Pure calculation module. No DB access, no server-only imports.
 * All inputs are numbers (convert Decimal before passing).
 *
 * Channel assumptions:
 *   retail      — direct sale, no marketplace commission, no payment fee
 *   wholesale   — direct sale, no marketplace commission, lower price
 *   marketplace — commission + payment fee + return reserve apply
 *
 * KDV (VAT) yaklaşımı:
 *   Fiyatlar KDV dahil tutardır (Türk perakende standardı). Trendyol
 *   komisyonu da KDV dahil tutar üzerinden kesilir. Buna göre kâr/marj
 *   hesabı da KDV dahil tutar üzerinden yapılır — KDV cash-flow açısından
 *   "düşülen maliyet" değildir, sadece devlete aktarılan tutardır.
 *
 *   `vatAmt` alanı bilgi amaçlı korunur (raporlama için), ama netRevenue ve
 *   netProfit hesabında KDV çıkarılmaz.
 *
 *   netRevenue = price (KDV dahil)
 *   netProfit  = price − unitCost − shipping − commission − paymentFee − returnReserve
 *
 * Default rates (used when product fields are null):
 *   vatRate           = 20 %   (sadece vatAmt bilgisi için)
 *   paymentFeeRate    = 0 %    (direct channels have no payment fee by default)
 *   returnReserveRate = 0 %
 *   marketplaceCommission = 20 %
 */

export type ChannelResult = {
  revenue: number;          // selling price (KDV dahil)
  vatAmt: number;           // informational: KDV portion (devlete aktarılan)
  netRevenue: number;       // = revenue (KDV dahil, kâr hesabında bu kullanılır)
  unitCost: number;         // unit cost TRY
  shippingCost: number;     // shipping + packaging
  commissionAmt: number;    // marketplace commission (KDV dahil tutar üzerinden)
  paymentAmt: number;       // payment processing fee
  returnAmt: number;        // return/defect reserve
  totalCosts: number;       // sum of all costs
  netProfit: number;        // revenue - totalCosts (KDV ekstrelenmez)
  margin: number;           // netProfit / revenue * 100
  roi: number | null;       // netProfit / unitCost * 100 (null if unitCost = 0)
  profitable: boolean;
};

export type ProfitabilityResult = {
  retail: ChannelResult | null;      // null if sellingPriceTry not set
  wholesale: ChannelResult | null;   // null if wholesalePriceTry not set
  marketplace: ChannelResult | null; // null if marketplacePriceTry not set
  unitCost: number;
  shippingCost: number;
  packagingCostAmt: number;
};

export type ProfitabilityInput = {
  unitCostTry?: number | null;
  sellingPriceTry?: number | null;
  wholesalePriceTry?: number | null;
  marketplacePriceTry?: number | null;
  shippingCost?: number | null;
  shippingCostOverride?: number | null;
  marketplaceCommission?: number | null;
  marketplaceCommissionOverride?: number | null;
  packagingCost?: number | null;
  vatRate?: number | null;
  paymentFeeRate?: number | null;
  returnReserveRate?: number | null;
};

function n(v: number | null | undefined, fallback = 0): number {
  if (v == null || !isFinite(v)) return fallback;
  return v;
}

function channelResult(
  price: number,
  unitCost: number,
  shippingTotal: number,
  commissionPct: number,
  paymentPct: number,
  returnPct: number,
  vatPct: number,
): ChannelResult {
  // vatAmt: bilgi amaçlı (KDV içeriği). Kâr hesabında ÇIKARILMAZ —
  // Trendyol komisyonu KDV dahil tutar üzerinden kesildiği için
  // kâr/marj da KDV dahil tutar üzerinden hesaplanır.
  const vatAmt = price * vatPct / (100 + vatPct);
  const netRevenue = price; // KDV dahil
  const commissionAmt = price * commissionPct / 100;
  const paymentAmt = price * paymentPct / 100;
  const returnAmt = price * returnPct / 100;
  const totalCosts = unitCost + shippingTotal + commissionAmt + paymentAmt + returnAmt;
  const netProfit = netRevenue - totalCosts;
  const margin = price > 0 ? (netProfit / price) * 100 : 0;
  const roi = unitCost > 0 ? (netProfit / unitCost) * 100 : null;
  return {
    revenue: price,
    vatAmt,
    netRevenue,
    unitCost,
    shippingCost: shippingTotal,
    commissionAmt,
    paymentAmt,
    returnAmt,
    totalCosts,
    netProfit,
    margin,
    roi,
    profitable: netProfit > 0,
  };
}

export function calculateProfitability(input: ProfitabilityInput): ProfitabilityResult {
  const unitCost = n(input.unitCostTry);
  const shipping = n(input.shippingCostOverride ?? input.shippingCost);
  const packaging = n(input.packagingCost);
  const shippingTotal = shipping + packaging;
  const commissionPct = n(input.marketplaceCommissionOverride ?? input.marketplaceCommission, 20);
  const vatPct = n(input.vatRate, 20);
  const paymentPct = n(input.paymentFeeRate, 0);
  const returnPct = n(input.returnReserveRate, 0);

  const retailPrice = n(input.sellingPriceTry);
  const wholesalePrice = n(input.wholesalePriceTry);
  const marketplacePrice = n(input.marketplacePriceTry);

  return {
    unitCost,
    shippingCost: shipping,
    packagingCostAmt: packaging,
    retail:
      retailPrice > 0
        ? channelResult(retailPrice, unitCost, shippingTotal, 0, 0, 0, vatPct)
        : null,
    wholesale:
      wholesalePrice > 0
        ? channelResult(wholesalePrice, unitCost, shippingTotal, 0, 0, 0, vatPct)
        : null,
    marketplace:
      marketplacePrice > 0
        ? channelResult(marketplacePrice, unitCost, shippingTotal, commissionPct, paymentPct, returnPct, vatPct)
        : null,
  };
}

/** Returns true if any channel has calculable results showing a loss */
export function isLosingProduct(result: ProfitabilityResult): boolean {
  return (
    (result.retail != null && !result.retail.profitable) ||
    (result.wholesale != null && !result.wholesale.profitable) ||
    (result.marketplace != null && !result.marketplace.profitable)
  );
}

/** Returns true if any channel result exists (at least one price is set) */
export function hasProfitabilityData(result: ProfitabilityResult): boolean {
  return result.retail != null || result.wholesale != null || result.marketplace != null;
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatPct(value: number): string {
  return `%${value.toFixed(1)}`;
}

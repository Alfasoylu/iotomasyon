/**
 * lib/pricing-engine.ts — Birleşik Fiyatlandırma & Kârlılık Motoru
 *
 * Tek üst seviye giriş noktası: bir ürün için tüm finansal göstergeleri
 * (maliyet, gelir, kâr, marj, ROI) hem TL hem USD cinsinden döner.
 *
 * Arka planda 2 kanonik altmodül kullanır:
 *   - lib/importer-cost.ts        — İthalat maliyet hesabı (RMB → USD/TL)
 *   - lib/marketplace-pricing.ts  — Pazaryeri gelir hesabı (kargo dilim,
 *                                    komisyon hiyerarşi, fee, iade)
 *
 * Tüm KDV mantığı `lib/profitability.ts` ile aynı (KDV dahil cash-flow
 * yaklaşımı — Trendyol komisyonu KDV dahil tutar üzerinden alındığı için
 * kâr da KDV dahil tutar üzerinden hesaplanır; KDV bilgi amaçlı tutulur).
 *
 * NEDEN VAR:
 *   Önceden 4 ayrı motor (importer-cost / marketplace-pricing / profitability
 *   / import-decision) birbiriyle hafifçe farklı varsayımlarla çalışıyordu;
 *   tutarsızlık bug'larına yol açıyordu. Bu motor onları tek API altında
 *   birleştirir. Yeni feature/sayfalar bu motoru kullanmalı.
 *
 *   Mevcut alt motorlar artık birbiriyle tutarlı (kargo dilimi aynı, KDV
 *   mantığı aynı). Bu yüzden bu engine bir "wrapper" — onları ayrı ayrı
 *   çağırıp sonuçları tek pakete koyar.
 */

import { calcImportCost, calcRevenue, type ShippingMethod } from "./importer-cost";
import {
  calcMarketplacePricingRow,
  type ProductPolicyInput,
  type PlatformPolicyInput,
} from "./marketplace-pricing";

// ── Input ─────────────────────────────────────────────────────────────────

export interface PricingInput {
  /** RMB cinsinden alış (Çin tedarikçi fiyatı). */
  sourceCostRmb: number | null;
  weightKg: number | null;
  /** Gümrük oranı yüzde (örn 30). DB'de yoksa default 30 kullanılır. */
  customsRatePct: number | null;
  /** Ödeme/wire fee yüzde, RMB alıma eklenir. */
  importPaymentFeePct: number | null;
  /** "AIR" | "SEA" | null (null → ağırlık ≥5kg → SEA, değilse AIR). */
  shippingMethodPref: string | null;

  /** Pazaryeri satış fiyatı (TL, KDV dahil). */
  marketplacePriceTry: number | null;
  /**
   * XML'den gelen USD fiyatı (override yoksa kur ile çevrilir). Hem manuel
   * hem XML varsa manuel öncelikli olur.
   */
  xmlPriceUsd: number | null;

  /** Ürüne özel kargo override (TL). null → fiyat dilimi tablosu. */
  productPolicy: ProductPolicyInput;
  /** Platform politikası (komisyon, ödeme fee, iade rezervi vb). */
  platformPolicy: PlatformPolicyInput;

  /** Güncel kurlar — DB'den okunmalı. */
  rmbUsdRate: number;
  usdTryRate: number;
}

// ── Output ────────────────────────────────────────────────────────────────

export interface PricingResult {
  // ── İthalat (cost side) ────────────────────────────────────────────────
  cost: {
    shippingMethod: ShippingMethod;     // AIR | SEA
    productUsd: number;                  // RMB alış (+ payment fee) USD
    freightUsd: number;                  // hava/deniz kargo USD
    customsUsd: number;                  // gümrük USD
    totalCostUsd: number;                // toplam iniş maliyeti USD
    totalCostTry: number;                // = totalCostUsd × usdTryRate
  } | null;

  // ── Pazaryeri (revenue side) ───────────────────────────────────────────
  revenue: {
    effectivePriceTry: number;           // KDV dahil etkin satış fiyatı
    shippingTry: number;                 // platform kargo kesintisi (TL)
    commissionPct: number;               // uygulanan komisyon %
    commissionTry: number;               // komisyon TL (KDV dahil tutardan)
    paymentFeeTry: number;               // ödeme fee TL
    returnReserveTry: number;            // iade rezervi TL
    netRevenueTry: number;               // ne kalır TL (KDV dahil)
    netRevenueUsd: number;               // = netRevenueTry / usdTryRate
  } | null;

  // ── Birleşik kâr & marj ────────────────────────────────────────────────
  profit: {
    netProfitTry: number;
    netProfitUsd: number;
    /** netProfitTry / effectivePriceTry × 100 */
    marginPct: number;
    /** netProfitUsd / totalCostUsd × 100 (sermaye getirisi, USD bazlı) */
    roiPct: number;
    /** Aylık döngü dikkate alarak yıllık birleşik ROI */
    annualRoiPct: number;
  } | null;

  /** KDV bilgisi (cash-flow kâr hesabında düşülmez, sadece raporlama için) */
  vatInfoTry: number;
  /** Uyarı/eksiklik mesajları */
  warnings: string[];
}

// ── Ana fonksiyon ─────────────────────────────────────────────────────────

/**
 * Bir ürün için tüm finansal göstergeleri hesaplar.
 *
 * Cost/revenue/profit blokları null olabilir (gerekli input eksikse). Bu
 * durumda `warnings` dizisi neyin eksik olduğunu söyler.
 */
export function computeProductEconomics(input: PricingInput): PricingResult {
  const warnings: string[] = [];

  // ── Cost side ─────────────────────────────────────────────────────────
  const costResult = calcImportCost({
    sourceCostRmb: input.sourceCostRmb,
    weightKg: input.weightKg,
    customsRatePct: input.customsRatePct,
    importPaymentFeePct: input.importPaymentFeePct,
    shippingMethodPref: input.shippingMethodPref,
    rmbUsdRate: input.rmbUsdRate,
  });

  if (!costResult) {
    if (input.sourceCostRmb == null) warnings.push("RMB alış fiyatı eksik");
    if (input.weightKg == null) warnings.push("Ağırlık eksik");
  }

  const cost = costResult
    ? {
        ...costResult,
        totalCostTry: costResult.totalCostUsd * input.usdTryRate,
      }
    : null;

  // ── Revenue side ──────────────────────────────────────────────────────
  const mpRow = calcMarketplacePricingRow({
    platform: "TRENDYOL",
    platformLabel: "Trendyol",
    xmlPriceUsd: input.xmlPriceUsd,
    manualOverrideTry: input.marketplacePriceTry,
    product: input.productPolicy,
    platformPolicy: input.platformPolicy,
    usdTryRate: input.usdTryRate,
  });

  if (!mpRow.hasData) {
    warnings.push("Pazaryeri fiyatı eksik (XML veya manuel)");
  }

  const revenue = mpRow.hasData && mpRow.netRevenueTry != null
    ? {
        effectivePriceTry: mpRow.effectivePriceTry!,
        shippingTry: mpRow.shippingTry,
        commissionPct: mpRow.commissionPct,
        commissionTry: mpRow.commissionTry,
        paymentFeeTry: mpRow.paymentFeeTry,
        returnReserveTry: mpRow.returnReserveTry,
        netRevenueTry: mpRow.netRevenueTry,
        netRevenueUsd: mpRow.netRevenueTry / input.usdTryRate,
      }
    : null;

  // ── Profit (her iki blok da varsa) ────────────────────────────────────
  let profit: PricingResult["profit"] = null;
  if (cost && revenue) {
    const netProfitTry = revenue.netRevenueTry - cost.totalCostTry;
    const netProfitUsd = netProfitTry / input.usdTryRate;
    const marginPct = revenue.effectivePriceTry > 0
      ? (netProfitTry / revenue.effectivePriceTry) * 100
      : 0;
    const roiPct = cost.totalCostUsd > 0
      ? (netProfitUsd / cost.totalCostUsd) * 100
      : 0;
    // Yıllık birleşik ROI: nakit döngüsü AIR=120g / SEA=210g
    const cycleDays = cost.shippingMethod === "SEA" ? 210 : 120;
    const ratio = cost.totalCostUsd > 0
      ? revenue.netRevenueUsd / cost.totalCostUsd
      : 0;
    const annualRoiPct = (Math.pow(Math.max(ratio, 0.001), 365 / cycleDays) - 1) * 100;

    profit = { netProfitTry, netProfitUsd, marginPct, roiPct, annualRoiPct };
  }

  // ── KDV bilgi (cash-flow'da kullanılmaz, sadece raporlama) ────────────
  const vatPct = input.platformPolicy?.vatPct ?? 20;
  const vatInfoTry = revenue
    ? (revenue.effectivePriceTry * vatPct) / (100 + vatPct)
    : 0;

  return { cost, revenue, profit, vatInfoTry, warnings };
}

// Convenience: legacy importer-cost.ts ile uyumluluk için re-export
export { calcRevenue, calcImportCost } from "./importer-cost";
export { calcMarketplacePricingRow, calcShippingFromPriceTiers } from "./marketplace-pricing";

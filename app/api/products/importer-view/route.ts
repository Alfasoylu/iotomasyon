/**
 * Phase 79 — İthalatçı Görünümü API
 *
 * GET /api/products/importer-view
 *
 * ADMIN-ONLY endpoint. Returns enriched product data for the importer table.
 * Non-admin users receive 403. Sensitive fields (cost, profit, ROI) are NEVER
 * returned to non-admin users — this is enforced at the data source, not the UI.
 *
 * Returns: ImporterProduct[] — fully computed, ready to render
 */

import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession, isOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  calcImportCost,
  calcRevenue,
  calcProfit,
  calcStockDays,
  calcHealthScore,
  DEFAULT_RMB_USD_RATE,
  DEFAULT_USD_TRY_RATE,
} from "@/lib/importer-cost";
import {
  forecastMonthlySales,
  buildMonthlySalesMap,
  effectiveMonthlyUnits as pickEffectiveMonthly,
} from "@/lib/sales-forecast";

export const dynamic = "force-dynamic";

export type ImporterProduct = {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  imageUrl: string | null;
  productKind: string;

  // Prices
  trendyolPriceTry: number | null;
  bayiPriceUsd: number | null;

  // Stock
  stockQuantity: number;
  minimumStock: number;
  t30g: number;
  /** Trendyol'da bu ürünün tüm zamanlardaki toplam satış adedi (iptaller hariç) */
  lifetimeTotalQty: number;

  // Import inputs
  sourceCostRmb: number | null;
  weightKg: number | null;
  shippingMethodPref: string | null;
  customsRatePct: number | null;
  importPaymentFeePct: number | null;

  // Phase 9 + Phase 90 + Phase 92 — Marketplace monthly sales estimate (units/month).
  // `onlineSalesPotential` is the raw DB value (null = not entered).
  // `forecastMonthlyUnits` = system tahmini (tüm 14 kanal × 5 yıl, recency-weighted
  //   + mevsimsel düzeltme). Detay: lib/sales-forecast.ts
  // `effectiveMonthlyUnits` = max(forecast, manuel onlineSalesPotential).
  //   stockDays / decisionLabel / Aylık Kâr bu sinyali kullanır.
  onlineSalesPotential: number | null;
  forecastMonthlyUnits: number;
  forecastFormula: string;
  effectiveMonthlyUnits: number;

  // Computed cost breakdown
  shippingMethod: "AIR" | "SEA" | null;
  productUsd: number | null;
  freightUsd: number | null;
  customsUsd: number | null;
  totalCostUsd: number | null;

  // Computed profit
  netRevenueTry: number | null;
  netRevenueUsd: number | null;
  netProfitUsd: number | null;
  marginPct: number | null;
  annualRoiPct: number | null;

  // Derived
  stockDays: number | null;
  healthScore: number;

  // Flags
  hasCost: boolean;
  hasTrendyolPrice: boolean;
  hasBayiPrice: boolean;
};

export async function GET(_req: NextRequest) {
  // ── Security: ADMIN only ───────────────────────────────────────────────────
  const user = await getCurrentSession();
  if (!user) {
    return NextResponse.json({ error: "Oturum açılmamış" }, { status: 401 });
  }
  if (user.role !== "ADMIN" && !isOwner(user)) {
    return NextResponse.json({ error: "Bu veriye erişim yetkiniz yok" }, { status: 403 });
  }

  // ── Fetch exchange rates ───────────────────────────────────────────────────
  const latestRate = await prisma.monthlyExchangeRate.findFirst({
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { usdTryRate: true, rmbUsdRate: true },
  });
  const usdTryRate = latestRate?.usdTryRate ? Number(latestRate.usdTryRate) : DEFAULT_USD_TRY_RATE;
  const rmbUsdRate = latestRate?.rmbUsdRate ? Number(latestRate.rmbUsdRate) : DEFAULT_RMB_USD_RATE;

  // ── Fetch products ─────────────────────────────────────────────────────────
  const products = await prisma.product.findMany({
    where: { isActive: true },
    orderBy: [{ name: "asc" }],
    include: {
      images: { take: 1, orderBy: { sortOrder: "asc" }, select: { url: true } },
      xmlData: {
        select: {
          xmlTrendyolPrice: true,
          xmlBayiPrice: true,
        },
      },
      marketplacePrices: {
        where: { marketplace: "TRENDYOL" },
        select: { priceTry: true },
        take: 1,
      },
    },
  });

  // ── Fetch unified monthly sales (tüm 14 kanal + Trendyol API) ────────────
  // Phase 92: MarketplaceSalesRecord (Entegra ihracı tarihçe) + TrendyolSalesRecord
  // (API son ~3 ay) + HepsiburadaSalesRecord (boş ama defensive). UNION sonrası
  // productId × ay bazında SUM(quantity), iptal/iade filtrelenir.
  const monthlyRows = await prisma.$queryRaw<
    Array<{ productId: string; month: Date; units: bigint }>
  >`
    SELECT
      "productId",
      DATE_TRUNC('month', "orderDate")::date AS month,
      SUM("quantity")::bigint AS units
    FROM (
      SELECT "productId", "orderDate", "quantity", "status"
        FROM "MarketplaceSalesRecord"
        WHERE "productId" IS NOT NULL
      UNION ALL
      SELECT "productId", "orderDate", "quantity", "status"
        FROM "TrendyolSalesRecord"
        WHERE "productId" IS NOT NULL
      UNION ALL
      SELECT "productId", "orderDate", "quantity", "status"
        FROM "HepsiburadaSalesRecord"
        WHERE "productId" IS NOT NULL
    ) combined
    WHERE "status" IS NULL
       OR ("status" NOT ILIKE '%iptal%'
       AND "status" NOT ILIKE '%iade%'
       AND "status" NOT ILIKE '%cancel%')
    GROUP BY "productId", DATE_TRUNC('month', "orderDate")
  `;
  const monthlyByProduct = buildMonthlySalesMap(
    monthlyRows.map((r) => ({ productId: r.productId, month: r.month, units: r.units })),
  );

  // Last 30g (display "T30G" kolonu için — UI'da raw veri kalır)
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const t30gMap = new Map<string, number>();
  const lifetime = new Map<string, number>();
  // Walk monthly buckets to compute t30g approximation (within-month) and lifetime
  // Note: t30g here is approximate (month-bucket granular, ≈last full month).
  // Yeterince doğru çünkü tahmin motoru zaten daha iyi sinyal üretiyor.
  for (const [pid, m] of monthlyByProduct) {
    let lt = 0;
    let t30 = 0;
    const thirtyAgoKey = thirtyDaysAgo.toISOString().slice(0, 7);
    for (const [k, units] of m) {
      lt += units;
      if (k >= thirtyAgoKey) t30 += units;
    }
    t30gMap.set(pid, t30);
    lifetime.set(pid, lt);
  }

  // ── Compute per product ────────────────────────────────────────────────────
  const result: ImporterProduct[] = products.map((p) => {
    // Resolve Trendyol price TRY
    const trendyolPriceTry: number | null =
      p.marketplacePrices[0]?.priceTry != null
        ? Number(p.marketplacePrices[0].priceTry)
        : p.xmlData?.xmlTrendyolPrice != null
          ? Number(p.xmlData.xmlTrendyolPrice) * usdTryRate
          : null;

    const bayiPriceUsd: number | null =
      p.xmlData?.xmlBayiPrice != null ? Number(p.xmlData.xmlBayiPrice) : null;

    const t30g = t30gMap.get(p.id) ?? 0;
    // Phase 92: Demand sinyali artık tüm 14 kanaldan + 5 yıllık tarihçeden
    // hesaplanır. forecast = recency-weighted (90d/365d/lifetime) + mevsimsel.
    // effective = max(forecast, manuel kullanıcı tahmini).
    const monthlyMap = monthlyByProduct.get(p.id) ?? new Map<string, number>();
    const forecast = forecastMonthlySales(monthlyMap, now);
    const effectiveT30g = pickEffectiveMonthly(forecast, p.onlineSalesPotential);

    // Import cost — Phase 92: otomatik kargo seçimi ROI bazlı yapılır (pref null
    // ise). Trendyol fiyatı + kur passlanır.
    const costResult = calcImportCost({
      sourceCostRmb: p.sourceCostRmb != null ? Number(p.sourceCostRmb) : null,
      weightKg: p.weightKg != null ? Number(p.weightKg) : null,
      customsRatePct: p.customsRatePct != null ? Number(p.customsRatePct) : null,
      importPaymentFeePct: p.importPaymentFeePct != null ? Number(p.importPaymentFeePct) : null,
      shippingMethodPref: p.shippingMethodPref,
      rmbUsdRate,
      trendyolPriceTry,
      usdTryRate,
    });

    // Revenue
    const revenueResult = calcRevenue({ trendyolPriceTry, usdTryRate });

    // Profit
    const profitResult =
      costResult && revenueResult ? calcProfit(costResult, revenueResult) : null;

    // Stock days — Phase 90: use effectiveT30g (max of Trendyol vs manuel)
    const stockDays = calcStockDays(p.stockQuantity, effectiveT30g);

    // Health score — Phase 90: same demand semantic for consistency
    const healthScore = calcHealthScore({
      hasRmb: p.sourceCostRmb != null,
      hasWeight: p.weightKg != null,
      hasTrendyolPrice: trendyolPriceTry != null,
      netProfitUsd: profitResult?.netProfitUsd ?? null,
      marginPct: profitResult?.marginPct ?? null,
      t30g: effectiveT30g,
      stockDays,
    });

    const imageUrl = p.images[0]?.url ?? p.imageUrl ?? null;

    return {
      id: p.id,
      sku: p.sku ?? "",
      name: p.name,
      brand: p.brand,
      barcode: p.barcode,
      imageUrl,
      productKind: p.productKind,

      trendyolPriceTry,
      bayiPriceUsd,

      stockQuantity: p.stockQuantity,
      minimumStock: p.minimumStock,
      t30g,
      lifetimeTotalQty: lifetime.get(p.id) ?? 0,

      sourceCostRmb: p.sourceCostRmb != null ? Number(p.sourceCostRmb) : null,
      weightKg: p.weightKg != null ? Number(p.weightKg) : null,
      shippingMethodPref: p.shippingMethodPref,
      customsRatePct: p.customsRatePct != null ? Number(p.customsRatePct) : null,
      importPaymentFeePct: p.importPaymentFeePct != null ? Number(p.importPaymentFeePct) : null,

      onlineSalesPotential: p.onlineSalesPotential,
      // Phase 92: demand sinyali = max(forecast, manuel onlineSalesPotential).
      // forecast tüm 14 kanaldan + 5 yıllık tarihçeden recency-weighted + mevsimsel
      // düzeltmeyle hesaplanır (lib/sales-forecast.ts).
      forecastMonthlyUnits: forecast.monthlyUnits,
      forecastFormula: forecast.formula,
      effectiveMonthlyUnits: effectiveT30g,

      shippingMethod: costResult?.shippingMethod ?? null,
      productUsd: costResult?.productUsd ?? null,
      freightUsd: costResult?.freightUsd ?? null,
      customsUsd: costResult?.customsUsd ?? null,
      totalCostUsd: costResult?.totalCostUsd ?? null,

      netRevenueTry: revenueResult?.netRevenueTry ?? null,
      netRevenueUsd: revenueResult?.netRevenueUsd ?? null,
      netProfitUsd: profitResult?.netProfitUsd ?? null,
      marginPct: profitResult?.marginPct ?? null,
      annualRoiPct: profitResult?.annualRoiPct ?? null,

      stockDays,
      healthScore,

      hasCost: costResult !== null,
      hasTrendyolPrice: trendyolPriceTry !== null,
      hasBayiPrice: bayiPriceUsd !== null,
    };
  });

  return NextResponse.json({ products: result, usdTryRate, rmbUsdRate });
}

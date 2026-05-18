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

  // Import inputs
  sourceCostRmb: number | null;
  weightKg: number | null;
  shippingMethodPref: string | null;
  customsRatePct: number | null;
  importPaymentFeePct: number | null;

  // Phase 9 — Marketplace monthly sales estimate (units/month).
  // `onlineSalesPotential` is the raw DB value (null = not entered).
  // `effectiveMonthlyUnits` is what calculations should use — null falls back to 1
  // (the documented default for products without a recorded monthly sales figure).
  onlineSalesPotential: number | null;
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

  // ── Fetch T30G velocity ────────────────────────────────────────────────────
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const salesRecords = await prisma.trendyolSalesRecord.findMany({
    where: {
      orderDate: { gte: thirtyDaysAgo },
      productId: { not: null },
      NOT: [
        { status: { contains: "iptal", mode: "insensitive" } },
        { status: { contains: "cancel", mode: "insensitive" } },
      ],
    },
    select: { productId: true, quantity: true },
  });

  const velocity = new Map<string, number>();
  for (const r of salesRecords) {
    if (r.productId) {
      velocity.set(r.productId, (velocity.get(r.productId) ?? 0) + r.quantity);
    }
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

    const t30g = velocity.get(p.id) ?? 0;

    // Import cost
    const costResult = calcImportCost({
      sourceCostRmb: p.sourceCostRmb != null ? Number(p.sourceCostRmb) : null,
      weightKg: p.weightKg != null ? Number(p.weightKg) : null,
      customsRatePct: p.customsRatePct != null ? Number(p.customsRatePct) : null,
      importPaymentFeePct: p.importPaymentFeePct != null ? Number(p.importPaymentFeePct) : null,
      shippingMethodPref: p.shippingMethodPref,
      rmbUsdRate,
    });

    // Revenue
    const revenueResult = calcRevenue({ trendyolPriceTry, usdTryRate });

    // Profit
    const profitResult =
      costResult && revenueResult ? calcProfit(costResult, revenueResult) : null;

    // Stock days
    const stockDays = calcStockDays(p.stockQuantity, t30g);

    // Health score
    const healthScore = calcHealthScore({
      hasRmb: p.sourceCostRmb != null,
      hasWeight: p.weightKg != null,
      hasTrendyolPrice: trendyolPriceTry != null,
      netProfitUsd: profitResult?.netProfitUsd ?? null,
      marginPct: profitResult?.marginPct ?? null,
      t30g,
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

      sourceCostRmb: p.sourceCostRmb != null ? Number(p.sourceCostRmb) : null,
      weightKg: p.weightKg != null ? Number(p.weightKg) : null,
      shippingMethodPref: p.shippingMethodPref,
      customsRatePct: p.customsRatePct != null ? Number(p.customsRatePct) : null,
      importPaymentFeePct: p.importPaymentFeePct != null ? Number(p.importPaymentFeePct) : null,

      onlineSalesPotential: p.onlineSalesPotential,
      // Default 1 unit/month for marketplace channel when not explicitly entered.
      effectiveMonthlyUnits: p.onlineSalesPotential ?? 1,

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

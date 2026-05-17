"use server";

import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import {
  calculateImportDecision,
  DEFAULT_USD_TRY_RATE,
  effectiveFreightPerKg,
} from "@/lib/import-decision";
import type { ActionResult } from "@/types/actions";

/**
 * Phase 32 — Import Decision Snapshot
 *
 * Freezes all import decision inputs + computed outputs for a product at the
 * current exchange rate. Historical decisions remain explainable after rates change.
 */
export async function createImportDecisionSnapshotAction(
  productId: string,
  notes?: string,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXECUTIVE_READ))) {
    return { ok: false, message: "Bu işlem için yetkiniz yok." };
  }

  // Load product
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      importUnitCostUsd: true,
      unitCostUsd: true,
      sourceCostRmb: true,
      importPaymentFeePct: true,
      weightKg: true,
      customsRatePct: true,
      shippingMethodPref: true,
      sellingPriceTry: true,
      marketplacePriceTry: true,
      shippingCost: true,
      shippingCostOverride: true,
      marketplaceCommission: true,
      marketplaceCommissionOverride: true,
      onlineSalesPotential: true,
      wholesaleSalesPotential: true,
      installerSalesPotential: true,
      supplierLinks: {
        where: { isPreferred: true },
        take: 1,
        select: {
          supplierId: true,
          supplier: {
            select: {
              defaultAirFreightUsdPerKg: true,
              defaultSeaFreightUsdPerKg: true,
              defaultPaymentFeePct: true,
            },
          },
        },
      },
    },
  });

  if (!product) return { ok: false, message: "Ürün bulunamadı." };

  // Load latest exchange rate
  const latestRate = await prisma.monthlyExchangeRate.findFirst({
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  const usdTryRate = latestRate ? Number(latestRate.usdTryRate) : DEFAULT_USD_TRY_RATE;
  const rmbUsdRate = latestRate?.rmbUsdRate != null ? Number(latestRate.rmbUsdRate) : null;

  // Resolve preferred supplier for freight overrides
  const preferredLink = product.supplierLinks[0] ?? null;
  const preferredSupplierId = preferredLink?.supplierId ?? null;
  const supplierAirFreight = preferredLink?.supplier?.defaultAirFreightUsdPerKg != null
    ? Number(preferredLink.supplier.defaultAirFreightUsdPerKg)
    : null;
  const supplierSeaFreight = preferredLink?.supplier?.defaultSeaFreightUsdPerKg != null
    ? Number(preferredLink.supplier.defaultSeaFreightUsdPerKg)
    : null;

  // Resolve source USD price (prefer importUnitCostUsd then unitCostUsd)
  const sourcePriceUsd = product.importUnitCostUsd != null
    ? Number(product.importUnitCostUsd)
    : product.unitCostUsd != null
      ? Number(product.unitCostUsd)
      : null;

  const monthlyUnits =
    (product.onlineSalesPotential ?? 0) +
    (product.wholesaleSalesPotential ?? 0) +
    (product.installerSalesPotential ?? 0) || null;

  const sellingPriceTry = product.marketplacePriceTry != null
    ? Number(product.marketplacePriceTry)
    : product.sellingPriceTry != null
      ? Number(product.sellingPriceTry)
      : null;

  const commissionPct = product.marketplaceCommissionOverride != null
    ? Number(product.marketplaceCommissionOverride)
    : product.marketplaceCommission != null
      ? Number(product.marketplaceCommission)
      : null;

  const domesticShippingTry = product.shippingCostOverride != null
    ? Number(product.shippingCostOverride)
    : product.shippingCost != null
      ? Number(product.shippingCost)
      : null;

  const decision = calculateImportDecision({
    sourcePriceUsd,
    sourceCostRmb: product.sourceCostRmb != null ? Number(product.sourceCostRmb) : null,
    rmbUsdRate,
    importPaymentFeePct: product.importPaymentFeePct != null ? Number(product.importPaymentFeePct) : null,
    weightKg: product.weightKg != null ? Number(product.weightKg) : null,
    customsRatePct: product.customsRatePct != null ? Number(product.customsRatePct) : null,
    shippingMethodPref: product.shippingMethodPref ?? null,
    sellingPriceTry,
    commissionPct,
    domesticShippingTry,
    usdTryRate,
    monthlyUnits,
    airFreightPerKgOverride: supplierAirFreight,
    seaFreightPerKgOverride: supplierSeaFreight,
  });

  if (!decision.hasData || !decision.effectiveScenario || decision.effectiveMethod == null) {
    return {
      ok: false,
      message: `Karar oluşturulamadı — eksik veriler: ${decision.missingFields.join(", ")}`,
    };
  }

  const effectiveAirFreight = effectiveFreightPerKg("AIR", supplierAirFreight);
  const effectiveSeaFreight = effectiveFreightPerKg("SEA", supplierSeaFreight);

  await prisma.importDecisionSnapshot.create({
    data: {
      productId,
      supplierId: preferredSupplierId,
      rateYear: latestRate?.year ?? null,
      rateMonth: latestRate?.month ?? null,
      usdTryRate,
      rmbUsdRate,
      sourceCostRmb: product.sourceCostRmb != null ? Number(product.sourceCostRmb) : null,
      sourcePriceUsd,
      importPaymentFeePct: product.importPaymentFeePct != null ? Number(product.importPaymentFeePct) : null,
      weightKg: product.weightKg != null ? Number(product.weightKg) : null,
      customsRatePct: product.customsRatePct != null ? Number(product.customsRatePct) : null,
      shippingMethodPref: product.shippingMethodPref ?? null,
      airFreightPerKg: effectiveAirFreight,
      seaFreightPerKg: effectiveSeaFreight,
      effectiveSourceUsd: decision.effectiveSourceUsd ?? 0,
      effectiveMethod: decision.effectiveMethod,
      landedCostUsd: decision.effectiveScenario.landedCostUsd,
      profitRatio: decision.effectiveScenario.profitRatio,
      decision: decision.decision,
      score: decision.score,
      notes: notes?.trim() || null,
      createdById: user.id,
    },
  });

  return { ok: true };
}

/** Fetch recent import decision snapshots for a product (latest first, limit 10) */
export async function getProductImportSnapshotsAction(productId: string) {
  return prisma.importDecisionSnapshot.findMany({
    where: { productId },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      createdBy: { select: { name: true } },
      supplier: { select: { name: true } },
    },
  });
}

/**
 * Phase 77 — Yeni Satın Alma Siparişi
 *
 * Pre-fill from capital allocation recommendations via URL params:
 *   ?from=capital  → show allocation suggestions for one-click adding
 *
 * The form passes data to the CreatePurchaseOrderForm client component.
 */

import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { CreatePurchaseOrderForm } from "@/components/purchase-orders/create-purchase-order-form";
import {
  calculateImportDecision,
  DEFAULT_USD_TRY_RATE,
  AIR_FREIGHT_PER_KG,
  SEA_FREIGHT_PER_KG,
} from "@/lib/import-decision";

export const dynamic = "force-dynamic";

export default async function NewPurchaseOrderPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  const sp = await searchParams;
  const fromCapital = sp.from === "capital";

  // Fetch exchange rates, suppliers, and eligible products
  const [latestRate, suppliers, products] = await Promise.all([
    prisma.monthlyExchangeRate.findFirst({
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
    prisma.supplier.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        sku: true,
        stockQuantity: true,
        minimumStock: true,
        sourceCostRmb: true,
        weightKg: true,
        customsRatePct: true,
        importPaymentFeePct: true,
        shippingMethodPref: true,
        importUnitCostUsd: true,
        unitCostUsd: true,
        onlineSalesPotential: true,
        wholesaleSalesPotential: true,
        installerSalesPotential: true,
        marketplacePriceTry: true,
        sellingPriceTry: true,
        marketplacePrices: {
          where: { marketplace: "TRENDYOL" },
          select: { priceTry: true },
          take: 1,
        },
      },
    }),
  ]);

  const usdTryRate = latestRate ? Number(latestRate.usdTryRate) : DEFAULT_USD_TRY_RATE;
  const rmbUsdRate = latestRate?.rmbUsdRate != null ? Number(latestRate.rmbUsdRate) : null;

  type RawProduct = (typeof products)[number];

  type ProductData = {
    id: string; name: string; sku: string;
    stockQuantity: number; minimumStock: number;
    sourceCostRmb: number | null; weightKg: number | null;
    shippingMethod: "AIR" | "SEA"; unitCostTry: number | null;
    monthlyDemand: number; needsReorder: boolean; suggestedQty: number;
  };

  // Build product data with cost estimates
  const productData: ProductData[] = products.map((p: RawProduct) => {
    const rmb = p.sourceCostRmb != null ? Number(p.sourceCostRmb) : null;
    const kg = p.weightKg != null ? Number(p.weightKg) : null;
    const customsPct = p.customsRatePct != null ? Number(p.customsRatePct) : 30;
    const payFeePct = p.importPaymentFeePct != null ? Number(p.importPaymentFeePct) : 0;

    // Resolve shipping method same as products page (Phase 76)
    const prefRaw = p.shippingMethodPref?.toUpperCase() ?? null;
    const shippingMethod: "AIR" | "SEA" =
      prefRaw === "SEA" ? "SEA"
      : prefRaw === "AIR" ? "AIR"
      : kg != null && kg >= 5 ? "SEA"
      : "AIR";

    const freightPerKg = shippingMethod === "SEA" ? SEA_FREIGHT_PER_KG : AIR_FREIGHT_PER_KG;

    // Estimate landed cost per unit in TRY
    let unitCostTry: number | null = null;
    if (rmb != null && rmb > 0 && rmbUsdRate != null && kg != null) {
      const supplierUsd = (rmb / rmbUsdRate) * (1 + payFeePct / 100);
      const cargoUsd = kg * freightPerKg;
      const landedUsd = (supplierUsd + cargoUsd) * (1 + customsPct / 100);
      unitCostTry = Math.round(landedUsd * usdTryRate);
    }

    // Monthly demand for prioritization
    const monthlyDemand =
      (p.onlineSalesPotential ?? 0) +
      (p.wholesaleSalesPotential ?? 0) +
      (p.installerSalesPotential ?? 0);

    // Need to reorder?
    const needsReorder = p.stockQuantity <= p.minimumStock || p.stockQuantity === 0;
    const suggestedQty = needsReorder && monthlyDemand > 0
      ? Math.max(1, Math.ceil(monthlyDemand * 2) - p.stockQuantity)
      : needsReorder
        ? Math.max(1, (p.minimumStock ?? 0) + 1 - p.stockQuantity)
        : 0;

    return {
      id: p.id,
      name: p.name,
      sku: p.sku ?? "",
      stockQuantity: p.stockQuantity,
      minimumStock: p.minimumStock,
      sourceCostRmb: rmb,
      weightKg: kg,
      shippingMethod,
      unitCostTry,
      monthlyDemand,
      needsReorder,
      suggestedQty,
    };
  });

  // Capital allocation suggestions: products that need reorder, sorted by demand
  const suggestions = productData
    .filter((p) => p.needsReorder && p.unitCostTry != null)
    .sort((a, b) => b.monthlyDemand - a.monthlyDemand)
    .slice(0, 30);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Tedarik</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Yeni Satın Alma Siparişi</h1>
        <p className="mt-1 text-sm text-slate-500">
          Kur: <span className="font-semibold">1 USD = ₺{usdTryRate.toFixed(2)}</span>
          {rmbUsdRate && <> · <span className="font-semibold">1 USD = ¥{rmbUsdRate.toFixed(4)}</span></>}
        </p>
      </div>

      <CreatePurchaseOrderForm
        suppliers={suppliers}
        products={productData}
        suggestions={fromCapital ? suggestions : []}
        usdTryRate={usdTryRate}
        rmbUsdRate={rmbUsdRate}
      />
    </div>
  );
}

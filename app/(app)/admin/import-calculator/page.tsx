/**
 * Phase 21 — Import Cost Calculator
 *
 * Pre-purchase landed cost calculator. Uses existing Supplier, SupplierProduct,
 * MonthlyExchangeRate, and Product data — no new DB schema required.
 *
 * Formula:
 *   Total landed cost (USD) = (qty × unitCostUsd) + freightUsd + (productCost × customsRate%)
 *   Unit landed cost (TRY)  = (totalLandedUsd / qty) × exchangeRate
 *   Margin (%)              = (sellingPrice - unitLandedTry) / sellingPrice × 100
 */

import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { ImportCalculatorForm } from "@/components/suppliers/import-calculator-form";

export const dynamic = "force-dynamic";

export default async function ImportCalculatorPage() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  const [suppliers, products, supplierProducts, latestRate] = await Promise.all([
    prisma.supplier.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        sku: true,
        sellingPriceTry: true,
        marketplacePriceTry: true,
        wholesalePriceTry: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.supplierProduct.findMany({
      select: {
        supplierId: true,
        productId: true,
        unitCostUsd: true,
        moq: true,
        leadDays: true,
      },
    }),
    prisma.monthlyExchangeRate.findFirst({
      orderBy: [{ year: "desc" }, { month: "desc" }],
      select: { usdTryRate: true },
    }),
  ]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Yönetim / İthalat Maliyet Hesaplayıcısı
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            İthalat Maliyet Hesaplayıcısı
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Sipariş miktarı, birim maliyet, nakliye ve gümrük üzerinden toplam ithalat maliyetini
            ve kanal bazlı marjı hesaplayın.
          </p>
        </div>
        <Link
          href="/admin/suppliers"
          className="text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          ← Tedarikçiler
        </Link>
      </div>

      {/* How it works */}
      <Card className="border-blue-100 bg-blue-50 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
          Hesaplama Mantığı
        </p>
        <div className="mt-3 grid gap-2 text-xs text-blue-700 sm:grid-cols-2">
          <div>
            <p className="font-semibold">Toplam İthalat Maliyeti (USD)</p>
            <p className="font-mono mt-0.5 text-blue-600">
              = (Adet × Birim Maliyet) + Nakliye + Gümrük Vergisi
            </p>
          </div>
          <div>
            <p className="font-semibold">Birim Başına İthalat Maliyeti (TRY)</p>
            <p className="font-mono mt-0.5 text-blue-600">
              = (Toplam USD / Adet) × USD/TRY Kuru
            </p>
          </div>
          <div>
            <p className="font-semibold">Marj (%)</p>
            <p className="font-mono mt-0.5 text-blue-600">
              = (Satış Fiyatı − Birim Maliyet TRY) / Satış Fiyatı × 100
            </p>
          </div>
          <div>
            <p className="font-semibold">Başa Baş Fiyatı</p>
            <p className="font-mono mt-0.5 text-blue-600">
              = Birim Maliyet TRY × 1.20 (minimum %20 marj)
            </p>
          </div>
        </div>
      </Card>

      {/* Calculator */}
      <Card className="p-6 space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
            Girdiler
          </p>
          <h2 className="mt-1 text-lg font-semibold text-slate-900">Hesaplama Parametreleri</h2>
          <p className="mt-1 text-sm text-slate-500">
            Tedarikçi ve ürün seçilirse birim maliyet otomatik doldurulur.
          </p>
        </div>
        <ImportCalculatorForm
          suppliers={suppliers}
          products={products.map((p) => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            sellingPriceTry: p.sellingPriceTry != null ? Number(p.sellingPriceTry) : null,
            marketplacePriceTry:
              p.marketplacePriceTry != null ? Number(p.marketplacePriceTry) : null,
            wholesalePriceTry: p.wholesalePriceTry != null ? Number(p.wholesalePriceTry) : null,
          }))}
          supplierProducts={supplierProducts.map((sp) => ({
            supplierId: sp.supplierId,
            productId: sp.productId,
            unitCostUsd: sp.unitCostUsd != null ? Number(sp.unitCostUsd) : null,
            moq: sp.moq,
            leadDays: sp.leadDays,
          }))}
          latestRate={latestRate?.usdTryRate != null ? Number(latestRate.usdTryRate) : null}
        />
      </Card>
    </div>
  );
}

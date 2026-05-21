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
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Yönetim / İthalat Maliyet Hesaplayıcısı
          </p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
            İthalat Maliyet Hesaplayıcısı
          </h1>
          <p className="mt-1 text-sm leading-7 text-[var(--text-secondary)]">
            Sipariş miktarı, birim maliyet, nakliye ve gümrük üzerinden toplam ithalat maliyetini
            ve kanal bazlı marjı hesaplayın.
          </p>
        </div>
        <Link
          href="/admin/suppliers"
          className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          ← Tedarikçiler
        </Link>
      </div>

      {/* How it works */}
      <Card className="border-[var(--info-border)] bg-[var(--info-dim)] p-5">
        <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--info)]">
          Hesaplama Mantığı
        </p>
        <div className="mt-3 grid gap-2 text-xs text-[var(--info)] sm:grid-cols-2">
          <div>
            <p className="font-semibold">Toplam İthalat Maliyeti (USD)</p>
            <p className="font-mono tabular-nums mt-0.5 opacity-80">
              = (Adet × Birim Maliyet) + Nakliye + Gümrük Vergisi
            </p>
          </div>
          <div>
            <p className="font-semibold">Birim Başına İthalat Maliyeti (TRY)</p>
            <p className="font-mono tabular-nums mt-0.5 opacity-80">
              = (Toplam USD / Adet) × USD/TRY Kuru
            </p>
          </div>
          <div>
            <p className="font-semibold">Marj (%)</p>
            <p className="font-mono tabular-nums mt-0.5 opacity-80">
              = (Satış Fiyatı − Birim Maliyet TRY) / Satış Fiyatı × 100
            </p>
          </div>
          <div>
            <p className="font-semibold">Başa Baş Fiyatı</p>
            <p className="font-mono tabular-nums mt-0.5 opacity-80">
              = Birim Maliyet TRY × 1.20 (minimum %20 marj)
            </p>
          </div>
        </div>
      </Card>

      {/* Calculator */}
      <Card className="p-6 space-y-6">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Girdiler
          </p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">Hesaplama Parametreleri</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
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

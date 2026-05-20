/**
 * Faz 2 — USD Net Katalog Fiyatları
 *
 * Sales rep katalog gönderdiğinde gösterilen USD bazlı, KDV hariç fiyatları admin doldurur.
 * - `wholesalePriceUsd` → bayi kataloglarında gösterilir
 * - `retailPriceUsd` → son müşteri kataloglarında gösterilir
 *
 * TRY alanları (sellingPriceTry, wholesalePriceTry) quote sistemi için dokunulmaz.
 */

import { DollarSign } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { ProductPricingTable } from "@/components/admin/product-pricing-table";
import { BulkMarkupForm } from "@/components/admin/bulk-markup-form";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    categoryId?: string;
    brand?: string;
    filter?: "all" | "empty-wholesale" | "empty-retail" | "empty-both";
    q?: string;
  }>;
};

export default async function ProductPricingPage({ searchParams }: PageProps) {
  await requirePermission(PERMISSIONS.PRODUCTS_UPDATE);
  const sp = await searchParams;

  const filter = sp.filter ?? "empty-both";
  const search = sp.q?.trim() ?? "";

  const where: Record<string, unknown> = { isActive: true };
  if (sp.categoryId) where.categoryId = sp.categoryId;
  if (sp.brand) where.brand = sp.brand;
  if (filter === "empty-wholesale") where.wholesalePriceUsd = null;
  else if (filter === "empty-retail") where.retailPriceUsd = null;
  else if (filter === "empty-both") {
    where.AND = [{ wholesalePriceUsd: null }, { retailPriceUsd: null }];
  }
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { sku: { contains: search, mode: "insensitive" } },
    ];
  }

  const [products, categories, brands, stats] = await Promise.all([
    prisma.product.findMany({
      where,
      select: {
        id: true,
        sku: true,
        name: true,
        imageUrl: true,
        brand: true,
        categoryId: true,
        productCategory: { select: { id: true, name: true } },
        stockQuantity: true,
        unitCostTry: true,
        unitCostUsd: true,
        wholesalePriceTry: true,
        sellingPriceTry: true,
        wholesalePriceUsd: true,
        retailPriceUsd: true,
      },
      orderBy: [{ stockQuantity: "desc" }, { name: "asc" }],
      take: 300,
    }),
    prisma.productCategory.findMany({
      where: { parentId: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { products: true } } },
    }),
    prisma.product.findMany({
      where: { isActive: true, brand: { not: null } },
      select: { brand: true },
      distinct: ["brand"],
      orderBy: { brand: "asc" },
    }),
    Promise.all([
      prisma.product.count({ where: { isActive: true } }),
      prisma.product.count({
        where: { isActive: true, wholesalePriceUsd: { not: null } },
      }),
      prisma.product.count({
        where: { isActive: true, retailPriceUsd: { not: null } },
      }),
    ]).then(([total, withWholesale, withRetail]) => ({
      total,
      withWholesale,
      withRetail,
    })),
  ]);

  const wholesalePct = stats.total > 0 ? (stats.withWholesale / stats.total) * 100 : 0;
  const retailPct = stats.total > 0 ? (stats.withRetail / stats.total) * 100 : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={DollarSign}
        breadcrumb={[
          { label: "Ürünler & Stok", href: "/products" },
          { label: "USD Net Fiyatlar" },
        ]}
        title="Katalog Fiyatları (USD net)"
        subtitle="Sales rep'in göndereceği kataloglarda gösterilen USD bazlı, KDV hariç fiyatlar. TRY alanları quote sistemi için ayrıdır."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-widest text-slate-500">
            Aktif Ürün
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-950">{stats.total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-widest text-slate-500">
            Bayi (Wholesale USD)
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {stats.withWholesale}{" "}
            <Badge tone={wholesalePct >= 80 ? "success" : wholesalePct >= 40 ? "warning" : "danger"}>
              {wholesalePct.toFixed(0)}%
            </Badge>
          </p>
          <p className="mt-1 text-xs text-slate-400">{stats.total - stats.withWholesale} boş</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] uppercase tracking-widest text-slate-500">
            Perakende (Retail USD)
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-950">
            {stats.withRetail}{" "}
            <Badge tone={retailPct >= 80 ? "success" : retailPct >= 40 ? "warning" : "danger"}>
              {retailPct.toFixed(0)}%
            </Badge>
          </p>
          <p className="mt-1 text-xs text-slate-400">{stats.total - stats.withRetail} boş</p>
        </Card>
      </div>

      <BulkMarkupForm
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          productCount: c._count.products,
        }))}
        brands={brands.map((b) => b.brand!).filter(Boolean)}
      />

      <Card className="p-4">
        <ProductPricingTable
          products={products.map((p) => ({
            id: p.id,
            sku: p.sku,
            name: p.name,
            imageUrl: p.imageUrl,
            brand: p.brand,
            categoryName: p.productCategory?.name ?? null,
            stockQuantity: p.stockQuantity,
            unitCostUsd: p.unitCostUsd ? Number(p.unitCostUsd) : null,
            wholesalePriceUsd: p.wholesalePriceUsd ? Number(p.wholesalePriceUsd) : null,
            retailPriceUsd: p.retailPriceUsd ? Number(p.retailPriceUsd) : null,
          }))}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          brands={brands.map((b) => b.brand!).filter(Boolean)}
          activeFilters={{
            categoryId: sp.categoryId ?? null,
            brand: sp.brand ?? null,
            filter,
            q: search,
          }}
        />
      </Card>
    </div>
  );
}

import { notFound } from "next/navigation";

import { ProductForm } from "@/components/products/product-form";
import { Card } from "@/components/ui/card";
import { getProductById } from "@/services/product-service";
import { listCategoriesForSelect } from "@/services/category-service";
import { listAttributes } from "@/services/attribute-service";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission(PERMISSIONS.PRODUCTS_UPDATE);
  const { id } = await params;
  const [{ databaseAvailable, product }, { categories }, allAttributes, users] = await Promise.all([
    getProductById(id),
    listCategoriesForSelect(),
    listAttributes(),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!databaseAvailable) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Ürünler
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Ürün düzenleme geçici olarak kullanılamıyor
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Veritabanı bağlantısı şu anda kullanılamıyor.
          </p>
        </div>
        <Card className="border-amber-200 bg-amber-50 p-6 text-sm leading-7 text-amber-900">
          Veritabanına ulaşılamadığı için ürün düzenleme formu yüklenemedi.
        </Card>
      </div>
    );
  }

  if (!product) notFound();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          Ürünler
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Ürün düzenle
        </h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          Ürün bilgilerini, stok zekasını ve maliyet girdilerini güncelleyin.
        </p>
      </div>

      <Card className="p-6">
        <ProductForm
          mode="edit"
          productId={product.id}
          categories={categories}
          allAttributes={allAttributes}
          initialAttributeIds={product.attributeAssignments.map((a) => a.attributeId)}
          users={users}
          initialValues={{
            sku: product.sku,
            barcode: product.barcode ?? "",
            name: product.name,
            imageUrl: product.imageUrl ?? "",
            category: product.category ?? "",
            categoryId: product.categoryId ?? "",
            brand: product.brand ?? "",
            model: product.model ?? "",
            supplier: product.supplier ?? "",
            stockQuantity: product.stockQuantity,
            minimumStock: product.minimumStock,
            reorderLeadTime: product.reorderLeadTime != null ? String(product.reorderLeadTime) : "",
            stockSource: product.stockSource ?? "",
            stockConfidence: product.stockConfidence ?? "",
            lastStockSyncAt: product.lastStockSyncAt ? product.lastStockSyncAt.toISOString().split("T")[0] : "",
            lastStockCountById: product.lastStockCountById ?? "",
            location: product.location ?? "",
            description: product.description ?? "",
            isActive: product.isActive,
            shippingCost: product.shippingCost != null ? String(product.shippingCost) : "",
            shippingCostOverride: product.shippingCostOverride != null ? String(product.shippingCostOverride) : "",
            marketplaceCommission: product.marketplaceCommission != null ? String(product.marketplaceCommission) : "",
            marketplaceCommissionOverride: product.marketplaceCommissionOverride != null ? String(product.marketplaceCommissionOverride) : "",
            importDate: product.importDate ? product.importDate.toISOString().split("T")[0] : "",
            importQuantity: product.importQuantity != null ? String(product.importQuantity) : "",
            importUnitCostUsd: product.importUnitCostUsd != null ? String(product.importUnitCostUsd) : "",
            inventoryCountDate: product.inventoryCountDate ? product.inventoryCountDate.toISOString().split("T")[0] : "",
            inventoryCountStock: product.inventoryCountStock != null ? String(product.inventoryCountStock) : "",
          }}
        />
      </Card>
    </div>
  );
}

import { notFound } from "next/navigation";

import { ProductForm } from "@/components/products/product-form";
import { ProductImageManager } from "@/components/products/product-image-manager";
import { PrivateNoteEditor } from "@/components/products/private-note-editor";
import { Card } from "@/components/ui/card";
import { getProductById } from "@/services/product-service";
import { listCategoriesForSelect } from "@/services/category-service";
import { listAttributes } from "@/services/attribute-service";
import { requirePermission, checkPermission, requireUser, isOwner } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { SupplierProductSection } from "@/components/suppliers/supplier-product-section";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission(PERMISSIONS.PRODUCTS_UPDATE);
  const { id } = await params;
  const user = await requireUser();
  const [{ databaseAvailable, product }, { categories }, allAttributes, users, allSuppliers, supplierLinks, canWriteSuppliers, canViewPrivate] = await Promise.all([
    getProductById(id),
    listCategoriesForSelect(),
    listAttributes(),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.supplier.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.supplierProduct.findMany({
      where: { productId: id },
      include: { supplier: { select: { name: true } } },
    }),
    checkPermission(user, PERMISSIONS.SUPPLIERS_WRITE),
    Promise.resolve(isOwner(user)),
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
          xmlDescription={product.xmlData?.xmlDescription ?? null}
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
            // Phase 9
            onlineSalesPotential: product.onlineSalesPotential != null ? String(product.onlineSalesPotential) : "",
            wholesaleSalesPotential: product.wholesaleSalesPotential != null ? String(product.wholesaleSalesPotential) : "",
            installerSalesPotential: product.installerSalesPotential != null ? String(product.installerSalesPotential) : "",
            // Phase 8
            unitCostTry: product.unitCostTry != null ? String(product.unitCostTry) : "",
            sellingPriceTry: product.sellingPriceTry != null ? String(product.sellingPriceTry) : "",
            wholesalePriceTry: product.wholesalePriceTry != null ? String(product.wholesalePriceTry) : "",
            marketplacePriceTry: product.marketplacePriceTry != null ? String(product.marketplacePriceTry) : "",
            packagingCost: product.packagingCost != null ? String(product.packagingCost) : "",
            vatRate: product.vatRate != null ? String(product.vatRate) : "",
            paymentFeeRate: product.paymentFeeRate != null ? String(product.paymentFeeRate) : "",
            returnReserveRate: product.returnReserveRate != null ? String(product.returnReserveRate) : "",
            // Phase 11
            xmlLocked: product.xmlLocked ?? false,
            // Phase 11C
            weightKg: product.weightKg != null ? String(product.weightKg) : "",
            customsRatePct: product.customsRatePct != null ? String(product.customsRatePct) : "",
            shippingMethodPref: product.shippingMethodPref ?? "",
          }}
        />
      </Card>

      {/* Phase 27: Product Media Studio */}
      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Faz 27 — Medya Stüdyosu
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Ürün Görselleri</h2>
          <p className="mt-1 text-sm text-slate-500">
            URL girerek veya dosya yükleyerek görsel ekleyin. Birincil görsel ürün listesinde ve detay sayfasında kullanılır.
          </p>
        </div>
        <div className="p-6">
          <ProductImageManager
            productId={product.id}
            initialImages={product.images.map((img) => ({
              id: img.id,
              url: img.url,
              sortOrder: img.sortOrder,
              source: img.source,
              altText: img.altText,
            }))}
            canUpload={!!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)}
          />
        </div>
      </Card>

      {/* Phase 20: Supplier product links */}
      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Faz 20 — Tedarikçi Zekası
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Tedarikçi Bağlantıları</h2>
          <p className="mt-1 text-sm text-slate-500">
            Bu ürünü tedarik eden tedarikçileri, maliyetleri ve koşulları yönetin.
          </p>
        </div>
        <div className="p-6">
          <SupplierProductSection
            productId={product.id}
            suppliers={allSuppliers}
            existingLinks={supplierLinks.map((sl) => ({
              supplierId: sl.supplierId,
              supplierName: sl.supplier.name,
              unitCostUsd: sl.unitCostUsd != null ? Number(sl.unitCostUsd) : null,
              moq: sl.moq,
              leadDays: sl.leadDays,
              isPreferred: sl.isPreferred,
              notes: sl.notes,
            }))}
            canWrite={canWriteSuppliers}
          />
        </div>
      </Card>

      {/* Phase 28: Owner-only private note */}
      {canViewPrivate && (
        <Card className="overflow-hidden border-amber-200">
          <div className="border-b border-amber-200 bg-amber-50 px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-amber-600">
              Faz 28 — Özel Zeka
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">Özel Not</h2>
            <p className="mt-1 text-sm text-slate-500">
              Sadece sahip/yönetici görebilir. Tedarikçi bilgisi, fiyat stratejisi, özel satın alma notları.
            </p>
          </div>
          <div className="p-6">
            <PrivateNoteEditor
              productId={product.id}
              initialNote={product.privateNote ?? null}
            />
          </div>
        </Card>
      )}
    </div>
  );
}

import { notFound } from "next/navigation";

import { ProductForm } from "@/components/products/product-form";
import { Card } from "@/components/ui/card";
import { getProductById } from "@/services/product-service";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProductById(id);

  if (!product) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          Products
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Urun duzenle
        </h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          SKU, stok ve lokasyon alanlarini mevcut operasyon ihtiyacina gore guncelleyin.
        </p>
      </div>

      <Card className="p-6">
        <ProductForm
          mode="edit"
          productId={product.id}
          initialValues={{
            sku: product.sku,
            name: product.name,
            category: product.category ?? "",
            brand: product.brand ?? "",
            model: product.model ?? "",
            stockQuantity: product.stockQuantity,
            minimumStock: product.minimumStock,
            location: product.location ?? "",
            description: product.description ?? "",
            isActive: product.isActive,
          }}
        />
      </Card>
    </div>
  );
}

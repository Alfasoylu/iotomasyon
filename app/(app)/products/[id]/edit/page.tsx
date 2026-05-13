import { notFound } from "next/navigation";

import { ProductForm } from "@/components/products/product-form";
import { Card } from "@/components/ui/card";
import { getProductById } from "@/services/product-service";

export const dynamic = "force-dynamic";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { databaseAvailable, product } = await getProductById(id);

  if (!databaseAvailable) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Products
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Urun duzenleme gecici olarak kullanilamiyor
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Veritabani baglantisi su anda kullanilamiyor. Baglanti geri geldiginde
            bu ekran tekrar kullanilabilir olacak.
          </p>
        </div>

        <Card className="border-amber-200 bg-amber-50 p-6 text-sm leading-7 text-amber-900">
          Veritabanina ulasilamadigi icin urun duzenleme formu yuklenemedi.
        </Card>
      </div>
    );
  }

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

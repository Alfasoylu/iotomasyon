import { Card } from "@/components/ui/card";
import { ProductForm } from "@/components/products/product-form";
import { listCategoriesForSelect } from "@/services/category-service";
import { listAttributes } from "@/services/attribute-service";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  await requirePermission(PERMISSIONS.PRODUCTS_CREATE);
  const [{ categories }, allAttributes] = await Promise.all([
    listCategoriesForSelect(),
    listAttributes(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          Ürünler
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Yeni ürün oluştur
        </h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          SKU, stok ve lokasyon bilgilerini kaydederek envanteri aratılabilir hale getirin.
        </p>
      </div>

      <Card className="p-6">
        <ProductForm mode="create" categories={categories} allAttributes={allAttributes} />
      </Card>
    </div>
  );
}

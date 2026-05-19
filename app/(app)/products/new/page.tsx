import Link from "next/link";

import { Card } from "@/components/ui/card";
import { ProductForm } from "@/components/products/product-form";
import { listCategoriesForSelect } from "@/services/category-service";
import { listAttributes } from "@/services/attribute-service";
import { requirePermission, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function NewProductPage() {
  const user = await requirePermission(PERMISSIONS.PRODUCTS_CREATE);
  // Phase 57: Only EXECUTIVE_READ users see financial/cost/import fields.
  const [{ categories }, allAttributes, showFinancialFields] = await Promise.all([
    listCategoriesForSelect(),
    listAttributes(),
    checkPermission(user, PERMISSIONS.EXECUTIVE_READ),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/products"
          className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 hover:text-slate-900 transition"
        >
          ← Ürünler
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Yeni ürün oluştur
        </h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          SKU, stok ve lokasyon bilgilerini kaydederek envanteri aratılabilir hale getirin.
        </p>
      </div>

      <Card className="p-6">
        <ProductForm
          mode="create"
          categories={categories}
          allAttributes={allAttributes}
          showFinancialFields={showFinancialFields}
        />
      </Card>
    </div>
  );
}

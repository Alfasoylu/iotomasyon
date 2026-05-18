import Link from "next/link";

import { Card } from "@/components/ui/card";
import { CategoryForm } from "@/components/categories/category-form";
import { listCategoriesForSelect } from "@/services/category-service";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function NewCategoryPage() {
  await requirePermission(PERMISSIONS.CATEGORIES_CREATE);
  const { categories } = await listCategoriesForSelect();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/categories"
          className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 hover:text-slate-900 transition"
        >
          ← Kategoriler
        </Link>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Yeni kategori
        </h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          Ürün kataloğunuzu organize etmek için yeni bir kategori tanımlayın.
        </p>
      </div>

      <Card className="p-6">
        <CategoryForm mode="create" parentOptions={categories} />
      </Card>
    </div>
  );
}

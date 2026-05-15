import { notFound } from "next/navigation";

import { Card } from "@/components/ui/card";
import { CategoryForm } from "@/components/categories/category-form";
import { getCategoryById, listCategoriesForSelect } from "@/services/category-service";
import type { CategoryFormValues } from "@/types/categories";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission(PERMISSIONS.CATEGORIES_UPDATE);
  const { id } = await params;
  const [{ category }, { categories }] = await Promise.all([
    getCategoryById(id),
    listCategoriesForSelect(),
  ]);

  if (!category) notFound();

  const initialValues: CategoryFormValues = {
    name: category.name,
    slug: category.slug,
    description: category.description ?? "",
    parentId: category.parent?.id ?? "",
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          Kategoriler
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Kategoriyi duzenle
        </h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">{category.name}</p>
      </div>

      <Card className="p-6">
        <CategoryForm
          mode="edit"
          categoryId={id}
          initialValues={initialValues}
          parentOptions={categories}
        />
      </Card>
    </div>
  );
}

import Link from "next/link";
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
        <nav className="flex flex-wrap items-center gap-1 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
          <Link href="/categories" className="hover:text-slate-900 transition">
            ← Kategoriler
          </Link>
          <span className="text-slate-300">/</span>
          <Link
            href={`/categories/${id}`}
            className="max-w-[280px] truncate normal-case tracking-normal text-slate-500 hover:text-slate-900 transition"
            title={category.name}
          >
            {category.name}
          </Link>
        </nav>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Kategoriyi duzenle
        </h1>
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

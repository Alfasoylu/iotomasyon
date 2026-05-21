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
        <nav className="flex flex-wrap items-center gap-1 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
          <Link href="/categories" className="transition hover:text-[var(--text-primary)]">
            ← Kategoriler
          </Link>
          <span className="text-[var(--border-default)]">/</span>
          <Link
            href={`/categories/${id}`}
            className="max-w-[280px] truncate normal-case tracking-normal text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
            title={category.name}
          >
            {category.name}
          </Link>
        </nav>
        <h1 className="mt-3 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
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

import Link from "next/link";
import { notFound } from "next/navigation";

import { CategoryDeleteButton } from "@/components/categories/category-delete-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatInterestStage, getInterestStageTone } from "@/lib/customer-utils";
import { formatDateTime } from "@/lib/utils";
import { getCategoryById } from "@/services/category-service";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function CategoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission(PERMISSIONS.CATEGORIES_READ);
  const { id } = await params;
  const { databaseAvailable, category } = await getCategoryById(id);

  if (!databaseAvailable) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Kategoriler
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Kategori geçici olarak kullanılamıyor
          </h1>
        </div>
        <Card className="border-amber-200 bg-amber-50 p-6 text-sm leading-7 text-amber-900">
          Veritabanı bağlantısı şu anda kullanılamıyor.
        </Card>
      </div>
    );
  }

  if (!category) notFound();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            {category.parent ? (
              <Link
                href={`/categories/${category.parent.id}`}
                className="text-sm text-slate-500 hover:text-slate-700"
              >
                {category.parent.name}
              </Link>
            ) : null}
            {category.parent ? <span className="text-slate-300">/</span> : null}
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
              Kategoriler
            </p>
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
            {category.name}
          </h1>
          <p className="mt-1 font-mono text-sm text-slate-400">{category.slug}</p>
          {category.description ? (
            <p className="mt-3 text-sm leading-7 text-slate-600">{category.description}</p>
          ) : null}
        </div>

        <div className="flex gap-3">
          <Link href={`/customers/new?categoryId=${category.id}`}>
            <Button variant="secondary">Yeni Müşteri Ekle</Button>
          </Link>
          {category.interests.length > 0 ? (
            <Link href={`/campaigns/new?categoryId=${category.id}`}>
              <Button>WhatsApp kampanyası oluştur</Button>
            </Link>
          ) : null}
          <Link href={`/categories/${category.id}/edit`}>
            <Button variant="secondary">Düzenle</Button>
          </Link>
          <CategoryDeleteButton categoryId={category.id} />
        </div>
      </div>

      {category.children.length > 0 ? (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.25em] text-slate-500">
            Alt kategoriler
          </h2>
          <div className="flex flex-wrap gap-2">
            {category.children.map((child) => (
              <Link key={child.id} href={`/categories/${child.id}`}>
                <Badge tone="default">{child.name}</Badge>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-950">Bu kategorideki ürünler</h2>
            <Badge>{category.products.length} ürün</Badge>
          </div>

          <div className="mt-6 space-y-2">
            {category.products.length === 0 ? (
              <p className="text-sm text-slate-500">Bu kategoride henüz ürün yok.</p>
            ) : (
              category.products.map((product) => {
                const isLow = product.stockQuantity <= product.minimumStock;

                return (
                  <Link key={product.id} href={`/products/${product.id}`}>
                    <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 hover:border-slate-200 transition">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{product.name}</p>
                        <p className="text-xs text-slate-400">{product.sku}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isLow ? <Badge tone="warning">Düşük stok</Badge> : null}
                        <span className="text-sm font-medium text-slate-600">
                          {product.stockQuantity} adet
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-950">Bu kategoriyle ilgilenen müşteriler</h2>
            <Badge>{category.interests.length} müşteri</Badge>
          </div>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Bu kategorideki ürünleri satmak için potansiyel alıcılar.
          </p>

          <div className="mt-6 space-y-3">
            {category.interests.length === 0 ? (
              <p className="text-sm text-slate-500">Henüz kategori ilgisi kaydedilmedi.</p>
            ) : (
              category.interests.map((interest) => (
                <Link key={interest.id} href={`/customers/${interest.customer.id}`}>
                  <div className="flex items-start justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 hover:border-slate-200 transition">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {interest.customer.name}
                      </p>
                      {interest.customer.company ? (
                        <p className="text-xs text-slate-500">{interest.customer.company}</p>
                      ) : null}
                      {interest.notes ? (
                        <p className="mt-2 text-xs leading-5 text-slate-500 line-clamp-2">
                          {interest.notes}
                        </p>
                      ) : null}
                      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-slate-400">
                        {formatDateTime(interest.createdAt)}
                      </p>
                    </div>
                    <Badge tone={getInterestStageTone(interest.stage)}>
                      {formatInterestStage(interest.stage)}
                    </Badge>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

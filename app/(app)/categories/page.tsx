import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listCategories } from "@/services/category-service";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const { databaseAvailable, categories } = await listCategories();

  if (!databaseAvailable) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Kategoriler
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Kategoriler gecici olarak kullanilamiyor
          </h1>
        </div>
        <Card className="border-amber-200 bg-amber-50 p-6 text-sm leading-7 text-amber-900">
          Veritabani baglantisi su anda kullanilamiyor.
        </Card>
      </div>
    );
  }

  const rootCategories = categories.filter((c) => !c.parentId);
  const childCategories = categories.filter((c) => c.parentId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Katalog
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Kategoriler
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            {categories.length} kategori &mdash; urün katalogunu ve müşteri ilgilerini organize edin.
          </p>
        </div>
        <Link href="/categories/new">
          <Button>Yeni kategori</Button>
        </Link>
      </div>

      {categories.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-slate-500">Henuz kategori eklenmedi.</p>
          <p className="mt-2 text-sm text-slate-400">
            Ilk kategoriyi olusturmak icin &quot;Yeni kategori&quot; butonunu kullanin.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {rootCategories.map((cat) => {
            const children = childCategories.filter((c) => c.parentId === cat.id);

            return (
              <div key={cat.id}>
                <Link href={`/categories/${cat.id}`}>
                  <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 hover:border-slate-300 hover:bg-slate-50 transition">
                    <div>
                      <p className="font-semibold text-slate-900">{cat.name}</p>
                      {cat.description ? (
                        <p className="mt-1 text-sm text-slate-500 line-clamp-1">{cat.description}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge>{cat._count.products} ürün</Badge>
                      <Badge tone="default">{cat._count.interests} ilgi</Badge>
                    </div>
                  </div>
                </Link>

                {children.map((child) => (
                  <Link key={child.id} href={`/categories/${child.id}`}>
                    <div className="ml-6 mt-1 flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50/60 px-5 py-3 hover:border-slate-200 hover:bg-slate-50 transition">
                      <div>
                        <p className="text-sm font-medium text-slate-700">{child.name}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge>{child._count.products} ürün</Badge>
                        <Badge tone="default">{child._count.interests} ilgi</Badge>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

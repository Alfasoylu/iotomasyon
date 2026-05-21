import Link from "next/link";
import { FolderTree, ChevronRight, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { listCategories } from "@/services/category-service";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  await requirePermission(PERMISSIONS.CATEGORIES_READ);
  const { databaseAvailable, categories } = await listCategories();

  if (!databaseAvailable) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Kategoriler
          </p>
          <h1 className="mt-3 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
            Kategoriler geçici olarak kullanılamıyor
          </h1>
        </div>
        <Card className="flex items-start gap-3 border-[var(--warn-border)] bg-[var(--warn-dim)] p-5 text-[13px] leading-relaxed text-[var(--warn)]">
          <AlertTriangle size={14} strokeWidth={1.5} className="mt-0.5 flex-shrink-0" />
          <span>Veritabanı bağlantısı şu anda kullanılamıyor.</span>
        </Card>
      </div>
    );
  }

  const rootCategories = categories.filter((c) => !c.parentId);
  const childCategories = categories.filter((c) => c.parentId);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FolderTree}
        breadcrumb={[{ label: "Ürünler & Stok" }, { label: "Kategoriler" }]}
        title="Kategoriler"
        subtitle={`${categories.length} kategori. Ürün kataloğunu ve müşteri ilgilerini organize et.`}
        actions={
          <Link href="/categories/new">
            <Button>Yeni kategori</Button>
          </Link>
        }
      />

      {categories.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title="Henüz kategori yok"
          hint="Kategorilerin ilki oluşturulduğunda burada listelenir. Ürünleri organize etmek ve müşteri ilgilerini takip etmek için kullanılır."
          action={
            <Link href="/categories/new">
              <Button>Yeni kategori</Button>
            </Link>
          }
        />
      ) : (
        <>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Tüm kategoriler
          </p>
          <Card className="divide-y divide-[var(--border-subtle)] overflow-hidden">
            {rootCategories.map((cat) => {
              const children = childCategories.filter((c) => c.parentId === cat.id);

              return (
                <div key={cat.id}>
                  <Link
                    href={`/categories/${cat.id}`}
                    className="group flex items-center justify-between gap-3 px-5 py-4 transition hover:bg-[var(--surface-3)]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <ChevronRight
                        size={14}
                        strokeWidth={1.5}
                        className="flex-shrink-0 text-[var(--text-muted)] transition group-hover:text-[var(--text-secondary)]"
                      />
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium text-[var(--text-primary)]">
                          {cat.name}
                        </p>
                        {cat.description ? (
                          <p className="mt-0.5 text-[12px] text-[var(--text-secondary)] line-clamp-1">
                            {cat.description}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-4">
                      <span className="font-mono text-[12px] tabular-nums text-[var(--text-secondary)]">
                        <span className="font-semibold text-[var(--text-primary)]">
                          {cat._count.products.toLocaleString("tr-TR")}
                        </span>
                        <span className="ml-1 text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                          ürün
                        </span>
                      </span>
                      <span className="font-mono text-[12px] tabular-nums text-[var(--text-secondary)]">
                        <span className="font-semibold text-[var(--text-primary)]">
                          {cat._count.interests.toLocaleString("tr-TR")}
                        </span>
                        <span className="ml-1 text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                          ilgi
                        </span>
                      </span>
                    </div>
                  </Link>

                  {children.map((child) => (
                    <Link
                      key={child.id}
                      href={`/categories/${child.id}`}
                      className="group flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] bg-[var(--surface-1)] px-5 py-3 pl-12 transition hover:bg-[var(--surface-3)]"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <ChevronRight
                          size={14}
                          strokeWidth={1.5}
                          className="flex-shrink-0 text-[var(--text-muted)] transition group-hover:text-[var(--text-secondary)]"
                        />
                        <p className="text-[13px] text-[var(--text-secondary)]">
                          {child.name}
                        </p>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-4">
                        <span className="font-mono text-[12px] tabular-nums text-[var(--text-secondary)]">
                          <span className="font-semibold text-[var(--text-primary)]">
                            {child._count.products.toLocaleString("tr-TR")}
                          </span>
                          <span className="ml-1 text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                            ürün
                          </span>
                        </span>
                        <span className="font-mono text-[12px] tabular-nums text-[var(--text-secondary)]">
                          <span className="font-semibold text-[var(--text-primary)]">
                            {child._count.interests.toLocaleString("tr-TR")}
                          </span>
                          <span className="ml-1 text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                            ilgi
                          </span>
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              );
            })}
          </Card>
        </>
      )}
    </div>
  );
}

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
import { CUSTOMER_TYPE_LABELS } from "@/types/customers";

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
          <Link
            href="/categories"
            className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
          >
            ← Kategoriler
          </Link>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
            Kategori geçici olarak kullanılamıyor
          </h1>
        </div>
        <Card className="border-[var(--warn-border)] bg-[var(--warn-dim)] p-6 text-sm leading-7 text-[var(--warn)]">
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
            <Link
              href="/categories"
              className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)] transition hover:text-[var(--text-primary)]"
            >
              ← Kategoriler
            </Link>
            {category.parent ? <span className="text-[var(--text-muted)]">/</span> : null}
            {category.parent ? (
              <Link
                href={`/categories/${category.parent.id}`}
                className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                {category.parent.name}
              </Link>
            ) : null}
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-[var(--text-primary)]">
            {category.name}
          </h1>
          <p className="mt-1 font-mono text-sm tabular-nums text-[var(--text-muted)]">{category.slug}</p>
          {category.description ? (
            <p className="mt-3 text-sm leading-7 text-[var(--text-secondary)]">{category.description}</p>
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
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
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
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Bu kategorideki ürünler
            </h2>
            <Badge>{category.products.length} ürün</Badge>
          </div>

          <div className="mt-6 space-y-2">
            {category.products.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Bu kategoride henüz ürün yok.</p>
            ) : (
              category.products.map((product) => {
                const isLow = product.stockQuantity <= product.minimumStock;

                return (
                  <Link key={product.id} href={`/products/${product.id}`}>
                    <div className="flex items-center justify-between rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-3 transition hover:border-[var(--border-default)] hover:bg-[var(--surface-3)]">
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">{product.name}</p>
                        <p className="font-mono text-xs tabular-nums text-[var(--text-muted)]">{product.sku}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isLow ? <Badge tone="warning">Düşük stok</Badge> : null}
                        <span className="font-mono text-sm font-medium tabular-nums text-[var(--text-secondary)]">
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
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
              Bu kategoriyle ilgilenen müşteriler
            </h2>
            <Badge>{category.interests.length} müşteri</Badge>
          </div>
          <p className="mt-2 text-sm leading-7 text-[var(--text-secondary)]">
            Bu kategorideki ürünleri satmak için potansiyel alıcılar.
          </p>

          <div className="mt-6 space-y-3">
            {category.interests.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">Henüz kategori ilgisi kaydedilmedi.</p>
            ) : (
              category.interests.map((interest) => (
                <Link key={interest.id} href={`/customers/${interest.customer.id}`}>
                  <div className="flex items-start justify-between rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-3 transition hover:border-[var(--border-default)] hover:bg-[var(--surface-3)]">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          {interest.customer.name}
                        </p>
                        {interest.customer.customerType ? (
                          <Badge tone="default">{CUSTOMER_TYPE_LABELS[interest.customer.customerType]}</Badge>
                        ) : null}
                      </div>
                      {interest.customer.company ? (
                        <p className="text-xs text-[var(--text-secondary)]">{interest.customer.company}</p>
                      ) : null}
                      {interest.notes ? (
                        <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--text-muted)]">
                          {interest.notes}
                        </p>
                      ) : null}
                      <p className="mt-2 text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
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

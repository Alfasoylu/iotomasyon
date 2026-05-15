import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductDeleteButton } from "@/components/products/product-delete-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import { getProductById } from "@/services/product-service";
import { getProductIntelligence } from "@/services/category-service";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission(PERMISSIONS.PRODUCTS_READ);
  const { id } = await params;
  const [{ databaseAvailable, product }, intelligenceResult] = await Promise.all([
    getProductById(id),
    getProductIntelligence(id),
  ]);

  if (!databaseAvailable) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Ürünler
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Ürün detayı geçici olarak kullanılamıyor
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Veritabanı bağlantısı şu anda kullanılamıyor.
          </p>
        </div>
        <Card className="border-amber-200 bg-amber-50 p-6 text-sm leading-7 text-amber-900">
          Canlı ürün verisi alınamadığı için detay ekranı gösterilemiyor.
        </Card>
      </div>
    );
  }

  if (!product) notFound();

  const isLowStock = product.stockQuantity <= product.minimumStock;
  const { directInterests, attributeInterests, categoryInterests } = intelligenceResult;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Badge tone={product.isActive ? "success" : "default"}>
              {product.isActive ? "Aktif" : "Pasif"}
            </Badge>
            {isLowStock ? <Badge tone="warning">Düşük stok</Badge> : null}
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
            {product.name}
          </h1>
          <p className="mt-2 font-mono text-sm text-slate-500">{product.sku}</p>
          {product.productCategory ? (
            <Link
              href={`/categories/${product.productCategory.id}`}
              className="mt-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700"
            >
              {product.productCategory.name}
            </Link>
          ) : null}
        </div>

        <div className="flex gap-3">
          <Link href={`/customers/new?productId=${product.id}`}>
            <Button variant="secondary">Yeni Müşteri Ekle</Button>
          </Link>
          <Link href={`/products/${product.id}/edit`}>
            <Button>Düzenle</Button>
          </Link>
          <ProductDeleteButton productId={product.id} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-950">Ürün bilgileri</h2>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <Info label="Kategori" value={product.productCategory?.name ?? product.category} />
            <Info label="Marka" value={product.brand} />
            <Info label="Model" value={product.model} />
            <Info label="Konum" value={product.location} />
            <Info label="Stok" value={`${product.stockQuantity}`} />
            <Info label="Minimum stok" value={`${product.minimumStock}`} />
            {product.importDate ? (
              <Info label="İthalat tarihi" value={formatDateTime(product.importDate)} />
            ) : null}
            {product.importQuantity != null ? (
              <Info label="İthalatta gelen adet" value={`${product.importQuantity}`} />
            ) : null}
            {product.importUnitCostUsd != null ? (
              <Info label="İthalat birim maliyeti (USD)" value={`$${Number(product.importUnitCostUsd).toFixed(2)}`} />
            ) : null}
            {product.inventoryCountDate ? (
              <Info label="Depo sayım tarihi" value={formatDateTime(product.inventoryCountDate)} />
            ) : null}
            {product.inventoryCountStock != null ? (
              <Info label="Sayım tarihindeki stok" value={`${product.inventoryCountStock}`} />
            ) : null}
          </dl>
          {product.attributeAssignments.length > 0 && (
            <div className="mt-6">
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Özellikler</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {product.attributeAssignments.map((a) => (
                  <span
                    key={a.attributeId}
                    className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
                  >
                    {a.attribute.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-600">
            {product.description || "Bu ürün için açıklama eklenmedi."}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-950">Kayıt metrikleri</h2>
          <dl className="mt-5 space-y-4">
            <Info label="Oluşturulma" value={formatDateTime(product.createdAt)} />
            <Info label="Güncellenme" value={formatDateTime(product.updatedAt)} />
            <Info label="Oluşturan" value={product.createdBy?.name ?? "Sistem"} />
            <Info label="Oluşturan e-posta" value={product.createdBy?.email ?? "-"} />
          </dl>
        </Card>
      </div>

      {(directInterests.length > 0 || attributeInterests.length > 0 || categoryInterests.length > 0) ? (
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-700">
            {directInterests.length + attributeInterests.length + categoryInterests.length} potansiyel alıcı
          </p>
          <Link href={`/campaigns/new?productId=${product.id}`}>
            <Button>WhatsApp kampanyası oluştur</Button>
          </Link>
        </div>
      ) : null}

      {(directInterests.length > 0 || attributeInterests.length > 0 || categoryInterests.length > 0) ? (
        <div className="grid gap-4 xl:grid-cols-3">
          {directInterests.length > 0 ? (
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-950">Doğrudan ilgili</h2>
                <Badge>{directInterests.length}</Badge>
              </div>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Bu ürünü özellikle talep edenler.
              </p>
              <div className="mt-5 space-y-2">
                {directInterests.map((interest) => (
                  <Link key={interest.id} href={`/customers/${interest.customer.id}`}>
                    <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 hover:border-slate-200 transition">
                      <p className="text-sm font-medium text-slate-900">{interest.customer.name}</p>
                      {interest.customer.company ? (
                        <p className="text-xs text-slate-500">{interest.customer.company}</p>
                      ) : null}
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          ) : null}

          {attributeInterests.length > 0 ? (
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-950">Özellik ilgili</h2>
                <Badge>{attributeInterests.length}</Badge>
              </div>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Bu ürünün özellikleriyle eşleşen müşteriler.
              </p>
              <div className="mt-5 space-y-2">
                {attributeInterests.map((ai) => (
                  <Link key={`${ai.customerId}-${ai.attributeId}`} href={`/customers/${ai.customer.id}`}>
                    <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 hover:border-slate-200 transition">
                      <p className="text-sm font-medium text-slate-900">{ai.customer.name}</p>
                      {ai.customer.company ? (
                        <p className="text-xs text-slate-500">{ai.customer.company}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-slate-400">{ai.attribute.name}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          ) : null}

          {categoryInterests.length > 0 ? (
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-950">Kategori ilgili</h2>
                <Badge>{categoryInterests.length}</Badge>
              </div>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Bu ürünün kategorisiyle ilgilenen potansiyel alıcılar.
              </p>
              <div className="mt-5 space-y-2">
                {categoryInterests.map((interest) => (
                  <Link key={interest.id} href={`/customers/${interest.customer.id}`}>
                    <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 hover:border-slate-200 transition">
                      <p className="text-sm font-medium text-slate-900">{interest.customer.name}</p>
                      {interest.customer.company ? (
                        <p className="text-xs text-slate-500">{interest.customer.company}</p>
                      ) : null}
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-[0.25em] text-slate-500">{label}</dt>
      <dd className="mt-2 text-sm font-medium text-slate-900">{value || "-"}</dd>
    </div>
  );
}

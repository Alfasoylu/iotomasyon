import Link from "next/link";
import { notFound } from "next/navigation";

import { ProductDeleteButton } from "@/components/products/product-delete-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import { getProductById } from "@/services/product-service";

export const dynamic = "force-dynamic";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { databaseAvailable, product } = await getProductById(id);

  if (!databaseAvailable) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Products
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Urun detayi gecici olarak kullanilamiyor
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Veritabani baglantisi su anda kullanilamiyor. Baglanti geri geldiginde
            urun detaylari tekrar yuklenecek.
          </p>
        </div>

        <Card className="border-amber-200 bg-amber-50 p-6 text-sm leading-7 text-amber-900">
          Canli urun verisi alinamadigi icin detay ekrani su anda gosterilemiyor.
        </Card>
      </div>
    );
  }

  if (!product) {
    notFound();
  }

  const isLowStock = product.stockQuantity <= product.minimumStock;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Badge tone={product.isActive ? "success" : "default"}>
              {product.isActive ? "Active" : "Passive"}
            </Badge>
            {isLowStock ? <Badge tone="warning">Low stock</Badge> : null}
          </div>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950">
            {product.name}
          </h1>
          <p className="mt-2 font-mono text-sm text-slate-500">{product.sku}</p>
        </div>

        <div className="flex gap-3">
          <Link href={`/products/${product.id}/edit`}>
            <Button>Duzenle</Button>
          </Link>
          <ProductDeleteButton productId={product.id} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-950">Urun bilgileri</h2>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <Info label="Kategori" value={product.category} />
            <Info label="Marka" value={product.brand} />
            <Info label="Model" value={product.model} />
            <Info label="Lokasyon" value={product.location} />
            <Info label="Stok" value={`${product.stockQuantity}`} />
            <Info label="Minimum stok" value={`${product.minimumStock}`} />
          </dl>
          <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm leading-7 text-slate-600">
            {product.description || "Bu urun icin aciklama eklenmedi."}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-slate-950">Kayit metrikleri</h2>
          <dl className="mt-5 space-y-4">
            <Info label="Olusturulma" value={formatDateTime(product.createdAt)} />
            <Info label="Guncellenme" value={formatDateTime(product.updatedAt)} />
            <Info label="Olusturan" value={product.createdBy?.name ?? "System"} />
            <Info label="Olusturan e-posta" value={product.createdBy?.email ?? "-"} />
          </dl>
        </Card>
      </div>
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

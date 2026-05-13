import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProductFilters } from "@/components/products/product-filters";
import { formatBooleanLabel } from "@/lib/utils";
import { listProducts } from "@/services/product-service";

export const dynamic = "force-dynamic";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const status = typeof params.status === "string" ? params.status : "all";
  const stock = typeof params.stock === "string" ? params.stock : "all";
  const { databaseAvailable, products } = await listProducts({ q: query, status, stock });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Products
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Urun katalugu
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Phase 1 icin CRUD, arama ve dusuk stok gorunumu aktif.
          </p>
        </div>
        <Link href="/products/new">
          <Button>Yeni urun</Button>
        </Link>
      </div>

      <Card className="p-5">
        <ProductFilters initialQuery={query} initialStatus={status} initialStock={stock} />
      </Card>

      {!databaseAvailable ? (
        <Card className="border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900">
          Veritabani baglantisi su anda kullanilamiyor. Urun listesi gosterilemiyor.
        </Card>
      ) : null}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.25em] text-slate-500">
              <tr>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Urun</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3">Lokasyon</th>
                <th className="px-4 py-3">Stok</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3 text-right">Aksiyon</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-sm">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    Bu filtrelerle eslesen urun bulunamadi.
                  </td>
                </tr>
              ) : (
                products.map((product) => {
                  const isLowStock = product.stockQuantity <= product.minimumStock;

                  return (
                    <tr key={product.id} className="hover:bg-slate-50">
                      <td className="px-4 py-4 font-mono text-xs text-slate-700">
                        {product.sku}
                      </td>
                      <td className="px-4 py-4">
                        <p className="font-semibold text-slate-900">{product.name}</p>
                        <p className="text-slate-500">
                          {[product.brand, product.model].filter(Boolean).join(" / ") || "-"}
                        </p>
                      </td>
                      <td className="px-4 py-4 text-slate-600">{product.category ?? "-"}</td>
                      <td className="px-4 py-4 text-slate-600">{product.location ?? "-"}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">
                            {product.stockQuantity}
                          </span>
                          <span className="text-slate-500">/ min {product.minimumStock}</span>
                          {isLowStock ? <Badge tone="warning">Low</Badge> : null}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-600">
                        {formatBooleanLabel(product.isActive)}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Link
                          href={`/products/${product.id}`}
                          className="text-sm font-semibold text-slate-900 hover:text-[color:var(--accent)]"
                        >
                          Detay
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

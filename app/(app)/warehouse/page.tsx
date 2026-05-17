import Link from "next/link";

import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Phase 55 — Warehouse Dashboard
 *
 * Mobile-first barcode/SKU/name search for warehouse staff.
 * NEVER shows cost, margin, or financial data.
 * Requires INVENTORY_READ permission.
 */
export default async function WarehousePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requirePermission(PERMISSIONS.INVENTORY_READ);

  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  const products =
    query.length >= 2
      ? await prisma.product.findMany({
          where: {
            OR: [
              { barcode: { contains: query, mode: "insensitive" } },
              { sku: { contains: query, mode: "insensitive" } },
              { name: { contains: query, mode: "insensitive" } },
            ],
          },
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
            stockQuantity: true,
            minimumStock: true,
            location: true,
            imageUrl: true,
            isActive: true,
          },
          orderBy: { name: "asc" },
          take: 20,
        })
      : [];

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Depo
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Barkod, SKU veya ürün adıyla arayın
        </p>
      </div>

      {/* Search form */}
      <form method="GET" action="/warehouse">
        <div className="flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Barkod / SKU / Ürün adı..."
            autoFocus
            className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 text-base focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
          />
          <button
            type="submit"
            className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Ara
          </button>
        </div>
      </form>

      {/* Quick actions */}
      <div className="flex gap-3">
        <Link
          href="/warehouse/count"
          className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          📦 Stok Sayımı
        </Link>
        <Link
          href="/admin/stock-health"
          className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          ⚠️ Stok Sağlığı
        </Link>
      </div>

      {/* Results */}
      {query.length >= 2 && products.length === 0 && (
        <p className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm text-slate-500">
          &quot;{query}&quot; için sonuç bulunamadı.
        </p>
      )}

      {products.length > 0 && (
        <ul className="space-y-3">
          {products.map((product) => {
            const isLow =
              product.minimumStock > 0 &&
              product.stockQuantity <= product.minimumStock;
            const isCritical = product.stockQuantity <= 0;

            return (
              <li
                key={product.id}
                className={`rounded-2xl border bg-white p-4 shadow-sm ${
                  isCritical
                    ? "border-red-200"
                    : isLow
                      ? "border-amber-200"
                      : "border-slate-200"
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Image */}
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="h-16 w-16 flex-shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl bg-slate-100 text-2xl">
                      📦
                    </div>
                  )}

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">
                      {product.name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      SKU: {product.sku}
                      {product.barcode && ` · ${product.barcode}`}
                    </p>
                    {product.location && (
                      <p className="mt-0.5 text-xs text-slate-400">
                        📍 {product.location}
                      </p>
                    )}
                  </div>

                  {/* Stock badge */}
                  <div className="flex-shrink-0 text-right">
                    <p
                      className={`text-2xl font-bold ${
                        isCritical
                          ? "text-red-600"
                          : isLow
                            ? "text-amber-600"
                            : "text-emerald-600"
                      }`}
                    >
                      {product.stockQuantity}
                    </p>
                    <p className="text-xs text-slate-400">adet</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-3 flex gap-2">
                  <Link
                    href={`/warehouse/count?productId=${product.id}&productName=${encodeURIComponent(product.name)}&sku=${encodeURIComponent(product.sku)}`}
                    className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-center text-xs font-semibold text-white hover:bg-slate-700"
                  >
                    Sayım Gir
                  </Link>
                  <Link
                    href={`/products/${product.id}`}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-center text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Detay
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!query && (
        <p className="text-center text-sm text-slate-400">
          Aramak için en az 2 karakter girin.
        </p>
      )}
    </div>
  );
}

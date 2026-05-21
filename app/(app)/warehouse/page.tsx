import Link from "next/link";
import { Warehouse, Package, AlertTriangle, MapPin, Search, Check } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
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
            // Phase 89 — physical count for variance display
            physicalCountQuantity: true,
            physicalCountAt: true,
          },
          orderBy: { name: "asc" },
          take: 20,
        })
      : [];

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
      <PageHeader
        icon={Warehouse}
        breadcrumb={[{ label: "Ürünler & Stok" }, { label: "Depo" }]}
        title="Depo"
        subtitle="Barkod, SKU veya ürün adıyla ürün ara — depo elemanı için mobil-uyumlu sayfa."
      />

      {/* Search form */}
      <form method="GET" action="/warehouse">
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Search
              size={14}
              strokeWidth={1.5}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            />
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Barkod / SKU / Ürün adı..."
              autoFocus
              className="w-full rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] py-3 pl-9 pr-3 text-base text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none transition focus:border-[var(--accent-border)]"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-[var(--accent)] px-5 py-3 text-sm font-semibold text-[var(--accent-fg)] transition hover:brightness-110"
          >
            Ara
          </button>
        </div>
      </form>

      {/* Quick actions */}
      <div className="flex gap-3">
        <Link
          href="/warehouse/count"
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-4 py-3 text-center text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-3)]"
        >
          <Package size={14} strokeWidth={1.5} />
          Stok Sayımı
        </Link>
        <Link
          href="/admin/stock-health"
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-4 py-3 text-center text-sm font-medium text-[var(--text-primary)] transition hover:bg-[var(--surface-3)]"
        >
          <AlertTriangle size={14} strokeWidth={1.5} className="text-[var(--warn)]" />
          Stok Sağlığı
        </Link>
      </div>

      {/* Results */}
      {query.length >= 2 && products.length === 0 && (
        <p className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] px-5 py-8 text-center text-sm text-[var(--text-secondary)]">
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
                className={`rounded-lg border bg-[var(--surface-2)] p-4 transition hover:bg-[var(--surface-3)] ${
                  isCritical
                    ? "border-[var(--danger-border)]"
                    : isLow
                      ? "border-[var(--warn-border)]"
                      : "border-[var(--border-default)]"
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Image */}
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="h-16 w-16 flex-shrink-0 rounded-md object-cover border border-[var(--border-subtle)]"
                    />
                  ) : (
                    <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-md bg-[var(--surface-1)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                      <Package size={14} strokeWidth={1.5} />
                    </div>
                  )}

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-[var(--text-primary)]">
                      {product.name}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--text-secondary)] font-mono tabular-nums">
                      SKU: {product.sku}
                      {product.barcode && ` · ${product.barcode}`}
                    </p>
                    {product.location && (
                      <p className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
                        <MapPin size={14} strokeWidth={1.5} />
                        {product.location}
                      </p>
                    )}
                  </div>

                  {/* Stock badge — Entegra source-of-truth + physical count variance */}
                  <div className="flex-shrink-0 text-right">
                    <p
                      className={`text-[28px] font-semibold tabular-nums font-mono leading-tight ${
                        isCritical
                          ? "text-[var(--danger)]"
                          : isLow
                            ? "text-[var(--warn)]"
                            : "text-[var(--ok)]"
                      }`}
                    >
                      {product.stockQuantity}
                    </p>
                    <p className="text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Entegra</p>
                    {product.physicalCountQuantity != null && (() => {
                      const variance = product.stockQuantity - product.physicalCountQuantity;
                      const tone =
                        variance === 0 ? "text-[var(--ok)]"
                        : variance > 0 ? "text-[var(--warn)]"
                        : "text-[var(--danger)]";
                      return (
                        <div className="mt-1 text-[11px] text-[var(--text-secondary)] font-mono tabular-nums">
                          <span>Sayım: <span className="font-semibold text-[var(--text-primary)]">{product.physicalCountQuantity}</span></span>
                          <span className={`ml-1 inline-flex items-center font-semibold ${tone}`}>
                            {variance === 0 ? <Check size={14} strokeWidth={1.5} /> : variance > 0 ? `(+${variance})` : `(${variance})`}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-3 flex gap-2">
                  <Link
                    href={`/warehouse/count?productId=${product.id}&productName=${encodeURIComponent(product.name)}&sku=${encodeURIComponent(product.sku)}`}
                    className="flex-1 rounded-md bg-[var(--accent)] px-3 py-2 text-center text-xs font-semibold text-[var(--accent-fg)] transition hover:brightness-110"
                  >
                    Sayım Gir
                  </Link>
                  <Link
                    href={`/products/${product.id}`}
                    className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-3 py-2 text-center text-xs font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
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
        <p className="text-center text-sm text-[var(--text-muted)]">
          Aramak için en az 2 karakter girin.
        </p>
      )}
    </div>
  );
}

import Link from "next/link";

import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// ── Helpers ───────────────────────────────────────────────────────────────────

function IssueCount({
  count,
  label,
  tone = "default",
}: {
  count: number;
  label: string;
  tone?: "ok" | "warn" | "danger" | "default";
}) {
  const colours = {
    ok:      "border-emerald-200 bg-emerald-50 text-emerald-700",
    warn:    "border-amber-200   bg-amber-50   text-amber-700",
    danger:  "border-red-200     bg-red-50     text-red-700",
    default: "border-slate-200   bg-white      text-slate-700",
  };
  return (
    <div className={`rounded-xl border p-4 ${colours[tone]}`}>
      <p className="text-3xl font-bold">{count}</p>
      <p className="mt-1 text-sm font-medium">{label}</p>
    </div>
  );
}

function Section({
  title,
  subtitle,
  count,
  children,
}: {
  title: string;
  subtitle: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${
            count === 0
              ? "bg-emerald-100 text-emerald-700"
              : "bg-red-100 text-red-700"
          }`}
        >
          {count === 0 ? "✓ Temiz" : `${count} sorun`}
        </span>
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="text-sm text-emerald-600">✓ {message}</p>
  );
}

function ProductTable({
  products,
  columns,
}: {
  products: Array<{ id: string; sku: string; name: string; extra?: string }>;
  columns?: { header: string; key: "extra" }[];
}) {
  if (products.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
            <th className="pb-2 pr-4">SKU</th>
            <th className="pb-2 pr-4">Ürün Adı</th>
            {columns?.map((c) => (
              <th key={c.key} className="pb-2 pr-4">
                {c.header}
              </th>
            ))}
            <th className="pb-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {products.map((p) => (
            <tr key={p.id} className="hover:bg-slate-50">
              <td className="py-2 pr-4 font-mono text-xs text-slate-500">{p.sku}</td>
              <td className="py-2 pr-4 font-medium text-slate-900">{p.name}</td>
              {columns?.map((c) => (
                <td key={c.key} className="py-2 pr-4 text-slate-600">
                  {p.extra ?? "—"}
                </td>
              ))}
              <td className="py-2 text-right">
                <Link
                  href={`/products/${p.id}/edit`}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Düzenle →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DataHygienePage() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  // Fetch all active products with the fields we need for hygiene checks
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      sku: true,
      name: true,
      barcode: true,
      categoryId: true,
      stockQuantity: true,
      unitCostTry: true,
      sellingPriceTry: true,
      marketplacePriceTry: true,
      wholesalePriceTry: true,
      xmlImported: true,
      supplierLinks: { select: { id: true }, take: 1 },
    },
    orderBy: { name: "asc" },
  });

  // ── Hygiene checks ─────────────────────────────────────────────────────────

  const missingCost = products
    .filter((p) => !p.unitCostTry)
    .map((p) => ({ id: p.id, sku: p.sku, name: p.name }));

  const missingRetailPrice = products
    .filter((p) => !p.sellingPriceTry)
    .map((p) => ({ id: p.id, sku: p.sku, name: p.name }));

  const missingMarketplacePrice = products
    .filter((p) => !p.marketplacePriceTry)
    .map((p) => ({ id: p.id, sku: p.sku, name: p.name }));

  const missingCategory = products
    .filter((p) => !p.categoryId)
    .map((p) => ({ id: p.id, sku: p.sku, name: p.name }));

  const missingBarcode = products
    .filter((p) => !p.barcode)
    .map((p) => ({ id: p.id, sku: p.sku, name: p.name }));

  const missingSupplier = products
    .filter((p) => p.supplierLinks.length === 0)
    .map((p) => ({ id: p.id, sku: p.sku, name: p.name }));

  const stockWithNoCost = products
    .filter((p) => p.stockQuantity > 0 && !p.unitCostTry)
    .map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      extra: `${p.stockQuantity} adet stok`,
    }));

  const xmlNoPrice = products
    .filter((p) => p.xmlImported && !p.marketplacePriceTry && !p.sellingPriceTry)
    .map((p) => ({ id: p.id, sku: p.sku, name: p.name }));

  const totalIssues =
    missingCost.length +
    missingRetailPrice.length +
    missingMarketplacePrice.length +
    missingCategory.length +
    missingBarcode.length +
    missingSupplier.length +
    stockWithNoCost.length +
    xmlNoPrice.length;

  const totalProducts = products.length;
  const cleanProducts = products.filter(
    (p) =>
      p.unitCostTry &&
      p.sellingPriceTry &&
      p.marketplacePriceTry &&
      p.categoryId &&
      p.barcode
  ).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
          YÖNETİM / VERİ KALİTESİ
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          Veri Hijyeni
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Eksik maliyet, fiyat, kategori ve tanımlayıcı alanlarına sahip ürünleri
          listeler. Düzeltme için Düzenle bağlantılarını kullanın.
        </p>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <IssueCount
          count={totalProducts}
          label="Aktif Ürün"
          tone="default"
        />
        <IssueCount
          count={cleanProducts}
          label="Tam Dolu Ürün"
          tone={cleanProducts === totalProducts ? "ok" : "default"}
        />
        <IssueCount
          count={totalIssues}
          label="Toplam Sorun"
          tone={totalIssues === 0 ? "ok" : totalIssues < 50 ? "warn" : "danger"}
        />
        <IssueCount
          count={stockWithNoCost.length}
          label="Maliyetsiz Stoklu"
          tone={stockWithNoCost.length === 0 ? "ok" : "danger"}
        />
      </div>

      {totalIssues === 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-6 py-5 text-emerald-800">
          <p className="text-base font-semibold">✓ Veri tabanı temiz</p>
          <p className="mt-1 text-sm">
            Tüm aktif ürünlerin maliyet, fiyat, kategori ve barkod bilgileri dolu.
          </p>
        </div>
      )}

      {/* Section 1 — Missing cost */}
      <Section
        title="Maliyeti Eksik Ürünler"
        subtitle="unitCostTry alanı boş — kârlılık ve sermaye hesaplamaları çalışmaz"
        count={missingCost.length}
      >
        {missingCost.length === 0 ? (
          <EmptyState message="Tüm aktif ürünlerde birim maliyet (TL) tanımlı." />
        ) : (
          <ProductTable products={missingCost} />
        )}
      </Section>

      {/* Section 2 — Missing retail price */}
      <Section
        title="Perakende Fiyatı Eksik"
        subtitle="sellingPriceTry boş — perakende kâr analizi hesaplanamaz"
        count={missingRetailPrice.length}
      >
        {missingRetailPrice.length === 0 ? (
          <EmptyState message="Tüm aktif ürünlerde perakende satış fiyatı tanımlı." />
        ) : (
          <ProductTable products={missingRetailPrice} />
        )}
      </Section>

      {/* Section 3 — Missing marketplace price */}
      <Section
        title="Pazar Yeri Fiyatı Eksik"
        subtitle="marketplacePriceTry boş — Trendyol/pazar yeri kâr analizi çalışmaz"
        count={missingMarketplacePrice.length}
      >
        {missingMarketplacePrice.length === 0 ? (
          <EmptyState message="Tüm aktif ürünlerde pazar yeri fiyatı tanımlı." />
        ) : (
          <ProductTable products={missingMarketplacePrice} />
        )}
      </Section>

      {/* Section 4 — Stock with no cost (highest priority) */}
      <Section
        title="Stokta Var, Maliyeti Yok"
        subtitle="stockQuantity > 0 ama unitCostTry boş — stok değeri hesaplanamaz"
        count={stockWithNoCost.length}
      >
        {stockWithNoCost.length === 0 ? (
          <EmptyState message="Stok miktarı olan tüm ürünlerin maliyeti tanımlı." />
        ) : (
          <ProductTable
            products={stockWithNoCost}
            columns={[{ header: "Stok", key: "extra" }]}
          />
        )}
      </Section>

      {/* Section 5 — XML imported but no prices */}
      <Section
        title="XML İthalatı — Fiyatsız Ürünler"
        subtitle="XML'den gelen ürünlerin ne perakende ne de pazar yeri fiyatı yok"
        count={xmlNoPrice.length}
      >
        {xmlNoPrice.length === 0 ? (
          <EmptyState message="Tüm XML ithal ürünlerinde en az bir satış fiyatı tanımlı." />
        ) : (
          <ProductTable products={xmlNoPrice} />
        )}
      </Section>

      {/* Section 6 — Missing category */}
      <Section
        title="Kategorisi Eksik Ürünler"
        subtitle="categoryId boş — kategori bazlı filtreleme ve kampanya hedeflemesi çalışmaz"
        count={missingCategory.length}
      >
        {missingCategory.length === 0 ? (
          <EmptyState message="Tüm aktif ürünlerde kategori tanımlı." />
        ) : (
          <ProductTable products={missingCategory} />
        )}
      </Section>

      {/* Section 7 — Missing barcode */}
      <Section
        title="Barkodu Eksik Ürünler"
        subtitle="barcode boş — XML eşleştirme ve pazar yeri barcode doğrulaması çalışmaz"
        count={missingBarcode.length}
      >
        {missingBarcode.length === 0 ? (
          <EmptyState message="Tüm aktif ürünlerde barkod tanımlı." />
        ) : (
          <ProductTable products={missingBarcode} />
        )}
      </Section>

      {/* Section 8 — Missing supplier */}
      <Section
        title="Tedarikçi Bağlantısı Eksik"
        subtitle="Hiç SupplierProduct bağlantısı olmayan ürünler — tedarik maliyeti bilinemez"
        count={missingSupplier.length}
      >
        {missingSupplier.length === 0 ? (
          <EmptyState message="Tüm aktif ürünlerin en az bir tedarikçi bağlantısı var." />
        ) : (
          <ProductTable products={missingSupplier} />
        )}
      </Section>

      {/* Footer */}
      <div className="flex flex-wrap gap-4 text-sm text-slate-500">
        <Link href="/products" className="hover:text-slate-900 hover:underline">
          ← Ürünler
        </Link>
        <Link
          href="/admin/executive"
          className="hover:text-slate-900 hover:underline"
        >
          Yönetici Paneli →
        </Link>
        <Link
          href="/admin/procurement"
          className="hover:text-slate-900 hover:underline"
        >
          Tedarik Asistanı →
        </Link>
      </div>
    </div>
  );
}

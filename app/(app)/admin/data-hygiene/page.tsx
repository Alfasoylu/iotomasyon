import Link from "next/link";
import { Check } from "lucide-react";

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
  const valueColor = {
    ok: "text-[var(--ok)]",
    warn: "text-[var(--warn)]",
    danger: "text-[var(--danger)]",
    default: "text-[var(--text-primary)]",
  }[tone];

  return (
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-4">
      <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
        {label}
      </p>
      <p className={`mt-2 text-[28px] font-semibold leading-tight tabular-nums ${valueColor}`}>
        {count}
      </p>
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
    <section className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)]">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-4">
        <div>
          <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            {title}
          </h2>
          <p className="mt-1.5 text-sm text-[var(--text-secondary)]">{subtitle}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${
            count === 0
              ? "border-[var(--ok-border)] bg-[var(--ok-dim)] text-[var(--ok)]"
              : "border-[var(--danger-border)] bg-[var(--danger-dim)] text-[var(--danger)]"
          }`}
        >
          {count === 0 ? (
            <>
              <Check size={14} strokeWidth={1.5} /> Temiz
            </>
          ) : (
            `${count} sorun`
          )}
        </span>
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="flex items-center gap-1.5 text-sm text-[var(--ok)]">
      <Check size={14} strokeWidth={1.5} /> {message}
    </p>
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
          <tr className="border-b border-[var(--border-subtle)] text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
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
        <tbody className="divide-y divide-[var(--border-subtle)]">
          {products.map((p) => (
            <tr key={p.id} className="hover:bg-[var(--surface-3)]">
              <td className="py-2 pr-4 font-mono text-xs tabular-nums text-[var(--text-muted)]">
                {p.sku}
              </td>
              <td className="py-2 pr-4 font-medium text-[var(--text-primary)]">{p.name}</td>
              {columns?.map((c) => (
                <td
                  key={c.key}
                  className="py-2 pr-4 font-mono tabular-nums text-[var(--text-secondary)]"
                >
                  {p.extra ?? "—"}
                </td>
              ))}
              <td className="py-2 text-right">
                <Link
                  href={`/products/${p.id}/edit`}
                  className="text-xs text-[var(--accent)] hover:brightness-110"
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
        <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
          YÖNETİM / VERİ KALİTESİ
        </p>
        <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
          Veri Hijyeni
        </h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Eksik maliyet, fiyat, kategori ve tanımlayıcı alanlarına sahip ürünleri listeler.
          Düzeltme için Düzenle bağlantılarını kullanın.
        </p>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <IssueCount count={totalProducts} label="Aktif Ürün" tone="default" />
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
        <div className="rounded-lg border border-[var(--ok-border)] bg-[var(--ok-dim)] px-6 py-5">
          <p className="flex items-center gap-1.5 text-base font-semibold text-[var(--ok)]">
            <Check size={14} strokeWidth={1.5} /> Veri tabanı temiz
          </p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
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
      <div className="flex flex-wrap gap-4 text-sm text-[var(--text-secondary)]">
        <Link href="/products" className="transition-colors hover:text-[var(--text-primary)]">
          ← Ürünler
        </Link>
        <Link
          href="/admin/executive"
          className="transition-colors hover:text-[var(--text-primary)]"
        >
          Yönetici Paneli →
        </Link>
        <Link
          href="/admin/procurement"
          className="transition-colors hover:text-[var(--text-primary)]"
        >
          Tedarik Asistanı →
        </Link>
      </div>
    </div>
  );
}

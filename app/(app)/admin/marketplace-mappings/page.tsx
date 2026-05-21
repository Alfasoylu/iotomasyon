/**
 * Phase 16 — Marketplace Product Mapping Management
 * Phase 37 — Unmatched Barcodes Inbox
 * Phase 41 — Bulk Backfill Engine (BulkBackfillButton in header)
 * Phase 61 — Normalized Barcode Re-Match (RematchNormalizedButton in header)
 *
 * Manage many-to-one mappings: multiple platform identities → one internal product.
 * Supports Trendyol and all other MarketplacePlatform values.
 *
 * Phase 37 adds an "Eşleşmemiş Barkodlar" inbox above the add form, showing top
 * unmatched Trendyol barcodes sorted by revenue. Clicking "Eşleştir →" pre-fills
 * the barcode field via ?barcode= search param.
 *
 * Phase 41 adds "Tüm Eşleştirmeleri Uygula" button that runs backfill for all
 * existing mappings against all unmatched TrendyolSalesRecord / TrendyolReturnRecord
 * rows. Per-mapping save also now surfaces backfill count in success message.
 */

import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MappingForm, DeleteMappingButton } from "@/components/marketplace/mapping-form";
import { BulkBackfillButton } from "@/components/marketplace/bulk-backfill-button";
import { RematchNormalizedButton } from "@/components/marketplace/rematch-normalized-button";

export const dynamic = "force-dynamic";

const PLATFORM_LABELS: Record<string, string> = {
  TRENDYOL: "Trendyol",
  HEPSIBURADA: "Hepsiburada",
  N11: "N11",
  PTTAVM: "PttAVM",
  KOCTAS: "Koçtaş",
  TEKNOSA: "Teknosa",
  TEMU: "Temu",
  CUSTOM: "Diğer",
};

function fmt(n: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function MarketplaceMappingsPage({
  searchParams,
}: {
  searchParams: Promise<{ barcode?: string; title?: string }>;
}) {
  await requirePermission(PERMISSIONS.MARKETPLACE_MAPPINGS_READ);

  const params = await searchParams;
  const defaultBarcode = params.barcode ?? "";
  const defaultPlatformTitle = params.title ?? "";

  const [mappings, products, unmatchedSalesRaw] = await Promise.all([
    prisma.marketplaceProductMapping.findMany({
      include: {
        product: { select: { id: true, name: true, sku: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.product.findMany({
      select: { id: true, name: true, sku: true },
      orderBy: { name: "asc" },
    }),
    // Phase 37: fetch unmatched sales for inbox
    prisma.trendyolSalesRecord.findMany({
      where: { productId: null, barcode: { not: null } },
      select: { barcode: true, merchantSku: true, productName: true, totalPriceTry: true },
    }),
  ]);

  // ── Group unmatched by barcode, sort by revenue ───────────────────────────
  const byBarcode = new Map<
    string,
    { productName: string; merchantSku: string | null; revenue: number; count: number }
  >();
  for (const r of unmatchedSalesRaw) {
    if (!r.barcode) continue;
    const cur = byBarcode.get(r.barcode);
    if (cur) {
      cur.revenue += Number(r.totalPriceTry);
      cur.count++;
    } else {
      byBarcode.set(r.barcode, {
        productName: r.productName,
        merchantSku: r.merchantSku,
        revenue: Number(r.totalPriceTry),
        count: 1,
      });
    }
  }
  const unmatchedTop = [...byBarcode.entries()]
    .sort(([, a], [, b]) => b.revenue - a.revenue)
    .slice(0, 30)
    .map(([barcode, data]) => ({ barcode, ...data }));

  const totalUnmatched = byBarcode.size;
  const totalUnmatchedRevenue = [...byBarcode.values()].reduce((s, v) => s + v.revenue, 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Yönetim / Ürün Eşleştirme
          </p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
            Pazar Yeri Ürün Eşleştirme
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Platform kimliklerini (barkod, SKU, listeleme ID) iç ürünlere bağlayın.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <BulkBackfillButton />
          <RematchNormalizedButton />
          <Link href="/admin">
            <Button variant="secondary">← Admin Panel</Button>
          </Link>
        </div>
      </div>

      {/* ── Phase 37: Unmatched Barcodes Inbox ── */}
      {unmatchedTop.length > 0 && (
        <Card className="overflow-hidden rounded-lg">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-subtle)] px-6 py-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                Trendyol / Eşleşmemiş
              </p>
              <h2 className="mt-1 flex items-center gap-2 text-base font-semibold text-[var(--text-primary)]">
                Eşleşmemiş Barkodlar
                <span className="rounded-md border border-[var(--warn-border)] bg-[var(--warn-dim)] px-2 py-0.5 text-xs font-medium tabular-nums font-mono text-[var(--warn)]">
                  {totalUnmatched} barkod
                </span>
              </h2>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Bu satışlar hiçbir iç ürünle eşleşmedi.{" "}
                <span className="font-medium tabular-nums font-mono text-[var(--warn)]">{fmt(totalUnmatchedRevenue)}</span>{" "}
                tutarında ciro kârlılık analizine dahil edilemiyor.
                {totalUnmatched > 30 && (
                  <span className="ml-1 text-[var(--text-muted)]">(İlk 30 barkod gösteriliyor.)</span>
                )}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)] text-[11px] uppercase tracking-widest text-[var(--text-muted)]">
                  <th className="px-4 py-3 text-left font-medium">Platform Barkod</th>
                  <th className="px-4 py-3 text-left font-medium">Trendyol Ürün Adı</th>
                  <th className="px-4 py-3 text-left font-medium">SKU</th>
                  <th className="px-4 py-3 text-right font-medium">Kayıt</th>
                  <th className="px-4 py-3 text-right font-medium">Toplam Ciro</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {unmatchedTop.map((row) => (
                  <tr
                    key={row.barcode}
                    className={`hover:bg-[var(--surface-1)] ${
                      defaultBarcode === row.barcode ? "ring-1 ring-inset ring-[var(--warn-border)] bg-[var(--warn-dim)]" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-[var(--text-primary)]">{row.barcode}</td>
                    <td className="px-4 py-3 max-w-[260px] truncate text-xs text-[var(--text-secondary)]">
                      {row.productName}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]">
                      {row.merchantSku ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-mono text-xs text-[var(--text-muted)]">
                      {row.count}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-mono text-xs font-semibold text-[var(--text-primary)]">
                      {fmt(row.revenue)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/marketplace-mappings?barcode=${encodeURIComponent(row.barcode)}&title=${encodeURIComponent(row.productName)}#add-form`}
                        className="rounded-md border border-[var(--warn-border)] bg-[var(--warn-dim)] px-3 py-1 text-xs font-medium text-[var(--warn)] hover:bg-[var(--surface-3)]"
                      >
                        Eşleştir →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Add form */}
      <div id="add-form">
      <Card className="p-6 space-y-4 rounded-lg">
        <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-secondary)]">
          Yeni Eşleştirme Ekle
          {defaultBarcode && (
            <span className="ml-2 rounded-md border border-[var(--warn-border)] bg-[var(--warn-dim)] px-2 py-0.5 font-mono text-xs font-normal normal-case tracking-normal text-[var(--warn)]">
              Barkod ön dolduruldu: {defaultBarcode}
            </span>
          )}
        </h2>
        <MappingForm
          products={products}
          defaultBarcode={defaultBarcode}
          defaultPlatformTitle={defaultPlatformTitle}
        />
      </Card>
      </div>

      {/* Mappings list */}
      <div className="space-y-3">
        <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-secondary)]">
          Mevcut Eşleştirmeler ({mappings.length})
        </h2>
        {mappings.length === 0 ? (
          <Card className="p-10 text-center rounded-lg">
            <p className="text-sm text-[var(--text-muted)]">Henüz eşleştirme eklenmedi.</p>
          </Card>
        ) : (
          <Card className="overflow-hidden rounded-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)]">
                    <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Platform</th>
                    <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">İç Ürün</th>
                    <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Barkod</th>
                    <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">SKU</th>
                    <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Listeleme ID</th>
                    <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Platform Başlığı</th>
                    <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Güven</th>
                    <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Ekleyen</th>
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((m) => (
                    <tr key={m.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--surface-1)]">
                      <td className="py-3 px-4">
                        <span className="rounded-md border border-[var(--info-border)] bg-[var(--info-dim)] px-2 py-0.5 text-xs font-medium text-[var(--info)]">
                          {PLATFORM_LABELS[m.platform] ?? m.platform}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <Link
                          href={`/products/${m.product.id}`}
                          className="text-xs font-medium text-[var(--text-primary)] hover:text-[var(--accent)] underline decoration-dotted"
                        >
                          {m.product.name}
                        </Link>
                        {m.product.sku && (
                          <span className="block font-mono text-[10px] text-[var(--text-muted)]">{m.product.sku}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-[var(--text-secondary)]">{m.platformBarcode ?? "—"}</td>
                      <td className="py-3 px-4 font-mono text-xs text-[var(--text-secondary)]">{m.platformSku ?? "—"}</td>
                      <td className="py-3 px-4 font-mono text-xs text-[var(--text-secondary)]">{m.platformListingId ?? "—"}</td>
                      <td className="py-3 px-4 text-xs text-[var(--text-muted)] max-w-[180px] truncate">{m.platformTitle ?? "—"}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${
                            m.confidence === "MANUAL"
                              ? "border-[var(--border-default)] bg-[var(--surface-3)] text-[var(--text-secondary)]"
                              : "border-[var(--ok-border)] bg-[var(--ok-dim)] text-[var(--ok)]"
                          }`}
                        >
                          {m.confidence}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-[var(--text-muted)]">{m.createdBy?.name ?? "—"}</td>
                      <td className="py-3 px-4">
                        <DeleteMappingButton id={m.id} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

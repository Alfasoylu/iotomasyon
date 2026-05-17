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
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Yönetim / Ürün Eşleştirme
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Pazar Yeri Ürün Eşleştirme
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
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
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
                Trendyol / Eşleşmemiş
              </p>
              <h2 className="mt-1 text-lg font-semibold text-slate-900">
                Eşleşmemiş Barkodlar
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-sm font-semibold text-amber-800">
                  {totalUnmatched} barkod
                </span>
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Bu satışlar hiçbir iç ürünle eşleşmedi.{" "}
                <span className="font-medium text-amber-700">{fmt(totalUnmatchedRevenue)}</span>{" "}
                tutarında ciro kârlılık analizine dahil edilemiyor.
                {totalUnmatched > 30 && (
                  <span className="ml-1 text-slate-400">(İlk 30 barkod gösteriliyor.)</span>
                )}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-widest text-slate-500">
                  <th className="px-4 py-3 text-left">Platform Barkod</th>
                  <th className="px-4 py-3 text-left">Trendyol Ürün Adı</th>
                  <th className="px-4 py-3 text-left">SKU</th>
                  <th className="px-4 py-3 text-right">Kayıt</th>
                  <th className="px-4 py-3 text-right">Toplam Ciro</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {unmatchedTop.map((row, i) => (
                  <tr
                    key={row.barcode}
                    className={`${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"} ${
                      defaultBarcode === row.barcode ? "ring-2 ring-inset ring-amber-300" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{row.barcode}</td>
                    <td className="px-4 py-3 max-w-[260px] truncate text-xs text-slate-600">
                      {row.productName}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">
                      {row.merchantSku ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs text-slate-500">
                      {row.count}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs font-semibold text-slate-700">
                      {fmt(row.revenue)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/marketplace-mappings?barcode=${encodeURIComponent(row.barcode)}&title=${encodeURIComponent(row.productName)}#add-form`}
                        className="rounded-md bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-200"
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
      <Card className="p-6 space-y-4">
        <h2 className="text-sm font-semibold text-slate-800">
          Yeni Eşleştirme Ekle
          {defaultBarcode && (
            <span className="ml-2 font-mono text-xs font-normal text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
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
        <h2 className="text-sm font-semibold text-slate-800">
          Mevcut Eşleştirmeler ({mappings.length})
        </h2>
        {mappings.length === 0 ? (
          <Card className="p-10 text-center">
            <p className="text-slate-400 text-sm">Henüz eşleştirme eklenmedi.</p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-slate-700 border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Platform</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">İç Ürün</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Barkod</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">SKU</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Listeleme ID</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Platform Başlığı</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Güven</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Ekleyen</th>
                    <th className="py-3 px-4"></th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((m) => (
                    <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-3 px-4">
                        <span className="rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-xs font-medium">
                          {PLATFORM_LABELS[m.platform] ?? m.platform}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <Link
                          href={`/products/${m.product.id}`}
                          className="text-xs font-medium text-slate-800 hover:text-slate-950 underline decoration-dotted"
                        >
                          {m.product.name}
                        </Link>
                        {m.product.sku && (
                          <span className="block font-mono text-[10px] text-slate-400">{m.product.sku}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600">{m.platformBarcode ?? "—"}</td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600">{m.platformSku ?? "—"}</td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600">{m.platformListingId ?? "—"}</td>
                      <td className="py-3 px-4 text-xs text-slate-500 max-w-[180px] truncate">{m.platformTitle ?? "—"}</td>
                      <td className="py-3 px-4">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${m.confidence === "MANUAL" ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-700"}`}>
                          {m.confidence}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-400">{m.createdBy?.name ?? "—"}</td>
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

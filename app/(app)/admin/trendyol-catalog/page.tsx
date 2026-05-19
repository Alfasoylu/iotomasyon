/**
 * Phase 46 — Trendyol Catalog View
 *
 * Fetches the seller's product catalog from Trendyol (up to 200 products,
 * 4 pages of 50) and compares each item to internal Product records by barcode.
 *
 * Shows:
 *   - Matched products: product link, Trendyol stock vs internal stock, delta
 *   - Unmatched: products on Trendyol with no internal match (barcode missing)
 *   - Summary KPI cards
 *
 * Read-only. No writes to Trendyol or our DB.
 *
 * Trendyol policy: READ-ONLY. The previous /admin/trendyol-stock-sync push
 * page has been removed (see docs/NEXT-STEPS.md "Architecture Constraints").
 * Links to /admin/marketplace-mappings to add mappings.
 */

import Link from "next/link";

import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fetchTrendyolCatalog, TrendyolCatalogProduct, TrendyolApiError } from "@/lib/trendyol-api";
import { Card } from "@/components/ui/card";
import { MissingListingsTable } from "@/components/admin/missing-listings-table";
import { TrendyolMatchedTable } from "@/components/admin/trendyol-matched-table";
import { TrendyolUnmatchedTable } from "@/components/admin/trendyol-unmatched-table";

export const dynamic = "force-dynamic";

interface MatchedRow {
  barcode: string;
  trendyolTitle: string;
  trendyolQty: number;
  trendyolPrice: number;
  internalQty: number;
  productId: string;
  productName: string;
  sku: string | null;
  delta: number; // internalQty - trendyolQty (positive = internal has more)
}

interface UnmatchedRow {
  barcode: string | null;
  trendyolTitle: string;
  trendyolQty: number;
  trendyolPrice: number;
  stockCode: string | null;
}

interface MissingListingRow {
  productId: string;
  productName: string;
  sku: string;
  barcode: string | null;
  brand: string | null;
  stockQuantity: number;
  /** Trendyol satış geçmişi var mı? Daha önce satılmışsa muhtemelen listemeden düşmüş. */
  lifetimeSold: number;
}

export default async function TrendyolCatalogPage() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  const config = await prisma.trendyolConfig.findUnique({ where: { id: "singleton" } });

  if (!config?.supplierId || !config?.apiKey || !config?.apiSecret || !config?.isEnabled) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Faz 46 — Trendyol Katalog</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Trendyol Katalog</h1>
        </div>
        <Card className="p-6 border-amber-200 bg-amber-50">
          <p className="text-sm font-semibold text-amber-900">Trendyol API yapılandırması eksik veya devre dışı.</p>
          <Link href="/admin/trendyol" className="mt-2 inline-block text-xs text-amber-700 underline">
            Trendyol API yapılandırmasına git →
          </Link>
        </Card>
      </div>
    );
  }

  const cfg = { supplierId: config.supplierId, apiKey: config.apiKey, apiSecret: config.apiSecret };

  // Fetch TÜM sayfalar (Trendyol'da binlerce ürün olabilir)
  // Paralelizasyon: 8'erli batch, her batch arasında bekleme yok.
  let trendyolProducts: TrendyolCatalogProduct[] = [];
  let fetchError: string | null = null;
  let totalElements = 0;
  let totalPages = 0;

  try {
    const first = await fetchTrendyolCatalog(cfg, { page: 0, size: 100, approved: true });
    totalElements = first.totalElements;
    totalPages = first.totalPages;
    trendyolProducts = [...first.content];

    if (totalPages > 1) {
      const PARALLEL_BATCH = 8;
      const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 1);
      for (let i = 0; i < remainingPages.length; i += PARALLEL_BATCH) {
        const batch = remainingPages.slice(i, i + PARALLEL_BATCH);
        const results = await Promise.all(
          batch.map((page) =>
            fetchTrendyolCatalog(cfg, { page, size: 100, approved: true })
          )
        );
        for (const r of results) trendyolProducts.push(...r.content);
      }
    }
  } catch (err) {
    fetchError = err instanceof TrendyolApiError
      ? `Trendyol API ${err.status}: ${err.body.slice(0, 300)}`
      : err instanceof Error ? err.message : "Bilinmeyen hata";
  }

  // Build internal product lookup by barcode and SKU
  type InternalProduct = {
    id: string; name: string; sku: string; brand: string | null;
    barcode: string | null; stockQuantity: number;
  };
  const barcodeMap = new Map<string, InternalProduct>();
  const skuMap = new Map<string, InternalProduct>();
  let internalProducts: InternalProduct[] = [];

  if (!fetchError) {
    internalProducts = (await prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, name: true, sku: true, brand: true, barcode: true, stockQuantity: true },
    })) as InternalProduct[];
    for (const p of internalProducts) {
      if (p.barcode) barcodeMap.set(p.barcode.toLowerCase(), p);
      if (p.sku) skuMap.set(p.sku.toLowerCase(), p);
    }
  }

  // Classify Trendyol products
  const matched: MatchedRow[] = [];
  const unmatched: UnmatchedRow[] = [];

  for (const tp of trendyolProducts) {
    const barcode = tp.barcode?.toLowerCase() ?? null;
    const stockCode = tp.stockCode?.toLowerCase() ?? null;

    const internal = (barcode ? barcodeMap.get(barcode) : null) ?? (stockCode ? skuMap.get(stockCode) : null);

    const qty = tp.quantity ?? 0;
    const price = tp.salePrice ?? tp.listPrice ?? 0;

    if (internal) {
      matched.push({
        barcode: tp.barcode ?? "",
        trendyolTitle: tp.title,
        trendyolQty: qty,
        trendyolPrice: price,
        internalQty: internal.stockQuantity,
        productId: internal.id,
        productName: internal.name,
        sku: internal.sku,
        delta: internal.stockQuantity - qty,
      });
    } else {
      unmatched.push({
        barcode: tp.barcode,
        trendyolTitle: tp.title,
        trendyolQty: qty,
        trendyolPrice: price,
        stockCode: tp.stockCode,
      });
    }
  }

  // Sort: synced last, diverged (risk) first
  matched.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  const oversellCount = matched.filter((r) => r.delta < 0).length;
  const inSyncCount = matched.filter((r) => r.delta === 0).length;
  const surplusCount = matched.filter((r) => r.delta > 0).length;

  // ── Eksik Listeme: stoğumuzda var ama Trendyol'da yok ──────────────────────
  // Trendyol katalogunda gördüğümüz tüm barkod + stockCode'lar (lowercase)
  const trendyolBarcodes = new Set<string>();
  const trendyolStockCodes = new Set<string>();
  for (const tp of trendyolProducts) {
    if (tp.barcode) trendyolBarcodes.add(tp.barcode.toLowerCase());
    if (tp.stockCode) trendyolStockCodes.add(tp.stockCode.toLowerCase());
  }

  // Trendyol satış geçmişi olan ürünler (lifetime sold > 0 — daha önce satılmış)
  let lifetimeMap = new Map<string, number>();
  if (!fetchError && internalProducts.length > 0) {
    const lifetime = await prisma.trendyolSalesRecord.groupBy({
      by: ["productId"],
      where: {
        productId: { not: null },
        NOT: [
          { status: { contains: "iptal", mode: "insensitive" } },
          { status: { contains: "cancel", mode: "insensitive" } },
        ],
      },
      _sum: { quantity: true },
    });
    lifetimeMap = new Map(
      lifetime.filter((x) => x.productId).map((x) => [x.productId!, x._sum.quantity ?? 0])
    );
  }

  const missingListings: MissingListingRow[] = [];
  for (const p of internalProducts) {
    const barLower = p.barcode?.toLowerCase() ?? null;
    const skuLower = p.sku.toLowerCase();
    const inTrendyol =
      (barLower && trendyolBarcodes.has(barLower)) ||
      trendyolStockCodes.has(skuLower) ||
      trendyolBarcodes.has(skuLower); // bazen barkod alanına SKU yazılmış
    if (!inTrendyol) {
      missingListings.push({
        productId: p.id,
        productName: p.name,
        sku: p.sku,
        barcode: p.barcode,
        brand: p.brand,
        stockQuantity: p.stockQuantity,
        lifetimeSold: lifetimeMap.get(p.id) ?? 0,
      });
    }
  }

  // Daha önce satılmış olanlar (büyük olasılıkla listemeden düşmüş) en üste
  missingListings.sort((a, b) => b.lifetimeSold - a.lifetimeSold);

  const missingPreviouslySold = missingListings.filter((m) => m.lifetimeSold > 0).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Faz 46 — Trendyol Katalog
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Trendyol Katalog
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Trendyol&apos;daki ürünler ile iç stok karşılaştırması.{" "}
            {totalElements > 0 && (
              <span className="text-slate-500">
                ({trendyolProducts.length} / {totalElements} ürün, {totalPages} sayfa çekildi)
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/admin/marketplace-mappings"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
          >
            Ürün Eşleştirme →
          </Link>
        </div>
      </div>

      {/* Fetch error */}
      {fetchError && (
        <Card className="p-6 border-red-200 bg-red-50">
          <p className="text-sm font-semibold text-red-900">Trendyol&apos;dan ürün listesi alınamadı.</p>
          <p className="mt-1 text-xs text-red-700 font-mono">{fetchError}</p>
        </Card>
      )}

      {!fetchError && (
        <>
          {/* Architecture banner */}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-3 text-xs leading-6 text-slate-600">
            🛡 <strong>Mimari:</strong> iotomasyon yalnızca Trendyol&apos;dan veri{" "}
            <strong>çeker</strong> (read-only). Pazaryerlerine ürün/stok/fiyat verisi{" "}
            <strong>Entegra</strong> üzerinden gönderilir. Stok düzeltmeleri Trendyol panelinden veya Entegra üzerinden yapılır.
          </div>

          {/* KPI cards — clickable navigate to relevant section */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <a href="#section-matched" className="block group">
              <Card className="p-5 transition group-hover:shadow-md group-hover:border-blue-200">
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Trendyol&apos;da</p>
                <p className="mt-2 text-4xl font-bold text-blue-700 tabular-nums">{trendyolProducts.length}</p>
                <p className="mt-1 text-xs text-slate-400">onaylı ürün · tıkla →</p>
              </Card>
            </a>
            <a href="#section-matched" className="block group">
              <Card className="p-5 transition group-hover:shadow-md group-hover:border-red-200">
                <p className="text-xs font-semibold uppercase tracking-wide text-red-500">Aşım Riski</p>
                <p className="mt-2 text-4xl font-bold text-red-600 tabular-nums">{oversellCount}</p>
                <p className="mt-1 text-xs text-slate-400">Trendyol fazla · tıkla →</p>
              </Card>
            </a>
            <a href="#section-matched" className="block group">
              <Card className="p-5 transition group-hover:shadow-md group-hover:border-emerald-200">
                <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Senkron</p>
                <p className="mt-2 text-4xl font-bold text-emerald-700 tabular-nums">{inSyncCount}</p>
                <p className="mt-1 text-xs text-slate-400">eşleşmiş · tıkla →</p>
              </Card>
            </a>
            <a href="#section-unmatched" className="block group">
              <Card className="p-5 transition group-hover:shadow-md group-hover:border-slate-300">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Trendyol&apos;da Eşleşmemiş</p>
                <p className="mt-2 text-4xl font-bold text-slate-500 tabular-nums">{unmatched.length}</p>
                <p className="mt-1 text-xs text-slate-400">iç sistemde yok · tıkla →</p>
              </Card>
            </a>
            <a href="#section-missing-listing" className="block group">
              <Card className="p-5 border-amber-200 bg-amber-50/40 transition group-hover:shadow-md group-hover:border-amber-400">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Eksik Listeme</p>
                <p className="mt-2 text-4xl font-bold text-amber-700 tabular-nums">{missingListings.length}</p>
                <p className="mt-1 text-xs text-amber-600">
                  stokta var, Trendyol&apos;da yok
                  {missingPreviouslySold > 0 && (
                    <> · {missingPreviouslySold} satılmış</>
                  )}{" "}
                  · tıkla →
                </p>
              </Card>
            </a>
          </div>

          {/* Matched products */}
          {matched.length > 0 && (
            <Card
              id="section-matched"
              className="overflow-hidden p-0 scroll-mt-24"
            >
              <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
                <h2 className="text-base font-semibold text-slate-950">
                  Eşleşmiş Ürünler — Stok Karşılaştırması
                </h2>
                <span className="ml-auto rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                  {matched.length} ürün
                </span>
              </div>
              <TrendyolMatchedTable rows={matched} />
              {oversellCount > 0 && (
                <div className="border-t border-slate-100 px-6 py-3 text-xs text-red-700 bg-red-50/50">
                  ⚠ {oversellCount} üründe Trendyol iç stoktan fazla gösteriyor — mükerrer satış riski.
                  Stok düzeltmesi Trendyol paneli veya Entegra üzerinden yapılır (iotomasyon push yapmaz).
                </div>
              )}
            </Card>
          )}

          {/* Unmatched products */}
          {unmatched.length > 0 && (
            <Card
              id="section-unmatched"
              className="overflow-hidden p-0 scroll-mt-24"
            >
              <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
                <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
                <h2 className="text-base font-semibold text-slate-950">
                  Trendyol&apos;da Var — İç Sistemde Eşleşmemiş
                </h2>
                <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                  {unmatched.length} ürün
                </span>
              </div>
              <TrendyolUnmatchedTable rows={unmatched} />
            </Card>
          )}

          {/* Eksik Listeme — stoğumuzda var ama Trendyol'da yok */}
          {missingListings.length > 0 && (
            <Card
              id="section-missing-listing"
              className="overflow-hidden p-0 border-amber-200 scroll-mt-24"
            >
              <div className="border-b border-amber-100 px-6 py-4 flex items-center gap-3 bg-amber-50/40">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                <h2 className="text-base font-semibold text-amber-900">
                  Eksik Listeme — Stoğumuzda Var, Trendyol&apos;da Yok
                </h2>
                <span className="ml-auto rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                  {missingListings.length} ürün
                </span>
              </div>
              <div className="px-6 py-3 text-xs text-amber-700 bg-amber-50/40 border-b border-amber-100">
                Aktif stoğumuzda olan ama Trendyol katalogunda barkod/SKU eşleşmesi
                olmayan ürünler. Daha önce satılmış olanlar listeden düşmüş
                olabilir — kırmızı badge ile vurgulanır.{" "}
                <strong>Trendyol&apos;a ürün ekleme/düzeltme Entegra üzerinden yapılır.</strong>
              </div>
              <MissingListingsTable rows={missingListings} />
            </Card>
          )}

          {/* Eksik Listeme — stoğumuzda var ama Trendyol'da yok */}
          {missingListings.length > 0 && (
            <Card className="overflow-hidden p-0 border-amber-200">
              <div className="border-b border-amber-100 px-6 py-4 flex items-center gap-3 bg-amber-50/40">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                <h2 className="text-base font-semibold text-amber-900">
                  Eksik Listeme — Stoğumuzda Var, Trendyol&apos;da Yok
                </h2>
                <span className="ml-auto rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
                  {missingListings.length} ürün
                </span>
              </div>
              <div className="px-6 py-3 text-xs text-amber-700 bg-amber-50/40 border-b border-amber-100">
                Bu ürünler aktif stoğumuzda olduğu hâlde Trendyol katalogunda
                bulunamadı (barkod veya SKU eşleşmesi yok). Daha önce satılmış
                olanlar listeden düşmüş olabilir — bu yüzden lifetime satışına
                göre sıralandı.
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-6 py-3 text-left">Ürün</th>
                      <th className="px-4 py-3 text-left">SKU</th>
                      <th className="px-4 py-3 text-left">Barkod</th>
                      <th className="px-4 py-3 text-left">Marka</th>
                      <th className="px-4 py-3 text-right">Stok</th>
                      <th className="px-4 py-3 text-right" title="Tüm zamanlar Trendyol satış adedi">
                        Lifetime Satış
                      </th>
                      <th className="px-4 py-3 text-left">Notlar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {missingListings.slice(0, 500).map((r) => (
                      <tr
                        key={r.productId}
                        className={r.lifetimeSold > 0 ? "bg-red-50/40 hover:bg-red-50" : "hover:bg-slate-50"}
                      >
                        <td className="px-6 py-3 max-w-[260px] truncate">
                          <Link href={`/products/${r.productId}`} className="font-medium text-slate-900 hover:underline">
                            {r.productName}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-500">{r.sku}</td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-500">{r.barcode ?? "—"}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{r.brand ?? "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">{r.stockQuantity}</td>
                        <td className={`px-4 py-3 text-right tabular-nums text-sm ${r.lifetimeSold > 0 ? "font-bold text-red-700" : "text-slate-400"}`}>
                          {r.lifetimeSold > 0 ? r.lifetimeSold : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {r.lifetimeSold > 0 ? (
                            <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700 font-medium">
                              ⚠ Daha önce satılmış
                            </span>
                          ) : (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
                              Listemeden eksik
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {missingListings.length > 500 && (
                <div className="border-t border-slate-100 px-6 py-3 text-xs text-slate-500 bg-slate-50/30">
                  İlk 500 ürün gösteriliyor (toplam {missingListings.length}).
                </div>
              )}
            </Card>
          )}

          {/* Empty state */}
          {trendyolProducts.length === 0 && (
            <Card className="p-8 text-center text-sm text-slate-400">
              Trendyol&apos;da onaylı ürün bulunamadı. API yapılandırmanızı ve satıcı bilgilerinizi kontrol edin.
            </Card>
          )}
        </>
      )}
    </div>
  );
}

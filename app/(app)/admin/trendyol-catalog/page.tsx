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
 * Links to /admin/trendyol-stock-sync for push, /admin/marketplace-mappings to add mappings.
 */

import Link from "next/link";

import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { fetchTrendyolCatalog, TrendyolCatalogProduct, TrendyolApiError } from "@/lib/trendyol-api";
import { Card } from "@/components/ui/card";

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

function deltaClass(delta: number) {
  if (delta < 0) return "text-red-600 font-bold"; // Trendyol shows MORE than internal — oversell risk
  if (delta > 0) return "text-amber-600 font-semibold"; // internal has more — opportunity to push
  return "text-emerald-600"; // in sync
}

function deltaLabel(delta: number) {
  if (delta === 0) return "✓ Senkron";
  if (delta > 0) return `+${delta} iç stok fazla`;
  return `${delta} Trendyol fazla`;
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

  // Fetch up to 4 pages (200 products) from Trendyol
  let trendyolProducts: TrendyolCatalogProduct[] = [];
  let fetchError: string | null = null;
  let totalElements = 0;

  try {
    const first = await fetchTrendyolCatalog(cfg, { page: 0, size: 50, approved: true });
    totalElements = first.totalElements;
    trendyolProducts = [...first.content];

    const extraPages = Math.min(first.totalPages - 1, 3); // max 3 more pages (total 4)
    if (extraPages > 0) {
      const extraFetches = await Promise.all(
        Array.from({ length: extraPages }, (_, i) =>
          fetchTrendyolCatalog(cfg, { page: i + 1, size: 50, approved: true })
        )
      );
      for (const page of extraFetches) {
        trendyolProducts = [...trendyolProducts, ...page.content];
      }
    }
  } catch (err) {
    fetchError = err instanceof TrendyolApiError
      ? `Trendyol API ${err.status}: ${err.body.slice(0, 300)}`
      : err instanceof Error ? err.message : "Bilinmeyen hata";
  }

  // Build internal product lookup by barcode and SKU
  const barcodeMap = new Map<string, { id: string; name: string; sku: string | null; stockQuantity: number }>();
  const skuMap = new Map<string, { id: string; name: string; sku: string | null; stockQuantity: number }>();

  if (!fetchError) {
    const products = await prisma.product.findMany({
      select: { id: true, name: true, sku: true, barcode: true, stockQuantity: true },
    });
    for (const p of products) {
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
            Trendyol&apos;daki ürünler ile iç stok karşılaştırması.
            {totalElements > trendyolProducts.length && (
              <span className="ml-1 text-amber-600">
                (İlk {trendyolProducts.length} / {totalElements} ürün gösteriliyor)
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/admin/trendyol-stock-sync"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
          >
            Stok Senkronu →
          </Link>
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
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Trendyol&apos;da</p>
              <p className="mt-2 text-4xl font-bold text-blue-700 tabular-nums">{trendyolProducts.length}</p>
              <p className="mt-1 text-xs text-slate-400">ürün</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-500">Aşım Riski</p>
              <p className="mt-2 text-4xl font-bold text-red-600 tabular-nums">{oversellCount}</p>
              <p className="mt-1 text-xs text-slate-400">Trendyol fazla gösteriyor</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Senkron</p>
              <p className="mt-2 text-4xl font-bold text-emerald-700 tabular-nums">{inSyncCount}</p>
              <p className="mt-1 text-xs text-slate-400">eşleşmiş ürün</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Eşleşmemiş</p>
              <p className="mt-2 text-4xl font-bold text-slate-500 tabular-nums">{unmatched.length}</p>
              <p className="mt-1 text-xs text-slate-400">iç ürün yok</p>
            </Card>
          </div>

          {/* Matched products */}
          {matched.length > 0 && (
            <Card className="overflow-hidden p-0">
              <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
                <h2 className="text-base font-semibold text-slate-950">Eşleşmiş Ürünler — Stok Karşılaştırması</h2>
                <span className="ml-auto rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                  {matched.length} ürün
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-6 py-3 text-left">Ürün (İç)</th>
                      <th className="px-4 py-3 text-left">SKU</th>
                      <th className="px-4 py-3 text-left">Barkod</th>
                      <th className="px-4 py-3 text-right">İç Stok</th>
                      <th className="px-4 py-3 text-right">Trendyol Stok</th>
                      <th className="px-4 py-3 text-right">Fark</th>
                      <th className="px-4 py-3 text-right">Trendyol Fiyatı (₺)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {matched.map((r) => (
                      <tr key={r.barcode} className={r.delta < 0 ? "bg-red-50/40 hover:bg-red-50" : "hover:bg-slate-50"}>
                        <td className="px-6 py-3 font-medium text-slate-900 max-w-[180px] truncate">
                          <Link href={`/products/${r.productId}`} className="hover:underline text-slate-900">
                            {r.productName}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">{r.sku ?? "—"}</td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-600">{r.barcode}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-800">{r.internalQty}</td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-slate-800">{r.trendyolQty}</td>
                        <td className={`px-4 py-3 text-right tabular-nums text-xs ${deltaClass(r.delta)}`}>
                          {deltaLabel(r.delta)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                          {r.trendyolPrice.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {surplusCount > 0 && (
                <div className="border-t border-slate-100 px-6 py-3 text-xs text-amber-700 bg-amber-50/50">
                  {surplusCount} üründe iç stok Trendyol&apos;dan fazla — stok senkronuna git ve güncelleyin.
                  <Link href="/admin/trendyol-stock-sync" className="ml-2 underline">Stok Senkronu →</Link>
                </div>
              )}
              {oversellCount > 0 && (
                <div className="border-t border-slate-100 px-6 py-3 text-xs text-red-700 bg-red-50/50">
                  ⚠ {oversellCount} üründe Trendyol iç stoktan fazla gösteriyor — mükerrer satış riski var.
                  <Link href="/admin/trendyol-stock-sync" className="ml-2 underline">Hemen Senkron Et →</Link>
                </div>
              )}
            </Card>
          )}

          {/* Unmatched products */}
          {unmatched.length > 0 && (
            <Card className="overflow-hidden p-0">
              <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
                <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
                <h2 className="text-base font-semibold text-slate-950">Trendyol&apos;da Var — İç Sistemde Eşleşmemiş</h2>
                <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                  {unmatched.length} ürün
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-6 py-3 text-left">Trendyol Ürünü</th>
                      <th className="px-4 py-3 text-left">Barkod</th>
                      <th className="px-4 py-3 text-left">Stok Kodu</th>
                      <th className="px-4 py-3 text-right">Trendyol Stok</th>
                      <th className="px-4 py-3 text-right">Fiyat (₺)</th>
                      <th className="px-4 py-3 text-left">İşlem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {unmatched.map((r, i) => {
                      const mappingHref = r.barcode
                        ? `/admin/marketplace-mappings?barcode=${encodeURIComponent(r.barcode)}&title=${encodeURIComponent(r.trendyolTitle)}#add-form`
                        : "/admin/marketplace-mappings";
                      return (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-6 py-3 text-slate-700 max-w-[200px] truncate">{r.trendyolTitle}</td>
                          <td className="px-4 py-3 text-xs font-mono text-slate-500">{r.barcode ?? "—"}</td>
                          <td className="px-4 py-3 text-xs text-slate-400">{r.stockCode ?? "—"}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700">{r.trendyolQty}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                            {r.trendyolPrice.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={mappingHref}
                              className="text-xs text-blue-600 hover:underline"
                            >
                              Eşleştir →
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
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

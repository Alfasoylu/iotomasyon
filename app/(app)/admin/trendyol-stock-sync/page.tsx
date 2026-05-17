/**
 * Phase 45 — Trendyol Stock Sync
 *
 * Shows all matched Trendyol products (via MarketplaceProductMapping.platformBarcode)
 * with their current internal stock and selling price, then lets the admin push
 * all quantities to Trendyol via PUT price-and-inventory (batches of 100).
 *
 * Products are skipped if:
 *   - platformBarcode is null → no Trendyol barcode to address the listing
 *   - sellingPriceTry is null → Trendyol requires a price; cannot push without it
 */

import Link from "next/link";

import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { getTrendyolStockPushPreviewAction } from "@/lib/actions/trendyol-product-actions";
import { Card } from "@/components/ui/card";
import { TrendyolStockPushButton } from "@/components/admin/trendyol-stock-push-button";

export const dynamic = "force-dynamic";

function stockColor(qty: number) {
  if (qty <= 0) return "text-red-600 font-bold";
  if (qty <= 5) return "text-amber-600 font-semibold";
  return "text-slate-800 font-medium";
}

export default async function TrendyolStockSyncPage() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  const result = await getTrendyolStockPushPreviewAction();

  const rows = result.preview?.rows ?? [];
  const skippedNoBarcode = result.preview?.skippedNoBarcode ?? 0;
  const skippedNoPrice = result.preview?.skippedNoPrice ?? 0;
  const criticalCount = rows.filter((r) => r.stockQuantity <= 0).length;
  const lowCount = rows.filter((r) => r.stockQuantity > 0 && r.stockQuantity <= 5).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Faz 45 — Trendyol Stok Senkronu
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Trendyol Stok Senkronu
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Eşleşmiş ürünlerin iç stok miktarları Trendyol&apos;a gönderilir.
            Fiyatlar da dahil edilir (zorunlu) ancak mevcut değerler kullanılır.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href="/admin/stock-health"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
          >
            ← Stok Sağlığı
          </Link>
          <Link
            href="/admin/marketplace-mappings"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
          >
            Ürün Eşleştirme →
          </Link>
        </div>
      </div>

      {/* Config error */}
      {!result.ok && (
        <Card className="p-6 border-amber-200 bg-amber-50">
          <p className="text-sm font-semibold text-amber-900">{result.message}</p>
          <Link href="/admin/trendyol" className="mt-2 inline-block text-xs text-amber-700 underline">
            Trendyol API yapılandırmasına git →
          </Link>
        </Card>
      )}

      {result.ok && (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Gönderilecek</p>
              <p className="mt-2 text-4xl font-bold text-blue-700 tabular-nums">{rows.length}</p>
              <p className="mt-1 text-xs text-slate-400">ürün</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-500">Sıfır Stok</p>
              <p className="mt-2 text-4xl font-bold text-red-600 tabular-nums">{criticalCount}</p>
              <p className="mt-1 text-xs text-slate-400">ürün (0 adet gönderilir)</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-500">Düşük Stok</p>
              <p className="mt-2 text-4xl font-bold text-amber-600 tabular-nums">{lowCount}</p>
              <p className="mt-1 text-xs text-slate-400">ürün (≤5 adet)</p>
            </Card>
            <Card className="p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Atlanan</p>
              <p className="mt-2 text-4xl font-bold text-slate-500 tabular-nums">{skippedNoBarcode + skippedNoPrice}</p>
              <p className="mt-1 text-xs text-slate-400">barkod yok: {skippedNoBarcode} · fiyat yok: {skippedNoPrice}</p>
            </Card>
          </div>

          {/* Push action */}
          {rows.length > 0 && (
            <Card className="p-6">
              <h2 className="text-base font-semibold text-slate-950 mb-1">Stok Gönderimi</h2>
              <p className="text-xs text-slate-500 mb-4">
                Aşağıdaki {rows.length} ürünün güncel stok miktarı ve satış fiyatı Trendyol&apos;a gönderilecek.
                Bu işlem asenkron — Trendyol toplu iş (batch) ID ile onay verir.
              </p>
              <TrendyolStockPushButton readyCount={rows.length} />
            </Card>
          )}

          {/* Preview table */}
          {rows.length > 0 && (
            <Card className="overflow-hidden p-0">
              <div className="border-b border-slate-100 px-6 py-4 flex items-center gap-3">
                <h2 className="text-base font-semibold text-slate-950">Gönderilecek Ürünler</h2>
                <span className="ml-auto rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                  {rows.length} ürün
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-6 py-3 text-left">Ürün</th>
                      <th className="px-4 py-3 text-left">SKU</th>
                      <th className="px-4 py-3 text-left">Barkod</th>
                      <th className="px-4 py-3 text-right">Stok</th>
                      <th className="px-4 py-3 text-right">Fiyat (₺)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((r) => (
                      <tr key={r.mappingId} className="hover:bg-slate-50">
                        <td className="px-6 py-3 font-medium text-slate-900 max-w-[200px] truncate">
                          <Link href={`/products/${r.productId}`} className="hover:underline text-slate-900">
                            {r.productName}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400">{r.sku ?? "—"}</td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-600">{r.barcode}</td>
                        <td className={`px-4 py-3 text-right tabular-nums ${stockColor(r.stockQuantity)}`}>
                          {r.stockQuantity}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                          {r.sellingPriceTry.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Empty state */}
          {rows.length === 0 && (
            <Card className="p-8 text-center text-sm text-slate-400">
              Trendyol&apos;a gönderilebilecek eşleşmiş ürün bulunamadı.
              <br />
              <Link href="/admin/marketplace-mappings" className="mt-2 inline-block text-xs text-blue-600 underline">
                Ürün Eşleştirme sayfasında Trendyol barkodlarını tanımlayın →
              </Link>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

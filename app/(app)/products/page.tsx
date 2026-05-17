/**
 * Phase 25 — Product Operations UX
 *
 * Changes from original:
 * - Thumbnail column (first product image or imageUrl, 48×48)
 * - Live search (debounce, fires at ≥2 chars, no submit button)
 * - Compact filter pill row: Durum + Stok + Sırala
 * - New sort options: stock ↑↓, price ↑↓, margin ↓, name A–Z
 * - Visual health cues per row: düşük stok, görsel yok, maliyet eksik, veri eksik
 * - "Stokta var" filter (stockQuantity > 0)
 */

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProductFilters } from "@/components/products/product-filters";
import { listProducts } from "@/services/product-service";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Health cue definitions
type HealthCue = { label: string; tone: "warning" | "danger" | "default" };

function getHealthCues(product: {
  stockQuantity: number;
  minimumStock: number;
  imageUrl: string | null;
  images: { id: string }[];
  unitCostTry: unknown;
  sourceCostRmb: unknown;
  importUnitCostUsd: unknown;
  weightKg: unknown;
  sellingPriceTry: unknown;
  marketplacePriceTry: unknown;
  trendyolPriceTry: number | null;  // from MarketplacePrice
  xmlImported: boolean;
  lastStockSyncAt: Date | null;
}): HealthCue[] {
  const cues: HealthCue[] = [];

  // Low stock
  if (product.stockQuantity <= product.minimumStock) {
    cues.push({ label: "Düşük stok", tone: "warning" });
  }

  // Missing image
  if (!product.imageUrl && product.images.length === 0) {
    cues.push({ label: "Görsel yok", tone: "default" });
  }

  // Missing cost
  if (!product.unitCostTry && !product.sourceCostRmb && !product.importUnitCostUsd) {
    cues.push({ label: "Maliyet eksik", tone: "danger" });
  }

  // Missing weight (has RMB cost but no weight = can't calculate import cost)
  if (!product.weightKg && product.sourceCostRmb) {
    cues.push({ label: "Ağırlık eksik", tone: "warning" });
  }

  // Missing Trendyol price
  if (!product.trendyolPriceTry && !product.sellingPriceTry && !product.marketplacePriceTry) {
    cues.push({ label: "Trendyol fiyat yok", tone: "default" });
  }

  // Stale XML (imported but not synced in 7+ days)
  if (product.xmlImported) {
    const stale =
      !product.lastStockSyncAt ||
      Date.now() - new Date(product.lastStockSyncAt).getTime() > 7 * 24 * 60 * 60 * 1000;
    if (stale) cues.push({ label: "XML bayat", tone: "default" });
  }

  return cues;
}

type ProfitResult = {
  priceTry: number;
  netProfit: number;
  marginPct: number;
  roi: number;
  status: "LOSS" | "LOW" | "GOOD" | "EXCELLENT";
} | null;

const TRENDYOL_COMMISSION = 0.20;
const TRENDYOL_FIXED_DEDUCTION = 150; // TRY, for orders > 250 TRY
const CARGO_USD_PER_KG = 10;
const DEFAULT_CUSTOMS_PCT = 0.30;

function calcProfit(product: {
  sourceCostRmb: unknown;
  weightKg: unknown;
  customsRatePct: unknown;
  importPaymentFeePct: unknown;
  trendyolPriceTry: number | null;
}, usdTryRate: number, rmbUsdRate: number): ProfitResult {
  const priceTry = product.trendyolPriceTry;
  const rmb = product.sourceCostRmb != null ? Number(product.sourceCostRmb) : null;
  const kg = product.weightKg != null ? Number(product.weightKg) : null;
  if (!priceTry || !rmb || rmb <= 0 || !kg || kg <= 0) return null;

  const customsPct = product.customsRatePct != null ? Number(product.customsRatePct) : DEFAULT_CUSTOMS_PCT * 100;
  const payFeePct = product.importPaymentFeePct != null ? Number(product.importPaymentFeePct) : 0;

  const supplierTry = (rmb / rmbUsdRate) * usdTryRate * (1 + payFeePct / 100);
  const cargoTry = kg * CARGO_USD_PER_KG * usdTryRate;
  const customsTry = (supplierTry + cargoTry) * (customsPct / 100);
  const totalCost = supplierTry + cargoTry + customsTry;

  const commission = priceTry * TRENDYOL_COMMISSION;
  const fixed = priceTry > 250 ? TRENDYOL_FIXED_DEDUCTION : 0;
  const netRevenue = priceTry - commission - fixed;
  const netProfit = netRevenue - totalCost;
  const marginPct = (netProfit / priceTry) * 100;
  const roi = (netProfit / totalCost) * 100;

  let status: "LOSS" | "LOW" | "GOOD" | "EXCELLENT";
  if (netProfit < 0) status = "LOSS";
  else if (marginPct < 15) status = "LOW";
  else if (marginPct < 30) status = "GOOD";
  else status = "EXCELLENT";

  return { priceTry, netProfit, marginPct, roi, status };
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission(PERMISSIONS.PRODUCTS_READ);
  const params = await searchParams;
  const query  = typeof params.q      === "string" ? params.q      : "";
  const status = typeof params.status === "string" ? params.status : "all";
  const stock  = typeof params.stock  === "string" ? params.stock  : "all";
  const sort   = typeof params.sort   === "string" ? params.sort   : "updated_desc";

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [{ databaseAvailable, products }, trendyolSales30d] = await Promise.all([
    listProducts({ q: query, status, stock, sort }),
    prisma.trendyolSalesRecord.findMany({
      where: {
        orderDate: { gte: thirtyDaysAgo },
        productId: { not: null },
        NOT: [
          { status: { contains: "iptal", mode: "insensitive" } },
          { status: { contains: "cancel", mode: "insensitive" } },
        ],
      },
      select: { productId: true, quantity: true },
    }),
  ]);

  // Phase 65 — Build productId → qty30d velocity map
  const velocity30d = new Map<string, number>();
  for (const r of trendyolSales30d) {
    if (r.productId) {
      velocity30d.set(r.productId, (velocity30d.get(r.productId) ?? 0) + r.quantity);
    }
  }

  // Phase 71 — exchange rates for profit calculation
  const latestRate = await prisma.monthlyExchangeRate.findFirst({
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { usdTryRate: true, rmbUsdRate: true },
  });
  const usdTryRate = latestRate?.usdTryRate ? Number(latestRate.usdTryRate) : 45;
  const rmbUsdRate = latestRate?.rmbUsdRate ? Number(latestRate.rmbUsdRate) : 7.0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Ürünler
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Ürün kataloğu
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Ürün kaydı, stok takibi ve ithalat bilgilerini yönetin.
          </p>
        </div>
        <Link href="/products/new">
          <Button>Yeni ürün</Button>
        </Link>
      </div>

      <Card className="p-5">
        <ProductFilters
          initialQuery={query}
          initialStatus={status}
          initialStock={stock}
          initialSort={sort}
          total={products.length}
        />
      </Card>

      {!databaseAvailable ? (
        <Card className="border-amber-200 bg-amber-50 p-5 text-sm leading-7 text-amber-900">
          Veritabanı bağlantısı şu anda kullanılamıyor. Ürün listesi gösterilemiyor.
        </Card>
      ) : null}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.2em] text-slate-400">
              <tr>
                <th className="w-14 px-3 py-3" aria-label="Görsel" />
                <th className="px-4 py-3">Ürün</th>
                <th className="px-4 py-3">Kategori</th>
                <th className="px-4 py-3 text-right">T.Fiyat</th>
                <th className="px-4 py-3 text-right">Stok</th>
                <th className="px-4 py-3 text-right">T30G</th>
                <th className="px-4 py-3 text-right">Net Kâr</th>
                <th className="px-4 py-3 text-right">Marj</th>
                <th className="px-4 py-3 text-right">ROI</th>
                <th className="px-4 py-3 text-center">Durum</th>
                <th className="px-4 py-3">Sağlık</th>
                <th className="px-4 py-3 text-right">Aksiyon</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 bg-white text-sm">
              {products.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-slate-400">
                    {query.length >= 2
                      ? `"${query}" için ürün bulunamadı.`
                      : "Bu filtrelerle eşleşen ürün bulunamadı."}
                  </td>
                </tr>
              ) : (
                products.map((product) => {
                  const thumbnailUrl =
                    product.images[0]?.url ?? product.imageUrl ?? null;
                  const trendyolMp = product.marketplacePrices?.find(p => p.marketplace === "TRENDYOL");
                  const trendyolPriceTry = trendyolMp
                    ? Number(trendyolMp.priceTry)
                    : product.xmlData?.xmlTrendyolPrice != null
                      ? Number(product.xmlData.xmlTrendyolPrice) * usdTryRate
                      : null;
                  const profit = calcProfit({ ...product, trendyolPriceTry }, usdTryRate, rmbUsdRate);
                  const healthCues = getHealthCues({
                    ...product,
                    trendyolPriceTry,
                  });
                  const isLowStock = product.stockQuantity <= product.minimumStock;

                  return (
                    <tr key={product.id} className="hover:bg-slate-50/60 transition">
                      {/* Thumbnail */}
                      <td className="px-3 py-2">
                        <Link href={`/products/${product.id}`} tabIndex={-1}>
                          {thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={thumbnailUrl}
                              alt={product.name}
                              className="h-12 w-12 rounded-lg object-contain bg-slate-50 border border-slate-100"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-12 w-12 rounded-lg bg-slate-100 flex items-center justify-center text-slate-300 text-lg border border-slate-100">
                              📦
                            </div>
                          )}
                        </Link>
                      </td>

                      {/* Product name + SKU */}
                      <td className="px-4 py-3">
                        <Link href={`/products/${product.id}`} className="group">
                          <p className="font-semibold text-slate-900 group-hover:text-slate-600 transition leading-tight">
                            {product.name}
                          </p>
                          <p className="mt-0.5 font-mono text-xs text-slate-400">
                            {product.sku}
                          </p>
                          {(product.brand || product.model) && (
                            <p className="mt-0.5 text-xs text-slate-400">
                              {[product.brand, product.model].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </Link>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {product.productCategory?.name ?? product.category ?? (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>

                      {/* Trendyol Price */}
                      <td className="px-4 py-3 text-right">
                        {trendyolPriceTry != null ? (
                          <span className="font-mono text-sm font-medium text-slate-700">
                            ₺{trendyolPriceTry.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Stock */}
                      <td className="px-4 py-3 text-right">
                        <span className={`font-mono font-semibold text-sm ${isLowStock ? "text-amber-600" : "text-slate-800"}`}>
                          {product.stockQuantity}
                        </span>
                        {product.minimumStock > 0 && (
                          <span className="ml-1 text-xs text-slate-400">
                            / {product.minimumStock}
                          </span>
                        )}
                      </td>

                      {/* Phase 65 — Trendyol 30-day velocity */}
                      <td className="px-4 py-3 text-right">
                        {(() => {
                          const qty = velocity30d.get(product.id);
                          if (!qty) return <span className="text-xs text-slate-300">—</span>;
                          return (
                            <span className={`font-mono text-sm font-semibold ${qty >= 10 ? "text-emerald-600" : qty >= 3 ? "text-amber-600" : "text-slate-600"}`}>
                              {qty}
                            </span>
                          );
                        })()}
                      </td>

                      {/* Net Kâr */}
                      <td className="px-4 py-3 text-right">
                        {profit ? (
                          <span className={`font-mono text-sm font-semibold ${profit.netProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                            ₺{profit.netProfit.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>

                      {/* Marj */}
                      <td className="px-4 py-3 text-right">
                        {profit ? (
                          <span className={`font-mono text-sm font-semibold ${profit.marginPct >= 15 ? "text-emerald-600" : profit.marginPct >= 0 ? "text-amber-600" : "text-red-600"}`}>
                            %{profit.marginPct.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                          </span>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>

                      {/* ROI */}
                      <td className="px-4 py-3 text-right">
                        {profit ? (
                          <span className={`font-mono text-sm ${profit.roi >= 30 ? "text-emerald-600" : profit.roi >= 0 ? "text-amber-600" : "text-red-600"}`}>
                            %{profit.roi.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
                        ) : <span className="text-xs text-slate-300">—</span>}
                      </td>

                      {/* Durum */}
                      <td className="px-4 py-3 text-center">
                        {profit ? (() => {
                          const durum = { LOSS: { label: "Zarar", cls: "bg-red-100 text-red-700" }, LOW: { label: "Düşük", cls: "bg-amber-100 text-amber-700" }, GOOD: { label: "İyi", cls: "bg-emerald-100 text-emerald-700" }, EXCELLENT: { label: "Mükemmel", cls: "bg-emerald-200 text-emerald-900 font-semibold" } }[profit.status];
                          return <span className={`inline-block rounded px-2 py-0.5 text-xs ${durum.cls}`}>{durum.label}</span>;
                        })() : <span className="text-xs text-slate-300">—</span>}
                      </td>

                      {/* Health cues */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {healthCues.length === 0 ? (
                            <span className="text-xs text-emerald-500">✓</span>
                          ) : (
                            healthCues.map((c) => (
                              <Badge key={c.label} tone={c.tone}>
                                {c.label}
                              </Badge>
                            ))
                          )}
                        </div>
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <Link
                            href={`/products/${product.id}/edit`}
                            className="text-xs font-medium text-slate-400 hover:text-slate-700 transition"
                          >
                            Düzenle
                          </Link>
                          <Link
                            href={`/products/${product.id}`}
                            className="text-xs font-semibold text-slate-900 hover:text-slate-600 transition"
                          >
                            Detay
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {products.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-3 text-right text-xs text-slate-400">
            {products.length} ürün gösteriliyor
          </div>
        )}
      </Card>
    </div>
  );
}

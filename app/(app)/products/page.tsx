/**
 * Phase 74 — Durum Filtresi (kârlılık bazlı)
 * Adds profit-status filter pills: Tümü / LOSS / LOW / GOOD / EXCELLENT / Veri Yok
 * Computed server-side from calcProfit() results, URL param `durum`.
 *
 * Phase 25 — Product Operations UX (original)
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
import { ProductBulkButtons } from "@/components/products/product-bulk-buttons";
import { ImporterViewClient } from "@/components/products/importer-view-client";
import { requireUser, requirePermission, checkPermission } from "@/lib/auth";
import { listProducts } from "@/services/product-service";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { resolveFinanceGate } from "@/lib/finance-visibility";

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
}, canViewFinance: boolean): HealthCue[] {
  const cues: HealthCue[] = [];

  // Low stock — operational, always visible
  if (product.stockQuantity <= product.minimumStock) {
    cues.push({ label: "Düşük stok", tone: "warning" });
  }

  // Missing image — operational, always visible
  if (!product.imageUrl && product.images.length === 0) {
    cues.push({ label: "Görsel yok", tone: "default" });
  }

  // Finance-tinted cues — only for finance viewers
  if (canViewFinance) {
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
  }

  // Stale XML (imported but not synced in 7+ days) — operational, always visible
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
  shippingMethod: "AIR" | "SEA"; // Phase 76: which method was used
} | null;

const TRENDYOL_COMMISSION = 0.20;
const TRENDYOL_FIXED_DEDUCTION = 150; // TRY, for orders > 250 TRY
// Phase 76: align with lib/import-decision.ts constants ($8 air / $1 sea)
const AIR_FREIGHT_USD_PER_KG = 8;
const SEA_FREIGHT_USD_PER_KG = 1;
const DEFAULT_CUSTOMS_PCT = 0.30;
// Auto-select SEA for heavy products when no explicit preference set
const SEA_AUTO_WEIGHT_KG = 5; // ≥5 kg → default to SEA

function calcProfit(product: {
  sourceCostRmb: unknown;
  weightKg: unknown;
  customsRatePct: unknown;
  importPaymentFeePct: unknown;
  shippingMethodPref: unknown; // Phase 76
  trendyolPriceTry: number | null;
}, usdTryRate: number, rmbUsdRate: number): ProfitResult {
  const priceTry = product.trendyolPriceTry;
  const rmb = product.sourceCostRmb != null ? Number(product.sourceCostRmb) : null;
  const kg = product.weightKg != null ? Number(product.weightKg) : null;
  if (!priceTry || !rmb || rmb <= 0 || !kg || kg <= 0) return null;

  const customsPct = product.customsRatePct != null ? Number(product.customsRatePct) : DEFAULT_CUSTOMS_PCT * 100;
  const payFeePct = product.importPaymentFeePct != null ? Number(product.importPaymentFeePct) : 0;

  // Phase 76: resolve shipping method
  // Explicit preference wins; when null → auto: ≥5kg → SEA, else AIR
  const prefRaw = product.shippingMethodPref != null ? String(product.shippingMethodPref).toUpperCase() : null;
  const shippingMethod: "AIR" | "SEA" =
    prefRaw === "SEA" ? "SEA"
    : prefRaw === "AIR" ? "AIR"
    : kg >= SEA_AUTO_WEIGHT_KG ? "SEA"
    : "AIR";

  const freightPerKg = shippingMethod === "SEA" ? SEA_FREIGHT_USD_PER_KG : AIR_FREIGHT_USD_PER_KG;

  const supplierTry = (rmb / rmbUsdRate) * usdTryRate * (1 + payFeePct / 100);
  const cargoTry = kg * freightPerKg * usdTryRate;
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

  return { priceTry, netProfit, marginPct, roi, status, shippingMethod };
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission(PERMISSIONS.PRODUCTS_READ);
  // requireUser is cached within the request — no extra DB call
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN";
  const { canViewFinance } = await resolveFinanceGate(user);
  const [canCreate, canUpdate] = await Promise.all([
    checkPermission(user, PERMISSIONS.PRODUCTS_CREATE),
    checkPermission(user, PERMISSIONS.PRODUCTS_UPDATE),
  ]);

  const params = await searchParams;
  const view        = typeof params.view   === "string" ? params.view   : "standard";
  const query       = typeof params.q      === "string" ? params.q      : "";
  const status      = typeof params.status === "string" ? params.status : "all";
  const stock       = typeof params.stock  === "string" ? params.stock  : "all";
  const sort        = typeof params.sort   === "string" ? params.sort   : "updated_desc";
  const durumFilter = typeof params.durum  === "string" ? params.durum  : "all";

  // Admin-only importer view — redirect non-admins back to standard
  if (view === "importer" && !isAdmin) {
    const safeParams = new URLSearchParams();
    if (query) safeParams.set("q", query);
    return (
      <div className="space-y-6">
        <p className="text-sm text-slate-500">Bu görünüme erişim yetkiniz yok.</p>
      </div>
    );
  }

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

  // Phase 71 — exchange rates for profit calculation.
  // Only fetched when the viewer can see finance data — otherwise we never
  // compute profit / margin / ROI on the server, so we never have to risk
  // leaking them in the rendered output.
  const latestRate = canViewFinance
    ? await prisma.monthlyExchangeRate.findFirst({
        orderBy: [{ year: "desc" }, { month: "desc" }],
        select: { usdTryRate: true, rmbUsdRate: true },
      })
    : null;
  const usdTryRate = latestRate?.usdTryRate ? Number(latestRate.usdTryRate) : 45;
  const rmbUsdRate = latestRate?.rmbUsdRate ? Number(latestRate.rmbUsdRate) : 7.0;

  // Phase 74 — pre-compute profit + health for all products, then filter by durumFilter.
  // Finance fields (trendyolPriceTry, profit) are NULL for non-finance viewers —
  // the table columns are then unconditionally suppressed below.
  type RowData = {
    product: (typeof products)[0];
    trendyolPriceTry: number | null;
    profit: ProfitResult;
    healthCues: HealthCue[];
    isLowStock: boolean;
  };

  type ProductItem = (typeof products)[number];
  const allRows: RowData[] = products.map((product: ProductItem) => {
    const trendyolMp = canViewFinance
      ? product.marketplacePrices?.find((p: { marketplace: string }) => p.marketplace === "TRENDYOL")
      : undefined;
    const trendyolPriceTry = canViewFinance
      ? (trendyolMp
          ? Number(trendyolMp.priceTry)
          : product.xmlData?.xmlTrendyolPrice != null
            ? Number(product.xmlData.xmlTrendyolPrice) * usdTryRate
            : null)
      : null;
    const profit = canViewFinance
      ? calcProfit({ ...product, trendyolPriceTry }, usdTryRate, rmbUsdRate)
      : null;
    const healthCues = getHealthCues({ ...product, trendyolPriceTry }, canViewFinance);
    const isLowStock = product.stockQuantity <= product.minimumStock;
    return { product, trendyolPriceTry, profit, healthCues, isLowStock };
  });

  // Filter pills are only meaningful when finance is visible.
  const filteredRows = !canViewFinance
    ? allRows
    : durumFilter === "all"
      ? allRows
      : durumFilter === "no_profit"
        ? allRows.filter((r) => r.profit === null)
        : allRows.filter((r) => r.profit?.status === durumFilter);

  // Counts per durum for filter pills (only computed when visible)
  const durumCounts = canViewFinance
    ? {
        all: allRows.length,
        LOSS:      allRows.filter((r) => r.profit?.status === "LOSS").length,
        LOW:       allRows.filter((r) => r.profit?.status === "LOW").length,
        GOOD:      allRows.filter((r) => r.profit?.status === "GOOD").length,
        EXCELLENT: allRows.filter((r) => r.profit?.status === "EXCELLENT").length,
        no_profit: allRows.filter((r) => r.profit === null).length,
      }
    : { all: allRows.length, LOSS: 0, LOW: 0, GOOD: 0, EXCELLENT: 0, no_profit: 0 };

  function durumHref(d: string) {
    const p = new URLSearchParams();
    if (query)  p.set("q",      query);
    if (status !== "all") p.set("status", status);
    if (stock  !== "all") p.set("stock",  stock);
    if (sort   !== "updated_desc") p.set("sort", sort);
    if (d !== "all") p.set("durum", d);
    const qs = p.toString();
    return `/products${qs ? "?" + qs : ""}`;
  }

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
        <div className="flex flex-wrap items-end gap-3">
          {canUpdate && <ProductBulkButtons />}
          {canCreate && (
            <Link href="/products/new">
              <Button>Yeni ürün</Button>
            </Link>
          )}
        </div>
      </div>

      {/* View switcher — Admin only */}
      {isAdmin && (
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 w-fit">
          <Link
            href="/products"
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              view !== "importer"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            Standart Görünüm
          </Link>
          <Link
            href="/products?view=importer"
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition ${
              view === "importer"
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            📊 İthalatçı Görünümü
          </Link>
        </div>
      )}

      {/* İthalatçı Görünümü — renders when view=importer and user is admin */}
      {view === "importer" && isAdmin && (
        <ImporterViewClient />
      )}

      {/* Standard view — hidden when importer view is active */}
      {view !== "importer" && (
        <>
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

      {/* Phase 74 — Kârlılık durum filtresi (finance-only) */}
      {canViewFinance && (
      <div className="flex flex-wrap gap-2">
        {([
          { key: "all",      label: "Tümü",     cls: "bg-white border-slate-200 text-slate-700 hover:border-slate-400" },
          { key: "EXCELLENT",label: "Mükemmel", cls: "bg-white border-emerald-200 text-emerald-700 hover:border-emerald-400" },
          { key: "GOOD",     label: "İyi",      cls: "bg-white border-emerald-100 text-emerald-600 hover:border-emerald-300" },
          { key: "LOW",      label: "Düşük",    cls: "bg-white border-amber-200 text-amber-700 hover:border-amber-400" },
          { key: "LOSS",     label: "Zarar",    cls: "bg-white border-red-200 text-red-700 hover:border-red-400" },
          { key: "no_profit",label: "Veri Yok", cls: "bg-white border-slate-100 text-slate-400 hover:border-slate-300" },
        ] as const).map(({ key, label, cls }) => {
          const isActive = durumFilter === key;
          const count = durumCounts[key];
          return (
            <Link
              key={key}
              href={durumHref(key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                isActive
                  ? key === "EXCELLENT" ? "bg-emerald-700 border-emerald-700 text-white"
                  : key === "GOOD"      ? "bg-emerald-600 border-emerald-600 text-white"
                  : key === "LOW"       ? "bg-amber-600 border-amber-600 text-white"
                  : key === "LOSS"      ? "bg-red-600 border-red-600 text-white"
                  : key === "no_profit" ? "bg-slate-500 border-slate-500 text-white"
                  : "bg-slate-900 border-slate-900 text-white"
                  : cls
              }`}
            >
              {label}
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${isActive ? "bg-white/20" : "bg-slate-100 text-slate-500"}`}>
                {count}
              </span>
            </Link>
          );
        })}
      </div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.2em] text-slate-400">
              <tr>
                <th className="w-14 px-3 py-3" aria-label="Görsel" />
                <th className="px-4 py-3">Ürün</th>
                <th className="px-4 py-3">Kategori</th>
                {canViewFinance && <th className="px-4 py-3 text-right">T.Fiyat</th>}
                <th className="px-4 py-3 text-right">Stok</th>
                <th className="px-4 py-3 text-right">T30G</th>
                {canViewFinance && <th className="px-4 py-3 text-right">Net Kâr</th>}
                {canViewFinance && <th className="px-4 py-3 text-right">Marj</th>}
                {canViewFinance && <th className="px-4 py-3 text-right">ROI</th>}
                {canViewFinance && <th className="px-4 py-3 text-center">Durum</th>}
                <th className="px-4 py-3">Sağlık</th>
                <th className="px-4 py-3 text-right">Aksiyon</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 bg-white text-sm">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={canViewFinance ? 12 : 7} className="px-4 py-12 text-center text-slate-400">
                    {query.length >= 2
                      ? `"${query}" için ürün bulunamadı.`
                      : "Bu filtrelerle eşleşen ürün bulunamadı."}
                  </td>
                </tr>
              ) : (
                filteredRows.map(({ product, trendyolPriceTry, profit, healthCues, isLowStock }) => {
                  const thumbnailUrl =
                    product.images[0]?.url ?? product.imageUrl ?? null;

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

                      {/* Trendyol Price — finance only */}
                      {canViewFinance && (
                        <td className="px-4 py-3 text-right">
                          {trendyolPriceTry != null ? (
                            <span className="font-mono text-sm font-medium text-slate-700">
                              ₺{trendyolPriceTry.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-xs">—</span>
                          )}
                        </td>
                      )}

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

                      {/* Net Kâr / Marj / ROI / Durum — finance only */}
                      {canViewFinance && (
                        <td className="px-4 py-3 text-right">
                          {profit ? (
                            <span className={`font-mono text-sm font-semibold ${profit.netProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                              ₺{profit.netProfit.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </span>
                          ) : <span className="text-xs text-slate-300">—</span>}
                        </td>
                      )}

                      {canViewFinance && (
                        <td className="px-4 py-3 text-right">
                          {profit ? (
                            <span className={`font-mono text-sm font-semibold ${profit.marginPct >= 15 ? "text-emerald-600" : profit.marginPct >= 0 ? "text-amber-600" : "text-red-600"}`}>
                              %{profit.marginPct.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                            </span>
                          ) : <span className="text-xs text-slate-300">—</span>}
                        </td>
                      )}

                      {canViewFinance && (
                        <td className="px-4 py-3 text-right">
                          {profit ? (
                            <span className={`font-mono text-sm ${profit.roi >= 30 ? "text-emerald-600" : profit.roi >= 0 ? "text-amber-600" : "text-red-600"}`}>
                              %{profit.roi.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </span>
                          ) : <span className="text-xs text-slate-300">—</span>}
                        </td>
                      )}

                      {canViewFinance && (
                        <td className="px-4 py-3 text-center">
                          {profit ? (() => {
                            const durum = { LOSS: { label: "Zarar", cls: "bg-red-100 text-red-700" }, LOW: { label: "Düşük", cls: "bg-amber-100 text-amber-700" }, GOOD: { label: "İyi", cls: "bg-emerald-100 text-emerald-700" }, EXCELLENT: { label: "Mükemmel", cls: "bg-emerald-200 text-emerald-900 font-semibold" } }[profit.status];
                            return (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className={`inline-block rounded px-2 py-0.5 text-xs ${durum.cls}`}>{durum.label}</span>
                                {/* Phase 76: kargo modu göstergesi */}
                                <span className={`text-[10px] font-medium ${profit.shippingMethod === "SEA" ? "text-blue-500" : "text-orange-400"}`}>
                                  {profit.shippingMethod === "SEA" ? "🚢 Deniz" : "✈ Hava"}
                                </span>
                              </div>
                            );
                          })() : <span className="text-xs text-slate-300">—</span>}
                        </td>
                      )}

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
                          {canUpdate && (
                            <Link
                              href={`/products/${product.id}/edit`}
                              className="text-xs font-medium text-slate-400 hover:text-slate-700 transition"
                            >
                              Düzenle
                            </Link>
                          )}
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

        {filteredRows.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-3 text-right text-xs text-slate-400">
            {filteredRows.length} ürün gösteriliyor{durumFilter !== "all" && ` (${allRows.length} toplam)`}
          </div>
        )}
      </Card>
        </>
      )} {/* end standard view */}
    </div>
  );
}

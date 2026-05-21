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
import { Package, BarChart3, Ship, Plane, Check } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { PageHelp } from "@/components/layout/page-help";
import { ProductFilters } from "@/components/products/product-filters";
import { ProductBulkButtons } from "@/components/products/product-bulk-buttons";
import { ImporterViewClient } from "@/components/products/importer-view-client";
import { requireUser, requirePermission, checkPermission } from "@/lib/auth";
import { listProducts } from "@/services/product-service";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { resolveFinanceGate } from "@/lib/finance-visibility";
import { calcImportCost, calcRevenue } from "@/lib/importer-cost";

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

/**
 * Standart görünüm kâr hesabı — kanonik motor (`lib/importer-cost.ts`) üzerinden.
 *
 * Eski inline formül (komisyon %20 + >250₺ → 150₺ sabit, kargo dilimi yok)
 * Pazaryeri Fiyatlandırması ile tutarsızdı. Şimdi calcImportCost + calcRevenue
 * çağrılarıyla aynı motoru kullanır — kargo fiyat dilimi (<$5/$5–7.5/>$7.5) ve
 * komisyon politikası tek kaynaktan gelir.
 */
function calcProfit(product: {
  sourceCostRmb: unknown;
  weightKg: unknown;
  customsRatePct: unknown;
  importPaymentFeePct: unknown;
  shippingMethodPref: unknown;
  trendyolPriceTry: number | null;
}, usdTryRate: number, rmbUsdRate: number): ProfitResult {
  const priceTry = product.trendyolPriceTry;
  if (!priceTry || priceTry <= 0) return null;

  const cost = calcImportCost({
    sourceCostRmb: product.sourceCostRmb != null ? Number(product.sourceCostRmb) : null,
    weightKg: product.weightKg != null ? Number(product.weightKg) : null,
    customsRatePct: product.customsRatePct != null ? Number(product.customsRatePct) : null,
    importPaymentFeePct: product.importPaymentFeePct != null ? Number(product.importPaymentFeePct) : null,
    shippingMethodPref: product.shippingMethodPref != null ? String(product.shippingMethodPref) : null,
    rmbUsdRate,
  });
  if (!cost) return null;

  const revenue = calcRevenue({ trendyolPriceTry: priceTry, usdTryRate });
  if (!revenue) return null;

  const totalCostTry = cost.totalCostUsd * usdTryRate;
  const netProfit = revenue.netRevenueTry - totalCostTry;
  const marginPct = (netProfit / priceTry) * 100;
  const roi = (netProfit / totalCostTry) * 100;

  let status: "LOSS" | "LOW" | "GOOD" | "EXCELLENT";
  if (netProfit < 0) status = "LOSS";
  else if (marginPct < 15) status = "LOW";
  else if (marginPct < 30) status = "GOOD";
  else status = "EXCELLENT";

  return { priceTry, netProfit, marginPct, roi, status, shippingMethod: cost.shippingMethod };
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
        <p className="text-sm text-[var(--text-secondary)]">Bu görünüme erişim yetkiniz yok.</p>
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
      <PageHeader
        icon={Package}
        breadcrumb={[{ label: "Ürünler & Stok" }, { label: "Ürünler" }]}
        title="Ürünler"
        subtitle="Ürün kataloğun. Stok, fiyat, pazaryeri durumu, ithalat maliyeti ve kâr-marj bilgisi tek yerde."
        actions={
          <>
            <PageHelp pageKey="products" />
            {canUpdate && <ProductBulkButtons />}
            {canCreate && (
              <Link href="/products/new">
                <Button>Yeni ürün</Button>
              </Link>
            )}
          </>
        }
      />

      {/* View switcher — Admin only */}
      {isAdmin && (
        <div className="flex items-center gap-1 rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] p-1 w-fit">
          <Link
            href="/products"
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              view !== "importer"
                ? "bg-[var(--accent-dim)] border border-[var(--accent-border)] text-[var(--accent)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            Standart Görünüm
          </Link>
          <Link
            href="/products?view=importer"
            className={`inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition ${
              view === "importer"
                ? "bg-[var(--accent-dim)] border border-[var(--accent-border)] text-[var(--accent)]"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <BarChart3 size={14} strokeWidth={1.5} />
            İthalatçı Görünümü
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
        <Card className="border-[var(--warn-border)] bg-[var(--warn-dim)] p-5 text-sm leading-7 text-[var(--warn)]">
          Veritabanı bağlantısı şu anda kullanılamıyor. Ürün listesi gösterilemiyor.
        </Card>
      ) : null}

      {/* Phase 74 — Kârlılık durum filtresi (finance-only) */}
      {canViewFinance && (
      <div className="flex flex-wrap gap-2">
        {([
          { key: "all",      label: "Tümü"     },
          { key: "EXCELLENT",label: "Mükemmel" },
          { key: "GOOD",     label: "İyi"      },
          { key: "LOW",      label: "Düşük"    },
          { key: "LOSS",     label: "Zarar"    },
          { key: "no_profit",label: "Veri Yok" },
        ] as const).map(({ key, label }) => {
          const isActive = durumFilter === key;
          const count = durumCounts[key];
          const base =
            "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition";
          const stateCls = isActive
            ? "border-[var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]"
            : "border-[var(--border-default)] bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)]";
          return (
            <Link
              key={key}
              href={durumHref(key)}
              className={`${base} ${stateCls}`}
            >
              {label}
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10px] tabular-nums font-mono ${
                  isActive
                    ? "bg-[var(--accent)]/15 text-[var(--accent)]"
                    : "bg-[var(--surface-3)] text-[var(--text-muted)]"
                }`}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </div>
      )}

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-[var(--border-subtle)]">
            <thead className="bg-[var(--surface-1)] text-left text-[11px] uppercase tracking-wider font-medium text-[var(--text-muted)]">
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
            <tbody className="divide-y divide-[var(--border-subtle)] bg-[var(--surface-2)] text-sm">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={canViewFinance ? 12 : 7} className="px-4 py-12 text-center text-[var(--text-muted)]">
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
                    <tr key={product.id} className="hover:bg-[var(--surface-3)] transition">
                      {/* Thumbnail */}
                      <td className="px-3 py-2">
                        <Link href={`/products/${product.id}`} tabIndex={-1}>
                          {thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={thumbnailUrl}
                              alt={product.name}
                              className="h-12 w-12 rounded-md object-contain bg-[var(--surface-1)] border border-[var(--border-subtle)]"
                              loading="lazy"
                            />
                          ) : (
                            <div className="h-12 w-12 rounded-md bg-[var(--surface-1)] flex items-center justify-center text-[var(--text-muted)] border border-[var(--border-subtle)]">
                              <Package size={14} strokeWidth={1.5} />
                            </div>
                          )}
                        </Link>
                      </td>

                      {/* Product name + SKU */}
                      <td className="px-4 py-3">
                        <Link href={`/products/${product.id}`} className="group">
                          <p className="font-medium text-[var(--text-primary)] group-hover:text-[var(--accent)] transition leading-tight">
                            {product.name}
                          </p>
                          <p className="mt-0.5 font-mono text-xs text-[var(--text-muted)]">
                            {product.sku}
                          </p>
                          {(product.brand || product.model) && (
                            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                              {[product.brand, product.model].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </Link>
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3 text-xs text-[var(--text-secondary)]">
                        {product.productCategory?.name ?? product.category ?? (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>

                      {/* Trendyol Price — finance only */}
                      {canViewFinance && (
                        <td className="px-4 py-3 text-right">
                          {trendyolPriceTry != null ? (
                            <span className="tabular-nums font-mono text-sm font-medium text-[var(--text-primary)]">
                              ₺{trendyolPriceTry.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="text-[var(--text-muted)] text-xs">—</span>
                          )}
                        </td>
                      )}

                      {/* Stock */}
                      <td className="px-4 py-3 text-right">
                        <span className={`tabular-nums font-mono font-semibold text-sm ${isLowStock ? "text-[var(--warn)]" : "text-[var(--text-primary)]"}`}>
                          {product.stockQuantity}
                        </span>
                        {product.minimumStock > 0 && (
                          <span className="ml-1 text-xs tabular-nums font-mono text-[var(--text-muted)]">
                            / {product.minimumStock}
                          </span>
                        )}
                      </td>

                      {/* Phase 65 — Trendyol 30-day velocity */}
                      <td className="px-4 py-3 text-right">
                        {(() => {
                          const qty = velocity30d.get(product.id);
                          if (!qty) return <span className="text-xs text-[var(--text-muted)]">—</span>;
                          return (
                            <span className={`tabular-nums font-mono text-sm font-semibold ${qty >= 10 ? "text-[var(--ok)]" : qty >= 3 ? "text-[var(--warn)]" : "text-[var(--text-secondary)]"}`}>
                              {qty}
                            </span>
                          );
                        })()}
                      </td>

                      {/* Net Kâr / Marj / ROI / Durum — finance only */}
                      {canViewFinance && (
                        <td className="px-4 py-3 text-right">
                          {profit ? (
                            <span className={`tabular-nums font-mono text-sm font-semibold ${profit.netProfit >= 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}>
                              ₺{profit.netProfit.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </span>
                          ) : <span className="text-xs text-[var(--text-muted)]">—</span>}
                        </td>
                      )}

                      {canViewFinance && (
                        <td className="px-4 py-3 text-right">
                          {profit ? (
                            <span className={`tabular-nums font-mono text-sm font-semibold ${profit.marginPct >= 15 ? "text-[var(--ok)]" : profit.marginPct >= 0 ? "text-[var(--warn)]" : "text-[var(--danger)]"}`}>
                              %{profit.marginPct.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                            </span>
                          ) : <span className="text-xs text-[var(--text-muted)]">—</span>}
                        </td>
                      )}

                      {canViewFinance && (
                        <td className="px-4 py-3 text-right">
                          {profit ? (
                            <span className={`tabular-nums font-mono text-sm ${profit.roi >= 30 ? "text-[var(--ok)]" : profit.roi >= 0 ? "text-[var(--warn)]" : "text-[var(--danger)]"}`}>
                              %{profit.roi.toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </span>
                          ) : <span className="text-xs text-[var(--text-muted)]">—</span>}
                        </td>
                      )}

                      {canViewFinance && (
                        <td className="px-4 py-3 text-center">
                          {profit ? (() => {
                            const durum = {
                              LOSS:      { label: "Zarar",    cls: "border border-[var(--danger-border)] bg-[var(--danger-dim)] text-[var(--danger)]" },
                              LOW:       { label: "Düşük",    cls: "border border-[var(--warn-border)] bg-[var(--warn-dim)] text-[var(--warn)]" },
                              GOOD:      { label: "İyi",      cls: "border border-[var(--ok-border)] bg-[var(--ok-dim)] text-[var(--ok)]" },
                              EXCELLENT: { label: "Mükemmel", cls: "border border-[var(--ok-border)] bg-[var(--ok-dim)] text-[var(--ok)] font-semibold" },
                            }[profit.status];
                            return (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className={`inline-block rounded-md px-2 py-0.5 text-xs ${durum.cls}`}>{durum.label}</span>
                                {/* Phase 76: kargo modu göstergesi */}
                                <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${profit.shippingMethod === "SEA" ? "text-[var(--info)]" : "text-[var(--warn)]"}`}>
                                  {profit.shippingMethod === "SEA" ? (
                                    <>
                                      <Ship size={14} strokeWidth={1.5} />
                                      Deniz
                                    </>
                                  ) : (
                                    <>
                                      <Plane size={14} strokeWidth={1.5} />
                                      Hava
                                    </>
                                  )}
                                </span>
                              </div>
                            );
                          })() : <span className="text-xs text-[var(--text-muted)]">—</span>}
                        </td>
                      )}

                      {/* Health cues */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {healthCues.length === 0 ? (
                            <Check size={14} strokeWidth={1.5} className="text-[var(--ok)]" />
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
                              className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
                            >
                              Düzenle
                            </Link>
                          )}
                          <Link
                            href={`/products/${product.id}`}
                            className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
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
          <div className="border-t border-[var(--border-subtle)] px-4 py-3 text-right text-xs text-[var(--text-muted)]">
            {filteredRows.length} ürün gösteriliyor{durumFilter !== "all" && ` (${allRows.length} toplam)`}
          </div>
        )}
      </Card>
        </>
      )} {/* end standard view */}
    </div>
  );
}

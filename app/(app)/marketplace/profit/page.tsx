/**
 * Phase 15 — Marketplace Profit Dashboard
 * Phase 30 — Marketplace Margin Policy Normalization
 * Phase 34 — Per-platform XML Price Integration
 *
 * Per-listing marketplace channel profitability computed from effective
 * shipping/commission using the three-tier policy resolver.
 *
 * Phase 34 change: effective price now resolved via calcMarketplacePricingRow()
 * which picks up per-platform XML prices (xmlTrendyolPrice, xmlHbPrice, etc.)
 * when no manual override (marketplacePriceTry) is set.
 *
 * Shows:
 *  - Summary: active listings, profitable, unprofitable, missing data counts
 *  - Winners table (top margin DESC)
 *  - Losers table (all with negative profit)
 *  - Missing data alert (no marketplace price or unit cost)
 *  - High-stock / low-demand signal (stock > 5, salesPotential = 0)
 */

import Link from "next/link";
import { Settings, AlertTriangle, ArrowLeft } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  policySourceLabel,
  type PolicySource,
} from "@/lib/marketplace-policy";
import {
  calcMarketplacePricingRow,
  priceSourceLabel,
  type PriceSource,
} from "@/lib/marketplace-pricing";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Prisma, MarketplacePlatform } from "@prisma/client";

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toNum(v: Prisma.Decimal | number | null | undefined): number {
  if (v == null) return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  return v.toNumber();
}

function fmt(v: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v);
}

function fmtPct(v: number) {
  return `%${v.toFixed(1)}`;
}

const PLATFORM_LABELS: Record<string, string> = {
  TRENDYOL:    "Trendyol",
  HEPSIBURADA: "Hepsiburada",
  N11:         "N11",
  PTTAVM:      "PTT AVM",
  KOCTAS:      "Koçtaş",
  TEKNOSA:     "Teknosa",
  TEMU:        "Temu",
  CUSTOM:      "Diğer",
};

/** Maps marketplace platform key → XmlProductData USD price field */
const PLATFORM_XML_FIELD: Record<string, string> = {
  TRENDYOL:    "xmlTrendyolPrice",
  HEPSIBURADA: "xmlHbPrice",
  AMAZON:      "xmlAmazonPrice",
  PAZARAMA:    "xmlPazaramaPrice",
  IDEFIX:      "xmlIdefixPrice",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ListingRow {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  platform: string;
  marketplacePrice: number;
  priceSource: PriceSource;
  netProfit: number | null;
  margin: number | null;
  roi: number | null;
  profitable: boolean | null;
  hasData: boolean;
  stockQuantity: number;
  salesPotential: number;
  shippingTry: number;
  shippingSource: PolicySource | "price_tier";
  commissionPct: number;
  commissionSource: PolicySource;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PlatformChip({ platform }: { platform: string }) {
  return (
    <span className="rounded-md bg-[var(--surface-3)] px-2 py-0.5 text-[11px] font-medium text-[var(--text-secondary)] border border-[var(--border-subtle)]">
      {PLATFORM_LABELS[platform] ?? platform}
    </span>
  );
}

function PolicyBadge({ source }: { source: PolicySource | "price_tier" }) {
  const label =
    source === "price_tier"
      ? "Fiyat Dilimi"
      : policySourceLabel(source as PolicySource);
  const variant: "warn" | "ok" | "info" | "neutral" =
    source === "price_tier"
      ? "warn"
      : source === "product_override"
        ? "info"
        : source === "platform_standard"
          ? "ok"
          : "neutral";
  return (
    <Badge variant={variant} className="text-[10px]">
      {label}
    </Badge>
  );
}

function PriceBadge({ source }: { source: PriceSource }) {
  const variant: "ok" | "info" | "neutral" | "warn" =
    source === "manual"
      ? "info"
      : source === "xml"
        ? "ok"
        : "neutral";
  return (
    <Badge variant={variant} className="text-[10px]">
      {priceSourceLabel(source)}
    </Badge>
  );
}

function ProfitBadge({ row }: { row: ListingRow }) {
  if (!row.hasData) {
    return <Badge variant="warn">Veri yok</Badge>;
  }
  if (row.profitable) {
    return <Badge variant="ok">Kârlı</Badge>;
  }
  return <Badge variant="danger">Kârsız</Badge>;
}

function ProfitTable({
  rows,
  highlight,
  showPolicySources,
}: {
  rows: ListingRow[];
  highlight?: "danger";
  showPolicySources?: boolean;
}) {
  const headBg =
    highlight === "danger"
      ? "bg-[var(--danger-dim)]"
      : "bg-[var(--surface-1)]";
  return (
    <Card className="overflow-hidden rounded-lg">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-[var(--text-secondary)] border-collapse">
          <thead>
            <tr className={`border-b border-[var(--border-subtle)] ${headBg}`}>
              <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Platform</th>
              <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Ürün</th>
              <th className="py-3 px-4 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Etkin Fiyat</th>
              <th className="py-3 px-4 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Net Kâr</th>
              <th className="py-3 px-4 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Marj</th>
              <th className="py-3 px-4 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">ROI</th>
              {showPolicySources && (
                <>
                  <th className="py-3 px-4 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Kargo</th>
                  <th className="py-3 px-4 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Komisyon</th>
                </>
              )}
              <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Durum</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--surface-3)]">
                <td className="py-3 px-4">
                  <PlatformChip platform={r.platform} />
                </td>
                <td className="py-3 px-4">
                  <Link
                    href={`/products/${r.productId}`}
                    className="font-mono text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    {r.productSku}
                  </Link>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5 max-w-[200px] truncate">
                    {r.productName}
                  </p>
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-xs text-[var(--text-secondary)] tabular-nums font-mono">
                      {r.marketplacePrice > 0 ? fmt(r.marketplacePrice) : <span className="text-[var(--text-muted)]">—</span>}
                    </span>
                    <PriceBadge source={r.priceSource} />
                  </div>
                </td>
                <td className={`py-3 px-4 text-right text-xs font-semibold tabular-nums font-mono ${r.netProfit != null ? (r.netProfit >= 0 ? "text-[var(--ok)]" : "text-[var(--danger)]") : "text-[var(--text-muted)]"}`}>
                  {r.netProfit != null ? fmt(r.netProfit) : "—"}
                </td>
                <td className={`py-3 px-4 text-right text-xs font-semibold tabular-nums font-mono ${r.margin != null ? (r.margin >= 0 ? "text-[var(--ok)]" : "text-[var(--danger)]") : "text-[var(--text-muted)]"}`}>
                  {r.margin != null ? fmtPct(r.margin) : "—"}
                </td>
                <td className={`py-3 px-4 text-right text-xs tabular-nums font-mono ${r.roi != null ? (r.roi >= 0 ? "text-[var(--text-secondary)]" : "text-[var(--danger)]") : "text-[var(--text-muted)]"}`}>
                  {r.roi != null ? fmtPct(r.roi) : "—"}
                </td>
                {showPolicySources && (
                  <>
                    <td className="py-3 px-4 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-xs text-[var(--text-secondary)] tabular-nums font-mono">{fmt(r.shippingTry)}</span>
                        <PolicyBadge source={r.shippingSource} />
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-xs text-[var(--text-secondary)] tabular-nums font-mono">{fmtPct(r.commissionPct)}</span>
                        <PolicyBadge source={r.commissionSource} />
                      </div>
                    </td>
                  </>
                )}
                <td className="py-3 px-4">
                  <ProfitBadge row={r} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function MarketplaceProfitPage() {
  // P0 fix: profitability/margin/ROI dashboard requires EXECUTIVE_READ, not
  // MARKETPLACE_LISTINGS_READ. Marketplace operators have listings.read but
  // must NOT see net profit, margin, or ROI per listing.
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  const [listings, allPolicies, latestRate] = await Promise.all([
    prisma.marketplaceListing.findMany({
      where: { status: "ACTIVE" },
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            stockQuantity: true,
            unitCostTry: true,
            marketplacePriceTry: true,
            shippingCost: true,
            shippingCostOverride: true,
            marketplaceCommission: true,
            marketplaceCommissionOverride: true,
            packagingCost: true,
            vatRate: true,
            paymentFeeRate: true,
            returnReserveRate: true,
            onlineSalesPotential: true,
            xmlData: {
              select: {
                xmlTrendyolPrice:  true,
                xmlHbPrice:        true,
                xmlAmazonPrice:    true,
                xmlPazaramaPrice:  true,
                xmlIdefixPrice:    true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.marketplacePlatformPolicy.findMany(),
    prisma.monthlyExchangeRate.findFirst({ orderBy: { month: "desc" } }),
  ]);

  const usdTryRate = latestRate ? toNum(latestRate.usdTryRate) : 32;

  // Build platform policy lookup map
  const policyByPlatform = Object.fromEntries(
    allPolicies.map((pol) => [
      pol.platform,
      {
        standardShippingTry:   toNum(pol.standardShippingTry),
        standardCommissionPct: toNum(pol.standardCommissionPct),
        paymentFeePct:         toNum(pol.paymentFeePct),
        returnReservePct:      toNum(pol.returnReservePct),
        vatPct:                toNum(pol.vatPct),
      },
    ]),
  );

  // Compute profitability per listing using canonical Phase 34 pricing engine
  const rows: ListingRow[] = listings.map((l) => {
    const p = l.product;
    const platformPolicy = policyByPlatform[l.platform as MarketplacePlatform] ?? null;

    // Resolve per-platform XML price (USD) from XmlProductData
    const xmlField = PLATFORM_XML_FIELD[l.platform];
    const xmlData = p.xmlData as Record<string, Prisma.Decimal | null> | null;
    const xmlPriceUsd = (xmlField && xmlData && xmlData[xmlField] != null)
      ? toNum(xmlData[xmlField])
      : null;

    // Use canonical pricing engine: manual override > XML > none
    const pricing = calcMarketplacePricingRow({
      platform:        l.platform,
      platformLabel:   PLATFORM_LABELS[l.platform] ?? l.platform,
      xmlPriceUsd:     xmlPriceUsd && xmlPriceUsd > 0 ? xmlPriceUsd : null,
      manualOverrideTry: p.marketplacePriceTry ? toNum(p.marketplacePriceTry) : null,
      product: {
        shippingCost:                  toNum(p.shippingCost),
        shippingCostOverride:          p.shippingCostOverride ? toNum(p.shippingCostOverride) : null,
        marketplaceCommission:         toNum(p.marketplaceCommission),
        marketplaceCommissionOverride: p.marketplaceCommissionOverride ? toNum(p.marketplaceCommissionOverride) : null,
        vatRate:                       p.vatRate ? toNum(p.vatRate) : null,
        paymentFeeRate:                p.paymentFeeRate ? toNum(p.paymentFeeRate) : null,
        returnReserveRate:             p.returnReserveRate ? toNum(p.returnReserveRate) : null,
      },
      platformPolicy,
      usdTryRate,
    });

    const effectivePrice = pricing.effectivePriceTry ?? 0; // KDV hariç gelir tabanı

    // Kanonik motor (marketplace-pricing) netRevenueTry'i kullan — komisyon KDV
    // dahil matrahtan, elde kalan gelir KDV hariç. Maliyet + ambalaj düşülür.
    const unitCostTry = toNum(p.unitCostTry);
    const packagingCost = toNum(p.packagingCost);
    const hasData = pricing.hasData && pricing.netRevenueTry != null && unitCostTry > 0;
    const netProfitVal = hasData ? pricing.netRevenueTry! - unitCostTry - packagingCost : null;
    const marginVal =
      netProfitVal != null && effectivePrice > 0 ? (netProfitVal / effectivePrice) * 100 : null;
    const roiVal =
      netProfitVal != null && unitCostTry > 0 ? (netProfitVal / unitCostTry) * 100 : null;
    const profitableVal = netProfitVal != null ? netProfitVal > 0 : null;

    return {
      id:               l.id,
      productId:        p.id,
      productSku:       p.sku,
      productName:      p.name,
      platform:         l.platform,
      marketplacePrice: pricing.priceInclVatTry ?? effectivePrice, // KDV dahil göster
      priceSource:      pricing.priceSource,
      netProfit:        netProfitVal,
      margin:           marginVal,
      roi:              roiVal,
      profitable:       profitableVal,
      hasData,
      stockQuantity:    p.stockQuantity ?? 0,
      salesPotential:   p.onlineSalesPotential ?? 0,
      shippingTry:      pricing.shippingTry,
      shippingSource:   pricing.shippingSource,
      commissionPct:    pricing.commissionPct,
      commissionSource: pricing.commissionSource,
    };
  });

  // Aggregates
  const withData   = rows.filter((r) => r.hasData);
  const profitable = withData.filter((r) => r.profitable);
  const losing     = withData.filter((r) => !r.profitable);
  const noData     = rows.filter((r) => !r.hasData);
  const highStockLowSales = rows.filter(
    (r) => r.stockQuantity > 5 && r.salesPotential === 0,
  );

  // Sorted views
  const winners   = [...withData].sort((a, b) => (b.margin ?? 0) - (a.margin ?? 0)).slice(0, 20);
  const loserRows = [...losing].sort((a, b) => (a.margin ?? 0) - (b.margin ?? 0));

  // Per-platform summary
  const platformMap: Record<
    string,
    { total: number; profitable: number; losing: number; noData: number }
  > = {};
  for (const r of rows) {
    if (!platformMap[r.platform]) {
      platformMap[r.platform] = { total: 0, profitable: 0, losing: 0, noData: 0 };
    }
    platformMap[r.platform].total++;
    if (!r.hasData) platformMap[r.platform].noData++;
    else if (r.profitable) platformMap[r.platform].profitable++;
    else platformMap[r.platform].losing++;
  }
  const platforms = Object.keys(platformMap).sort();

  // Policy coverage
  const policyConfiguredCount = allPolicies.length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Pazar Yerleri / Kârlılık
          </p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
            Pazar Yeri Kâr Paneli
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
            Aktif listeleme başına pazar yeri kanalı kârlılığı — etkin marj politikasıyla hesaplanmıştır.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/marketplace-policies">
            <Button variant="secondary">
              <Settings size={14} strokeWidth={1.5} className="mr-1" />
              Marj Politikaları
            </Button>
          </Link>
          <Link href="/marketplace/monitoring">
            <Button variant="secondary">
              <AlertTriangle size={14} strokeWidth={1.5} className="mr-1" />
              İzleme
            </Button>
          </Link>
          <Link href="/marketplace">
            <Button variant="secondary">
              <ArrowLeft size={14} strokeWidth={1.5} className="mr-1" />
              Listeleme Kaydı
            </Button>
          </Link>
        </div>
      </div>

      {/* Policy coverage notice */}
      {policyConfiguredCount === 0 && (
        <Card className="p-4 rounded-lg border-[var(--warn-border)] bg-[var(--warn-dim)]">
          <div className="flex items-start gap-3">
            <AlertTriangle size={14} strokeWidth={1.5} className="text-[var(--warn)] mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-[var(--warn)]">
                Platform politikaları henüz yapılandırılmadı
              </p>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Kargo ve komisyon değerleri sistem varsayılanları kullanılarak hesaplanıyor (Kargo: ₺0, Komisyon: %20).
                {" "}
                <Link href="/admin/marketplace-policies" className="underline font-medium text-[var(--warn)]">
                  Platform politikalarını yapılandır →
                </Link>
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <Card className="p-4 rounded-lg">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Aktif Listeleme
          </p>
          <p className="mt-2 text-2xl font-semibold tabular-nums font-mono text-[var(--text-primary)]">{rows.length}</p>
        </Card>
        <Card className="p-4 rounded-lg">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Kârlı</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums font-mono text-[var(--ok)]">{profitable.length}</p>
        </Card>
        <Card className="p-4 rounded-lg">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Kârsız</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums font-mono text-[var(--danger)]">{losing.length}</p>
        </Card>
        <Card className="p-4 rounded-lg">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Veri Eksik</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums font-mono text-[var(--warn)]">{noData.length}</p>
        </Card>
      </div>

      {/* No listings at all */}
      {rows.length === 0 && (
        <Card className="p-10 text-center space-y-3 rounded-lg">
          <p className="text-[var(--text-secondary)] text-sm font-medium">Aktif listeleme bulunamadı.</p>
          <p className="text-[var(--text-muted)] text-xs">
            Kârlılık analizi için önce pazar yeri listelemeleri ekleyin.
          </p>
          <Link href="/marketplace/new">
            <Button className="mt-2">+ Yeni listeleme ekle</Button>
          </Link>
        </Card>
      )}

      {/* Platform breakdown */}
      {platforms.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-secondary)]">Platform Özeti</h2>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            {platforms.map((pf) => {
              const s = platformMap[pf];
              const hasPol = policyByPlatform[pf] != null;
              return (
                <Card key={pf} className="p-4 space-y-1 rounded-lg">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                      {PLATFORM_LABELS[pf] ?? pf}
                    </p>
                    {hasPol ? (
                      <Badge variant="ok" className="text-[10px]">Politika ✓</Badge>
                    ) : (
                      <Badge variant="warn" className="text-[10px]">Varsayılan</Badge>
                    )}
                  </div>
                  <p className="text-xl font-semibold tabular-nums font-mono text-[var(--text-primary)]">{s.total} listeleme</p>
                  <div className="flex flex-wrap gap-x-3 text-xs mt-1 tabular-nums font-mono">
                    <span className="text-[var(--ok)]">{s.profitable} kârlı</span>
                    {s.losing > 0 && <span className="text-[var(--danger)]">{s.losing} kârsız</span>}
                    {s.noData > 0 && <span className="text-[var(--warn)]">{s.noData} veri yok</span>}
                  </div>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Winners table */}
      {winners.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-secondary)]">
            En Kârlı Listelemeler{" "}
            <span className="text-[var(--text-muted)] font-normal normal-case tracking-normal">
              (marj sıralaması — en fazla 20)
            </span>
          </h2>
          <ProfitTable rows={winners} showPolicySources />
        </section>
      )}

      {/* Losers table */}
      {loserRows.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--danger)]">
            Kârsız Listelemeler{" "}
            <span className="text-[var(--text-muted)] font-normal normal-case tracking-normal">({loserRows.length} listeleme)</span>
          </h2>
          <ProfitTable rows={loserRows} highlight="danger" showPolicySources />
        </section>
      )}

      {/* Missing price/cost data */}
      {noData.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--warn)]">
            Fiyat / Maliyet Verisi Eksik{" "}
            <span className="text-[var(--text-muted)] font-normal normal-case tracking-normal">({noData.length} listeleme)</span>
          </h2>
          <p className="text-xs text-[var(--text-secondary)]">
            Bu ürünlere pazar yeri fiyatı veya maliyet bilgisi girilmediğinden kârlılık hesaplanamıyor.
          </p>
          <Card className="overflow-hidden rounded-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-[var(--text-secondary)] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--warn-dim)]">
                    <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Platform</th>
                    <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Ürün</th>
                    <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Yapılacak</th>
                  </tr>
                </thead>
                <tbody>
                  {noData.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--surface-3)]">
                      <td className="py-3 px-4"><PlatformChip platform={r.platform} /></td>
                      <td className="py-3 px-4">
                        <Link href={`/products/${r.productId}`} className="font-mono text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                          {r.productSku}
                        </Link>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5 max-w-[220px] truncate">{r.productName}</p>
                      </td>
                      <td className="py-3 px-4">
                        <Link href={`/products/${r.productId}/edit`} className="text-xs text-[var(--warn)] hover:brightness-110 underline underline-offset-2">
                          Fiyatlandırma ve kârlılık bölümünü doldur →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      )}

      {/* High stock / low demand */}
      {highStockLowSales.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-secondary)]">
            Yüksek Stok / Düşük Satış Potansiyeli{" "}
            <span className="text-[var(--text-muted)] font-normal normal-case tracking-normal">
              ({highStockLowSales.length} listeleme)
            </span>
          </h2>
          <p className="text-xs text-[var(--text-secondary)]">
            Stok miktarı 5&apos;ten fazla olan ancak çevrimiçi satış potansiyeli tanımlanmamış aktif listelemeler.
          </p>
          <Card className="overflow-hidden rounded-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-[var(--text-secondary)] border-collapse">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)]">
                    <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Platform</th>
                    <th className="py-3 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Ürün</th>
                    <th className="py-3 px-4 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Stok</th>
                    <th className="py-3 px-4 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Satış Pot.</th>
                    <th className="py-3 px-4 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Net Kâr</th>
                  </tr>
                </thead>
                <tbody>
                  {highStockLowSales.map((r) => (
                    <tr key={r.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--surface-3)]">
                      <td className="py-3 px-4"><PlatformChip platform={r.platform} /></td>
                      <td className="py-3 px-4">
                        <Link href={`/products/${r.productId}`} className="font-mono text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">
                          {r.productSku}
                        </Link>
                        <p className="text-xs text-[var(--text-secondary)] mt-0.5 max-w-[220px] truncate">{r.productName}</p>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-[var(--text-secondary)] tabular-nums font-mono">{r.stockQuantity}</td>
                      <td className="py-3 px-4 text-right text-[var(--text-muted)] tabular-nums font-mono">—</td>
                      <td className={`py-3 px-4 text-right text-xs font-semibold tabular-nums font-mono ${r.netProfit != null ? (r.netProfit >= 0 ? "text-[var(--ok)]" : "text-[var(--danger)]") : "text-[var(--text-muted)]"}`}>
                        {r.netProfit != null ? fmt(r.netProfit) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      )}
    </div>
  );
}

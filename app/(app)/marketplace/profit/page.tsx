/**
 * Phase 15 — Marketplace Profit Dashboard
 * Phase 30 — Marketplace Margin Policy Normalization
 *
 * Per-listing marketplace channel profitability computed from effective
 * shipping/commission using the three-tier policy resolver.
 *
 * Shows:
 *  - Summary: active listings, profitable, unprofitable, missing data counts
 *  - Winners table (top margin DESC)
 *  - Losers table (all with negative profit)
 *  - Missing data alert (no marketplace price or unit cost)
 *  - High-stock / low-demand signal (stock > 5, salesPotential = 0)
 */

import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { calculateProfitability } from "@/lib/profitability";
import {
  resolveMarginPolicy,
  policySourceLabel,
  policySourceColor,
  type PolicySource,
} from "@/lib/marketplace-policy";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  netProfit: number | null;
  margin: number | null;
  roi: number | null;
  profitable: boolean | null;
  hasData: boolean;
  stockQuantity: number;
  salesPotential: number;
  shippingTry: number;
  shippingSource: PolicySource;
  commissionPct: number;
  commissionSource: PolicySource;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function PlatformChip({ platform }: { platform: string }) {
  return (
    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
      {PLATFORM_LABELS[platform] ?? platform}
    </span>
  );
}

function PolicyBadge({ source }: { source: PolicySource }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${policySourceColor(source)}`}>
      {policySourceLabel(source)}
    </span>
  );
}

function ProfitBadge({ row }: { row: ListingRow }) {
  if (!row.hasData) {
    return (
      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
        Veri yok
      </span>
    );
  }
  if (row.profitable) {
    return (
      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
        Kârlı
      </span>
    );
  }
  return (
    <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
      Kârsız
    </span>
  );
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
  const headBg = highlight === "danger" ? "bg-red-50/50" : "bg-slate-50/50";
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-slate-700 border-collapse">
          <thead>
            <tr className={`border-b border-slate-100 ${headBg}`}>
              <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Platform</th>
              <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Ürün</th>
              <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Fiyat</th>
              <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Net Kâr</th>
              <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Marj</th>
              <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">ROI</th>
              {showPolicySources && (
                <>
                  <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Kargo</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Komisyon</th>
                </>
              )}
              <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Durum</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                <td className="py-3 px-4">
                  <PlatformChip platform={r.platform} />
                </td>
                <td className="py-3 px-4">
                  <Link
                    href={`/products/${r.productId}`}
                    className="font-mono text-xs text-slate-500 hover:text-slate-800"
                  >
                    {r.productSku}
                  </Link>
                  <p className="text-xs text-slate-600 mt-0.5 max-w-[200px] truncate">
                    {r.productName}
                  </p>
                </td>
                <td className="py-3 px-4 text-right text-xs text-slate-600">
                  {r.marketplacePrice > 0 ? fmt(r.marketplacePrice) : <span className="text-slate-300">—</span>}
                </td>
                <td className={`py-3 px-4 text-right text-xs font-semibold ${r.netProfit != null ? (r.netProfit >= 0 ? "text-emerald-600" : "text-red-600") : "text-slate-300"}`}>
                  {r.netProfit != null ? fmt(r.netProfit) : "—"}
                </td>
                <td className={`py-3 px-4 text-right text-xs font-semibold ${r.margin != null ? (r.margin >= 0 ? "text-emerald-600" : "text-red-600") : "text-slate-300"}`}>
                  {r.margin != null ? fmtPct(r.margin) : "—"}
                </td>
                <td className={`py-3 px-4 text-right text-xs ${r.roi != null ? (r.roi >= 0 ? "text-slate-700" : "text-red-600") : "text-slate-300"}`}>
                  {r.roi != null ? fmtPct(r.roi) : "—"}
                </td>
                {showPolicySources && (
                  <>
                    <td className="py-3 px-4 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-xs text-slate-700">{fmt(r.shippingTry)}</span>
                        <PolicyBadge source={r.shippingSource} />
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-xs text-slate-700">{fmtPct(r.commissionPct)}</span>
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
  await requirePermission(PERMISSIONS.MARKETPLACE_LISTINGS_READ);

  const [listings, allPolicies] = await Promise.all([
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
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.marketplacePlatformPolicy.findMany(),
  ]);

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

  // Compute profitability per listing using effective policy
  const rows: ListingRow[] = listings.map((l) => {
    const p = l.product;
    const platformPolicy = policyByPlatform[l.platform as MarketplacePlatform] ?? null;

    const policy = resolveMarginPolicy(
      {
        shippingCost:                  toNum(p.shippingCost),
        shippingCostOverride:          p.shippingCostOverride ? toNum(p.shippingCostOverride) : null,
        marketplaceCommission:         toNum(p.marketplaceCommission),
        marketplaceCommissionOverride: p.marketplaceCommissionOverride ? toNum(p.marketplaceCommissionOverride) : null,
        vatRate:                       p.vatRate ? toNum(p.vatRate) : null,
        paymentFeeRate:                p.paymentFeeRate ? toNum(p.paymentFeeRate) : null,
        returnReserveRate:             p.returnReserveRate ? toNum(p.returnReserveRate) : null,
      },
      platformPolicy,
    );

    const profit = calculateProfitability({
      unitCostTry:                    toNum(p.unitCostTry),
      marketplacePriceTry:            toNum(p.marketplacePriceTry),
      shippingCost:                   policy.shippingTry,
      shippingCostOverride:           null, // already resolved above
      marketplaceCommission:          policy.commissionPct,
      marketplaceCommissionOverride:  null, // already resolved above
      packagingCost:                  toNum(p.packagingCost),
      vatRate:                        policy.vatPct,
      paymentFeeRate:                 policy.paymentFeePct,
      returnReserveRate:              policy.returnReservePct,
    });

    const ch = profit.marketplace;
    const hasData = ch != null;

    return {
      id:               l.id,
      productId:        p.id,
      productSku:       p.sku,
      productName:      p.name,
      platform:         l.platform,
      marketplacePrice: toNum(p.marketplacePriceTry),
      netProfit:        hasData ? ch!.netProfit : null,
      margin:           hasData ? ch!.margin : null,
      roi:              hasData ? (ch!.roi ?? null) : null,
      profitable:       hasData ? ch!.profitable : null,
      hasData,
      stockQuantity:    p.stockQuantity ?? 0,
      salesPotential:   p.onlineSalesPotential ?? 0,
      shippingTry:      policy.shippingTry,
      shippingSource:   policy.shippingSource,
      commissionPct:    policy.commissionPct,
      commissionSource: policy.commissionSource,
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
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Pazar Yerleri / Kârlılık
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Pazar Yeri Kâr Paneli
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Aktif listeleme başına pazar yeri kanalı kârlılığı — etkin marj politikasıyla hesaplanmıştır.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/marketplace-policies">
            <Button variant="secondary">⚙ Marj Politikaları</Button>
          </Link>
          <Link href="/marketplace/monitoring">
            <Button variant="secondary">⚠ İzleme</Button>
          </Link>
          <Link href="/marketplace">
            <Button variant="secondary">← Listeleme Kaydı</Button>
          </Link>
        </div>
      </div>

      {/* Policy coverage notice */}
      {policyConfiguredCount === 0 && (
        <Card className="p-4 bg-amber-50 border-amber-200">
          <div className="flex items-start gap-3">
            <span className="text-amber-600 text-lg">⚠</span>
            <div>
              <p className="text-sm font-semibold text-amber-800">
                Platform politikaları henüz yapılandırılmadı
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Kargo ve komisyon değerleri sistem varsayılanları kullanılarak hesaplanıyor (Kargo: ₺0, Komisyon: %20).
                {" "}
                <Link href="/admin/marketplace-policies" className="underline font-medium">
                  Platform politikalarını yapılandır →
                </Link>
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Aktif Listeleme
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{rows.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Kârlı</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">{profitable.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Kârsız</p>
          <p className="mt-1 text-2xl font-semibold text-red-600">{losing.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Veri Eksik</p>
          <p className="mt-1 text-2xl font-semibold text-amber-600">{noData.length}</p>
        </Card>
      </div>

      {/* No listings at all */}
      {rows.length === 0 && (
        <Card className="p-10 text-center space-y-3">
          <p className="text-slate-500 text-sm font-medium">Aktif listeleme bulunamadı.</p>
          <p className="text-slate-400 text-xs">
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
          <h2 className="text-base font-semibold text-slate-900">Platform Özeti</h2>
          <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
            {platforms.map((pf) => {
              const s = platformMap[pf];
              const hasPol = policyByPlatform[pf] != null;
              return (
                <Card key={pf} className="p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      {PLATFORM_LABELS[pf] ?? pf}
                    </p>
                    {hasPol ? (
                      <span className="text-[10px] rounded-full bg-emerald-100 text-emerald-700 px-1.5 py-0.5">Politika ✓</span>
                    ) : (
                      <span className="text-[10px] rounded-full bg-amber-100 text-amber-700 px-1.5 py-0.5">Varsayılan</span>
                    )}
                  </div>
                  <p className="text-xl font-semibold text-slate-900">{s.total} listeleme</p>
                  <div className="flex flex-wrap gap-x-3 text-xs mt-1">
                    <span className="text-emerald-600">{s.profitable} kârlı</span>
                    {s.losing > 0 && <span className="text-red-600">{s.losing} kârsız</span>}
                    {s.noData > 0 && <span className="text-amber-600">{s.noData} veri yok</span>}
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
          <h2 className="text-base font-semibold text-slate-900">
            En Kârlı Listelemeler{" "}
            <span className="text-slate-400 font-normal text-sm">
              (marj sıralaması — en fazla 20)
            </span>
          </h2>
          <ProfitTable rows={winners} showPolicySources />
        </section>
      )}

      {/* Losers table */}
      {loserRows.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-red-700">
            Kârsız Listelemeler{" "}
            <span className="text-slate-400 font-normal text-sm">({loserRows.length} listeleme)</span>
          </h2>
          <ProfitTable rows={loserRows} highlight="danger" showPolicySources />
        </section>
      )}

      {/* Missing price/cost data */}
      {noData.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-amber-700">
            Fiyat / Maliyet Verisi Eksik{" "}
            <span className="text-slate-400 font-normal text-sm">({noData.length} listeleme)</span>
          </h2>
          <p className="text-xs text-slate-500">
            Bu ürünlere pazar yeri fiyatı veya maliyet bilgisi girilmediğinden kârlılık hesaplanamıyor.
          </p>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-slate-700 border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-amber-50/50">
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Platform</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Ürün</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Yapılacak</th>
                  </tr>
                </thead>
                <tbody>
                  {noData.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-3 px-4"><PlatformChip platform={r.platform} /></td>
                      <td className="py-3 px-4">
                        <Link href={`/products/${r.productId}`} className="font-mono text-xs text-slate-500 hover:text-slate-800">
                          {r.productSku}
                        </Link>
                        <p className="text-xs text-slate-600 mt-0.5 max-w-[220px] truncate">{r.productName}</p>
                      </td>
                      <td className="py-3 px-4">
                        <Link href={`/products/${r.productId}/edit`} className="text-xs text-amber-600 hover:text-amber-800 underline underline-offset-2">
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
          <h2 className="text-base font-semibold text-slate-700">
            Yüksek Stok / Düşük Satış Potansiyeli{" "}
            <span className="text-slate-400 font-normal text-sm">
              ({highStockLowSales.length} listeleme)
            </span>
          </h2>
          <p className="text-xs text-slate-500">
            Stok miktarı 5&apos;ten fazla olan ancak çevrimiçi satış potansiyeli tanımlanmamış aktif listelemeler.
          </p>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-slate-700 border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Platform</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Ürün</th>
                    <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Stok</th>
                    <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Satış Pot.</th>
                    <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Net Kâr</th>
                  </tr>
                </thead>
                <tbody>
                  {highStockLowSales.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-3 px-4"><PlatformChip platform={r.platform} /></td>
                      <td className="py-3 px-4">
                        <Link href={`/products/${r.productId}`} className="font-mono text-xs text-slate-500 hover:text-slate-800">
                          {r.productSku}
                        </Link>
                        <p className="text-xs text-slate-600 mt-0.5 max-w-[220px] truncate">{r.productName}</p>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-700">{r.stockQuantity}</td>
                      <td className="py-3 px-4 text-right text-slate-400">—</td>
                      <td className={`py-3 px-4 text-right text-xs font-semibold ${r.netProfit != null ? (r.netProfit >= 0 ? "text-emerald-600" : "text-red-600") : "text-slate-300"}`}>
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

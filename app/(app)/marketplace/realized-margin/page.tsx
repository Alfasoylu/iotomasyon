/**
 * Phase 35 — Realized Margin Analysis
 *
 * Compares actual realized margins from Trendyol order history
 * against expected margins from the canonical Phase 33 pricing engine.
 *
 * Realized margin uses the actual selling price from TrendyolSalesRecord
 * (unitPriceTry), deducts commission + shipping estimated at that price,
 * then subtracts unit cost.
 *
 * Delta = realized margin − expected margin highlights products where
 * actual profitability diverges from what the pricing engine predicts.
 */

import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { calcMarketplacePricingRow } from "@/lib/marketplace-pricing";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Prisma } from "@prisma/client";

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

function isCancelled(status: string | null) {
  if (!status) return false;
  const s = status.toLowerCase();
  return s.includes("iptal") || s.includes("cancel");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RealizedRow {
  productId: string;
  productSku: string;
  productName: string;
  qtySold: number;
  totalRevenue: number;
  avgRealizedPriceTry: number;
  unitCostTry: number;
  /** Commission estimated at realized price using Trendyol platform policy */
  estimatedCommissionTry: number;
  /** Shipping estimated at realized price using price-tier defaults */
  estimatedShippingTry: number;
  /** Realized net margin % = (avgPrice - commission - shipping - cost) / avgPrice × 100 */
  realizedMarginPct: number | null;
  /** Expected margin % from pricing engine at current effective price */
  expectedMarginPct: number | null;
  /** Delta = realized − expected (negative = worse than expected) */
  deltaPct: number | null;
  hasFullData: boolean;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function RealizedMarginPage() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  // 90-day window
  const since = new Date();
  since.setDate(since.getDate() - 90);

  const [salesRecords, allProducts, allPolicies, latestRate] = await Promise.all([
    prisma.trendyolSalesRecord.findMany({
      where: {
        orderDate: { gte: since },
        productId: { not: null },
      },
      select: {
        productId: true,
        status: true,
        quantity: true,
        unitPriceTry: true,
      },
    }),
    prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        sku: true,
        name: true,
        unitCostTry: true,
        marketplacePriceTry: true,
        shippingCost: true,
        shippingCostOverride: true,
        marketplaceCommission: true,
        marketplaceCommissionOverride: true,
        vatRate: true,
        paymentFeeRate: true,
        returnReserveRate: true,
        xmlData: {
          select: { xmlTrendyolPrice: true },
        },
      },
    }),
    prisma.marketplacePlatformPolicy.findMany(),
    prisma.monthlyExchangeRate.findFirst({ orderBy: { month: "desc" } }),
  ]);

  const usdTryRate = latestRate ? toNum(latestRate.usdTryRate) : 32;

  // Build product lookup
  const productMap = new Map(allProducts.map((p) => [p.id, p]));

  // Build Trendyol platform policy input
  const trendyolPolicy = allPolicies.find((pol) => pol.platform === "TRENDYOL") ?? null;
  const platformPolicyInput = trendyolPolicy
    ? {
        standardShippingTry:   toNum(trendyolPolicy.standardShippingTry),
        standardCommissionPct: toNum(trendyolPolicy.standardCommissionPct),
        paymentFeePct:         toNum(trendyolPolicy.paymentFeePct),
        returnReservePct:      toNum(trendyolPolicy.returnReservePct),
        vatPct:                toNum(trendyolPolicy.vatPct),
      }
    : null;

  // Aggregate sales by productId (exclude cancelled)
  interface Agg { qty: number; revenue: number }
  const agg = new Map<string, Agg>();
  for (const r of salesRecords) {
    if (!r.productId || isCancelled(r.status)) continue;
    const qty = r.quantity ?? 1;
    const price = toNum(r.unitPriceTry);
    if (price <= 0) continue;
    const existing = agg.get(r.productId);
    if (existing) {
      existing.qty += qty;
      existing.revenue += price * qty;
    } else {
      agg.set(r.productId, { qty, revenue: price * qty });
    }
  }

  // Build realized margin rows
  const rows: RealizedRow[] = [];
  for (const [productId, { qty, revenue }] of agg.entries()) {
    const p = productMap.get(productId);
    if (!p) continue;

    const avgRealizedPriceTry = revenue / qty;
    const unitCostTry = toNum(p.unitCostTry);
    const hasFullData = unitCostTry > 0 && avgRealizedPriceTry > 0;

    // Estimate commission + shipping at realized price using canonical engine
    const productPolicyInput = {
      shippingCost:                  toNum(p.shippingCost),
      shippingCostOverride:          p.shippingCostOverride ? toNum(p.shippingCostOverride) : null,
      marketplaceCommission:         toNum(p.marketplaceCommission),
      marketplaceCommissionOverride: p.marketplaceCommissionOverride ? toNum(p.marketplaceCommissionOverride) : null,
      vatRate:                       p.vatRate ? toNum(p.vatRate) : null,
      paymentFeeRate:                p.paymentFeeRate ? toNum(p.paymentFeeRate) : null,
      returnReserveRate:             p.returnReserveRate ? toNum(p.returnReserveRate) : null,
    };

    // Realized pricing: use actual order price as effective price
    const realizedPricing = calcMarketplacePricingRow({
      platform:          "TRENDYOL",
      platformLabel:     "Trendyol",
      xmlPriceUsd:       null, // not relevant — we override with realized price below
      manualOverrideTry: avgRealizedPriceTry, // actual selling price
      product:           productPolicyInput,
      platformPolicy:    platformPolicyInput,
      usdTryRate,
    });

    const estimatedCommissionTry = realizedPricing.commissionTry;
    const estimatedShippingTry   = realizedPricing.shippingTry;

    let realizedMarginPct: number | null = null;
    if (hasFullData) {
      const netRealized = avgRealizedPriceTry - estimatedCommissionTry - estimatedShippingTry - realizedPricing.paymentFeeTry - realizedPricing.returnReserveTry - unitCostTry;
      realizedMarginPct = (netRealized / avgRealizedPriceTry) * 100;
    }

    // Expected pricing: use current effective price from canonical engine
    const xmlTrendyolPriceUsd = p.xmlData ? toNum(p.xmlData.xmlTrendyolPrice) : null;
    const expectedPricing = calcMarketplacePricingRow({
      platform:          "TRENDYOL",
      platformLabel:     "Trendyol",
      xmlPriceUsd:       xmlTrendyolPriceUsd && xmlTrendyolPriceUsd > 0 ? xmlTrendyolPriceUsd : null,
      manualOverrideTry: p.marketplacePriceTry ? toNum(p.marketplacePriceTry) : null,
      product:           productPolicyInput,
      platformPolicy:    platformPolicyInput,
      usdTryRate,
    });
    const expectedMarginPct = expectedPricing.netMarginPct;

    const deltaPct = realizedMarginPct != null && expectedMarginPct != null
      ? realizedMarginPct - expectedMarginPct
      : null;

    rows.push({
      productId,
      productSku:             p.sku,
      productName:            p.name,
      qtySold:                qty,
      totalRevenue:           revenue,
      avgRealizedPriceTry,
      unitCostTry,
      estimatedCommissionTry,
      estimatedShippingTry,
      realizedMarginPct,
      expectedMarginPct,
      deltaPct,
      hasFullData,
    });
  }

  // Sort: worst realized margin first
  rows.sort((a, b) => {
    if (a.realizedMarginPct == null && b.realizedMarginPct == null) return 0;
    if (a.realizedMarginPct == null) return -1;
    if (b.realizedMarginPct == null) return 1;
    return a.realizedMarginPct - b.realizedMarginPct;
  });

  const withData  = rows.filter((r) => r.hasFullData);
  const noData    = rows.filter((r) => !r.hasFullData);
  const losers    = withData.filter((r) => r.realizedMarginPct != null && r.realizedMarginPct < 0);
  const winners   = withData.filter((r) => r.realizedMarginPct != null && r.realizedMarginPct >= 0)
                            .sort((a, b) => (b.realizedMarginPct ?? 0) - (a.realizedMarginPct ?? 0));
  const diverging = withData.filter((r) => r.deltaPct != null && r.deltaPct < -5);

  const totalRevenue = rows.reduce((s, r) => s + r.totalRevenue, 0);
  const avgMargin = withData.length > 0
    ? withData.reduce((s, r) => s + (r.realizedMarginPct ?? 0), 0) / withData.length
    : null;

  function marginColor(pct: number | null): string {
    if (pct == null) return "text-slate-300";
    if (pct >= 25) return "text-emerald-600";
    if (pct >= 10) return "text-amber-600";
    return "text-red-600";
  }

  function deltaColor(pct: number | null): string {
    if (pct == null) return "text-slate-300";
    if (pct >= 0) return "text-emerald-600";
    if (pct >= -5) return "text-amber-600";
    return "text-red-600";
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Pazar Yerleri / Gerçekleşen Marj
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Gerçekleşen Marj Analizi
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Trendyol sipariş geçmişinden hesaplanan gerçekleşen marj — beklenen marjla karşılaştırmalı (son 90 gün).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/marketplace/profit">
            <Button variant="secondary">← Kâr Paneli</Button>
          </Link>
          <Link href="/admin/product-performance">
            <Button variant="secondary">Satış Performansı</Button>
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Satılan Ürün Çeşidi
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{rows.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Toplam Ciro (90G)
          </p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{fmt(totalRevenue)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Ort. Gerçekleşen Marj
          </p>
          <p className={`mt-1 text-2xl font-semibold ${marginColor(avgMargin)}`}>
            {avgMargin != null ? fmtPct(avgMargin) : "—"}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Beklenenden Kötü (−5%)
          </p>
          <p className={`mt-1 text-2xl font-semibold ${diverging.length > 0 ? "text-red-600" : "text-emerald-600"}`}>
            {diverging.length}
          </p>
        </Card>
      </div>

      {/* Empty state */}
      {rows.length === 0 && (
        <Card className="p-10 text-center space-y-3">
          <p className="text-slate-500 text-sm font-medium">
            Son 90 günde eşleşmiş Trendyol satışı bulunamadı.
          </p>
          <p className="text-slate-400 text-xs">
            Sipariş verilerini senkronize edin.
          </p>
          <Link href="/admin/product-performance">
            <Button className="mt-2">Satış Senkronizasyonu →</Button>
          </Link>
        </Card>
      )}

      {/* Losers */}
      {losers.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-red-700">
            Zarar Eden Satışlar{" "}
            <span className="text-slate-400 font-normal text-sm">({losers.length} ürün — gerçekleşen marj negatif)</span>
          </h2>
          <MarginTable rows={losers} marginColor={marginColor} deltaColor={deltaColor} />
        </section>
      )}

      {/* Diverging from expected */}
      {diverging.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-amber-700">
            Beklenenden Düşük Marj{" "}
            <span className="text-slate-400 font-normal text-sm">
              ({diverging.length} ürün — gerçekleşen, beklenen marjdan 5+ puan düşük)
            </span>
          </h2>
          <p className="text-xs text-slate-500">
            Bu ürünler için fiyat politikası, iade oranı veya maliyet girdilerini gözden geçirin.
          </p>
          <MarginTable rows={diverging} marginColor={marginColor} deltaColor={deltaColor} showDelta />
        </section>
      )}

      {/* Winners */}
      {winners.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-slate-900">
            Kârlı Satışlar{" "}
            <span className="text-slate-400 font-normal text-sm">(gerçekleşen marj — yüksekten düşüğe)</span>
          </h2>
          <MarginTable rows={winners} marginColor={marginColor} deltaColor={deltaColor} showDelta />
        </section>
      )}

      {/* No cost data */}
      {noData.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-amber-700">
            Maliyet Verisi Eksik{" "}
            <span className="text-slate-400 font-normal text-sm">({noData.length} ürün)</span>
          </h2>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-slate-700 border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-amber-50/50">
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Ürün</th>
                    <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Satış (90G)</th>
                    <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Ciro</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Yapılacak</th>
                  </tr>
                </thead>
                <tbody>
                  {noData.map((r) => (
                    <tr key={r.productId} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-3 px-4">
                        <Link href={`/products/${r.productId}`} className="font-mono text-xs text-slate-500 hover:text-slate-800">
                          {r.productSku}
                        </Link>
                        <p className="text-xs text-slate-600 mt-0.5 max-w-[200px] truncate">{r.productName}</p>
                      </td>
                      <td className="py-3 px-4 text-right text-xs text-slate-700">{r.qtySold}</td>
                      <td className="py-3 px-4 text-right text-xs text-slate-700">{fmt(r.totalRevenue)}</td>
                      <td className="py-3 px-4">
                        <Link href={`/products/${r.productId}/edit`} className="text-xs text-amber-600 hover:text-amber-800 underline underline-offset-2">
                          Maliyet gir →
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

      {/* Formula note */}
      <Card className="p-4 bg-slate-50/50 text-xs text-slate-500 space-y-1">
        <p className="font-semibold text-slate-700">Hesaplama Notu</p>
        <p>Gerçekleşen marj = (Ort. gerçekleşen fiyat − tahm. komisyon − tahm. kargo − ödeme komisyonu − iade rezervi − birim maliyet) / fiyat × 100</p>
        <p>Komisyon ve kargo, gerçekleşen fiyat üzerinden platform politikasına veya sistem varsayılanına göre hesaplanır.</p>
        <p>Delta = Gerçekleşen marj − Beklenen marj (negatif: beklenden kötü, pozitif: beklenden iyi).</p>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component
// ---------------------------------------------------------------------------

function MarginTable({
  rows,
  marginColor,
  deltaColor,
  showDelta = false,
}: {
  rows: RealizedRow[];
  marginColor: (pct: number | null) => string;
  deltaColor: (pct: number | null) => string;
  showDelta?: boolean;
}) {
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

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-slate-700 border-collapse">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50/50">
              <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Ürün</th>
              <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Satış (90G)</th>
              <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Ort. Fiyat</th>
              <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Birim Maliyet</th>
              <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Gerçekleşen Marj</th>
              {showDelta && (
                <>
                  <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Beklenen Marj</th>
                  <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Delta</th>
                </>
              )}
              <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Ciro</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.productId} className="border-b border-slate-50 hover:bg-slate-50/50">
                <td className="py-3 px-4">
                  <Link href={`/products/${r.productId}`} className="font-mono text-xs text-slate-500 hover:text-slate-800">
                    {r.productSku}
                  </Link>
                  <p className="text-xs text-slate-600 mt-0.5 max-w-[200px] truncate">{r.productName}</p>
                </td>
                <td className="py-3 px-4 text-right text-xs text-slate-700">{r.qtySold}</td>
                <td className="py-3 px-4 text-right text-xs text-slate-700">{fmt(r.avgRealizedPriceTry)}</td>
                <td className="py-3 px-4 text-right text-xs text-slate-700">
                  {r.unitCostTry > 0 ? fmt(r.unitCostTry) : <span className="text-amber-500">Eksik</span>}
                </td>
                <td className={`py-3 px-4 text-right text-xs font-semibold ${marginColor(r.realizedMarginPct)}`}>
                  {r.realizedMarginPct != null ? fmtPct(r.realizedMarginPct) : "—"}
                </td>
                {showDelta && (
                  <>
                    <td className={`py-3 px-4 text-right text-xs ${marginColor(r.expectedMarginPct)}`}>
                      {r.expectedMarginPct != null ? fmtPct(r.expectedMarginPct) : "—"}
                    </td>
                    <td className={`py-3 px-4 text-right text-xs font-semibold ${deltaColor(r.deltaPct)}`}>
                      {r.deltaPct != null ? (r.deltaPct >= 0 ? `+${r.deltaPct.toFixed(1)}` : r.deltaPct.toFixed(1)) : "—"}
                    </td>
                  </>
                )}
                <td className="py-3 px-4 text-right text-xs text-slate-700">{fmt(r.totalRevenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

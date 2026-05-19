/**
 * Phase 72 — İthalat Karar Cockpiti v2 (Phase 50 + Phase 72 güncelleme)
 *
 * Phase 72 eklentisi: MarketplacePrice tablosu fiyat çözümleme hiyerarşisine eklendi.
 * Öncelik sırası: Trendyol gerçekleşen → MarketplacePrice TRENDYOL → XML → Manuel
 *
 * Önceki Phase 50 notu:
 *
 * Upgrades the Phase 11C import-decisions page with REAL Trendyol data:
 *   - Trendyol gerçekleşen ortalama satış fiyatı (son 90 gün, Delivered)
 *   - Trendyol satış hızı (son 30 gün, Delivered)
 *   - İade oranı (TrendyolReturnRecord / toplam satış)
 *   - Bunlarla hesaplanan net kâr/adet + marj % + aylık kâr tahmini
 *   - "AL / BEKLE / ALMA" sinyali gerçek veriden
 *   - Eşleşmemiş ürünler için uyarı (Trendyol verisi yok → manuel tahmin gösterilir)
 *
 * Sinyal eşikleri:
 *   AL     → marj ≥ 25% VE aylık kâr > 0
 *   BEKLE  → marj ≥ 15% VE aylık kâr > 0
 *   ALMA   → diğer (zarar veya yetersiz marj)
 *
 * Şema değişikliği yok — TrendyolSalesRecord + TrendyolReturnRecord + Product okunur.
 */

import Link from "next/link";
import { Ship } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import {
  calculateImportDecision,
  DEFAULT_USD_TRY_RATE,
} from "@/lib/import-decision";
import { resolveMarginPolicy } from "@/lib/marketplace-policy";

export const dynamic = "force-dynamic";

// ── Sinyal tipi ──────────────────────────────────────────────────────────────
type Signal = "AL" | "BEKLE" | "ALMA" | "VERİ_EKSİK";

function computeSignal(marginPct: number | null, monthlyProfitTry: number | null): Signal {
  if (marginPct === null || monthlyProfitTry === null) return "VERİ_EKSİK";
  if (monthlyProfitTry <= 0 || marginPct < 0) return "ALMA";
  if (marginPct >= 25) return "AL";
  if (marginPct >= 15) return "BEKLE";
  return "ALMA";
}

const SIGNAL_STYLE: Record<Signal, string> = {
  AL:        "bg-emerald-100 text-emerald-800 border border-emerald-200",
  BEKLE:     "bg-amber-100 text-amber-800 border border-amber-200",
  ALMA:      "bg-red-100 text-red-700 border border-red-200",
  VERİ_EKSİK: "bg-slate-100 text-slate-500 border border-slate-200",
};

const SIGNAL_LABEL: Record<Signal, string> = {
  AL:        "✓ AL",
  BEKLE:     "⏸ BEKLE",
  ALMA:      "✗ ALMA",
  VERİ_EKSİK: "— Veri Eksik",
};

// ── Format yardımcıları ──────────────────────────────────────────────────────
function fmtTry(n: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency", currency: "TRY", maximumFractionDigits: 0,
  }).format(n);
}

function fmtPct(n: number) {
  return `%${n.toFixed(1)}`;
}

type Tab = "all" | "AL" | "BEKLE" | "ALMA" | "VERİ_EKSİK";

const TAB_LABELS: Record<Tab, string> = {
  all:       "Tümü",
  AL:        "AL",
  BEKLE:     "BEKLE",
  ALMA:      "ALMA",
  VERİ_EKSİK: "Veri Eksik",
};

export default async function ImportCockpitPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  const sp = await searchParams;
  const tab = (sp.tab as Tab | undefined) ?? "all";

  const now = new Date();
  const ago90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const ago30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // ── Paralel veri çekimi ───────────────────────────────────────────────────
  const [latestRate, trendyolPolicy, products, sales90Raw, sales30Raw, returnsRaw, mpPricesRaw] = await Promise.all([
    prisma.monthlyExchangeRate.findFirst({
      orderBy: [{ year: "desc" }, { month: "desc" }],
    }),
    // Trendyol platform policy — komisyon + kargo kademe
    prisma.marketplacePlatformPolicy.findUnique({ where: { platform: "TRENDYOL" } }),
    prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        sku: true,
        stockQuantity: true,
        importUnitCostUsd: true,
        unitCostUsd: true,
        weightKg: true,
        customsRatePct: true,
        shippingMethodPref: true,
        sellingPriceTry: true,
        marketplacePriceTry: true,
        shippingCost: true,
        shippingCostOverride: true,
        marketplaceCommission: true,
        marketplaceCommissionOverride: true,
        onlineSalesPotential: true,
        wholesaleSalesPotential: true,
        installerSalesPotential: true,
        sourceCostRmb: true,
        importPaymentFeePct: true,
        // XML kaynaklı fiyatlar — Trendyol fiyatı fallback olarak kullanılır
        xmlData: {
          select: { xmlTrendyolPrice: true },
        },
      },
      orderBy: { name: "asc" },
    }),
    // Trendyol ortalama satış fiyatı + toplam satış hacmi — son 90 gün
    prisma.trendyolSalesRecord.groupBy({
      by: ["productId"],
      where: {
        productId: { not: null },
        orderDate: { gte: ago90 },
        status: { contains: "Delivered", mode: "insensitive" },
      },
      _avg: { unitPriceTry: true },
      _sum: { quantity: true },
      _count: { id: true },
    }),
    // Trendyol 30 günlük satış hızı
    prisma.trendyolSalesRecord.groupBy({
      by: ["productId"],
      where: {
        productId: { not: null },
        orderDate: { gte: ago30 },
        status: { contains: "Delivered", mode: "insensitive" },
      },
      _sum: { quantity: true },
    }),
    // İade sayısı (tüm zamanlar)
    prisma.trendyolReturnRecord.groupBy({
      by: ["productId"],
      where: { productId: { not: null } },
      _count: { id: true },
    }),
    // Phase 72 — MarketplacePrice canonical TRENDYOL fiyatları
    prisma.marketplacePrice.findMany({
      where: { marketplace: "TRENDYOL" },
      select: { productId: true, priceTry: true },
    }),
  ]);

  const usdTryRate = latestRate ? Number(latestRate.usdTryRate) : DEFAULT_USD_TRY_RATE;
  const rmbUsdRate = latestRate?.rmbUsdRate != null ? Number(latestRate.rmbUsdRate) : null;

  // Platform policy shape for resolveMarginPolicy
  const platformPolicyInput = trendyolPolicy
    ? {
        standardShippingTry:   trendyolPolicy.standardShippingTry != null ? Number(trendyolPolicy.standardShippingTry) : null,
        standardCommissionPct: trendyolPolicy.standardCommissionPct != null ? Number(trendyolPolicy.standardCommissionPct) : null,
        paymentFeePct:         trendyolPolicy.paymentFeePct != null ? Number(trendyolPolicy.paymentFeePct) : null,
        returnReservePct:      trendyolPolicy.returnReservePct != null ? Number(trendyolPolicy.returnReservePct) : null,
        vatPct:                trendyolPolicy.vatPct != null ? Number(trendyolPolicy.vatPct) : null,
        shippingTiersJson:     trendyolPolicy.shippingTiersJson,
      }
    : null;

  // ── Lookup map'leri ───────────────────────────────────────────────────────
  const sales90Map = new Map<string, { avgPrice: number; totalQty: number; orderCount: number }>();
  for (const r of sales90Raw) {
    if (!r.productId) continue;
    sales90Map.set(r.productId, {
      avgPrice: r._avg.unitPriceTry != null ? Number(r._avg.unitPriceTry) : 0,
      totalQty: r._sum.quantity ?? 0,
      orderCount: r._count.id,
    });
  }

  const sales30Map = new Map<string, number>(); // productId → units sold in last 30 days
  for (const r of sales30Raw) {
    if (!r.productId) continue;
    sales30Map.set(r.productId, r._sum.quantity ?? 0);
  }

  const returnsMap = new Map<string, number>(); // productId → total return count
  for (const r of returnsRaw) {
    if (!r.productId) continue;
    returnsMap.set(r.productId, r._count.id);
  }

  // Phase 72 — MarketplacePrice TRENDYOL canonical fiyatlar (zaten TRY)
  const mpTrendyolMap = new Map<string, number>(); // productId → priceTry
  for (const mp of mpPricesRaw) {
    mpTrendyolMap.set(mp.productId, Number(mp.priceTry));
  }

  // ── Satır hesapları ───────────────────────────────────────────────────────
  type Row = {
    id: string;
    name: string;
    sku: string | null;
    stockQuantity: number;
    // Trendyol verisi
    hasTrendyolData: boolean;
    trendyolAvgPriceTry: number | null;
    trendyolUnits90d: number | null;
    trendyolUnits30d: number | null;
    returnCount: number;
    returnRate: number | null; // 0‥1
    // Kullanılan satış fiyatı
    resolvedPriceTry: number | null;
    priceSource: "trendyol" | "mp" | "xml" | "manual" | "none";
    // Hesaplama
    landedCostTry: number | null;
    netRevenueTry: number | null;
    netProfitTry: number | null;
    marginPct: number | null;
    // Aylık kâr
    effectiveMonthlyUnits: number | null;
    monthlyProfitTry: number | null;
    // Sinyal
    signal: Signal;
    // Phase 66 — Stok kapsamı (gün)
    daysOfCoverage: number | null;
    // Phase 85 — Önerilen sipariş adeti
    recommendedQty: number | null;
  };

  const rows: Row[] = products.map((p) => {
    // ── Trendyol verileri ──────────────────────────────────────────────────
    const s90 = sales90Map.get(p.id);
    const units30d = sales30Map.get(p.id) ?? null;
    const returnCount = returnsMap.get(p.id) ?? 0;
    const hasTrendyolData = s90 != null && s90.avgPrice > 0;

    const trendyolAvgPriceTry = hasTrendyolData ? s90!.avgPrice : null;
    const trendyolUnits90d = s90?.totalQty ?? null;
    const trendyolUnits30d = units30d;

    // İade oranı: returns / (sales90d + returns) — muhafazakâr hesap
    const totalSales90 = s90?.totalQty ?? 0;
    const returnRate =
      (totalSales90 + returnCount) > 0
        ? returnCount / (totalSales90 + returnCount)
        : null;

    // ── Satış fiyatı çözümü ────────────────────────────────────────────────
    // Öncelik: Trendyol gerçekleşen ort. → MarketplacePrice TRENDYOL → XML → Manuel
    const mpPriceTry = mpTrendyolMap.get(p.id) ?? null;

    const xmlTrendyolPriceTry =
      p.xmlData?.xmlTrendyolPrice != null
        ? Number(p.xmlData.xmlTrendyolPrice) * usdTryRate
        : null;

    const manualPriceTry =
      p.marketplacePriceTry != null
        ? Number(p.marketplacePriceTry)
        : p.sellingPriceTry != null
          ? Number(p.sellingPriceTry)
          : null;

    const resolvedPriceTry = trendyolAvgPriceTry ?? mpPriceTry ?? xmlTrendyolPriceTry ?? manualPriceTry;
    const priceSource: "trendyol" | "mp" | "xml" | "manual" | "none" =
      trendyolAvgPriceTry != null
        ? "trendyol"
        : mpPriceTry != null
          ? "mp"
          : xmlTrendyolPriceTry != null
            ? "xml"
            : manualPriceTry != null
              ? "manual"
              : "none";

    // ── İthal maliyet hesabı (mevcut engine) ──────────────────────────────
    const sourcePriceUsd =
      p.importUnitCostUsd != null
        ? Number(p.importUnitCostUsd)
        : p.unitCostUsd != null
          ? Number(p.unitCostUsd)
          : null;

    // Satış fiyatı USD cinsinden — kargo kademesi hesabı için
    const resolvedPriceUsd =
      resolvedPriceTry != null ? resolvedPriceTry / usdTryRate : null;

    // resolveMarginPolicy ile komisyon ve kargo çözümü
    const marginPolicy = resolveMarginPolicy(
      {
        shippingCost:                  p.shippingCost != null ? Number(p.shippingCost) : null,
        shippingCostOverride:          p.shippingCostOverride != null ? Number(p.shippingCostOverride) : null,
        marketplaceCommission:         p.marketplaceCommission != null ? Number(p.marketplaceCommission) : null,
        marketplaceCommissionOverride: p.marketplaceCommissionOverride != null ? Number(p.marketplaceCommissionOverride) : null,
      },
      platformPolicyInput,
      { sellingPriceUsd: resolvedPriceUsd, usdTryRate },
    );

    const commissionPct        = marginPolicy.commissionPct;
    const domesticShippingTry  = marginPolicy.shippingTry;

    // İniş maliyeti — engine ile hesapla (Trendyol verisi yoksa fallback sayı ile)
    const decisionResult = calculateImportDecision({
      sourcePriceUsd,
      sourceCostRmb: p.sourceCostRmb != null ? Number(p.sourceCostRmb) : null,
      rmbUsdRate,
      importPaymentFeePct: p.importPaymentFeePct != null ? Number(p.importPaymentFeePct) : null,
      weightKg: p.weightKg != null ? Number(p.weightKg) : null,
      customsRatePct: p.customsRatePct != null ? Number(p.customsRatePct) : null,
      shippingMethodPref: p.shippingMethodPref,
      sellingPriceTry: resolvedPriceTry, // gerçek veya manuel
      commissionPct,
      domesticShippingTry,
      usdTryRate,
      monthlyUnits: 1, // skor için kukla — gerçek hesap aşağıda
      airFreightPerKgOverride: null,
      seaFreightPerKgOverride: null,
    });

    const landedCostUsd = decisionResult.effectiveScenario?.landedCostUsd ?? null;
    const landedCostTry = landedCostUsd != null ? landedCostUsd * usdTryRate : null;

    // ── Net kâr / marj ─────────────────────────────────────────────────────
    let netRevenueTry: number | null = null;
    let netProfitTry: number | null = null;
    let marginPct: number | null = null;

    if (resolvedPriceTry != null && landedCostTry != null) {
      netRevenueTry = resolvedPriceTry * (1 - commissionPct / 100) - domesticShippingTry;
      netProfitTry = netRevenueTry - landedCostTry;
      marginPct = resolvedPriceTry > 0 ? (netProfitTry / resolvedPriceTry) * 100 : null;
    }

    // ── Aylık kâr tahmini ──────────────────────────────────────────────────
    // Pazar yeri kanalı: Trendyol 30g (iade düşümü) VEYA manuel onlineSalesPotential
    // — büyük olanı al (Math.max). Wholesale + installer manuel'leri toplama eklenir.
    // Gerekçe: yeni ürünlerde Trendyol satışı düşük olsa bile manuel tahmin daha doğru
    // bir sipariş adeti çıktısı sağlar; tersi durumda gerçekleşen veri tahminden
    // büyükse onu yansıt.
    const trendyolAdjusted =
      trendyolUnits30d != null && trendyolUnits30d > 0
        ? trendyolUnits30d * (1 - (returnRate ?? 0))
        : 0;
    const manualOnline = p.onlineSalesPotential ?? 0;
    const effectiveOnline = Math.max(trendyolAdjusted, manualOnline);
    const manualOtherChannels =
      (p.wholesaleSalesPotential ?? 0) + (p.installerSalesPotential ?? 0);
    const effectiveMonthlyUnitsRaw = effectiveOnline + manualOtherChannels;
    const effectiveMonthlyUnits: number | null =
      effectiveMonthlyUnitsRaw > 0 ? effectiveMonthlyUnitsRaw : null;

    const monthlyProfitTry =
      netProfitTry != null && effectiveMonthlyUnits != null
        ? netProfitTry * effectiveMonthlyUnits
        : null;

    const signal = computeSignal(marginPct, monthlyProfitTry);

    // Phase 66 — Days of coverage = stockQty / (effectiveMonthlyUnits / 30)
    const dailyVelocity =
      effectiveMonthlyUnits != null && effectiveMonthlyUnits > 0
        ? effectiveMonthlyUnits / 30
        : null;
    const daysOfCoverage =
      dailyVelocity != null ? Math.round(p.stockQuantity / dailyVelocity) : null;

    // Phase 85 — Recommended order qty (target 90-day supply)
    const TARGET_DAYS = 90;
    const recommendedQty =
      dailyVelocity != null && signal !== "ALMA"
        ? Math.max(0, Math.ceil(dailyVelocity * TARGET_DAYS) - p.stockQuantity)
        : null;

    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      stockQuantity: p.stockQuantity,
      hasTrendyolData,
      trendyolAvgPriceTry,
      trendyolUnits90d,
      trendyolUnits30d,
      returnCount,
      returnRate,
      resolvedPriceTry,
      priceSource,
      landedCostTry,
      netRevenueTry,
      netProfitTry,
      marginPct,
      effectiveMonthlyUnits,
      monthlyProfitTry,
      signal,
      daysOfCoverage,
      recommendedQty,
    };
  });

  // ── Sayımlar ─────────────────────────────────────────────────────────────
  const counts: Record<Tab, number> = {
    all:       rows.length,
    AL:        rows.filter((r) => r.signal === "AL").length,
    BEKLE:     rows.filter((r) => r.signal === "BEKLE").length,
    ALMA:      rows.filter((r) => r.signal === "ALMA").length,
    VERİ_EKSİK: rows.filter((r) => r.signal === "VERİ_EKSİK").length,
  };
  const unmatchedCount = rows.filter((r) => !r.hasTrendyolData).length;

  // ── Tab filtresi ──────────────────────────────────────────────────────────
  const filtered =
    tab === "all"
      ? rows
      : rows.filter((r) => r.signal === (tab as Signal));

  // Sırala: AL → BEKLE → ALMA → VERİ_EKSİK, içinde aylık kâr büyükten küçüğe
  const signalOrder: Record<Signal, number> = { AL: 0, BEKLE: 1, ALMA: 2, VERİ_EKSİK: 3 };
  const sorted = [...filtered].sort((a, b) => {
    const diff = signalOrder[a.signal] - signalOrder[b.signal];
    if (diff !== 0) return diff;
    return (b.monthlyProfitTry ?? -Infinity) - (a.monthlyProfitTry ?? -Infinity);
  });

  function tabHref(t: Tab) {
    return t === "all" ? "/admin/import-cockpit" : `/admin/import-cockpit?tab=${t}`;
  }

  // Phase 85 — Build purchase order URL for AL products with recommendedQty > 0
  const orderCandidates = rows.filter(
    (r) => r.signal === "AL" && r.recommendedQty != null && r.recommendedQty > 0,
  );
  const orderItemsParam =
    orderCandidates.length > 0
      ? orderCandidates.map((r) => `${r.id}:${r.recommendedQty}`).join(",")
      : null;
  const orderHref = orderItemsParam
    ? `/admin/purchase-orders/new?from=cockpit&items=${encodeURIComponent(orderItemsParam)}`
    : null;

  return (
    <div className="space-y-6">
      {/* Başlık */}
      <PageHeader
        icon={Ship}
        breadcrumb={[{ label: "İthalat" }, { label: "Karar Kokpiti" }]}
        title="İthalat Karar Kokpiti"
        subtitle="Hangi üründen sipariş vermeli? Trendyol gerçek satış fiyatı + satış hızı + iade oranı + ithalat maliyetinden ithalat sinyali (AL / BEKLE / ALMA)."
        meta={
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
            Kur: 1 USD = ₺{usdTryRate.toFixed(2)}
            {latestRate ? ` (${latestRate.month}/${latestRate.year})` : " (varsayılan)"}
          </span>
        }
        actions={
          <>
            {orderHref && (
              <Link
                href={orderHref}
                className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 text-xs font-semibold transition whitespace-nowrap"
              >
                Sipariş Oluştur ({orderCandidates.length})
              </Link>
            )}
            <Link
              href="/admin/import-decisions"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
            >
              v1 Görünüm →
            </Link>
          </>
        }
      />

      {/* Eşleşmemiş ürünler uyarısı */}
      {unmatchedCount > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>{unmatchedCount} ürünün</strong> Trendyol satış verisi yok — bu ürünler için
          manuel tahminler kullanılır. Eşleştirmek için{" "}
          <Link href="/admin/marketplace-mappings" className="font-medium underline">
            Ürün Eşleştirme
          </Link>{" "}
          sayfasını kullanın, ardından sipariş senkronizasyonunu çalıştırın.
        </div>
      )}

      {/* Sinyal mantığı legend */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs font-semibold text-slate-700">Sinyal nasıl hesaplanır?</p>
        </div>
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-start gap-2">
            <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700">AL</span>
            <span className="text-slate-600">
              <strong className="text-slate-800">marj ≥ %25</strong> ve aylık kâr {">"} 0 — anlık ekonomi iyi
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">BEKLE</span>
            <span className="text-slate-600">
              <strong className="text-slate-800">marj %15–25</strong> ve aylık kâr {">"} 0 — fiyat/maliyet iyileşmeyi bekle
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">ALMA</span>
            <span className="text-slate-600">
              <strong className="text-slate-800">marj {"<"} %15</strong> veya zarar — sipariş verme
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">VERİ EKSİK</span>
            <span className="text-slate-600">
              maliyet/fiyat eksik — önce <Link href="/admin/marketplace-mappings" className="underline hover:text-slate-900">eşleştir</Link>
            </span>
          </div>
        </div>
      </div>

      {/* Özet kartlar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["AL", "BEKLE", "ALMA", "VERİ_EKSİK"] as const).map((s) => (
          <Link
            key={s}
            href={tabHref(s)}
            className={`rounded-2xl p-4 transition border ${
              tab === s
                ? SIGNAL_STYLE[s].replace("border ", "").replace("bg-", "bg-").includes("emerald")
                  ? "bg-emerald-700 text-white border-emerald-700"
                  : s === "BEKLE"
                    ? "bg-amber-600 text-white border-amber-600"
                    : s === "ALMA"
                      ? "bg-red-700 text-white border-red-700"
                      : "bg-slate-700 text-white border-slate-700"
                : "bg-white border-slate-200 hover:border-slate-300"
            }`}
          >
            <p className={`text-3xl font-bold ${tab === s ? "text-white" : {
              AL: "text-emerald-700", BEKLE: "text-amber-700", ALMA: "text-red-700", VERİ_EKSİK: "text-slate-500",
            }[s]}`}>
              {counts[s]}
            </p>
            <p className={`mt-1 text-xs font-semibold ${tab === s ? "text-white/80" : "text-slate-600"}`}>
              {SIGNAL_LABEL[s]}
            </p>
          </Link>
        ))}
      </div>

      {/* Tab çubuğu */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-0">
        {(Object.entries(TAB_LABELS) as [Tab, string][]).map(([t, label]) => (
          <Link
            key={t}
            href={tabHref(t)}
            className={`inline-flex items-center gap-1.5 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === t
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
              {counts[t].toLocaleString("tr-TR")}
            </span>
          </Link>
        ))}
      </div>

      {/* Tablo */}
      {sorted.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          Bu filtre için ürün bulunamadı.
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="border-b border-slate-100 bg-slate-50/80">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Ürün</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Sinyal</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Ort. Fiyat (90g)</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Hız (30g)</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">İade %</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">İthal Maliyet</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Net Kâr/Adet</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Marj</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Aylık Kâr</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Stok</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Kapsama</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Kaynak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sorted.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50/50">
                    {/* Ürün */}
                    <td className="px-4 py-3 max-w-[200px]">
                      <Link
                        href={`/products/${row.id}`}
                        className="font-medium text-slate-900 hover:text-slate-600 line-clamp-1"
                      >
                        {row.name}
                      </Link>
                      {row.sku && (
                        <p className="mt-0.5 font-mono text-[10px] text-slate-400">{row.sku}</p>
                      )}
                    </td>

                    {/* Sinyal */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${SIGNAL_STYLE[row.signal]}`}>
                        {SIGNAL_LABEL[row.signal]}
                      </span>
                    </td>

                    {/* Ort. Fiyat */}
                    <td className="px-4 py-3 text-right font-mono text-xs text-slate-700">
                      {row.trendyolAvgPriceTry != null
                        ? fmtTry(row.trendyolAvgPriceTry)
                        : row.resolvedPriceTry != null
                          ? <span className="text-slate-400">{fmtTry(row.resolvedPriceTry)}</span>
                          : <span className="text-slate-300">—</span>}
                    </td>

                    {/* Satış hızı 30d */}
                    <td className="px-4 py-3 text-right text-xs text-slate-700">
                      {row.trendyolUnits30d != null ? (
                        <span>
                          {row.trendyolUnits30d} <span className="text-slate-400">adet</span>
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* İade oranı */}
                    <td className="px-4 py-3 text-right text-xs">
                      {row.returnRate != null ? (
                        <span className={row.returnRate > 0.15 ? "text-red-600 font-semibold" : "text-slate-600"}>
                          {fmtPct(row.returnRate * 100)}
                          <span className="ml-1 text-slate-400 font-normal">({row.returnCount})</span>
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* İthal maliyet TRY */}
                    <td className="px-4 py-3 text-right font-mono text-xs text-slate-700">
                      {row.landedCostTry != null ? fmtTry(row.landedCostTry) : <span className="text-slate-300">—</span>}
                    </td>

                    {/* Net kâr / adet */}
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {row.netProfitTry != null ? (
                        <span className={row.netProfitTry >= 0 ? "text-emerald-700" : "text-red-600"}>
                          {fmtTry(row.netProfitTry)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Marj */}
                    <td className="px-4 py-3 text-right text-xs font-semibold">
                      {row.marginPct != null ? (
                        <span className={row.marginPct >= 25 ? "text-emerald-700" : row.marginPct >= 15 ? "text-amber-700" : "text-red-600"}>
                          {fmtPct(row.marginPct)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Aylık kâr */}
                    <td className="px-4 py-3 text-right font-mono text-xs">
                      {row.monthlyProfitTry != null ? (
                        <span className={row.monthlyProfitTry >= 0 ? "text-emerald-700 font-semibold" : "text-red-600"}>
                          {fmtTry(row.monthlyProfitTry)}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Stok */}
                    <td className="px-4 py-3 text-right text-xs text-slate-500">
                      {row.stockQuantity}
                    </td>

                    {/* Phase 66 — Stok kapsamı */}
                    <td className="px-4 py-3 text-right text-xs">
                      {row.daysOfCoverage != null ? (
                        <span className={
                          row.daysOfCoverage > 90
                            ? "text-slate-400"
                            : row.daysOfCoverage > 30
                            ? "text-amber-600 font-semibold"
                            : "text-red-600 font-bold"
                        }>
                          {row.daysOfCoverage}g
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Kaynak etiketi */}
                    <td className="px-4 py-3">
                      {row.priceSource === "trendyol" ? (
                        <span className="inline-flex rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-medium text-orange-700 border border-orange-200">
                          Trendyol
                        </span>
                      ) : row.priceSource === "mp" ? (
                        <span className="inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700 border border-violet-200">
                          MP Fiyat
                        </span>
                      ) : row.priceSource === "xml" ? (
                        <span className="inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600 border border-blue-200">
                          XML Fiyat
                        </span>
                      ) : row.priceSource === "manual" ? (
                        <span className="inline-flex rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500 border border-slate-200">
                          Manuel
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-500 border border-red-100">
                          Fiyat yok
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Formül açıklaması */}
      <Card className="p-5 text-xs leading-6 text-slate-500 space-y-1">
        <p className="font-semibold text-slate-700">Hesaplama Mantığı</p>
        <p>
          <span className="font-medium text-slate-600">Satış fiyatı:</span>{" "}
          Trendyol gerçekleşen ort. (son 90 gün, Teslim Edildi) → MarketplacePrice TRENDYOL (MP Fiyat) → XML Trendyol fiyatı → manuel fiyat
        </p>
        <p>
          <span className="font-medium text-slate-600">Kargo:</span>{" "}
          Ürün geçersiz kılma → ürün değeri → platform USD kademeli kargo → platform sabit kargo → ₺0
        </p>
        <p>
          <span className="font-medium text-slate-600">İthal maliyet (TRY):</span>{" "}
          İniş maliyeti (USD) × kur · hava/deniz seçimi mevcut motora göre
        </p>
        <p>
          <span className="font-medium text-slate-600">Net kâr/adet:</span>{" "}
          Satış fiyatı × (1 − komisyon%) − kargo − ithal maliyet TRY
        </p>
        <p>
          <span className="font-medium text-slate-600">Aylık kâr:</span>{" "}
          Net kâr × satış hızı (30g) × (1 − iade oranı) · yoksa manuel tahmin
        </p>
        <p>
          <span className="font-medium text-slate-600">Sinyal:</span>{" "}
          <span className="text-emerald-700 font-medium">AL</span> marj ≥ %25 ·{" "}
          <span className="text-amber-700 font-medium">BEKLE</span> marj ≥ %15 ·{" "}
          <span className="text-red-600 font-medium">ALMA</span> diğer
        </p>
      </Card>
    </div>
  );
}

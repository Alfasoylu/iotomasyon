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
import { Ship, Check, Pause, X, Info, HelpCircle } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { PageHelp } from "@/components/layout/page-help";
import {
  calculateImportDecision,
  DEFAULT_USD_TRY_RATE,
} from "@/lib/import-decision";
import { calcRevenue } from "@/lib/importer-cost";
import { resolveMarginPolicy } from "@/lib/marketplace-policy";

export const dynamic = "force-dynamic";

// ── Sinyal tipi ──────────────────────────────────────────────────────────────
// Phase 100 — STOKSUZ_AL: stok 0 ama geçmişte satışı olan ürün → acil sipariş.
type Signal = "AL" | "STOKSUZ_AL" | "BEKLE" | "ALMA" | "VERİ_EKSİK";

function computeSignal(marginPct: number | null, monthlyProfitTry: number | null): Signal {
  if (marginPct === null || monthlyProfitTry === null) return "VERİ_EKSİK";
  if (monthlyProfitTry <= 0 || marginPct < 0) return "ALMA";
  if (marginPct >= 25) return "AL";
  if (marginPct >= 15) return "BEKLE";
  return "ALMA";
}

const SIGNAL_BADGE: Record<Signal, "ok" | "warn" | "danger" | "neutral"> = {
  AL: "ok",
  STOKSUZ_AL: "warn", // turuncu — acil dikkat
  BEKLE: "warn",
  ALMA: "danger",
  VERİ_EKSİK: "neutral",
};

const SIGNAL_ICON: Record<Signal, ReactNode> = {
  AL: <Check size={14} strokeWidth={1.5} />,
  STOKSUZ_AL: <Check size={14} strokeWidth={2} />,
  BEKLE: <Pause size={14} strokeWidth={1.5} />,
  ALMA: <X size={14} strokeWidth={1.5} />,
  VERİ_EKSİK: null,
};

const SIGNAL_LABEL: Record<Signal, string> = {
  AL: "AL",
  STOKSUZ_AL: "STOKSUZ · AL",
  BEKLE: "BEKLE",
  ALMA: "ALMA",
  VERİ_EKSİK: "Veri Eksik",
};

const SIGNAL_TEXT_COLOR: Record<Signal, string> = {
  AL: "text-[var(--ok)]",
  STOKSUZ_AL: "text-[var(--warn)]",
  BEKLE: "text-[var(--warn)]",
  ALMA: "text-[var(--danger)]",
  VERİ_EKSİK: "text-[var(--text-muted)]",
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

type Tab = "all" | "AL" | "STOKSUZ_AL" | "BEKLE" | "ALMA" | "VERİ_EKSİK";

const TAB_LABELS: Record<Tab, string> = {
  all:        "Tümü",
  AL:         "AL",
  STOKSUZ_AL: "⚡ Stoksuz · AL",
  BEKLE:      "BEKLE",
  ALMA:       "ALMA",
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
  const [latestRate, trendyolPolicy, products, sales90Raw, sales30Raw, returnsRaw, mpPricesRaw, lifetimeSalesRaw] = await Promise.all([
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
        // UX iyileştirme — görsel + marka + kategori tablo satırlarında
        imageUrl: true,
        brand: true,
        productCategory: { select: { id: true, name: true, slug: true } },
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
    // Phase 100 — Lifetime satış (tüm zamanlar, tüm marketplace) + ilk satış tarihi.
    // Stoksuz + lifetime>0 ürünler için "AL" sinyali ve recommendedQty hesabı.
    // 142k MSR satırı + composite index (productId, orderDate) → ~50ms.
    prisma.marketplaceSalesRecord.groupBy({
      by: ["productId"],
      where: { productId: { not: null } },
      _sum: { quantity: true },
      _min: { orderDate: true },
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

  // Phase 100 — Lifetime satış + ilk satış tarihi
  const lifetimeQtyMap = new Map<string, number>();
  const lifetimeMonthsMap = new Map<string, number>();
  for (const r of lifetimeSalesRaw) {
    if (!r.productId) continue;
    lifetimeQtyMap.set(r.productId, r._sum.quantity ?? 0);
    if (r._min.orderDate) {
      const monthsElapsed =
        (now.getFullYear() - r._min.orderDate.getFullYear()) * 12 +
        (now.getMonth() - r._min.orderDate.getMonth()) + 1;
      lifetimeMonthsMap.set(r.productId, Math.max(1, monthsElapsed));
    }
  }

  // ── Satır hesapları ───────────────────────────────────────────────────────
  type Row = {
    id: string;
    name: string;
    sku: string | null;
    imageUrl: string | null;
    brand: string | null;
    categoryName: string | null;
    categorySlug: string | null;
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
    /** KDV dahil gerçek satış fiyatı (gösterim + komisyon matrahı). */
    priceInclVatTry: number | null;
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
    // Phase 100 — Lifetime satış (tüm zamanlar, tüm marketplace)
    lifetimeTotalQty: number;
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

    // ── Net kâr / marj — kanonik calcRevenue motoru (KDV-farkında) ─────────
    // KDV tabanı KAYNAĞA göre belirlenir:
    //   trendyol (gerçekleşen satış) + manuel  → KDV DAHİL (gross)
    //   mp / xml (Entegra/XML beslemesi)        → KDV HARİÇ (net)
    // Komisyon KDV dahil matrah üzerinden; elde kalan gelir KDV hariç (KDV geçiş kalemi).
    const priceIncludesVat = priceSource === "trendyol" || priceSource === "manual";

    let netRevenueTry: number | null = null;
    let netProfitTry: number | null = null;
    let marginPct: number | null = null;
    let priceInclVatTry: number | null = null;

    if (resolvedPriceTry != null) {
      const rev = calcRevenue({
        trendyolPriceTry: resolvedPriceTry,
        usdTryRate,
        priceIncludesVat,
        commissionPct,
        domesticShippingTry,
      });
      if (rev) {
        priceInclVatTry = rev.priceInclVatTry;
        if (landedCostTry != null) {
          netRevenueTry = rev.netRevenueTry;
          netProfitTry = rev.netRevenueTry - landedCostTry;
          // Marj tabanı: KDV hariç net satış fiyatı (gerçek gelir tabanı).
          marginPct = rev.priceNetTry > 0 ? (netProfitTry / rev.priceNetTry) * 100 : null;
        }
      }
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

    let signal = computeSignal(marginPct, monthlyProfitTry);

    // Phase 100 — Stoksuz + tarihsel satışlı ürünler için sinyal override.
    // Stoğu 0 olduğu için son 30 gün satışı 0 → effectiveMonthlyUnits=0 →
    // monthlyProfit=null → "VERİ_EKSİK" sinyali çıkıyordu. Ama bu ürün
    // aslında AKSİNE acil sipariş gerektiriyor (eskiden satıyordu).
    const lifetimeQty = lifetimeQtyMap.get(p.id) ?? 0;
    const lifetimeMonths = lifetimeMonthsMap.get(p.id) ?? null;
    const isStocksuzSatisli = p.stockQuantity === 0 && lifetimeQty > 0;
    // Sinyal koşulu GEVŞETİLDİ — sadece stoksuz + lifetime varsa yeterli.
    // Maliyet bilinmiyor olsa bile bu ürün eskiden satıyordu → sipariş gerekli.
    // Kullanıcı sonra maliyet/fiyat girer, kâr hesaplanır.
    // SADECE "Zarar" (kâr<0) açık tespit edildiyse override etme.
    if (
      isStocksuzSatisli &&
      !(netProfitTry != null && netProfitTry <= 0) // bilinen zarar değilse
    ) {
      signal = "STOKSUZ_AL";
    }

    // Phase 66 — Days of coverage = stockQty / (effectiveMonthlyUnits / 30)
    const dailyVelocity =
      effectiveMonthlyUnits != null && effectiveMonthlyUnits > 0
        ? effectiveMonthlyUnits / 30
        : null;
    const daysOfCoverage =
      dailyVelocity != null ? Math.round(p.stockQuantity / dailyVelocity) : null;

    // Phase 85/100 — Recommended order qty (target 90-day supply)
    // Eğer stoksuz + lifetime varsa historical velocity fallback kullan.
    const TARGET_DAYS = 90;
    let recommendedQty: number | null = null;
    if (dailyVelocity != null && signal !== "ALMA") {
      recommendedQty = Math.max(0, Math.ceil(dailyVelocity * TARGET_DAYS) - p.stockQuantity);
    } else if (signal === "STOKSUZ_AL" && lifetimeMonths != null && lifetimeMonths > 0) {
      // Historical velocity: lifetimeQty / lifetimeMonths × (90/30) → 3 ay stok
      const historicalMonthly = lifetimeQty / lifetimeMonths;
      recommendedQty = Math.max(5, Math.ceil(historicalMonthly * 3));
    }

    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      imageUrl: p.imageUrl,
      brand: p.brand,
      categoryName: p.productCategory?.name ?? null,
      categorySlug: p.productCategory?.slug ?? null,
      stockQuantity: p.stockQuantity,
      hasTrendyolData,
      trendyolAvgPriceTry,
      trendyolUnits90d,
      trendyolUnits30d,
      returnCount,
      returnRate,
      resolvedPriceTry,
      priceInclVatTry,
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
      lifetimeTotalQty: lifetimeQty,
    };
  });

  // ── Sayımlar ─────────────────────────────────────────────────────────────
  const counts: Record<Tab, number> = {
    all:        rows.length,
    AL:         rows.filter((r) => r.signal === "AL").length,
    STOKSUZ_AL: rows.filter((r) => r.signal === "STOKSUZ_AL").length,
    BEKLE:      rows.filter((r) => r.signal === "BEKLE").length,
    ALMA:       rows.filter((r) => r.signal === "ALMA").length,
    VERİ_EKSİK: rows.filter((r) => r.signal === "VERİ_EKSİK").length,
  };
  const unmatchedCount = rows.filter((r) => !r.hasTrendyolData).length;

  // ── Tab filtresi ──────────────────────────────────────────────────────────
  const filtered =
    tab === "all"
      ? rows
      : rows.filter((r) => r.signal === (tab as Signal));

  // Sırala: AL → BEKLE → ALMA → VERİ_EKSİK, içinde aylık kâr büyükten küçüğe
  // Phase 100 — STOKSUZ_AL en üstte (acil dikkat), sonra AL, BEKLE, ALMA, VERİ_EKSİK
  const signalOrder: Record<Signal, number> = { STOKSUZ_AL: 0, AL: 1, BEKLE: 2, ALMA: 3, VERİ_EKSİK: 4 };
  const sorted = [...filtered].sort((a, b) => {
    const diff = signalOrder[a.signal] - signalOrder[b.signal];
    if (diff !== 0) return diff;
    return (b.monthlyProfitTry ?? -Infinity) - (a.monthlyProfitTry ?? -Infinity);
  });

  function tabHref(t: Tab) {
    return t === "all" ? "/admin/import-cockpit" : `/admin/import-cockpit?tab=${t}`;
  }

  // Phase 85 — Build purchase order URL for AL products with recommendedQty > 0
  // Phase 100 — PO dahil edilecekler: AL + STOKSUZ_AL (her ikisi de acil sipariş)
  const orderCandidates = rows.filter(
    (r) => (r.signal === "AL" || r.signal === "STOKSUZ_AL") && r.recommendedQty != null && r.recommendedQty > 0,
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
          <Badge variant="neutral">
            Kur: 1 USD = ₺{usdTryRate.toFixed(2)}
            {latestRate ? ` (${latestRate.month}/${latestRate.year})` : " (varsayılan)"}
          </Badge>
        }
        actions={
          <>
            <PageHelp pageKey="admin/import-cockpit" />
            {orderHref && (
              <Link
                href={orderHref}
                className="inline-flex h-8 items-center whitespace-nowrap rounded-md bg-[var(--accent)] px-3 text-[12px] font-medium text-[var(--accent-fg)] transition-all hover:brightness-110"
              >
                Sipariş Oluştur ({orderCandidates.length})
              </Link>
            )}
            <Link
              href="/admin/import-decisions"
              className="inline-flex h-8 items-center rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)]"
            >
              v1 Görünüm →
            </Link>
          </>
        }
      />

      {/* Eşleşmemiş ürünler uyarısı */}
      {unmatchedCount > 0 && (
        <div className="rounded-lg border border-[var(--warn-border)] bg-[var(--warn-dim)] p-4 text-sm text-[var(--text-secondary)]">
          <strong className="text-[var(--warn)]">{unmatchedCount} ürünün</strong> Trendyol satış verisi yok — bu ürünler için
          manuel tahminler kullanılır. Eşleştirmek için{" "}
          <Link href="/admin/marketplace-mappings" className="font-medium text-[var(--accent)] underline hover:brightness-110">
            Ürün Eşleştirme
          </Link>{" "}
          sayfasını kullanın, ardından sipariş senkronizasyonunu çalıştırın.
        </div>
      )}

      {/* Sinyal mantığı legend */}
      <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-4">
        <div className="flex items-center gap-2">
          <Info size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Sinyal nasıl hesaplanır?
          </p>
        </div>
        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-start gap-2">
            <Badge variant="ok">AL</Badge>
            <span className="text-[var(--text-secondary)]">
              <strong className="text-[var(--text-primary)]">marj ≥ %25</strong> ve aylık kâr {">"} 0 — anlık ekonomi iyi
            </span>
          </div>
          <div className="flex items-start gap-2">
            <Badge variant="warn">BEKLE</Badge>
            <span className="text-[var(--text-secondary)]">
              <strong className="text-[var(--text-primary)]">marj %15–25</strong> ve aylık kâr {">"} 0 — fiyat/maliyet iyileşmeyi bekle
            </span>
          </div>
          <div className="flex items-start gap-2">
            <Badge variant="danger">ALMA</Badge>
            <span className="text-[var(--text-secondary)]">
              <strong className="text-[var(--text-primary)]">marj {"<"} %15</strong> veya zarar — sipariş verme
            </span>
          </div>
          <div className="flex items-start gap-2">
            <Badge variant="neutral">VERİ EKSİK</Badge>
            <span className="text-[var(--text-secondary)]">
              maliyet/fiyat eksik — önce{" "}
              <Link href="/admin/marketplace-mappings" className="text-[var(--accent)] underline hover:brightness-110">
                eşleştir
              </Link>
            </span>
          </div>
        </div>
      </div>

      {/* Özet kartlar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["AL", "BEKLE", "ALMA", "VERİ_EKSİK"] as const).map((s) => {
          const isActive = tab === s;
          return (
            <Link
              key={s}
              href={tabHref(s)}
              className={`rounded-lg border p-4 transition-colors ${
                isActive
                  ? "border-[var(--accent-border)] bg-[var(--accent-dim)]"
                  : "border-[var(--border-default)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]"
              }`}
            >
              <p
                className={`text-[28px] font-semibold leading-none tabular-nums ${SIGNAL_TEXT_COLOR[s]}`}
              >
                {counts[s]}
              </p>
              <p className="mt-2 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                {SIGNAL_LABEL[s]}
              </p>
            </Link>
          );
        })}
      </div>

      {/* Tab çubuğu */}
      <div className="flex flex-wrap gap-2 border-b border-[var(--border-default)] pb-0">
        {(Object.entries(TAB_LABELS) as [Tab, string][]).map(([t, label]) => (
          <Link
            key={t}
            href={tabHref(t)}
            className={`inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-[13px] font-medium transition ${
              tab === t
                ? "border-[var(--accent)] text-[var(--text-primary)]"
                : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {label}
            <span className="rounded-md bg-[var(--surface-3)] px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-[var(--text-secondary)]">
              {counts[t].toLocaleString("tr-TR")}
            </span>
          </Link>
        ))}
      </div>

      {/* Tablo */}
      {sorted.length === 0 ? (
        <Card className="p-8 text-center text-sm text-[var(--text-muted)]">
          Bu filtre için ürün bulunamadı.
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)]">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Ürün</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Sinyal</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Ort. Fiyat (90g)</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Hız (30g)</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">İade %</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">İthal Maliyet</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Net Kâr/Adet</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Marj</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Aylık Kâr</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Stok</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Kapsama</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Kaynak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {sorted.map((row) => (
                  <tr key={row.id} className="hover:bg-[var(--surface-3)]">
                    {/* Ürün — küçük görsel + ad + SKU + marka + kategori */}
                    <td className="max-w-[260px] px-4 py-3">
                      <div className="flex items-start gap-2.5">
                        {row.imageUrl ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={row.imageUrl}
                            alt=""
                            loading="lazy"
                            className="h-10 w-10 flex-shrink-0 rounded object-cover ring-1 ring-[var(--border-default)]"
                          />
                        ) : (
                          <div className="h-10 w-10 flex-shrink-0 rounded bg-[var(--surface-3)] ring-1 ring-[var(--border-subtle)]" />
                        )}
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/products/${row.id}`}
                            className="line-clamp-1 font-medium text-[13px] text-[var(--text-primary)] hover:text-[var(--accent)]"
                          >
                            {row.name}
                          </Link>
                          <div className="mt-0.5 flex items-center gap-2 text-[10px]">
                            {row.sku && (
                              <span className="font-mono tabular-nums text-[var(--text-muted)]">{row.sku}</span>
                            )}
                            {row.brand && (
                              <span className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 font-medium uppercase tracking-wider text-[var(--text-muted)]">
                                {row.brand}
                              </span>
                            )}
                          </div>
                          {row.categoryName && (
                            <p className="mt-0.5 line-clamp-1 text-[10px] text-[var(--text-muted)]">
                              {row.categoryName}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Sinyal */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-start gap-1">
                        <Badge variant={SIGNAL_BADGE[row.signal]} className="gap-1">
                          {SIGNAL_ICON[row.signal]}
                          {SIGNAL_LABEL[row.signal]}
                        </Badge>
                        {/* Phase 100 — Önerilen sipariş adeti (AL + STOKSUZ_AL satırlarında) */}
                        {(row.signal === "AL" || row.signal === "STOKSUZ_AL") && row.recommendedQty != null && row.recommendedQty > 0 && (
                          <span className="inline-flex items-center gap-1 rounded bg-[var(--accent-dim)] px-1.5 py-0 text-[10px] font-medium text-[var(--accent)]">
                            <span className="font-mono tabular-nums">≈{row.recommendedQty}</span>
                            <span>adet öner</span>
                          </span>
                        )}
                        {/* Stoksuz · AL: lifetime satış adedini muted hint olarak göster */}
                        {row.signal === "STOKSUZ_AL" && row.lifetimeTotalQty > 0 && (
                          <span className="text-[9px] text-[var(--text-muted)]">
                            <span className="tabular-nums">{row.lifetimeTotalQty}</span> adet satıldı
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Ort. Fiyat */}
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                      {row.trendyolAvgPriceTry != null
                        ? fmtTry(row.trendyolAvgPriceTry)
                        : row.priceInclVatTry != null
                          ? <span className="text-[var(--text-muted)]" title="KDV dahil (Entegra net × 1.20)">{fmtTry(row.priceInclVatTry)}</span>
                          : <span className="text-[var(--text-muted)]">—</span>}
                    </td>

                    {/* Satış hızı 30d */}
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                      {row.trendyolUnits30d != null ? (
                        <span>
                          {row.trendyolUnits30d} <span className="text-[var(--text-muted)]">adet</span>
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>

                    {/* İade oranı */}
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                      {row.returnRate != null ? (
                        <span className={row.returnRate > 0.15 ? "font-semibold text-[var(--danger)]" : "text-[var(--text-secondary)]"}>
                          {fmtPct(row.returnRate * 100)}
                          <span className="ml-1 font-normal text-[var(--text-muted)]">({row.returnCount})</span>
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>

                    {/* İthal maliyet TRY */}
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                      {row.landedCostTry != null ? fmtTry(row.landedCostTry) : <span className="text-[var(--text-muted)]">—</span>}
                    </td>

                    {/* Net kâr / adet */}
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                      {row.netProfitTry != null ? (
                        <span className={row.netProfitTry >= 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"}>
                          {fmtTry(row.netProfitTry)}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>

                    {/* Marj */}
                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold tabular-nums">
                      {row.marginPct != null ? (
                        <span className={row.marginPct >= 25 ? "text-[var(--ok)]" : row.marginPct >= 15 ? "text-[var(--warn)]" : "text-[var(--danger)]"}>
                          {fmtPct(row.marginPct)}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>

                    {/* Aylık kâr */}
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                      {row.monthlyProfitTry != null ? (
                        <span className={row.monthlyProfitTry >= 0 ? "font-semibold text-[var(--ok)]" : "text-[var(--danger)]"}>
                          {fmtTry(row.monthlyProfitTry)}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>

                    {/* Stok */}
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                      {row.stockQuantity}
                    </td>

                    {/* Phase 66 — Stok kapsamı */}
                    <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                      {row.daysOfCoverage != null ? (
                        <span className={
                          row.daysOfCoverage > 90
                            ? "text-[var(--text-muted)]"
                            : row.daysOfCoverage > 30
                            ? "font-semibold text-[var(--warn)]"
                            : "font-semibold text-[var(--danger)]"
                        }>
                          {row.daysOfCoverage}g
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>

                    {/* Kaynak etiketi */}
                    <td className="px-4 py-3">
                      {row.priceSource === "trendyol" ? (
                        <Badge variant="warn">Trendyol</Badge>
                      ) : row.priceSource === "mp" ? (
                        <Badge variant="info">MP Fiyat</Badge>
                      ) : row.priceSource === "xml" ? (
                        <Badge variant="info">XML Fiyat</Badge>
                      ) : row.priceSource === "manual" ? (
                        <Badge variant="neutral">Manuel</Badge>
                      ) : (
                        <Badge variant="danger">Fiyat yok</Badge>
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
      <Card className="space-y-1 p-5 text-xs leading-6 text-[var(--text-secondary)]">
        <div className="flex items-center gap-1.5">
          <HelpCircle size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Hesaplama Mantığı</p>
        </div>
        <p>
          <span className="font-medium text-[var(--text-primary)]">Satış fiyatı:</span>{" "}
          Trendyol gerçekleşen ort. (son 90 gün, Teslim Edildi) → MarketplacePrice TRENDYOL (MP Fiyat) → XML Trendyol fiyatı → manuel fiyat
        </p>
        <p>
          <span className="font-medium text-[var(--text-primary)]">Kargo:</span>{" "}
          Ürün geçersiz kılma → ürün değeri → platform USD kademeli kargo → platform sabit kargo → ₺0
        </p>
        <p>
          <span className="font-medium text-[var(--text-primary)]">İthal maliyet (TRY):</span>{" "}
          İniş maliyeti (USD) × kur · hava/deniz seçimi mevcut motora göre
        </p>
        <p>
          <span className="font-medium text-[var(--text-primary)]">KDV:</span>{" "}
          Gerçekleşen Trendyol satışı + manuel fiyat KDV dahildir; Entegra/XML fiyatı KDV hariçtir (×1.20 ile dahile çevrilir).
          Komisyon KDV dahil fiyat üzerinden kesilir; elde kalan gelir KDV hariç tutardır (KDV devlete ödenen geçiş kalemi).
        </p>
        <p>
          <span className="font-medium text-[var(--text-primary)]">Net kâr/adet:</span>{" "}
          (KDV hariç fiyat − komisyon[KDV dahil matrah] − kargo) − ithal maliyet TRY · Marj = net kâr / KDV hariç fiyat
        </p>
        <p>
          <span className="font-medium text-[var(--text-primary)]">Aylık kâr:</span>{" "}
          Net kâr × satış hızı (30g) × (1 − iade oranı) · yoksa manuel tahmin
        </p>
        <p>
          <span className="font-medium text-[var(--text-primary)]">Sinyal:</span>{" "}
          <span className="font-medium text-[var(--ok)]">AL</span> marj ≥ %25 ·{" "}
          <span className="font-medium text-[var(--warn)]">BEKLE</span> marj ≥ %15 ·{" "}
          <span className="font-medium text-[var(--danger)]">ALMA</span> diğer
        </p>
      </Card>
    </div>
  );
}

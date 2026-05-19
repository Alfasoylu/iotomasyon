/**
 * lib/smart-recommendations.ts — Akıllı Öneri Motoru (Faz 6 / PR-3)
 *
 * Dashboard'daki "Bugün Senin İçin" kartı için makinece çıkarılan
 * 4-6 aksiyon önerisi:
 *
 *   1. ⭐ Yıldız ürünler  — en çok aylık kâr getiren 3 ürün
 *   2. 🔴 Acil sipariş    — stockDays < 14 olan ilk 3 ürün
 *   3. 🟡 Ölü stok        — lifetime=0 + bağlı sermayesi yüksek ilk 3 ürün
 *   4. 🟠 Likidasyon      — t30g=0 ama lifetimeSold>0 ilk 3 ürün
 *   5. 👤 Uyuyan ticari   — son 60 günde sipariş vermeyen ticari müşteri (≥2)
 *   6. ❓ Eksik veri      — maliyet/ağırlık eksik en kazanan potansiyel 3 ürün
 *
 * Her öneri:
 *   - id (unique)
 *   - kind (kategori — ikon/renk için)
 *   - title (1 cümle, aksiyon odaklı: "X stoku 8 gün kaldı, sipariş ver")
 *   - href (tıklanırsa nereye gider)
 *   - severity (info | warning | danger | success)
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import {
  calcImportCost,
  calcRevenue,
  calcProfit,
  DEFAULT_USD_TRY_RATE,
  DEFAULT_RMB_USD_RATE,
} from "@/lib/importer-cost";

export type RecKind =
  | "star"          // yıldız ürün
  | "urgent"        // acil sipariş
  | "dead"          // ölü stok
  | "liquidation"   // likidasyon
  | "dormant"       // uyuyan müşteri
  | "missing-data"; // eksik veri

export type RecSeverity = "info" | "warning" | "danger" | "success";

export interface SmartRec {
  id: string;
  kind: RecKind;
  title: string;
  detail?: string;
  href: string;
  severity: RecSeverity;
}

export interface SmartRecsResult {
  databaseAvailable: boolean;
  generatedAt: Date;
  recs: SmartRec[];
}

function fmtUsd(n: number, decimals = 0): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: decimals,
  }).format(n);
}

/**
 * Tüm önerileri tek seferde toplar. Maliyetlidir (1 büyük query + birkaç
 * agregasyon) — dashboard yüklemesinde paralelde Promise.all içinde çağrılır.
 */
export async function getSmartRecommendations(): Promise<SmartRecsResult> {
  try {
    const now = new Date();
    const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const since60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // ── Kur ──
    const latestRate = await prisma.monthlyExchangeRate.findFirst({
      orderBy: [{ year: "desc" }, { month: "desc" }],
      select: { usdTryRate: true, rmbUsdRate: true },
    });
    const usdTryRate = latestRate?.usdTryRate ? Number(latestRate.usdTryRate) : DEFAULT_USD_TRY_RATE;
    const rmbUsdRate = latestRate?.rmbUsdRate ? Number(latestRate.rmbUsdRate) : DEFAULT_RMB_USD_RATE;

    // ── Ürünler ──
    const products = await prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        sku: true,
        stockQuantity: true,
        sourceCostRmb: true,
        weightKg: true,
        customsRatePct: true,
        importPaymentFeePct: true,
        shippingMethodPref: true,
        unitCostUsd: true,
        unitCostTry: true,
        onlineSalesPotential: true,
        xmlData: { select: { xmlTrendyolPrice: true } },
        marketplacePrices: {
          where: { marketplace: "TRENDYOL" },
          select: { priceTry: true },
          take: 1,
        },
      },
    });

    // ── Satış geçmişi (Trendyol — t30g + lifetime) ──
    const sales30 = await prisma.trendyolSalesRecord.groupBy({
      by: ["productId"],
      where: {
        productId: { not: null },
        orderDate: { gte: since30 },
        NOT: [
          { status: { contains: "iptal", mode: "insensitive" } },
          { status: { contains: "cancel", mode: "insensitive" } },
        ],
      },
      _sum: { quantity: true },
    });
    const t30Map = new Map<string, number>();
    for (const r of sales30) if (r.productId) t30Map.set(r.productId, r._sum.quantity ?? 0);

    const lifetimeRows = await prisma.trendyolSalesRecord.groupBy({
      by: ["productId"],
      where: {
        productId: { not: null },
        NOT: [
          { status: { contains: "iptal", mode: "insensitive" } },
          { status: { contains: "cancel", mode: "insensitive" } },
        ],
      },
      _sum: { quantity: true },
    });
    const lifetimeMap = new Map<string, number>();
    for (const r of lifetimeRows) if (r.productId) lifetimeMap.set(r.productId, r._sum.quantity ?? 0);

    // ── Per-ürün enrich ──
    type Enriched = {
      id: string;
      name: string;
      sku: string;
      stockQuantity: number;
      t30g: number;
      lifetimeSold: number;
      totalCostUsd: number | null;
      netProfitUsd: number | null;
      monthlyProfitUsd: number;
      stockDays: number | null;
      hasCost: boolean;
      hasWeight: boolean;
      hasTrendyolPrice: boolean;
    };

    const enriched: Enriched[] = products.map((p) => {
      const t30g = t30Map.get(p.id) ?? 0;
      const manualOnline = p.onlineSalesPotential ?? 0;
      const effectiveMonthlyUnits = Math.max(t30g, manualOnline);
      const lifetimeSold = lifetimeMap.get(p.id) ?? 0;

      const trendyolPriceTry =
        p.marketplacePrices[0]?.priceTry != null
          ? Number(p.marketplacePrices[0].priceTry)
          : p.xmlData?.xmlTrendyolPrice != null
            ? Number(p.xmlData.xmlTrendyolPrice) * usdTryRate
            : null;

      const costResult = calcImportCost({
        sourceCostRmb: p.sourceCostRmb != null ? Number(p.sourceCostRmb) : null,
        weightKg: p.weightKg != null ? Number(p.weightKg) : null,
        customsRatePct: p.customsRatePct != null ? Number(p.customsRatePct) : null,
        importPaymentFeePct: p.importPaymentFeePct != null ? Number(p.importPaymentFeePct) : null,
        shippingMethodPref: p.shippingMethodPref,
        rmbUsdRate,
        trendyolPriceTry,
        usdTryRate,
      });
      let unitCostUsd: number | null = null;
      if (costResult) unitCostUsd = costResult.totalCostUsd;
      else if (p.unitCostUsd != null) unitCostUsd = Number(p.unitCostUsd);
      else if (p.unitCostTry != null) unitCostUsd = Number(p.unitCostTry) / usdTryRate;
      const totalCostUsd = unitCostUsd != null ? unitCostUsd * p.stockQuantity : null;

      const revenueResult = calcRevenue({ trendyolPriceTry, usdTryRate });
      const profitResult = costResult && revenueResult ? calcProfit(costResult, revenueResult) : null;
      const netProfitUsd = profitResult?.netProfitUsd ?? null;
      const monthlyProfitUsd = netProfitUsd != null ? netProfitUsd * effectiveMonthlyUnits : 0;

      const stockDays = effectiveMonthlyUnits > 0
        ? Math.round((p.stockQuantity / effectiveMonthlyUnits) * 30)
        : null;

      return {
        id: p.id,
        name: p.name,
        sku: p.sku ?? "",
        stockQuantity: p.stockQuantity,
        t30g,
        lifetimeSold,
        totalCostUsd,
        netProfitUsd,
        monthlyProfitUsd,
        stockDays,
        hasCost: costResult !== null,
        hasWeight: p.weightKg != null,
        hasTrendyolPrice: trendyolPriceTry != null,
      };
    });

    const recs: SmartRec[] = [];

    // ── 1) Yıldız ürün — en çok aylık kâr ──
    const stars = enriched
      .filter((p) => p.monthlyProfitUsd > 0)
      .sort((a, b) => b.monthlyProfitUsd - a.monthlyProfitUsd)
      .slice(0, 3);
    for (const p of stars) {
      recs.push({
        id: `star-${p.id}`,
        kind: "star",
        severity: "success",
        title: `${truncate(p.name, 55)} aylık ${fmtUsd(p.monthlyProfitUsd)} kâr getiriyor`,
        detail: `T30G ${p.t30g} · Stok ${p.stockQuantity} · Siparişi 2x'le?`,
        href: `/products/${p.id}`,
      });
    }

    // ── 2) Acil sipariş — stockDays < 14 ──
    const urgent = enriched
      .filter((p) => p.stockDays != null && p.stockDays > 0 && p.stockDays < 14)
      .sort((a, b) => (a.stockDays ?? 0) - (b.stockDays ?? 0))
      .slice(0, 3);
    for (const p of urgent) {
      recs.push({
        id: `urgent-${p.id}`,
        kind: "urgent",
        severity: "danger",
        title: `${truncate(p.name, 55)} stoku ${p.stockDays} gün kaldı`,
        detail: `T30G ${p.t30g} · Stok ${p.stockQuantity} · Hemen sipariş ver`,
        href: `/products/${p.id}`,
      });
    }

    // ── 3) Ölü stok — lifetime=0 + bağlı sermaye yüksek ──
    const dead = enriched
      .filter((p) => p.lifetimeSold === 0 && p.stockQuantity > 0 && (p.totalCostUsd ?? 0) > 50)
      .sort((a, b) => (b.totalCostUsd ?? 0) - (a.totalCostUsd ?? 0))
      .slice(0, 2);
    for (const p of dead) {
      recs.push({
        id: `dead-${p.id}`,
        kind: "dead",
        severity: "warning",
        title: `${truncate(p.name, 55)} hiç satılmadı, ${fmtUsd(p.totalCostUsd ?? 0)} bağlı`,
        detail: `Stok ${p.stockQuantity} · Tasfiye / indirim düşün`,
        href: `/products/${p.id}`,
      });
    }

    // ── 4) Likidasyon adayı — son 30g hareketsiz ama daha önce satılmış ──
    const liquidation = enriched
      .filter((p) => p.stockQuantity > 0 && (p.totalCostUsd ?? 0) > 50 && p.t30g === 0 && p.lifetimeSold > 0)
      .sort((a, b) => (b.totalCostUsd ?? 0) - (a.totalCostUsd ?? 0))
      .slice(0, 1);
    for (const p of liquidation) {
      recs.push({
        id: `liq-${p.id}`,
        kind: "liquidation",
        severity: "warning",
        title: `${truncate(p.name, 55)} son 30g hareketsiz (${fmtUsd(p.totalCostUsd ?? 0)})`,
        detail: `Lifetime ${p.lifetimeSold} satılmış · Indirim?`,
        href: `/products/${p.id}`,
      });
    }

    // ── 5) Uyuyan ticari müşteri — son 60g sipariş yok, lifetime ≥2 ──
    // Source = "Entegra import" filtresi: bunlar bizim ticari müşterilerimiz
    const dormantCustomers = await prisma.$queryRaw<
      Array<{ id: string; name: string; lastOrderAt: Date | null; totalOrders: bigint }>
    >`
      SELECT
        c.id,
        c.name,
        MAX(m."orderDate") AS "lastOrderAt",
        COUNT(DISTINCT m."orderNumber") AS "totalOrders"
      FROM "Customer" c
      LEFT JOIN "MarketplaceSalesRecord" m
        ON m."customerId" = c.id
        AND (m.status IS NULL OR (m.status NOT ILIKE '%iptal%' AND m.status NOT ILIKE '%iade%'))
      WHERE c."isActive" = true
        AND c."taxNumber" IS NOT NULL
      GROUP BY c.id, c.name
      HAVING COUNT(DISTINCT m."orderNumber") >= 2
        AND MAX(m."orderDate") < ${since60}
      ORDER BY MAX(m."orderDate") DESC NULLS LAST
      LIMIT 3
    `;
    for (const c of dormantCustomers) {
      if (!c.lastOrderAt) continue;
      const daysSince = Math.floor((now.getTime() - c.lastOrderAt.getTime()) / (24 * 60 * 60 * 1000));
      const months = Math.floor(daysSince / 30);
      recs.push({
        id: `dormant-${c.id}`,
        kind: "dormant",
        severity: "info",
        title: `${truncate(c.name, 50)} ${months} aydır sipariş vermedi`,
        detail: `Toplam ${c.totalOrders} sipariş · Randevu/aramak ister misin?`,
        href: `/customers/${c.id}`,
      });
    }

    // ── 6) Eksik veri — satılıyor ama maliyet/ağırlık yok ──
    const missingData = enriched
      .filter((p) => p.t30g > 0 && (!p.hasCost || !p.hasWeight))
      .sort((a, b) => b.t30g - a.t30g)
      .slice(0, 2);
    for (const p of missingData) {
      const missing: string[] = [];
      if (!p.hasCost) missing.push("alış");
      if (!p.hasWeight) missing.push("ağırlık");
      recs.push({
        id: `missing-${p.id}`,
        kind: "missing-data",
        severity: "info",
        title: `${truncate(p.name, 55)} satılıyor (T30G ${p.t30g}) ama ${missing.join(" + ")} bilgisi eksik`,
        detail: `Kâr/marj hesabı yapılamıyor — verisi tamamlanmalı`,
        href: `/products/${p.id}/edit`,
      });
    }

    return {
      databaseAvailable: true,
      generatedAt: now,
      recs: recs.slice(0, 8), // en fazla 8 öneri
    };
  } catch (error) {
    return {
      databaseAvailable: false,
      generatedAt: new Date(),
      recs: [],
    };
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

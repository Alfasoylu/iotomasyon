/**
 * Sermaye Sağlık Panosu
 *
 * Günde 1 açılır karar verme aracı:
 *   - Sermaye Sağlık Skoru (0-100 manşet)
 *   - Bağlı sermaye (USD)
 *   - Aylık beklenen nakit akışı (geçen aya göre delta)
 *   - Yıllık ROI projeksiyonu (geçen aya göre delta)
 *   - Ölü stok bağlı sermaye
 *   - Kategori bazlı sermaye dağılımı
 *   - 4 aksiyon listesi (yıldız ürün, ölü stok, acil sipariş, eksik listeme) + CSV indir
 *
 * Veri kaynağı: Product + TrendyolSalesRecord. Yeni schema yok.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { Heart, Star, CircleDot, CircleAlert, Circle } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { CsvDownloadButton } from "@/components/admin/csv-download-button";
import { PageHeader } from "@/components/layout/page-header";
import { PageHelp } from "@/components/layout/page-help";
import {
  calcImportCost,
  calcRevenue,
  calcProfit,
  isDropshipStock,
  DEFAULT_USD_TRY_RATE,
  DEFAULT_RMB_USD_RATE,
} from "@/lib/importer-cost";
import {
  forecastMonthlySales,
  buildMonthlySalesMap,
  effectiveMonthlyUnits as pickEffectiveMonthly,
} from "@/lib/sales-forecast";

export const dynamic = "force-dynamic";

function fmtUsd(n: number, decimals = 0): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: decimals,
  }).format(n);
}

function fmtPct(n: number, decimals = 1): string {
  return `%${n.toFixed(decimals)}`;
}

function fmtDelta(curr: number, prev: number): { text: string; tone: "up" | "down" | "flat" } {
  if (prev === 0 && curr === 0) return { text: "—", tone: "flat" };
  if (prev === 0) return { text: "yeni", tone: "up" };
  const pct = ((curr - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 0.5) return { text: "≈ aynı", tone: "flat" };
  const sign = pct > 0 ? "+" : "";
  return {
    text: `${sign}${pct.toFixed(1)}% bu ay`,
    tone: pct > 0 ? "up" : "down",
  };
}

interface ProductLite {
  id: string;
  name: string;
  sku: string;
  brand: string | null;
  stockQuantity: number;
  categoryName: string;
  t30g: number;
  prevT30g: number;
  effectiveMonthlyUnits: number;
  lifetimeSold: number;
  unitCostUsd: number | null;
  totalCostUsd: number | null;
  netProfitUsd: number | null;
  monthlyProfitUsd: number;
  prevMonthlyProfitUsd: number;
  stockDays: number | null;
}

export default async function SermayeSaglikPage() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  const latestRate = await prisma.monthlyExchangeRate.findFirst({
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { usdTryRate: true, rmbUsdRate: true },
  });
  const usdTryRate = latestRate?.usdTryRate ? Number(latestRate.usdTryRate) : DEFAULT_USD_TRY_RATE;
  const rmbUsdRate = latestRate?.rmbUsdRate ? Number(latestRate.rmbUsdRate) : DEFAULT_RMB_USD_RATE;

  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      sku: true,
      brand: true,
      stockQuantity: true,
      sourceCostRmb: true,
      weightKg: true,
      customsRatePct: true,
      importPaymentFeePct: true,
      shippingMethodPref: true,
      unitCostUsd: true,
      unitCostTry: true,
      marketplacePriceTry: true,
      onlineSalesPotential: true,
      reorderLeadTime: true,
      productCategory: { select: { name: true } },
      xmlData: { select: { xmlTrendyolPrice: true } },
      marketplacePrices: {
        where: { marketplace: "TRENDYOL" },
        select: { priceTry: true },
        take: 1,
      },
    },
  });

  // Phase 92: Unified monthly buckets (tüm 14 kanal + Trendyol API)
  const nowDate = new Date();
  const since30 = new Date(nowDate.getTime() - 30 * 24 * 60 * 60 * 1000);
  const since60 = new Date(nowDate.getTime() - 60 * 24 * 60 * 60 * 1000);

  const monthlyRows = await prisma.$queryRaw<
    Array<{ productId: string; month: Date; units: bigint }>
  >`
    SELECT
      "productId",
      DATE_TRUNC('month', "orderDate")::date AS month,
      SUM("quantity")::bigint AS units
    FROM (
      SELECT "productId", "orderDate", "quantity", "status"
        FROM "MarketplaceSalesRecord" WHERE "productId" IS NOT NULL
      UNION ALL
      SELECT "productId", "orderDate", "quantity", "status"
        FROM "TrendyolSalesRecord" WHERE "productId" IS NOT NULL
      UNION ALL
      SELECT "productId", "orderDate", "quantity", "status"
        FROM "HepsiburadaSalesRecord" WHERE "productId" IS NOT NULL
    ) combined
    WHERE "status" IS NULL
       OR ("status" NOT ILIKE '%iptal%'
       AND "status" NOT ILIKE '%iade%'
       AND "status" NOT ILIKE '%cancel%')
    GROUP BY "productId", DATE_TRUNC('month', "orderDate")
  `;
  const monthlyByProduct = buildMonthlySalesMap(
    monthlyRows.map((r) => ({ productId: r.productId, month: r.month, units: r.units })),
  );

  // Son 30g + önceki 30g + lifetime — daily-precision için TrendyolSalesRecord
  // + MarketplaceSalesRecord union'ından tarihe göre sayım
  const dailyRows = await prisma.$queryRaw<
    Array<{ productId: string; units: bigint; period: string }>
  >`
    SELECT
      "productId",
      SUM("quantity")::bigint AS units,
      CASE
        WHEN "orderDate" >= ${since30} THEN 'curr'
        WHEN "orderDate" >= ${since60} AND "orderDate" < ${since30} THEN 'prev'
        ELSE 'older'
      END AS period
    FROM (
      SELECT "productId", "orderDate", "quantity", "status"
        FROM "MarketplaceSalesRecord" WHERE "productId" IS NOT NULL
      UNION ALL
      SELECT "productId", "orderDate", "quantity", "status"
        FROM "TrendyolSalesRecord" WHERE "productId" IS NOT NULL
      UNION ALL
      SELECT "productId", "orderDate", "quantity", "status"
        FROM "HepsiburadaSalesRecord" WHERE "productId" IS NOT NULL
    ) combined
    WHERE ("status" IS NULL OR ("status" NOT ILIKE '%iptal%' AND "status" NOT ILIKE '%iade%' AND "status" NOT ILIKE '%cancel%'))
      AND "orderDate" >= ${since60}
    GROUP BY "productId", period
  `;
  const t30Map = new Map<string, number>();
  const tPrev30Map = new Map<string, number>();
  for (const r of dailyRows) {
    if (r.period === "curr") t30Map.set(r.productId, Number(r.units));
    else if (r.period === "prev") tPrev30Map.set(r.productId, Number(r.units));
  }

  const lifetimeMap = new Map<string, number>();
  for (const [pid, m] of monthlyByProduct) {
    let lt = 0;
    for (const v of m.values()) lt += v;
    lifetimeMap.set(pid, lt);
  }

  const enriched: ProductLite[] = products.map((p) => {
    const t30g = t30Map.get(p.id) ?? 0;
    const prevT30g = tPrev30Map.get(p.id) ?? 0;
    // Phase 92: forecast tüm 14 kanaldan + 5 yıllık tarihçeden
    const monthlyMap = monthlyByProduct.get(p.id) ?? new Map<string, number>();
    const forecast = forecastMonthlySales(monthlyMap, nowDate);
    const effectiveMonthlyUnits = pickEffectiveMonthly(forecast, p.onlineSalesPotential);

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

    // Dropship/sipariş-üzerine (stok ≥ 1000) gerçek elde stok değil → bağlı sermaye
    // ve stok-günü hesaplarından çıkar; satış/kâr metriklerinde kalır.
    const isDropship = isDropshipStock(p.stockQuantity);
    const totalCostUsd = isDropship
      ? 0
      : unitCostUsd != null
        ? unitCostUsd * p.stockQuantity
        : null;

    const revenueResult = calcRevenue({ trendyolPriceTry, usdTryRate });
    const profitResult = costResult && revenueResult ? calcProfit(costResult, revenueResult) : null;
    const netProfitUsd = profitResult?.netProfitUsd ?? null;
    const monthlyProfitUsd = netProfitUsd != null ? netProfitUsd * effectiveMonthlyUnits : 0;
    const prevMonthlyProfitUsd = netProfitUsd != null ? netProfitUsd * prevT30g : 0;

    const stockDays =
      !isDropship && effectiveMonthlyUnits > 0
        ? Math.round((p.stockQuantity / effectiveMonthlyUnits) * 30)
        : null;

    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      brand: p.brand,
      stockQuantity: p.stockQuantity,
      categoryName: p.productCategory?.name ?? "Diğer",
      t30g,
      prevT30g,
      effectiveMonthlyUnits,
      lifetimeSold: lifetimeMap.get(p.id) ?? 0,
      unitCostUsd,
      totalCostUsd,
      netProfitUsd,
      monthlyProfitUsd,
      prevMonthlyProfitUsd,
      stockDays,
    };
  });

  // ── Toplam KPI'lar ────────────────────────────────────────────────────────
  const totalLockedUsd = enriched.reduce((s, p) => s + (p.totalCostUsd ?? 0), 0);
  const monthlyExpectedUsd = enriched.reduce((s, p) => s + Math.max(0, p.monthlyProfitUsd), 0);
  const prevMonthlyExpectedUsd = enriched.reduce((s, p) => s + Math.max(0, p.prevMonthlyProfitUsd), 0);
  const annualRoiPct =
    totalLockedUsd > 0 ? (monthlyExpectedUsd * 12 / totalLockedUsd) * 100 : 0;
  const prevAnnualRoiPct =
    totalLockedUsd > 0 ? (prevMonthlyExpectedUsd * 12 / totalLockedUsd) * 100 : 0;
  const deadStock = enriched.filter(
    (p) => p.lifetimeSold === 0 && p.stockQuantity > 0 && !isDropshipStock(p.stockQuantity),
  );
  const deadStockUsd = deadStock.reduce((s, p) => s + (p.totalCostUsd ?? 0), 0);

  // ── Aksiyon listeleri ─────────────────────────────────────────────────────

  const stars = enriched
    .filter((p) => p.monthlyProfitUsd > 0)
    .sort((a, b) => b.monthlyProfitUsd - a.monthlyProfitUsd)
    .slice(0, 10);

  const deadTop = deadStock
    .filter((p) => (p.totalCostUsd ?? 0) > 0)
    .sort((a, b) => (b.totalCostUsd ?? 0) - (a.totalCostUsd ?? 0))
    .slice(0, 10);

  const urgentReorder = enriched
    .filter((p) => p.stockDays != null && p.stockDays > 0 && p.stockDays < 14 && p.effectiveMonthlyUnits > 0)
    .sort((a, b) => (a.stockDays ?? 0) - (b.stockDays ?? 0))
    .slice(0, 10);

  const liquidation = enriched
    .filter((p) => p.stockQuantity > 0 && (p.totalCostUsd ?? 0) > 0 && p.t30g === 0 && p.lifetimeSold > 0)
    .sort((a, b) => (b.totalCostUsd ?? 0) - (a.totalCostUsd ?? 0))
    .slice(0, 10);

  // ── Sermaye Sağlık Skoru (0-100) ──────────────────────────────────────────
  // Ağırlıklar:
  //   ROI:           50 pts  →  yıllık ROI %60+ ise tam puan, lineer ölçek
  //   Ölü stok:      25 pts  →  ölü stok oranı düşük = yüksek puan
  //   Acil sipariş:  10 pts  →  0 acil sipariş = tam puan, 10+ = 0
  //   Likidasyon:    15 pts  →  0 likidasyon = tam puan, 30+ = 0
  const roiScore = Math.min(50, Math.max(0, (annualRoiPct / 60) * 50));
  const deadRatio = totalLockedUsd > 0 ? deadStockUsd / totalLockedUsd : 0;
  const deadScore = Math.max(0, (1 - Math.min(1, deadRatio * 2)) * 25);
  // urgentReorder filtered to top 10 — use full count for score
  const urgentCount = enriched.filter(
    (p) => p.stockDays != null && p.stockDays > 0 && p.stockDays < 14 && p.effectiveMonthlyUnits > 0,
  ).length;
  const urgentScore = Math.max(0, 10 - urgentCount * 1);
  const liquidationCount = enriched.filter(
    (p) => p.stockQuantity > 0 && (p.totalCostUsd ?? 0) > 0 && p.t30g === 0 && p.lifetimeSold > 0,
  ).length;
  const liquidationScore = Math.max(0, 15 - liquidationCount * 0.5);
  const healthScore = Math.round(roiScore + deadScore + urgentScore + liquidationScore);

  const healthTone =
    healthScore >= 75 ? "ok" :
    healthScore >= 55 ? "info" :
    healthScore >= 35 ? "warn" : "danger";
  const healthLabel =
    healthScore >= 75 ? "Mükemmel" :
    healthScore >= 55 ? "İyi" :
    healthScore >= 35 ? "Dikkat" : "Kritik";
  const healthText = {
    ok:     "text-[var(--ok)]",
    info:   "text-[var(--info)]",
    warn:   "text-[var(--warn)]",
    danger: "text-[var(--danger)]",
  }[healthTone];

  // ── Kategori dağılımı ─────────────────────────────────────────────────────
  type CatAgg = { name: string; lockedUsd: number; productCount: number; monthlyProfitUsd: number };
  const catMap = new Map<string, CatAgg>();
  for (const p of enriched) {
    const key = p.categoryName;
    const existing = catMap.get(key) ?? { name: key, lockedUsd: 0, productCount: 0, monthlyProfitUsd: 0 };
    existing.lockedUsd += p.totalCostUsd ?? 0;
    existing.productCount += 1;
    existing.monthlyProfitUsd += Math.max(0, p.monthlyProfitUsd);
    catMap.set(key, existing);
  }
  const catBreakdown = Array.from(catMap.values()).sort((a, b) => b.lockedUsd - a.lockedUsd);
  const topCats = catBreakdown.slice(0, 10);

  const monthlyDelta = fmtDelta(monthlyExpectedUsd, prevMonthlyExpectedUsd);
  const roiDelta = fmtDelta(annualRoiPct, prevAnnualRoiPct);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={Heart}
        breadcrumb={[{ label: "Günlük Durum" }, { label: "Sermaye Sağlığı" }]}
        title="Sermaye Sağlığı"
        subtitle="Günde bir kez aç, ne yapmalısın kararla — sermayenin nereye bağlı, ne kadar nakit beklenir, neyi siparişe vermeli, neyi tasfiye etmeli."
        actions={<PageHelp pageKey="admin/sermaye-saglik" />}
      />

      {/* Sermaye Sağlık Skoru — manşet */}
      <Card className="p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-baseline gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                Sermaye Sağlık Skoru
              </p>
              <div className="mt-1 flex items-baseline gap-3">
                <span className={`text-[64px] leading-none font-semibold tabular-nums ${healthText}`}>
                  {healthScore}
                </span>
                <span className="text-sm text-[var(--text-muted)]">/ 100</span>
                <span className={`rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-2.5 py-0.5 text-xs font-medium ${healthText}`}>
                  {healthLabel}
                </span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-4">
            <div>
              <p className="text-[11px] uppercase tracking-widest font-medium text-[var(--text-muted)]">ROI</p>
              <p className="mt-1 font-mono font-semibold tabular-nums text-[var(--text-primary)]">
                {roiScore.toFixed(0)}/50
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-widest font-medium text-[var(--text-muted)]">Ölü stok</p>
              <p className="mt-1 font-mono font-semibold tabular-nums text-[var(--text-primary)]">
                {deadScore.toFixed(0)}/25
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-widest font-medium text-[var(--text-muted)]">Acil sipariş</p>
              <p className="mt-1 font-mono font-semibold tabular-nums text-[var(--text-primary)]">
                {urgentScore.toFixed(0)}/10
              </p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-widest font-medium text-[var(--text-muted)]">Likidasyon</p>
              <p className="mt-1 font-mono font-semibold tabular-nums text-[var(--text-primary)]">
                {liquidationScore.toFixed(0)}/15
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Üst KPI şeridi */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricTile
          label="Bağlı Sermaye"
          value={fmtUsd(totalLockedUsd)}
          sub={`${enriched.length} aktif ürün`}
        />
        <MetricTile
          label="Aylık Beklenen Nakit"
          value={fmtUsd(monthlyExpectedUsd)}
          valueColor="text-[var(--ok)]"
          subSlot={<DeltaBadge delta={monthlyDelta} className="mt-1" />}
        />
        <MetricTile
          label="Yıllık ROI Projeksiyonu"
          value={fmtPct(annualRoiPct)}
          valueColor="text-[var(--info)]"
          subSlot={<DeltaBadge delta={roiDelta} className="mt-1" />}
        />
        <MetricTile
          label="Ölü Stok"
          value={fmtUsd(deadStockUsd)}
          valueColor="text-[var(--warn)]"
          sub={`${deadStock.length} ürün, hiç satılmamış`}
        />
      </div>

      {/* Kategori dağılımı */}
      <Card className="overflow-hidden p-0">
        <div className="border-b border-[var(--border-default)] px-6 py-4">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Kategori Dağılımı
          </p>
          <h2 className="mt-1 text-base font-semibold text-[var(--text-primary)]">
            Kategori bazlı bağlı sermaye dağılımı
          </h2>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Top 10 kategori — toplam: {fmtUsd(totalLockedUsd)}
          </p>
        </div>
        <div className="divide-y divide-[var(--border-subtle)]">
          {topCats.map((c) => {
            const pct = totalLockedUsd > 0 ? (c.lockedUsd / totalLockedUsd) * 100 : 0;
            return (
              <div key={c.name} className="grid grid-cols-12 items-center gap-3 px-6 py-3 hover:bg-[var(--surface-3)] transition">
                <div className="col-span-3 text-sm font-medium text-[var(--text-primary)] truncate" title={c.name}>
                  {c.name}
                </div>
                <div className="col-span-5">
                  <div className="h-2 rounded-md bg-[var(--surface-3)] overflow-hidden">
                    <div
                      className="h-full rounded-md bg-[var(--accent)]"
                      style={{ width: `${Math.min(100, pct).toFixed(1)}%` }}
                    />
                  </div>
                </div>
                <div className="col-span-1 text-right text-xs font-mono text-[var(--text-muted)] tabular-nums">
                  {fmtPct(pct, 1)}
                </div>
                <div className="col-span-2 text-right text-sm font-mono font-semibold text-[var(--text-primary)] tabular-nums">
                  {fmtUsd(c.lockedUsd)}
                </div>
                <div className="col-span-1 text-right text-xs text-[var(--text-muted)]">
                  {c.productCount} ürün
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* 4 aksiyon listesi: 2x2 grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ActionList
          title="Yıldız Ürünler"
          subtitle="En çok aylık kâr getiren 10 ürün — sipariş artırın"
          color="emerald"
          csv={{
            filename: "yildiz-urunler.csv",
            columns: [
              { header: "Ürün", key: "name" },
              { header: "Marka", key: "brand" },
              { header: "SKU", key: "sku" },
              { header: "Aylık Kâr (USD)", key: "monthlyProfitUsd" },
              { header: "T30G", key: "t30g" },
              { header: "Stok", key: "stockQuantity" },
            ],
            rows: stars.map((p) => ({
              name: p.name,
              brand: p.brand ?? "",
              sku: p.sku,
              monthlyProfitUsd: p.monthlyProfitUsd.toFixed(2),
              t30g: p.t30g,
              stockQuantity: p.stockQuantity,
            })),
          }}
          rows={stars.map((p) => ({
            id: p.id,
            primary: p.name,
            secondary: `${p.brand ?? "—"} · ${p.sku}`,
            valueLabel: "aylık kâr",
            value: fmtUsd(p.monthlyProfitUsd, 0),
            meta: `T30G ${p.t30g} · stok ${p.stockQuantity}`,
          }))}
          emptyMsg="Henüz aylık kâr verisi yok."
        />

        <ActionList
          title="Ölü Stok"
          subtitle="Hiç satılmamış + bağlı sermayesi yüksek 10 ürün — tasfiye / indirim"
          color="amber"
          csv={{
            filename: "olu-stok.csv",
            columns: [
              { header: "Ürün", key: "name" },
              { header: "Marka", key: "brand" },
              { header: "SKU", key: "sku" },
              { header: "Bağlı Sermaye (USD)", key: "totalCostUsd" },
              { header: "Stok", key: "stockQuantity" },
              { header: "Lifetime", key: "lifetimeSold" },
            ],
            rows: deadStock
              .filter((p) => (p.totalCostUsd ?? 0) > 0)
              .sort((a, b) => (b.totalCostUsd ?? 0) - (a.totalCostUsd ?? 0))
              .map((p) => ({
                name: p.name,
                brand: p.brand ?? "",
                sku: p.sku,
                totalCostUsd: (p.totalCostUsd ?? 0).toFixed(2),
                stockQuantity: p.stockQuantity,
                lifetimeSold: p.lifetimeSold,
              })),
          }}
          rows={deadTop.map((p) => ({
            id: p.id,
            primary: p.name,
            secondary: `${p.brand ?? "—"} · ${p.sku}`,
            valueLabel: "bağlı sermaye",
            value: fmtUsd(p.totalCostUsd ?? 0, 0),
            meta: `stok ${p.stockQuantity} · lifetime 0`,
          }))}
          emptyMsg="Ölü stok yok"
        />

        <ActionList
          title="Acil Sipariş"
          subtitle="14 günden az stoku kalan ürünler — hemen sipariş ver"
          color="red"
          csv={{
            filename: "acil-siparis.csv",
            columns: [
              { header: "Ürün", key: "name" },
              { header: "Marka", key: "brand" },
              { header: "SKU", key: "sku" },
              { header: "Kalan Gün", key: "stockDays" },
              { header: "Stok", key: "stockQuantity" },
              { header: "Aylık Satış", key: "effectiveMonthlyUnits" },
            ],
            rows: enriched
              .filter(
                (p) => p.stockDays != null && p.stockDays > 0 && p.stockDays < 14 && p.effectiveMonthlyUnits > 0,
              )
              .sort((a, b) => (a.stockDays ?? 0) - (b.stockDays ?? 0))
              .map((p) => ({
                name: p.name,
                brand: p.brand ?? "",
                sku: p.sku,
                stockDays: p.stockDays ?? 0,
                stockQuantity: p.stockQuantity,
                effectiveMonthlyUnits: p.effectiveMonthlyUnits,
              })),
          }}
          rows={urgentReorder.map((p) => ({
            id: p.id,
            primary: p.name,
            secondary: `${p.brand ?? "—"} · ${p.sku}`,
            valueLabel: "kalan",
            value: `${p.stockDays}g`,
            meta: `stok ${p.stockQuantity} · aylık ${p.effectiveMonthlyUnits}`,
          }))}
          emptyMsg="Acil sipariş yok"
        />

        <ActionList
          title="Likidasyon Adayı"
          subtitle="Daha önce satılmış ama son 30 gündür hiç hareket yok"
          color="orange"
          csv={{
            filename: "likidasyon-adaylari.csv",
            columns: [
              { header: "Ürün", key: "name" },
              { header: "Marka", key: "brand" },
              { header: "SKU", key: "sku" },
              { header: "Bağlı Sermaye (USD)", key: "totalCostUsd" },
              { header: "Stok", key: "stockQuantity" },
              { header: "Lifetime", key: "lifetimeSold" },
            ],
            rows: enriched
              .filter((p) => p.stockQuantity > 0 && (p.totalCostUsd ?? 0) > 0 && p.t30g === 0 && p.lifetimeSold > 0)
              .sort((a, b) => (b.totalCostUsd ?? 0) - (a.totalCostUsd ?? 0))
              .map((p) => ({
                name: p.name,
                brand: p.brand ?? "",
                sku: p.sku,
                totalCostUsd: (p.totalCostUsd ?? 0).toFixed(2),
                stockQuantity: p.stockQuantity,
                lifetimeSold: p.lifetimeSold,
              })),
          }}
          rows={liquidation.map((p) => ({
            id: p.id,
            primary: p.name,
            secondary: `${p.brand ?? "—"} · ${p.sku}`,
            valueLabel: "bağlı sermaye",
            value: fmtUsd(p.totalCostUsd ?? 0, 0),
            meta: `stok ${p.stockQuantity} · lifetime ${p.lifetimeSold}`,
          }))}
          emptyMsg="Likidasyon adayı yok"
        />
      </div>

      <p className="text-xs text-[var(--text-muted)] text-center">
        Kur: 1 USD = ₺{usdTryRate.toFixed(2)} · 1 USD = {rmbUsdRate.toFixed(2)} RMB ·
        Kâr hesabı: <code>lib/pricing-engine.ts</code> kanonik formülü (Trendyol kargo dilim + komisyon, KDV dahil) ·
        Karşılaştırma: son 30g vs önceki 30g.
      </p>
    </div>
  );
}

// ── Metric tile (KPI) ──────────────────────────────────────────────────────

function MetricTile({
  label,
  value,
  sub,
  subSlot,
  valueColor = "text-[var(--text-primary)]",
}: {
  label: string;
  value: string;
  sub?: string;
  subSlot?: ReactNode;
  valueColor?: string;
}) {
  return (
    <Card className="p-5">
      <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
        {label}
      </p>
      <p className={`mt-2 text-[28px] leading-tight font-semibold tabular-nums ${valueColor}`}>
        {value}
      </p>
      {subSlot ?? (sub && <p className="mt-1 text-xs text-[var(--text-muted)]">{sub}</p>)}
    </Card>
  );
}

// ── Delta rozeti ────────────────────────────────────────────────────────────

function DeltaBadge({
  delta,
  className,
}: {
  delta: { text: string; tone: "up" | "down" | "flat" };
  className?: string;
}) {
  const toneClass = {
    up: "text-[var(--ok)]",
    down: "text-[var(--danger)]",
    flat: "text-[var(--text-muted)]",
  }[delta.tone];
  const arrow = delta.tone === "up" ? "▲" : delta.tone === "down" ? "▼" : "·";
  return (
    <p className={`text-xs font-medium tabular-nums ${toneClass} ${className ?? ""}`}>
      {arrow} {delta.text}
    </p>
  );
}

// ── Aksiyon listesi bileşeni ────────────────────────────────────────────────

interface Row {
  id: string;
  primary: string;
  secondary: string;
  valueLabel: string;
  value: string;
  meta?: string;
}

interface CsvSpec {
  filename: string;
  columns: Array<{ header: string; key: string }>;
  rows: Array<Record<string, string | number>>;
}

function ActionList({
  title,
  subtitle,
  color,
  rows,
  csv,
  emptyMsg,
}: {
  title: string;
  subtitle: string;
  color: "emerald" | "amber" | "red" | "orange";
  rows: Row[];
  csv: CsvSpec;
  emptyMsg: string;
}) {
  const headerColors = {
    emerald: "text-[var(--ok)]",
    amber: "text-[var(--warn)]",
    red: "text-[var(--danger)]",
    orange: "text-[var(--warn)]",
  }[color];
  const HeaderIcon = {
    emerald: Star,
    amber: CircleDot,
    red: CircleAlert,
    orange: Circle,
  }[color];

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border-default)] bg-[var(--surface-1)] px-5 py-3">
        <div className="min-w-0 flex-1">
          <h3 className={`inline-flex items-center gap-1.5 text-sm font-semibold ${headerColors}`}>
            <HeaderIcon size={14} strokeWidth={1.5} />
            {title}
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">{subtitle}</p>
          {csv.rows.length > rows.length && (
            <p className="text-[10px] text-[var(--text-muted)] mt-0.5">
              Görüntüde ilk {rows.length} satır · CSV'de {csv.rows.length} satır
            </p>
          )}
        </div>
        <CsvDownloadButton
          filename={csv.filename}
          columns={csv.columns}
          rows={csv.rows}
        />
      </div>
      <div className="divide-y divide-[var(--border-subtle)]">
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-[var(--text-muted)]">{emptyMsg}</p>
        ) : (
          rows.map((r) => (
            <Link
              key={r.id}
              href={`/products/${r.id}`}
              className="block px-5 py-2.5 hover:bg-[var(--surface-3)] transition"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]" title={r.primary}>
                    {r.primary}
                  </p>
                  <p className="text-[10px] text-[var(--text-muted)] truncate font-mono">{r.secondary}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className={`text-sm font-semibold tabular-nums font-mono ${headerColors}`}>{r.value}</p>
                  <p className="text-[9px] text-[var(--text-muted)] uppercase tracking-wider">{r.valueLabel}</p>
                </div>
              </div>
              {r.meta && (
                <p className="mt-1 text-[10px] text-[var(--text-muted)] tabular-nums">{r.meta}</p>
              )}
            </Link>
          ))
        )}
      </div>
    </Card>
  );
}

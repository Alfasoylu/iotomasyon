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

import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { CsvDownloadButton } from "@/components/admin/csv-download-button";
import {
  calcImportCost,
  calcRevenue,
  calcProfit,
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

    const totalCostUsd = unitCostUsd != null ? unitCostUsd * p.stockQuantity : null;

    const revenueResult = calcRevenue({ trendyolPriceTry, usdTryRate });
    const profitResult = costResult && revenueResult ? calcProfit(costResult, revenueResult) : null;
    const netProfitUsd = profitResult?.netProfitUsd ?? null;
    const monthlyProfitUsd = netProfitUsd != null ? netProfitUsd * effectiveMonthlyUnits : 0;
    const prevMonthlyProfitUsd = netProfitUsd != null ? netProfitUsd * prevT30g : 0;

    const stockDays =
      effectiveMonthlyUnits > 0
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
  const deadStock = enriched.filter((p) => p.lifetimeSold === 0 && p.stockQuantity > 0);
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
    healthScore >= 75 ? "emerald" :
    healthScore >= 55 ? "blue" :
    healthScore >= 35 ? "amber" : "red";
  const healthLabel =
    healthScore >= 75 ? "Mükemmel" :
    healthScore >= 55 ? "İyi" :
    healthScore >= 35 ? "Dikkat" : "Kritik";
  const healthBg = {
    emerald: "border-emerald-300 bg-emerald-50",
    blue: "border-blue-300 bg-blue-50",
    amber: "border-amber-300 bg-amber-50",
    red: "border-red-300 bg-red-50",
  }[healthTone];
  const healthText = {
    emerald: "text-emerald-700",
    blue: "text-blue-700",
    amber: "text-amber-700",
    red: "text-red-700",
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
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          Yönetim / Pano
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Sermaye Sağlık Panosu
        </h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          USD bazlı tek bakışta günlük durum: ne kadar paranız ürüne bağlı, bu ay ne
          kadar nakit beklenir, neyi siparişe vermeli, neyi tasfiye etmeli.
        </p>
      </div>

      {/* Sermaye Sağlık Skoru — manşet */}
      <Card className={`${healthBg} p-6`}>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-baseline gap-4">
            <div>
              <p className={`text-xs font-semibold uppercase tracking-[0.25em] ${healthText}`}>
                Sermaye Sağlık Skoru
              </p>
              <div className="mt-1 flex items-baseline gap-3">
                <span className={`text-6xl font-bold tabular-nums ${healthText}`}>
                  {healthScore}
                </span>
                <span className="text-sm text-slate-500">/ 100</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${healthText} bg-white/70`}>
                  {healthLabel}
                </span>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-4">
            <div>
              <p className="text-slate-500">ROI</p>
              <p className="font-mono font-semibold text-slate-800">
                {roiScore.toFixed(0)}/50
              </p>
            </div>
            <div>
              <p className="text-slate-500">Ölü stok</p>
              <p className="font-mono font-semibold text-slate-800">
                {deadScore.toFixed(0)}/25
              </p>
            </div>
            <div>
              <p className="text-slate-500">Acil sipariş</p>
              <p className="font-mono font-semibold text-slate-800">
                {urgentScore.toFixed(0)}/10
              </p>
            </div>
            <div>
              <p className="text-slate-500">Likidasyon</p>
              <p className="font-mono font-semibold text-slate-800">
                {liquidationScore.toFixed(0)}/15
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Üst KPI şeridi */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Bağlı Sermaye
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">
            {fmtUsd(totalLockedUsd)}
          </p>
          <p className="mt-1 text-xs text-slate-400">
            {enriched.length} aktif ürün
          </p>
        </Card>
        <Card className="p-5 border-emerald-200 bg-emerald-50/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Aylık Beklenen Nakit
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-emerald-700">
            {fmtUsd(monthlyExpectedUsd)}
          </p>
          <DeltaBadge delta={monthlyDelta} className="mt-1" />
        </Card>
        <Card className="p-5 border-blue-200 bg-blue-50/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Yıllık ROI Projeksiyonu
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-blue-700">
            {fmtPct(annualRoiPct)}
          </p>
          <DeltaBadge delta={roiDelta} className="mt-1" />
        </Card>
        <Card className="p-5 border-amber-200 bg-amber-50/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
            Ölü Stok
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-amber-700">
            {fmtUsd(deadStockUsd)}
          </p>
          <p className="mt-1 text-xs text-amber-600">
            {deadStock.length} ürün, hiç satılmamış
          </p>
        </Card>
      </div>

      {/* Kategori dağılımı */}
      <Card className="overflow-hidden p-0">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-950">
            Kategori bazlı bağlı sermaye dağılımı
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Top 10 kategori — toplam: {fmtUsd(totalLockedUsd)}
          </p>
        </div>
        <div className="divide-y divide-slate-50">
          {topCats.map((c) => {
            const pct = totalLockedUsd > 0 ? (c.lockedUsd / totalLockedUsd) * 100 : 0;
            return (
              <div key={c.name} className="grid grid-cols-12 items-center gap-3 px-6 py-3">
                <div className="col-span-3 text-sm font-medium text-slate-700 truncate" title={c.name}>
                  {c.name}
                </div>
                <div className="col-span-5">
                  <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-slate-700"
                      style={{ width: `${Math.min(100, pct).toFixed(1)}%` }}
                    />
                  </div>
                </div>
                <div className="col-span-1 text-right text-xs font-mono text-slate-500 tabular-nums">
                  {fmtPct(pct, 1)}
                </div>
                <div className="col-span-2 text-right text-sm font-mono font-semibold text-slate-900 tabular-nums">
                  {fmtUsd(c.lockedUsd)}
                </div>
                <div className="col-span-1 text-right text-xs text-slate-400">
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
          title="⭐ Yıldız Ürünler"
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
          title="🟡 Ölü Stok"
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
          emptyMsg="Ölü stok yok ✓"
        />

        <ActionList
          title="🔴 Acil Sipariş"
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
          emptyMsg="Acil sipariş yok ✓"
        />

        <ActionList
          title="🟠 Likidasyon Adayı"
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
          emptyMsg="Likidasyon adayı yok ✓"
        />
      </div>

      <p className="text-xs text-slate-400 text-center">
        Kur: 1 USD = ₺{usdTryRate.toFixed(2)} · 1 USD = {rmbUsdRate.toFixed(2)} RMB ·
        Kâr hesabı: <code>lib/pricing-engine.ts</code> kanonik formülü (Trendyol kargo dilim + komisyon, KDV dahil) ·
        Karşılaştırma: son 30g vs önceki 30g.
      </p>
    </div>
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
    up: "text-emerald-600",
    down: "text-rose-600",
    flat: "text-slate-400",
  }[delta.tone];
  const arrow = delta.tone === "up" ? "▲" : delta.tone === "down" ? "▼" : "·";
  return (
    <p className={`text-xs font-medium ${toneClass} ${className ?? ""}`}>
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
  const colorClasses = {
    emerald: "border-emerald-200 bg-emerald-50/30",
    amber: "border-amber-200 bg-amber-50/30",
    red: "border-red-200 bg-red-50/30",
    orange: "border-orange-200 bg-orange-50/30",
  }[color];
  const headerColors = {
    emerald: "text-emerald-800",
    amber: "text-amber-800",
    red: "text-red-800",
    orange: "text-orange-800",
  }[color];

  return (
    <Card className={`overflow-hidden p-0 ${colorClasses}`}>
      <div className="flex items-start justify-between gap-3 border-b border-white/60 bg-white/60 px-5 py-3">
        <div className="min-w-0 flex-1">
          <h3 className={`text-sm font-bold ${headerColors}`}>{title}</h3>
          <p className="text-xs text-slate-600 mt-0.5">{subtitle}</p>
          {csv.rows.length > rows.length && (
            <p className="text-[10px] text-slate-400 mt-0.5">
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
      <div className="divide-y divide-white/60 bg-white/50">
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-slate-400">{emptyMsg}</p>
        ) : (
          rows.map((r) => (
            <Link
              key={r.id}
              href={`/products/${r.id}`}
              className="block px-5 py-2.5 hover:bg-white transition"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900" title={r.primary}>
                    {r.primary}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">{r.secondary}</p>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums text-slate-900">{r.value}</p>
                  <p className="text-[9px] text-slate-400">{r.valueLabel}</p>
                </div>
              </div>
              {r.meta && (
                <p className="mt-1 text-[10px] text-slate-400">{r.meta}</p>
              )}
            </Link>
          ))
        )}
      </div>
    </Card>
  );
}

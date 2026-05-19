/**
 * Sermaye Sağlık Panosu
 *
 * Günde 1 açılır karar verme aracı:
 *   - Bağlı sermaye (USD)
 *   - Aylık beklenen nakit akışı
 *   - Yıllık ROI projeksiyonu
 *   - Ölü stok bağlı sermaye
 *   - Kategori bazlı sermaye dağılımı
 *   - 4 aksiyon listesi (yıldız ürün, ölü stok, acil sipariş, eksik listeme)
 *
 * Veri kaynağı: Product + TrendyolSalesRecord. Yeni schema yok.
 */

import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import {
  calcImportCost,
  calcRevenue,
  calcProfit,
  DEFAULT_USD_TRY_RATE,
  DEFAULT_RMB_USD_RATE,
} from "@/lib/importer-cost";

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

interface ProductLite {
  id: string;
  name: string;
  sku: string;
  brand: string | null;
  stockQuantity: number;
  categoryName: string;
  t30g: number;
  effectiveMonthlyUnits: number;
  lifetimeSold: number;
  unitCostUsd: number | null;   // bir adet maliyeti (RMB→USD+freight+customs ya da unitCostTry/usdTry)
  totalCostUsd: number | null;  // total bağlı sermaye = unitCost × stock
  netProfitUsd: number | null;
  monthlyProfitUsd: number;     // effectiveMonthly × netProfit
  stockDays: number | null;
}

export default async function SermayeSaglikPage() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  // Kur
  const latestRate = await prisma.monthlyExchangeRate.findFirst({
    orderBy: [{ year: "desc" }, { month: "desc" }],
    select: { usdTryRate: true, rmbUsdRate: true },
  });
  const usdTryRate = latestRate?.usdTryRate ? Number(latestRate.usdTryRate) : DEFAULT_USD_TRY_RATE;
  const rmbUsdRate = latestRate?.rmbUsdRate ? Number(latestRate.rmbUsdRate) : DEFAULT_RMB_USD_RATE;

  // Aktif ürünler + kategori adı
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

  // Son 30g satış
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
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

  // Lifetime satış
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

  // Enrich
  const enriched: ProductLite[] = products.map((p) => {
    const t30g = t30Map.get(p.id) ?? 0;
    const manualOnline = p.onlineSalesPotential ?? 0;
    const effectiveMonthlyUnits = Math.max(t30g, manualOnline);

    // Maliyet — calcImportCost varsa onu kullan, yoksa unitCostTry/unitCostUsd fallback
    const costResult = calcImportCost({
      sourceCostRmb: p.sourceCostRmb != null ? Number(p.sourceCostRmb) : null,
      weightKg: p.weightKg != null ? Number(p.weightKg) : null,
      customsRatePct: p.customsRatePct != null ? Number(p.customsRatePct) : null,
      importPaymentFeePct: p.importPaymentFeePct != null ? Number(p.importPaymentFeePct) : null,
      shippingMethodPref: p.shippingMethodPref,
      rmbUsdRate,
    });
    let unitCostUsd: number | null = null;
    if (costResult) unitCostUsd = costResult.totalCostUsd;
    else if (p.unitCostUsd != null) unitCostUsd = Number(p.unitCostUsd);
    else if (p.unitCostTry != null) unitCostUsd = Number(p.unitCostTry) / usdTryRate;

    const totalCostUsd = unitCostUsd != null ? unitCostUsd * p.stockQuantity : null;

    // Trendyol fiyatı
    const trendyolPriceTry =
      p.marketplacePrices[0]?.priceTry != null
        ? Number(p.marketplacePrices[0].priceTry)
        : p.xmlData?.xmlTrendyolPrice != null
          ? Number(p.xmlData.xmlTrendyolPrice) * usdTryRate
          : null;

    const revenueResult = calcRevenue({ trendyolPriceTry, usdTryRate });
    const profitResult = costResult && revenueResult ? calcProfit(costResult, revenueResult) : null;
    const netProfitUsd = profitResult?.netProfitUsd ?? null;
    const monthlyProfitUsd = netProfitUsd != null ? netProfitUsd * effectiveMonthlyUnits : 0;

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
      effectiveMonthlyUnits,
      lifetimeSold: lifetimeMap.get(p.id) ?? 0,
      unitCostUsd,
      totalCostUsd,
      netProfitUsd,
      monthlyProfitUsd,
      stockDays,
    };
  });

  // ── Toplam KPI'lar ────────────────────────────────────────────────────────
  const totalLockedUsd = enriched.reduce((s, p) => s + (p.totalCostUsd ?? 0), 0);
  const monthlyExpectedUsd = enriched.reduce((s, p) => s + Math.max(0, p.monthlyProfitUsd), 0);
  const annualRoiPct =
    totalLockedUsd > 0 ? (monthlyExpectedUsd * 12 / totalLockedUsd) * 100 : 0;
  const deadStock = enriched.filter((p) => p.lifetimeSold === 0 && p.stockQuantity > 0);
  const deadStockUsd = deadStock.reduce((s, p) => s + (p.totalCostUsd ?? 0), 0);

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

  // ── Aksiyon listeleri ─────────────────────────────────────────────────────

  // Yıldız ürünler: top 10 aylık kâr
  const stars = enriched
    .filter((p) => p.monthlyProfitUsd > 0)
    .sort((a, b) => b.monthlyProfitUsd - a.monthlyProfitUsd)
    .slice(0, 10);

  // Ölü stok (top 10 bağlı sermaye)
  const deadTop = deadStock
    .filter((p) => (p.totalCostUsd ?? 0) > 0)
    .sort((a, b) => (b.totalCostUsd ?? 0) - (a.totalCostUsd ?? 0))
    .slice(0, 10);

  // Acil sipariş: stockDays varsa + lead time'ı aşıyor veya < 14g
  const urgentReorder = enriched
    .filter((p) => p.stockDays != null && p.stockDays > 0 && p.stockDays < 14 && p.effectiveMonthlyUnits > 0)
    .sort((a, b) => (a.stockDays ?? 0) - (b.stockDays ?? 0))
    .slice(0, 10);

  // Likidasyon: çok stok + uzun süredir satış yok
  const liquidation = enriched
    .filter((p) => p.stockQuantity > 0 && (p.totalCostUsd ?? 0) > 0 && p.t30g === 0 && p.lifetimeSold > 0)
    .sort((a, b) => (b.totalCostUsd ?? 0) - (a.totalCostUsd ?? 0))
    .slice(0, 10);

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
          <p className="mt-1 text-xs text-emerald-600">net kâr (kargo+komisyon sonrası)</p>
        </Card>
        <Card className="p-5 border-blue-200 bg-blue-50/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
            Yıllık ROI Projeksiyonu
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-blue-700">
            {fmtPct(annualRoiPct)}
          </p>
          <p className="mt-1 text-xs text-blue-600">
            mevcut hızda 12 ay
          </p>
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

      {/* Footer note */}
      <p className="text-xs text-slate-400 text-center">
        Kur: 1 USD = ₺{usdTryRate.toFixed(2)} · 1 USD = {rmbUsdRate.toFixed(2)} RMB ·
        Kâr hesabı: <code>lib/pricing-engine.ts</code> kanonik formülü (Trendyol kargo dilim + komisyon, KDV dahil).
      </p>
    </div>
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

function ActionList({
  title,
  subtitle,
  color,
  rows,
  emptyMsg,
}: {
  title: string;
  subtitle: string;
  color: "emerald" | "amber" | "red" | "orange";
  rows: Row[];
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
      <div className="border-b border-white/60 bg-white/60 px-5 py-3">
        <h3 className={`text-sm font-bold ${headerColors}`}>{title}</h3>
        <p className="text-xs text-slate-600 mt-0.5">{subtitle}</p>
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

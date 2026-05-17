/**
 * Phase 22 — Executive KPI Dashboard
 *
 * Single-page owner overview combining:
 *   - Stock intelligence (total value, zero-stock, below-min)
 *   - Profitability snapshot (top 5 by marketplace margin, losing products)
 *   - Procurement urgency summary (CRITICAL/HIGH counts, suggested reorder cost)
 *   - Capital status (if configured in CapitalConfig)
 *   - Latest exchange rate
 *
 * No new DB schema — reads from existing Product, CapitalConfig,
 * MonthlyExchangeRate, MarketplaceListing tables.
 */

import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { calculateProfitability } from "@/lib/profitability";
import { calculateProcurement } from "@/lib/procurement";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

function fmt(n: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtPct(n: number) {
  return `%${n.toFixed(1)}`;
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "green" | "amber" | "red" | "dark";
}) {
  const bg =
    tone === "dark"
      ? "border-slate-900 bg-slate-900"
      : tone === "green"
        ? "border-emerald-200 bg-emerald-50"
        : tone === "amber"
          ? "border-amber-200 bg-amber-50"
          : tone === "red"
            ? "border-red-200 bg-red-50"
            : "border-slate-200 bg-white";
  const labelColor =
    tone === "dark"
      ? "text-slate-400"
      : tone === "green"
        ? "text-emerald-700"
        : tone === "amber"
          ? "text-amber-700"
          : tone === "red"
            ? "text-red-700"
            : "text-slate-500";
  const valueColor =
    tone === "dark"
      ? "text-white"
      : tone === "green"
        ? "text-emerald-900"
        : tone === "amber"
          ? "text-amber-900"
          : tone === "red"
            ? "text-red-900"
            : "text-slate-900";

  return (
    <div className={`rounded-2xl border p-4 ${bg}`}>
      <p className={`text-xs font-semibold uppercase tracking-widest ${labelColor}`}>
        {label}
      </p>
      <p className={`mt-2 text-xl font-bold tabular-nums ${valueColor}`}>{value}</p>
      {sub && <p className={`mt-0.5 text-xs ${labelColor}`}>{sub}</p>}
    </div>
  );
}

// ─── Urgency Badge ─────────────────────────────────────────────────────────────

function UrgencyPill({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "red" | "orange" | "amber" | "blue" | "green" | "slate";
}) {
  const colors: Record<string, string> = {
    red: "bg-red-100 text-red-800 border border-red-200",
    orange: "bg-orange-100 text-orange-800 border border-orange-200",
    amber: "bg-amber-100 text-amber-800 border border-amber-200",
    blue: "bg-blue-100 text-blue-800 border border-blue-200",
    green: "bg-emerald-100 text-emerald-800 border border-emerald-200",
    slate: "bg-slate-100 text-slate-600 border border-slate-200",
  };
  return (
    <div className={`flex items-center justify-between rounded-lg px-4 py-3 ${colors[tone]}`}>
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-lg font-bold tabular-nums">{count}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ExecutivePage() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  // ── Fetch all data in parallel ────────────────────────────────────────────
  const [products, capitalConfig, latestRate, listingCount] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        sku: true,
        unitCostTry: true,
        stockQuantity: true,
        minimumStock: true,
        reorderLeadTime: true,
        sellingPriceTry: true,
        wholesalePriceTry: true,
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
        wholesaleSalesPotential: true,
        installerSalesPotential: true,
      },
    }),
    prisma.capitalConfig.findFirst(),
    prisma.monthlyExchangeRate.findFirst({
      orderBy: [{ year: "desc" }, { month: "desc" }],
      select: { usdTryRate: true, month: true, year: true },
    }),
    prisma.marketplaceListing.count({ where: { status: "ACTIVE" } }),
  ]);

  // ── Convert Decimal fields to number ─────────────────────────────────────
  const prods = products.map((p) => ({
    ...p,
    unitCostTry: p.unitCostTry != null ? Number(p.unitCostTry) : null,
    sellingPriceTry: p.sellingPriceTry != null ? Number(p.sellingPriceTry) : null,
    wholesalePriceTry: p.wholesalePriceTry != null ? Number(p.wholesalePriceTry) : null,
    marketplacePriceTry: p.marketplacePriceTry != null ? Number(p.marketplacePriceTry) : null,
    shippingCost: p.shippingCost != null ? Number(p.shippingCost) : null,
    shippingCostOverride: p.shippingCostOverride != null ? Number(p.shippingCostOverride) : null,
    marketplaceCommission: p.marketplaceCommission != null ? Number(p.marketplaceCommission) : null,
    marketplaceCommissionOverride:
      p.marketplaceCommissionOverride != null ? Number(p.marketplaceCommissionOverride) : null,
    packagingCost: p.packagingCost != null ? Number(p.packagingCost) : null,
    vatRate: p.vatRate != null ? Number(p.vatRate) : null,
    paymentFeeRate: p.paymentFeeRate != null ? Number(p.paymentFeeRate) : null,
    returnReserveRate: p.returnReserveRate != null ? Number(p.returnReserveRate) : null,
  }));

  // ── Stock Intelligence ────────────────────────────────────────────────────
  let totalStockValueTry = 0;
  let productsWithCost = 0;
  let zeroStockCount = 0;
  let belowMinCount = 0;

  for (const p of prods) {
    const cost = p.unitCostTry ?? 0;
    const qty = p.stockQuantity ?? 0;
    const min = p.minimumStock ?? 0;

    if (p.unitCostTry != null) {
      totalStockValueTry += cost * qty;
      productsWithCost++;
    }
    if (qty === 0) zeroStockCount++;
    if (min > 0 && qty < min) belowMinCount++;
  }

  // ── Profitability Snapshot ────────────────────────────────────────────────
  const withProfit = prods
    .map((p) => {
      const prof = calculateProfitability(p);
      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        marketplaceMargin: prof.marketplace?.margin ?? null,
        retailMargin: prof.retail?.margin ?? null,
        marketplaceProfitable: prof.marketplace?.profitable ?? null,
        retailProfitable: prof.retail?.profitable ?? null,
      };
    })
    .filter((p) => p.marketplaceMargin != null || p.retailMargin != null);

  const losingProductCount = withProfit.filter(
    (p) => p.marketplaceMargin != null && p.marketplaceMargin < 0,
  ).length;

  const top5Marketplace = [...withProfit]
    .filter((p) => p.marketplaceMargin != null)
    .sort((a, b) => (b.marketplaceMargin ?? 0) - (a.marketplaceMargin ?? 0))
    .slice(0, 5);

  // ── Procurement Urgency ───────────────────────────────────────────────────
  const urgencyCounts = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    OK: 0,
    UNKNOWN: 0,
  };
  let totalReorderCost = 0;

  for (const p of prods) {
    const result = calculateProcurement(p);
    urgencyCounts[result.reorderUrgency]++;
    if (result.reorderUrgency === "CRITICAL" || result.reorderUrgency === "HIGH") {
      totalReorderCost += result.suggestedOrderCost;
    }
  }

  const urgentCount = urgencyCounts.CRITICAL + urgencyCounts.HIGH;

  // ── Capital Status ────────────────────────────────────────────────────────
  const totalCapital = capitalConfig ? Number(capitalConfig.totalCapitalTry) : null;
  const reservePct = capitalConfig ? Number(capitalConfig.reservePct) : 20;
  const reserveAmt = totalCapital != null ? totalCapital * (reservePct / 100) : null;
  const deployable =
    totalCapital != null
      ? Math.max(0, totalCapital - totalStockValueTry - (reserveAmt ?? 0))
      : null;

  // ── Exchange Rate ─────────────────────────────────────────────────────────
  const rate = latestRate ? Number(latestRate.usdTryRate) : null;
  const rateLabel =
    latestRate
      ? `${latestRate.year}/${String(latestRate.month).padStart(2, "0")}`
      : null;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
          Yönetim / Yönetici Paneli
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Yönetici Paneli
        </h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          Stok değeri, kârlılık, tedarik aciliyeti ve sermaye durumunun anlık özeti.
        </p>
      </div>

      {/* ── Section 1: Top KPIs ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Toplam stok değeri (TRY)"
          value={fmt(totalStockValueTry)}
          sub={`${productsWithCost} maliyetli ürün`}
          tone="dark"
        />
        <KpiCard
          label="Sıfır stoklu ürünler"
          value={String(zeroStockCount)}
          sub={`${prods.length} aktif üründen`}
          tone={zeroStockCount > 10 ? "red" : zeroStockCount > 0 ? "amber" : "green"}
        />
        <KpiCard
          label="Minimum altı stok"
          value={String(belowMinCount)}
          sub="minimum eşik tanımlı ürünlerde"
          tone={belowMinCount > 5 ? "amber" : "neutral"}
        />
        <KpiCard
          label="Aktif pazar yeri listesi"
          value={String(listingCount)}
          sub="tüm platformlarda ACTIVE"
          tone="neutral"
        />
      </div>

      {/* ── Section 2: Exchange Rate + Capital ── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label={`USD/TRY kuru${rateLabel ? ` (${rateLabel})` : ""}`}
          value={rate != null ? rate.toFixed(4) : "Girilmemiş"}
          sub={rate == null ? "Döviz Kurları sayfasından girin" : undefined}
          tone={rate != null ? "neutral" : "amber"}
        />
        <KpiCard
          label="Toplam sermaye (ayar)"
          value={totalCapital != null ? fmt(totalCapital) : "Girilmemiş"}
          sub={totalCapital == null ? "Sermaye sayfasından girin" : undefined}
          tone={totalCapital != null ? "neutral" : "amber"}
        />
        <KpiCard
          label="Tahmini serbest sermaye"
          value={deployable != null ? fmt(deployable) : "—"}
          sub={
            deployable != null
              ? `Toplam − stok (${fmt(totalStockValueTry)}) − rezerv`
              : undefined
          }
          tone={deployable != null && deployable > 0 ? "green" : "neutral"}
        />
      </div>

      {/* ── Section 3: Procurement Urgency ── */}
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
              Tedarik Aciliyeti
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">Stok Uyarıları</h2>
          </div>
          <div className="flex items-center gap-3">
            {urgentCount > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-right">
                <p className="text-xs text-red-700">Tahmini acil alım maliyeti</p>
                <p className="text-base font-bold text-red-900">{fmt(totalReorderCost)}</p>
              </div>
            )}
            <Link
              href="/admin/procurement"
              className="text-sm font-medium text-slate-500 hover:text-slate-900"
            >
              Tedarik Asistanı →
            </Link>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <UrgencyPill label="KRİTİK" count={urgencyCounts.CRITICAL} tone="red" />
          <UrgencyPill label="YÜKSEK" count={urgencyCounts.HIGH} tone="orange" />
          <UrgencyPill label="ORTA" count={urgencyCounts.MEDIUM} tone="amber" />
          <UrgencyPill label="DÜŞÜK" count={urgencyCounts.LOW} tone="blue" />
          <UrgencyPill label="YETERLİ" count={urgencyCounts.OK} tone="green" />
          <UrgencyPill label="VERİ YOK" count={urgencyCounts.UNKNOWN} tone="slate" />
        </div>
      </Card>

      {/* ── Section 4: Profitability Top 5 ── */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
              Kârlılık
            </p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">
              En Kârlı 5 Ürün (Pazar Yeri)
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {losingProductCount > 0 && (
              <Badge tone="danger">
                {losingProductCount} ürün zarar ediyor
              </Badge>
            )}
            <Link
              href="/marketplace/profit"
              className="text-sm font-medium text-slate-500 hover:text-slate-900"
            >
              Pazar Kârlılığı →
            </Link>
          </div>
        </div>

        {top5Marketplace.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-widest text-slate-500">
                  <th className="px-6 py-3 text-left">Ürün</th>
                  <th className="px-4 py-3 text-right">Pazar Yeri Marjı</th>
                  <th className="px-4 py-3 text-right">Perakende Marjı</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {top5Marketplace.map((p, i) => {
                  const mpColor =
                    p.marketplaceMargin == null
                      ? "text-slate-400"
                      : p.marketplaceMargin >= 25
                        ? "text-emerald-700 font-semibold"
                        : p.marketplaceMargin >= 10
                          ? "text-amber-700 font-semibold"
                          : "text-red-700 font-semibold";
                  const rtColor =
                    p.retailMargin == null
                      ? "text-slate-400"
                      : p.retailMargin >= 25
                        ? "text-emerald-700 font-semibold"
                        : p.retailMargin >= 10
                          ? "text-amber-700 font-semibold"
                          : "text-red-700 font-semibold";
                  return (
                    <tr
                      key={p.id}
                      className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}
                    >
                      <td className="px-6 py-3">
                        <p className="font-medium text-slate-900">{p.name}</p>
                        {p.sku && (
                          <p className="font-mono text-xs text-slate-400">{p.sku}</p>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums ${mpColor}`}>
                        {p.marketplaceMargin != null ? fmtPct(p.marketplaceMargin) : "—"}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums ${rtColor}`}>
                        {p.retailMargin != null ? fmtPct(p.retailMargin) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-8 text-center text-sm text-slate-400">
            Kârlılık verisi hesaplamak için ürünlere fiyat ve maliyet bilgisi girilmesi gerekir.
          </div>
        )}
      </Card>

      {/* ── Footer links ── */}
      <div className="flex flex-wrap gap-4 text-xs text-slate-400">
        <Link href="/admin/capital" className="hover:text-slate-700">
          Sermaye Dağılımı →
        </Link>
        <Link href="/admin/procurement" className="hover:text-slate-700">
          Tedarik Asistanı →
        </Link>
        <Link href="/admin/import-calculator" className="hover:text-slate-700">
          İthalat Hesaplayıcısı →
        </Link>
        <Link href="/marketplace/profit" className="hover:text-slate-700">
          Pazar Kârlılığı →
        </Link>
        <Link href="/admin/exchange-rates" className="hover:text-slate-700">
          Döviz Kurları →
        </Link>
      </div>
    </div>
  );
}

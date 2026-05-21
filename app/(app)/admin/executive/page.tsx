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
import { BarChart3 } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { calculateProfitability } from "@/lib/profitability";
import { calculateProcurement } from "@/lib/procurement";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";

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
  const valueColor =
    tone === "green"
      ? "text-[var(--ok)]"
      : tone === "amber"
        ? "text-[var(--warn)]"
        : tone === "red"
          ? "text-[var(--danger)]"
          : "text-[var(--text-primary)]";

  return (
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-4">
      <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
        {label}
      </p>
      <p className={`mt-2 text-[28px] font-semibold tabular-nums leading-tight ${valueColor}`}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-[var(--text-muted)]">{sub}</p>}
    </div>
  );
}

// ─── Urgency Pill ─────────────────────────────────────────────────────────────

function UrgencyPill({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "red" | "orange" | "amber" | "blue" | "green" | "slate";
}) {
  const valueColor: Record<string, string> = {
    red: "text-[var(--danger)]",
    orange: "text-[var(--warn)]",
    amber: "text-[var(--warn)]",
    blue: "text-[var(--info)]",
    green: "text-[var(--ok)]",
    slate: "text-[var(--text-secondary)]",
  };
  return (
    <div className="flex items-center justify-between rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-4 py-3">
      <span className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
        {label}
      </span>
      <span className={`text-lg font-semibold tabular-nums ${valueColor[tone]}`}>{count}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ExecutivePage() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  // ── 90-day window ────────────────────────────────────────────────────────
  const since90 = new Date();
  since90.setDate(since90.getDate() - 90);

  // ── Fetch all data in parallel ────────────────────────────────────────────
  const [products, capitalConfig, latestRate, listingCount, salesRecords90d] = await Promise.all([
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
    prisma.trendyolSalesRecord.findMany({
      where: { orderDate: { gte: since90 } },
      select: {
        productId: true,
        status: true,
        quantity: true,
        totalPriceTry: true,
        product: { select: { name: true, sku: true } },
      },
    }),
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

  // ── Trendyol 90-day Sales ─────────────────────────────────────────────────
  function isCancelledStatus(s: string | null) {
    if (!s) return false;
    const lower = s.toLowerCase();
    return lower.includes("iptal") || lower.includes("cancel");
  }

  const activeSales90d = salesRecords90d.filter((r) => !isCancelledStatus(r.status));
  const totalRevenue90d = activeSales90d.reduce((sum, r) => sum + Number(r.totalPriceTry), 0);
  const unmatchedCount90d = activeSales90d.filter((r) => !r.productId).length;

  const revenueByProduct = new Map<
    string,
    { name: string; sku: string | null; revenue: number }
  >();
  for (const r of activeSales90d) {
    if (!r.productId || !r.product) continue;
    const cur = revenueByProduct.get(r.productId);
    if (cur) {
      cur.revenue += Number(r.totalPriceTry);
    } else {
      revenueByProduct.set(r.productId, {
        name: r.product.name,
        sku: r.product.sku ?? null,
        revenue: Number(r.totalPriceTry),
      });
    }
  }
  const top5Revenue90d = [...revenueByProduct.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
  const distinctProducts90d = revenueByProduct.size;

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
      <PageHeader
        icon={BarChart3}
        breadcrumb={[{ label: "Günlük Durum" }, { label: "Yönetici Paneli" }]}
        title="Yönetici Paneli"
        subtitle="Stok değeri, kârlılık, tedarik aciliyeti ve sermaye durumunun anlık özeti."
      />

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

      {/* ── Section 3: Trendyol 90-day Revenue ── */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-default)] px-6 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
              Trendyol / Son 90 Gün
            </p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
              Gerçekleşen Satış Özeti
            </h2>
          </div>
          <Link
            href="/marketplace/realized-margin"
            className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Gerçekleşen Marj →
          </Link>
        </div>

        <div className="grid gap-4 p-6 sm:grid-cols-3">
          <KpiCard
            label="Toplam Ciro (90G)"
            value={totalRevenue90d > 0 ? fmt(totalRevenue90d) : "Veri yok"}
            sub={`${activeSales90d.length} satır (iptal hariç)`}
            tone={totalRevenue90d > 0 ? "dark" : "neutral"}
          />
          <KpiCard
            label="Eşleşen Ürün Çeşidi"
            value={String(distinctProducts90d)}
            sub="productId bağlı kayıtlar"
            tone="neutral"
          />
          <KpiCard
            label="Eşleşmemiş Kayıt"
            value={String(unmatchedCount90d)}
            sub="ürün bağlantısı eksik"
            tone={unmatchedCount90d > 50 ? "amber" : unmatchedCount90d === 0 ? "green" : "neutral"}
          />
        </div>

        {top5Revenue90d.length > 0 && (
          <div className="border-t border-[var(--border-default)]">
            <p className="px-6 py-3 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
              En Yüksek Ciro — Top 5 (90G)
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-default)] bg-[var(--surface-1)] text-[11px] uppercase tracking-wider font-medium text-[var(--text-muted)]">
                    <th className="px-6 py-3 text-left">Ürün</th>
                    <th className="px-4 py-3 text-right">Ciro (90G)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-subtle)]">
                  {top5Revenue90d.map((p, i) => (
                    <tr key={i} className="hover:bg-[var(--surface-3)] transition">
                      <td className="px-6 py-3">
                        <p className="font-medium text-[var(--text-primary)]">{p.name}</p>
                        {p.sku && (
                          <p className="font-mono text-xs text-[var(--text-muted)]">{p.sku}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-mono font-semibold text-[var(--ok)]">
                        {fmt(p.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {top5Revenue90d.length === 0 && (
          <div className="border-t border-[var(--border-default)] px-6 py-6 text-center text-sm text-[var(--text-muted)]">
            90 günlük Trendyol satış verisi bulunamadı. Ürün Performansı sayfasından senkronize edin.
          </div>
        )}
      </Card>

      {/* ── Section 4: Procurement Urgency ── */}
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
              Tedarik Aciliyeti
            </p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">Stok Uyarıları</h2>
          </div>
          <div className="flex items-center gap-3">
            {urgentCount > 0 && (
              <div className="rounded-md border border-[var(--danger-border)] bg-[var(--danger-dim)] px-4 py-2 text-right">
                <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                  Tahmini acil alım maliyeti
                </p>
                <p className="text-base font-semibold tabular-nums text-[var(--danger)]">
                  {fmt(totalReorderCost)}
                </p>
              </div>
            )}
            <Link
              href="/admin/procurement"
              className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
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

      {/* ── Section 5: Profitability Top 5 ── */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-default)] px-6 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
              Kârlılık
            </p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
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
              className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Pazar Kârlılığı →
            </Link>
          </div>
        </div>

        {top5Marketplace.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--surface-1)] text-[11px] uppercase tracking-wider font-medium text-[var(--text-muted)]">
                  <th className="px-6 py-3 text-left">Ürün</th>
                  <th className="px-4 py-3 text-right">Pazar Yeri Marjı</th>
                  <th className="px-4 py-3 text-right">Perakende Marjı</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {top5Marketplace.map((p) => {
                  const mpColor =
                    p.marketplaceMargin == null
                      ? "text-[var(--text-muted)]"
                      : p.marketplaceMargin >= 25
                        ? "text-[var(--ok)] font-semibold"
                        : p.marketplaceMargin >= 10
                          ? "text-[var(--warn)] font-semibold"
                          : "text-[var(--danger)] font-semibold";
                  const rtColor =
                    p.retailMargin == null
                      ? "text-[var(--text-muted)]"
                      : p.retailMargin >= 25
                        ? "text-[var(--ok)] font-semibold"
                        : p.retailMargin >= 10
                          ? "text-[var(--warn)] font-semibold"
                          : "text-[var(--danger)] font-semibold";
                  return (
                    <tr
                      key={p.id}
                      className="hover:bg-[var(--surface-3)] transition"
                    >
                      <td className="px-6 py-3">
                        <p className="font-medium text-[var(--text-primary)]">{p.name}</p>
                        {p.sku && (
                          <p className="font-mono text-xs text-[var(--text-muted)]">{p.sku}</p>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums font-mono ${mpColor}`}>
                        {p.marketplaceMargin != null ? fmtPct(p.marketplaceMargin) : "—"}
                      </td>
                      <td className={`px-4 py-3 text-right tabular-nums font-mono ${rtColor}`}>
                        {p.retailMargin != null ? fmtPct(p.retailMargin) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-8 text-center text-sm text-[var(--text-muted)]">
            Kârlılık verisi hesaplamak için ürünlere fiyat ve maliyet bilgisi girilmesi gerekir.
          </div>
        )}
      </Card>

      {/* ── Footer links ── */}
      <div className="flex flex-wrap gap-4 text-xs text-[var(--text-muted)]">
        <Link href="/admin/capital" className="hover:text-[var(--text-primary)]">
          Sermaye Dağılımı →
        </Link>
        <Link href="/admin/procurement" className="hover:text-[var(--text-primary)]">
          Tedarik Asistanı →
        </Link>
        <Link href="/admin/import-calculator" className="hover:text-[var(--text-primary)]">
          İthalat Hesaplayıcısı →
        </Link>
        <Link href="/marketplace/profit" className="hover:text-[var(--text-primary)]">
          Pazar Kârlılığı →
        </Link>
        <Link href="/marketplace/realized-margin" className="hover:text-[var(--text-primary)]">
          Gerçekleşen Marj →
        </Link>
        <Link href="/admin/exchange-rates" className="hover:text-[var(--text-primary)]">
          Döviz Kurları →
        </Link>
      </div>
    </div>
  );
}

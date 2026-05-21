/**
 * Phase 63 — Trendyol Aylık Satış Raporu
 *
 * Last-12-months breakdown of Trendyol orders, revenue, returns, and match rate.
 * Current-month (last 30 days) KPI cards + top-10 matched products by revenue.
 * EXECUTIVE_READ gated. No schema change — uses TrendyolSalesRecord + TrendyolReturnRecord.
 */

import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

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

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  const names = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
  return `${names[month - 1]} ${year}`;
}

function isCancelled(status: string) {
  const s = status.toLowerCase();
  return s.includes("cancel") || s.includes("iptal");
}

function toMonthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

type MonthData = {
  totalOrders: number;
  totalUnits: number;
  grossRevenue: number;
  matchedOrders: number;
  returnCount: number;
  returnValue: number;
};

export default async function TrendyolReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  const params = await searchParams;
  // Phase 70 — month drill-down (e.g. ?month=2026-05)
  const selectedMonth = typeof params.month === "string" ? params.month : null;

  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [salesRecords, returnRecords] = await Promise.all([
    prisma.trendyolSalesRecord.findMany({
      where: { orderDate: { gte: oneYearAgo } },
      select: {
        orderDate: true,
        quantity: true,
        totalPriceTry: true,
        status: true,
        productId: true,
      },
    }),
    prisma.trendyolReturnRecord.findMany({
      where: { claimDate: { gte: oneYearAgo } },
      select: {
        claimDate: true,
        unitPriceTry: true,
        productId: true,
      },
    }),
  ]);

  // ── Monthly aggregation ───────────────────────────────────────────────────
  const monthMap = new Map<string, MonthData>();

  const ensureMonth = (key: string): MonthData => {
    if (!monthMap.has(key)) {
      monthMap.set(key, {
        totalOrders: 0,
        totalUnits: 0,
        grossRevenue: 0,
        matchedOrders: 0,
        returnCount: 0,
        returnValue: 0,
      });
    }
    return monthMap.get(key)!;
  };

  for (const r of salesRecords) {
    if (isCancelled(r.status)) continue;
    const m = ensureMonth(toMonthKey(r.orderDate));
    m.totalOrders++;
    m.totalUnits += r.quantity;
    m.grossRevenue += Number(r.totalPriceTry);
    if (r.productId) m.matchedOrders++;
  }

  for (const r of returnRecords) {
    const m = ensureMonth(toMonthKey(r.claimDate));
    m.returnCount++;
    m.returnValue += Number(r.unitPriceTry);
  }

  // Last 12 months descending
  const months = [...monthMap.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 12);

  // ── Current period (last 30 days) KPIs ───────────────────────────────────
  const recentSales = salesRecords.filter(
    (r) => !isCancelled(r.status) && r.orderDate >= thirtyDaysAgo,
  );
  const recentReturns = returnRecords.filter((r) => r.claimDate >= thirtyDaysAgo);

  const kpiOrders = recentSales.length;
  const kpiUnits = recentSales.reduce((s, r) => s + r.quantity, 0);
  const kpiGross = recentSales.reduce((s, r) => s + Number(r.totalPriceTry), 0);
  const kpiReturnCount = recentReturns.length;
  const kpiReturnValue = recentReturns.reduce((s, r) => s + Number(r.unitPriceTry), 0);
  const kpiNet = kpiGross - kpiReturnValue;
  const kpiMatchedOrders = recentSales.filter((r) => r.productId).length;
  const kpiMatchPct = kpiOrders > 0 ? (kpiMatchedOrders / kpiOrders) * 100 : 0;

  // Phase 70 — Drill-down: filter to selected month if set
  const drillSales = selectedMonth
    ? salesRecords.filter((r) => !isCancelled(r.status) && toMonthKey(r.orderDate) === selectedMonth)
    : recentSales;
  const drillLabel = selectedMonth ? monthLabel(selectedMonth) : "Son 30 Gün";

  // ── Top 10 products (drill period, matched only) ───────────────────────────
  const productRevMap = new Map<string, number>();
  for (const r of drillSales) {
    if (!r.productId) continue;
    productRevMap.set(r.productId, (productRevMap.get(r.productId) ?? 0) + Number(r.totalPriceTry));
  }
  const topIds = [...productRevMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([id]) => id);

  const topProducts =
    topIds.length > 0
      ? await prisma.product.findMany({
          where: { id: { in: topIds } },
          select: { id: true, name: true, sku: true },
        })
      : [];

  const topRows = topIds.map((id) => ({
    product: topProducts.find((p) => p.id === id),
    revenue: productRevMap.get(id) ?? 0,
  }));

  const kpis = [
    { label: "Sipariş", value: kpiOrders.toString(), tone: "default" },
    { label: "Adet", value: kpiUnits.toString(), tone: "default" },
    { label: "Brüt Ciro", value: fmt(kpiGross), tone: "ok" },
    { label: "İade", value: kpiReturnCount.toString(), tone: "warn" },
    { label: "Net Ciro", value: fmt(kpiNet), tone: "info" },
    { label: "Eşleşme", value: fmtPct(kpiMatchPct), tone: kpiMatchPct >= 50 ? "ok" : "danger" },
  ];

  const toneClass: Record<string, string> = {
    ok: "text-[var(--ok)]",
    info: "text-[var(--info)]",
    warn: "text-[var(--warn)]",
    danger: "text-[var(--danger)]",
    default: "text-[var(--text-primary)]",
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            İthalat & Analiz / Trendyol Raporu
          </p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
            Trendyol Aylık Satış Raporu
          </h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Son 12 ay sipariş, ciro, iade ve eşleşme oranı özeti.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/orders">
            <Button variant="secondary">← Siparişler</Button>
          </Link>
        </div>
      </div>

      {/* KPI cards — last 30 days */}
      <div>
        <p className="mb-3 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
          Son 30 Gün
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {kpis.map(({ label, value, tone }) => (
            <Card key={label} className="p-4">
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
              <p className={`mt-1 text-lg font-semibold tabular-nums font-mono ${toneClass[tone]}`}>
                {value}
              </p>
            </Card>
          ))}
        </div>
      </div>

      {/* Monthly breakdown table */}
      <Card className="overflow-hidden">
        <div className="border-b border-[var(--border-subtle)] px-6 py-3.5">
          <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Aylık Özet (Son 12 Ay)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)] text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                <th className="px-4 py-2.5 text-left">Ay</th>
                <th className="px-4 py-2.5 text-right">Sipariş</th>
                <th className="px-4 py-2.5 text-right">Adet</th>
                <th className="px-4 py-2.5 text-right">Brüt Ciro</th>
                <th className="px-4 py-2.5 text-right">İade</th>
                <th className="px-4 py-2.5 text-right">İade Oranı</th>
                <th className="px-4 py-2.5 text-right">Net Ciro</th>
                <th className="px-4 py-2.5 text-right">Eşleşme</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-subtle)]">
              {months.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-[var(--text-muted)]">
                    Son 12 ayda kayıt yok.
                  </td>
                </tr>
              ) : (
                months.map(([key, d]) => {
                  const netRevenue = d.grossRevenue - d.returnValue;
                  const returnRate =
                    d.totalOrders > 0 ? (d.returnCount / d.totalOrders) * 100 : 0;
                  const matchRate =
                    d.totalOrders > 0 ? (d.matchedOrders / d.totalOrders) * 100 : 0;
                  const isSelected = key === selectedMonth;
                  return (
                    <tr
                      key={key}
                      className={isSelected
                        ? "bg-[var(--accent-dim)]"
                        : "hover:bg-[var(--surface-3)] cursor-pointer"}
                    >
                      <td className="px-4 py-2.5 font-medium">
                        <Link
                          href={isSelected ? "/admin/trendyol-report" : `/admin/trendyol-report?month=${key}`}
                          className={`hover:underline ${isSelected ? "text-[var(--accent)]" : "text-[var(--text-primary)]"}`}
                        >
                          {monthLabel(key)} {isSelected && <span className="ml-1 text-[10px] text-[var(--text-muted)]">▲ seçili</span>}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-mono text-[var(--text-secondary)]">
                        {d.totalOrders}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-mono text-[var(--text-secondary)]">
                        {d.totalUnits}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-mono font-medium text-[var(--text-primary)]">
                        {fmt(d.grossRevenue)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-mono text-[var(--text-muted)]">
                        {d.returnCount}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <span
                          className={`text-xs font-medium font-mono ${
                            returnRate > 15
                              ? "text-[var(--danger)]"
                              : returnRate > 8
                              ? "text-[var(--warn)]"
                              : "text-[var(--ok)]"
                          }`}
                        >
                          {fmtPct(returnRate)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-mono font-semibold text-[var(--ok)]">
                        {fmt(netRevenue)}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        <span
                          className={`text-xs font-medium font-mono ${
                            matchRate >= 70
                              ? "text-[var(--ok)]"
                              : matchRate >= 40
                              ? "text-[var(--warn)]"
                              : "text-[var(--danger)]"
                          }`}
                        >
                          {fmtPct(matchRate)}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {months.length > 0 && (
              <tfoot>
                <tr className="border-t border-[var(--border-default)] bg-[var(--surface-1)] text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                  <td className="px-4 py-3">Toplam</td>
                  <td className="px-4 py-3 text-right tabular-nums font-mono text-[var(--text-primary)] normal-case">
                    {months.reduce((s, [, d]) => s + d.totalOrders, 0)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-mono text-[var(--text-primary)] normal-case">
                    {months.reduce((s, [, d]) => s + d.totalUnits, 0)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-mono text-[var(--text-primary)] normal-case">
                    {fmt(months.reduce((s, [, d]) => s + d.grossRevenue, 0))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-mono text-[var(--text-primary)] normal-case">
                    {months.reduce((s, [, d]) => s + d.returnCount, 0)}
                  </td>
                  <td className="px-4 py-3 text-right">—</td>
                  <td className="px-4 py-3 text-right tabular-nums font-mono text-[var(--ok)] normal-case">
                    {fmt(months.reduce((s, [, d]) => s + d.grossRevenue - d.returnValue, 0))}
                  </td>
                  <td className="px-4 py-3 text-right">—</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* Top 10 products */}
      {topRows.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-[var(--border-subtle)] px-6 py-3.5 flex items-center justify-between">
            <div>
              <h2 className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                {drillLabel} — En Çok Ciro Yapan Ürünler
                <span className="ml-2 text-[10px] normal-case font-normal text-[var(--text-muted)]">
                  (eşleşmiş, iptal hariç)
                </span>
              </h2>
              {selectedMonth && (
                <Link
                  href="/admin/trendyol-report"
                  className="mt-1 inline-flex items-center text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  ← Son 30 güne dön
                </Link>
              )}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)] text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                  <th className="px-4 py-2.5 text-left">#</th>
                  <th className="px-4 py-2.5 text-left">Ürün</th>
                  <th className="px-4 py-2.5 text-right">Ciro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {topRows.map(({ product, revenue }, i) => (
                  <tr key={i} className="hover:bg-[var(--surface-3)]">
                    <td className="px-4 py-2.5 text-xs tabular-nums font-mono text-[var(--text-muted)]">{i + 1}</td>
                    <td className="px-4 py-2.5">
                      {product ? (
                        <Link
                          href={`/products/${product.id}`}
                          className="text-xs font-medium text-[var(--text-primary)] underline decoration-dotted hover:text-[var(--accent)]"
                        >
                          {product.name}
                          {product.sku && (
                            <span className="ml-1 font-mono text-[10px] text-[var(--text-muted)]">
                              {product.sku}
                            </span>
                          )}
                        </Link>
                      ) : (
                        <span className="text-xs text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono text-xs font-semibold text-[var(--ok)]">
                      {fmt(revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {topRows.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-sm text-[var(--text-muted)]">
            {drillLabel} döneminde eşleşmiş sipariş kaydı yok. Ürün eşleştirme sayfasını ziyaret edin.
          </p>
          <Link href="/admin/marketplace-mappings" className="mt-3 inline-block text-xs text-[var(--info)] underline">
            Ürün Eşleştirme →
          </Link>
        </Card>
      )}
    </div>
  );
}

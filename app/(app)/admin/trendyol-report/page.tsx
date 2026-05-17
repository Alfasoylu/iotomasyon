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

export default async function TrendyolReportPage() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

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

  // ── Top 10 products last 30 days (matched only) ───────────────────────────
  const productRevMap = new Map<string, number>();
  for (const r of recentSales) {
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            İthalat & Analiz / Trendyol Raporu
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Trendyol Aylık Satış Raporu
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Son 12 ay sipariş, ciro, iade ve eşleşme oranı özeti.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/orders">
            <Button variant="secondary">← Siparişler</Button>
          </Link>
        </div>
      </div>

      {/* KPI cards — last 30 days */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-slate-400">
          Son 30 Gün
        </p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Sipariş", value: kpiOrders.toString(), tone: "slate" },
            { label: "Adet", value: kpiUnits.toString(), tone: "slate" },
            { label: "Brüt Ciro", value: fmt(kpiGross), tone: "emerald" },
            { label: "İade", value: kpiReturnCount.toString(), tone: "amber" },
            { label: "Net Ciro", value: fmt(kpiNet), tone: "blue" },
            { label: "Eşleşme", value: fmtPct(kpiMatchPct), tone: kpiMatchPct >= 50 ? "emerald" : "red" },
          ].map(({ label, value, tone }) => (
            <Card key={label} className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
              <p
                className={`mt-1 text-xl font-semibold ${
                  tone === "emerald"
                    ? "text-emerald-700"
                    : tone === "blue"
                    ? "text-blue-700"
                    : tone === "amber"
                    ? "text-amber-700"
                    : tone === "red"
                    ? "text-red-600"
                    : "text-slate-800"
                }`}
              >
                {value}
              </p>
            </Card>
          ))}
        </div>
      </div>

      {/* Monthly breakdown table */}
      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-800">Aylık Özet (Son 12 Ay)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-widest text-slate-500">
                <th className="px-4 py-3 text-left">Ay</th>
                <th className="px-4 py-3 text-right">Sipariş</th>
                <th className="px-4 py-3 text-right">Adet</th>
                <th className="px-4 py-3 text-right">Brüt Ciro</th>
                <th className="px-4 py-3 text-right">İade</th>
                <th className="px-4 py-3 text-right">İade Oranı</th>
                <th className="px-4 py-3 text-right">Net Ciro</th>
                <th className="px-4 py-3 text-right">Eşleşme</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {months.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">
                    Son 12 ayda kayıt yok.
                  </td>
                </tr>
              ) : (
                months.map(([key, d], i) => {
                  const netRevenue = d.grossRevenue - d.returnValue;
                  const returnRate =
                    d.totalOrders > 0 ? (d.returnCount / d.totalOrders) * 100 : 0;
                  const matchRate =
                    d.totalOrders > 0 ? (d.matchedOrders / d.totalOrders) * 100 : 0;
                  return (
                    <tr
                      key={key}
                      className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}
                    >
                      <td className="px-4 py-3 font-medium text-slate-700">{monthLabel(key)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                        {d.totalOrders}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                        {d.totalUnits}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-700">
                        {fmt(d.grossRevenue)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                        {d.returnCount}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span
                          className={`text-xs font-medium ${
                            returnRate > 15
                              ? "text-red-600"
                              : returnRate > 8
                              ? "text-amber-600"
                              : "text-emerald-600"
                          }`}
                        >
                          {fmtPct(returnRate)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-emerald-700">
                        {fmt(netRevenue)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <span
                          className={`text-xs font-medium ${
                            matchRate >= 70
                              ? "text-emerald-600"
                              : matchRate >= 40
                              ? "text-amber-600"
                              : "text-red-500"
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
                <tr className="border-t-2 border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <td className="px-4 py-3">Toplam</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {months.reduce((s, [, d]) => s + d.totalOrders, 0)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {months.reduce((s, [, d]) => s + d.totalUnits, 0)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {fmt(months.reduce((s, [, d]) => s + d.grossRevenue, 0))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {months.reduce((s, [, d]) => s + d.returnCount, 0)}
                  </td>
                  <td className="px-4 py-3 text-right">—</td>
                  <td className="px-4 py-3 text-right tabular-nums text-emerald-700">
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
          <div className="border-b border-slate-100 px-6 py-4">
            <h2 className="text-sm font-semibold text-slate-800">
              Son 30 Gün — En Çok Ciro Yapan Ürünler
              <span className="ml-2 text-xs font-normal text-slate-400">
                (eşleşmiş, iptal hariç)
              </span>
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-widest text-slate-500">
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Ürün</th>
                  <th className="px-4 py-3 text-right">Ciro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topRows.map(({ product, revenue }, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                    <td className="px-4 py-3 text-xs text-slate-400">{i + 1}</td>
                    <td className="px-4 py-3">
                      {product ? (
                        <Link
                          href={`/products/${product.id}`}
                          className="text-xs font-medium text-slate-800 underline decoration-dotted hover:text-slate-950"
                        >
                          {product.name}
                          {product.sku && (
                            <span className="ml-1 font-mono text-[10px] text-slate-400">
                              {product.sku}
                            </span>
                          )}
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-xs font-semibold text-emerald-700">
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
          <p className="text-sm text-slate-400">
            Son 30 günde eşleşmiş sipariş kaydı yok. Ürün eşleştirme sayfasını ziyaret edin.
          </p>
          <Link href="/admin/marketplace-mappings" className="mt-3 inline-block text-xs text-blue-600 underline">
            Ürün Eşleştirme →
          </Link>
        </Card>
      )}
    </div>
  );
}

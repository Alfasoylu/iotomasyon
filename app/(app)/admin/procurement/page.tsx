/**
 * Phase 19 / Phase 39 — Procurement Intelligence Engine
 *
 * Phase 39 enhancement: integrates real 30-day Trendyol sales velocity
 * (TrendyolSalesRecord) as the demand input where available, falling back
 * to manual onlineSalesPotential estimates when no matched sales data exists.
 *
 * velocitySource per product:
 *   "actual"    — demand driven by real Trendyol 30-day sales (non-cancelled, matched)
 *   "estimated" — demand driven by manual onlineSalesPotential / wholesaleSalesPotential
 *   "none"      — no demand data at all → UNKNOWN urgency
 *
 * No schema changes — reads existing TrendyolSalesRecord (Phase 26).
 */

import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { calculateProcurement, urgencyRank, URGENCY_LABELS, URGENCY_TONES, type ReorderUrgency } from "@/lib/procurement";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

function fmtTry(n: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDays(d: number | null): string {
  if (d === null) return "—";
  if (d < 1) return "< 1 gün";
  return `${Math.round(d)} gün`;
}

function isCancelledStatus(s: string | null) {
  if (!s) return false;
  const lower = s.toLowerCase();
  return lower.includes("iptal") || lower.includes("cancel");
}

export default async function ProcurementPage() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);

  // Fetch products and 30-day sales in parallel
  const [products, salesRecords30d] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        sku: true,
        stockQuantity: true,
        minimumStock: true,
        reorderLeadTime: true,
        unitCostTry: true,
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
      orderBy: [{ name: "asc" }],
    }),
    prisma.trendyolSalesRecord.findMany({
      where: {
        productId: { not: null },
        orderDate: { gte: since30 },
      },
      select: { productId: true, quantity: true, status: true },
    }),
  ]);

  // Build actual 30-day sales qty per product (non-cancelled, matched)
  const actualSales30d = new Map<string, number>();
  for (const r of salesRecords30d) {
    if (!r.productId || isCancelledStatus(r.status)) continue;
    actualSales30d.set(r.productId, (actualSales30d.get(r.productId) ?? 0) + (r.quantity ?? 1));
  }

  type VelocitySource = "actual" | "estimated" | "none";

  type ProcurementRow = {
    id: string;
    name: string;
    sku: string | null;
    stock: number;
    urgency: ReorderUrgency;
    daysRemaining: number | null;
    leadTimeDays: number;
    suggestedQty: number;
    suggestedCost: number;
    monthlyProfit: number;
    score: number;
    monthlyUnits: number;
    actualSalesQty: number | null; // real Trendyol 30d qty if available
    velocitySource: VelocitySource;
  };

  const rows: ProcurementRow[] = products.map((p) => {
    const actualQty = actualSales30d.get(p.id) ?? null;

    // Determine effective onlineSalesPotential: actual data overrides manual estimate
    const effectiveOnlinePotential = actualQty !== null ? actualQty : p.onlineSalesPotential;

    const hasAnyDemand =
      actualQty !== null ||
      (p.onlineSalesPotential ?? 0) > 0 ||
      (p.wholesaleSalesPotential ?? 0) > 0 ||
      (p.installerSalesPotential ?? 0) > 0;

    const velocitySource: VelocitySource =
      actualQty !== null ? "actual" :
      hasAnyDemand ? "estimated" :
      "none";

    const result = calculateProcurement({
      unitCostTry: p.unitCostTry != null ? Number(p.unitCostTry) : null,
      sellingPriceTry: p.sellingPriceTry != null ? Number(p.sellingPriceTry) : null,
      wholesalePriceTry: p.wholesalePriceTry != null ? Number(p.wholesalePriceTry) : null,
      marketplacePriceTry: p.marketplacePriceTry != null ? Number(p.marketplacePriceTry) : null,
      shippingCost: p.shippingCost != null ? Number(p.shippingCost) : null,
      shippingCostOverride: p.shippingCostOverride != null ? Number(p.shippingCostOverride) : null,
      marketplaceCommission: p.marketplaceCommission != null ? Number(p.marketplaceCommission) : null,
      marketplaceCommissionOverride: p.marketplaceCommissionOverride != null ? Number(p.marketplaceCommissionOverride) : null,
      packagingCost: p.packagingCost != null ? Number(p.packagingCost) : null,
      vatRate: p.vatRate != null ? Number(p.vatRate) : null,
      paymentFeeRate: p.paymentFeeRate != null ? Number(p.paymentFeeRate) : null,
      returnReserveRate: p.returnReserveRate != null ? Number(p.returnReserveRate) : null,
      onlineSalesPotential: effectiveOnlinePotential,
      wholesaleSalesPotential: p.wholesaleSalesPotential,
      installerSalesPotential: p.installerSalesPotential,
      stockQuantity: p.stockQuantity,
      minimumStock: p.minimumStock,
      reorderLeadTime: p.reorderLeadTime,
    });

    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      stock: p.stockQuantity,
      urgency: result.reorderUrgency,
      daysRemaining: result.daysOfStockRemaining,
      leadTimeDays: p.reorderLeadTime ?? 0,
      suggestedQty: result.suggestedOrderQty,
      suggestedCost: result.suggestedOrderCost,
      monthlyProfit: result.projectedMonthlyProfit,
      score: result.investmentScore,
      monthlyUnits: result.totalMonthlyUnits,
      actualSalesQty: actualQty,
      velocitySource,
    };
  });

  // Sort: urgency rank ASC, then investment score DESC
  const sorted = [...rows].sort((a, b) => {
    const ur = urgencyRank(a.urgency) - urgencyRank(b.urgency);
    if (ur !== 0) return ur;
    return b.score - a.score;
  });

  // Filter actionable: CRITICAL, HIGH, MEDIUM, LOW (exclude OK and UNKNOWN from main list)
  const actionable = sorted.filter((r) => r.urgency !== "OK" && r.urgency !== "UNKNOWN");
  const okRows = sorted.filter((r) => r.urgency === "OK");

  // Summary counts
  const criticalCount = rows.filter((r) => r.urgency === "CRITICAL").length;
  const highCount = rows.filter((r) => r.urgency === "HIGH").length;
  const mediumCount = rows.filter((r) => r.urgency === "MEDIUM").length;
  const lowCount = rows.filter((r) => r.urgency === "LOW").length;
  const unknownCount = rows.filter((r) => r.urgency === "UNKNOWN").length;
  const actualDataCount = rows.filter((r) => r.velocitySource === "actual").length;

  const totalSuggestedCost = actionable.reduce((s, r) => s + r.suggestedCost, 0);
  const totalMonthlyProfit = actionable
    .filter((r) => r.urgency === "CRITICAL" || r.urgency === "HIGH")
    .reduce((s, r) => s + r.monthlyProfit, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="overflow-hidden rounded-3xl bg-slate-950">
        <div className="h-1 bg-orange-500" />
        <div className="px-6 py-8 xl:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Yönetim
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                Tedarik Asistanı
              </h1>
              <p className="mt-2 text-sm text-slate-400">
                Stok aciliyetine ve yatırım skoruna göre sıralanmış satın alma önerileri.
                {actualDataCount > 0 && (
                  <span className="ml-2 text-emerald-400">
                    {actualDataCount} üründe gerçek Trendyol satış hızı kullanılıyor.
                  </span>
                )}
              </p>
            </div>
            <Link
              href="/admin/capital"
              className="text-sm font-medium text-slate-400 transition hover:text-white"
            >
              ← Sermaye
            </Link>
          </div>
        </div>
      </div>

      {/* Data coverage notice */}
      {actualDataCount > 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <p className="text-sm text-emerald-800">
            <span className="font-semibold">Gerçek Satış Verisi Aktif:</span>{" "}
            {actualDataCount} ürün için son 30 günlük Trendyol sipariş verisi talep tahmini olarak kullanılıyor.
            Kalan {rows.length - actualDataCount} ürün için manuel tahmin veya veri yok.
          </p>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <SummaryCard label="KRİTİK" value={criticalCount} tone="danger" />
        <SummaryCard label="YÜKSEK ACİLİYET" value={highCount} tone="danger" />
        <SummaryCard label="ORTA ACİLİYET" value={mediumCount} tone="warning" />
        <SummaryCard label="DÜŞÜK ACİLİYET" value={lowCount} tone="warning" />
        <SummaryCard label="VERİ YOK" value={unknownCount} tone="default" />
      </div>

      {/* Financial summary */}
      {actionable.length > 0 ? (
        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Mali Özet</p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">Tahmini Alım Bütçesi</h2>
          </div>
          <div className="grid divide-y divide-slate-100 sm:grid-cols-3 sm:divide-x sm:divide-y-0 px-6 py-5 gap-4 sm:gap-0">
            <div className="sm:pr-6">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Toplam Önerilen Alım</p>
              <p className="mt-1 text-2xl font-bold text-slate-950">{fmtTry(totalSuggestedCost)}</p>
              <p className="mt-1 text-xs text-slate-400">KRİTİK + YÜKSEK + ORTA + DÜŞÜK aciliyetli ürünler için</p>
            </div>
            <div className="sm:px-6">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Kritik+Yüksek Aylık Kâr</p>
              <p className="mt-1 text-2xl font-bold text-emerald-600">{fmtTry(totalMonthlyProfit)}</p>
              <p className="mt-1 text-xs text-slate-400">Satış gerçekleşirse tahmini aylık net kâr</p>
            </div>
            <div className="sm:pl-6">
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Aksiyon Gerektiren</p>
              <p className="mt-1 text-2xl font-bold text-slate-950">{actionable.length}</p>
              <p className="mt-1 text-xs text-slate-400">ürün önerilen alım listesinde</p>
            </div>
          </div>
          <div className="border-t border-amber-100 bg-amber-50 px-6 py-3">
            <p className="text-xs text-amber-700">
              ⚠ Bu liste öneridir — satın alma kararı vermez. Tedarikçi teklifi ve stok doğrulaması yapılmadan alım yapmayın.
            </p>
          </div>
        </Card>
      ) : null}

      {/* Actionable products table */}
      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-5">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Aciliyet Sıralaması ({actionable.length} ürün)
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-950">Satın Alma Önerileri</h2>
        </div>

        {actionable.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-slate-500">
              Şu anda acil tedarik gerektiren ürün yok.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Ürünlerin stok, talep ve tedarik süresi verilerini doldurun.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Ürün</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Aciliyet</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Stok</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Kalan Süre</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Tedarik Süresi</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Aylık Talep</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Hız Kaynağı</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">T30G Satış</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Önerilen Adet</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Tahmini Maliyet</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Skor</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {actionable.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{row.name}</p>
                      {row.sku ? <p className="text-xs text-slate-400">{row.sku}</p> : null}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge tone={URGENCY_TONES[row.urgency]}>
                        {URGENCY_LABELS[row.urgency]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-slate-700">{row.stock}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={row.daysRemaining !== null && row.daysRemaining <= (row.leadTimeDays * 1.5) ? "font-semibold text-red-600" : "text-slate-700"}>
                        {fmtDays(row.daysRemaining)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">
                      {row.leadTimeDays > 0 ? `${row.leadTimeDays} gün` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">{row.monthlyUnits} adet/ay</td>
                    <td className="px-4 py-3 text-center">
                      {row.velocitySource === "actual" ? (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                          Gerçek
                        </span>
                      ) : row.velocitySource === "estimated" ? (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                          Tahmin
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          Veri Yok
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                      {row.actualSalesQty !== null ? `${row.actualSalesQty} adet` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {row.suggestedQty > 0 ? `${row.suggestedQty} adet` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {row.suggestedCost > 0 ? fmtTry(row.suggestedCost) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`text-sm font-bold ${row.score >= 60 ? "text-emerald-600" : row.score >= 30 ? "text-amber-600" : "text-slate-500"}`}>
                        {row.score}/100
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/products/${row.id}`}
                        className="text-xs font-medium text-slate-500 hover:text-slate-900"
                      >
                        Detay →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* OK products (adequately stocked) */}
      {okRows.length > 0 ? (
        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 px-6 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
              Stok Durumu Yeterli ({okRows.length} ürün)
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-950">Aksiyon Gerekmeyenler</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {okRows.map((row) => (
              <div key={row.id} className="flex items-center justify-between px-6 py-3">
                <div>
                  <span className="font-medium text-slate-800">{row.name}</span>
                  {row.sku ? <span className="ml-2 text-xs text-slate-400">{row.sku}</span> : null}
                </div>
                <div className="flex items-center gap-4 text-sm text-slate-500">
                  <span>{row.stock} adet stok</span>
                  <span>{fmtDays(row.daysRemaining)}</span>
                  {row.velocitySource === "actual" && (
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                      Gerçek ({row.actualSalesQty} T30G)
                    </span>
                  )}
                  <Badge tone="success">YETERLİ</Badge>
                  <Link href={`/products/${row.id}`} className="text-xs text-slate-400 hover:text-slate-700">Detay →</Link>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "danger" | "warning" | "success" | "default";
}) {
  const bg = {
    danger: "bg-red-50 border-red-100",
    warning: "bg-amber-50 border-amber-100",
    success: "bg-emerald-50 border-emerald-100",
    default: "bg-slate-50 border-slate-200",
  }[tone];

  const text = {
    danger: "text-red-700",
    warning: "text-amber-700",
    success: "text-emerald-700",
    default: "text-slate-600",
  }[tone];

  const num = {
    danger: "text-red-900",
    warning: "text-amber-900",
    success: "text-emerald-900",
    default: "text-slate-800",
  }[tone];

  return (
    <div className={`rounded-2xl border p-5 ${bg}`}>
      <p className={`text-xs font-semibold uppercase tracking-wider ${text}`}>{label}</p>
      <p className={`mt-2 text-4xl font-bold ${num}`}>{value}</p>
    </div>
  );
}

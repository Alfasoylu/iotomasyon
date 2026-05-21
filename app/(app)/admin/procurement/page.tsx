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
import { Truck, AlertTriangle } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { calculateProcurement, urgencyRank, URGENCY_LABELS, URGENCY_TONES, type ReorderUrgency } from "@/lib/procurement";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";

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

    // Pazar yeri kanalı demand: Trendyol 30g VEYA manuel onlineSalesPotential —
    // büyük olanı al. Manuel tahmin Trendyol'dan büyükse devre dışı kalmıyor.
    const manualOnline = p.onlineSalesPotential ?? 0;
    const trendyolOnline = actualQty ?? 0;
    const maxOnline = Math.max(trendyolOnline, manualOnline);
    const effectiveOnlinePotential = maxOnline > 0 ? maxOnline : null;

    const hasAnyDemand =
      maxOnline > 0 ||
      (p.wholesaleSalesPotential ?? 0) > 0 ||
      (p.installerSalesPotential ?? 0) > 0;

    // velocitySource: hangi sinyal galip geldi?
    const velocitySource: VelocitySource =
      trendyolOnline > 0 && trendyolOnline >= manualOnline ? "actual" :
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
      <PageHeader
        icon={Truck}
        breadcrumb={[{ label: "Yönetim" }, { label: "Tedarik Asistanı" }]}
        title="Tedarik Asistanı"
        subtitle="Stok aciliyetine ve yatırım skoruna göre sıralanmış satın alma önerileri."
        meta={
          actualDataCount > 0 ? (
            <Badge variant="ok">
              {actualDataCount} üründe gerçek Trendyol satış hızı
            </Badge>
          ) : null
        }
        actions={
          <Link
            href="/admin/capital"
            className="inline-flex h-8 items-center rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 text-[12px] font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)]"
          >
            ← Sermaye
          </Link>
        }
      />

      {/* Data coverage notice */}
      {actualDataCount > 0 && (
        <div className="rounded-lg border border-[var(--ok-border)] bg-[var(--ok-dim)] px-5 py-4">
          <p className="text-sm text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--ok)]">Gerçek Satış Verisi Aktif:</span>{" "}
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
          <div className="border-b border-[var(--border-subtle)] px-6 py-4">
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Mali Özet · Tahmini Alım Bütçesi</p>
          </div>
          <div className="grid gap-4 divide-y divide-[var(--border-subtle)] px-6 py-5 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-y-0">
            <div className="sm:pr-6">
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Toplam Önerilen Alım</p>
              <p className="mt-2 font-mono text-[22px] font-semibold tabular-nums text-[var(--text-primary)]">{fmtTry(totalSuggestedCost)}</p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">KRİTİK + YÜKSEK + ORTA + DÜŞÜK aciliyetli ürünler için</p>
            </div>
            <div className="sm:px-6">
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Kritik+Yüksek Aylık Kâr</p>
              <p className="mt-2 font-mono text-[22px] font-semibold tabular-nums text-[var(--ok)]">{fmtTry(totalMonthlyProfit)}</p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">Satış gerçekleşirse tahmini aylık net kâr</p>
            </div>
            <div className="sm:pl-6">
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Aksiyon Gerektiren</p>
              <p className="mt-2 font-mono text-[22px] font-semibold tabular-nums text-[var(--text-primary)]">{actionable.length}</p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">ürün önerilen alım listesinde</p>
            </div>
          </div>
          <div className="flex items-center gap-2 border-t border-[var(--warn-border)] bg-[var(--warn-dim)] px-6 py-3">
            <AlertTriangle size={14} strokeWidth={1.5} className="flex-shrink-0 text-[var(--warn)]" />
            <p className="text-xs text-[var(--warn)]">
              Bu liste öneridir — satın alma kararı vermez. Tedarikçi teklifi ve stok doğrulaması yapılmadan alım yapmayın.
            </p>
          </div>
        </Card>
      ) : null}

      {/* Actionable products table */}
      <Card className="overflow-hidden">
        <div className="border-b border-[var(--border-subtle)] px-6 py-4">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Satın Alma Önerileri · {actionable.length} ürün
          </p>
        </div>

        {actionable.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-[var(--text-secondary)]">
              Şu anda acil tedarik gerektiren ürün yok.
            </p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Ürünlerin stok, talep ve tedarik süresi verilerini doldurun.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[var(--border-subtle)] text-sm">
              <thead className="bg-[var(--surface-1)]">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Ürün</th>
                  <th className="px-4 py-3 text-center text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Aciliyet</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Stok</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Kalan Süre</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Tedarik Süresi</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Aylık Talep</th>
                  <th className="px-4 py-3 text-center text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Hız Kaynağı</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">T30G Satış</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Önerilen Adet</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Tahmini Maliyet</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Skor</th>
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {actionable.map((row) => (
                  <tr key={row.id} className="hover:bg-[var(--surface-3)]">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[var(--text-primary)]">{row.name}</p>
                      {row.sku ? <p className="font-mono text-xs tabular-nums text-[var(--text-muted)]">{row.sku}</p> : null}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge tone={URGENCY_TONES[row.urgency]}>
                        {URGENCY_LABELS[row.urgency]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">{row.stock}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      <span className={row.daysRemaining !== null && row.daysRemaining <= (row.leadTimeDays * 1.5) ? "font-semibold text-[var(--danger)]" : "text-[var(--text-secondary)]"}>
                        {fmtDays(row.daysRemaining)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--text-muted)]">
                      {row.leadTimeDays > 0 ? `${row.leadTimeDays} gün` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">{row.monthlyUnits} adet/ay</td>
                    <td className="px-4 py-3 text-center">
                      {row.velocitySource === "actual" ? (
                        <Badge variant="ok">Gerçek</Badge>
                      ) : row.velocitySource === "estimated" ? (
                        <Badge variant="neutral">Tahmin</Badge>
                      ) : (
                        <Badge variant="warn">Veri Yok</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[var(--text-muted)]">
                      {row.actualSalesQty !== null ? `${row.actualSalesQty} adet` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-[var(--text-primary)]">
                      {row.suggestedQty > 0 ? `${row.suggestedQty} adet` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-[var(--text-primary)]">
                      {row.suggestedCost > 0 ? fmtTry(row.suggestedCost) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-mono text-sm font-semibold tabular-nums ${row.score >= 60 ? "text-[var(--ok)]" : row.score >= 30 ? "text-[var(--warn)]" : "text-[var(--text-muted)]"}`}>
                        {row.score}/100
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/products/${row.id}`}
                        className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
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
          <div className="border-b border-[var(--border-subtle)] px-6 py-4">
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
              Aksiyon Gerekmeyenler · {okRows.length} ürün
            </p>
          </div>
          <div className="divide-y divide-[var(--border-subtle)]">
            {okRows.map((row) => (
              <div key={row.id} className="flex items-center justify-between px-6 py-3">
                <div>
                  <span className="font-medium text-[var(--text-primary)]">{row.name}</span>
                  {row.sku ? <span className="ml-2 font-mono text-xs tabular-nums text-[var(--text-muted)]">{row.sku}</span> : null}
                </div>
                <div className="flex items-center gap-4 text-sm text-[var(--text-secondary)]">
                  <span className="font-mono tabular-nums">{row.stock} adet stok</span>
                  <span className="font-mono tabular-nums">{fmtDays(row.daysRemaining)}</span>
                  {row.velocitySource === "actual" && (
                    <Badge variant="ok">Gerçek ({row.actualSalesQty} T30G)</Badge>
                  )}
                  <Badge tone="success">YETERLİ</Badge>
                  <Link href={`/products/${row.id}`} className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">Detay →</Link>
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
  const valueColor = {
    danger: "text-[var(--danger)]",
    warning: "text-[var(--warn)]",
    success: "text-[var(--ok)]",
    default: "text-[var(--text-primary)]",
  }[tone];

  return (
    <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-2)] p-4">
      <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
      <p className={`mt-2 text-[28px] font-semibold leading-tight tabular-nums ${valueColor}`}>{value}</p>
    </div>
  );
}

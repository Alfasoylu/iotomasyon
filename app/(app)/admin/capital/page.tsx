/**
 * Phase 73 — Kilitli Sermaye Dağılımı (Capital Breakdown)
 * Adds top-20 products by locked capital after suggestions table.
 * No schema change, no new DB query — computed from existing productsWithScore.
 *
 * Phase 40 — Capital Allocation + Real Sales Velocity (original)
 *
 * Applies the same Phase 39 real-velocity upgrade to capital allocation:
 * 30-day Trendyol sales qty overrides manual onlineSalesPotential when
 * computing investment scores, making allocation priorities data-driven.
 *
 * No schema change — reads existing TrendyolSalesRecord (Phase 26).
 */

import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { calculateCapitalAllocation } from "@/lib/capital-allocation";
import { calculateSalesPotential } from "@/lib/sales-potential";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CapitalConfigForm } from "@/components/capital/capital-config-form";

export const dynamic = "force-dynamic";

function fmt(n: number) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(n);
}

function fmtPct(n: number) { return `%${n.toFixed(1)}`; }

function isCancelledStatus(s: string | null) {
  if (!s) return false;
  const lower = s.toLowerCase();
  return lower.includes("iptal") || lower.includes("cancel");
}

export default async function CapitalPage() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);

  const [config, products, salesRecords30d, latestRate] = await Promise.all([
    prisma.capitalConfig.findFirst(),
    prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true, name: true, sku: true,
        unitCostTry: true, stockQuantity: true, minimumStock: true,
        onlineSalesPotential: true, wholesaleSalesPotential: true, installerSalesPotential: true,
        marketplacePriceTry: true, wholesalePriceTry: true, sellingPriceTry: true,
        shippingCost: true, shippingCostOverride: true,
        marketplaceCommission: true, marketplaceCommissionOverride: true,
        packagingCost: true, vatRate: true, paymentFeeRate: true, returnReserveRate: true,
        sourceCostRmb: true, weightKg: true, customsRatePct: true, importPaymentFeePct: true,
      },
    }),
    prisma.trendyolSalesRecord.findMany({
      where: {
        productId: { not: null },
        orderDate: { gte: since30 },
      },
      select: { productId: true, quantity: true, status: true },
    }),
    prisma.monthlyExchangeRate.findFirst({
      orderBy: [{ year: "desc" }, { month: "desc" }],
      select: { usdTryRate: true, rmbUsdRate: true },
    }),
  ]);

  // Build actual 30-day sales qty per product (non-cancelled, matched)
  const actualSales30d = new Map<string, number>();
  for (const r of salesRecords30d) {
    if (!r.productId || isCancelledStatus(r.status)) continue;
    actualSales30d.set(r.productId, (actualSales30d.get(r.productId) ?? 0) + (r.quantity ?? 1));
  }

  const actualDataCount = actualSales30d.size;

  // Exchange rates for landed cost computation
  const usdTryRate = latestRate?.usdTryRate != null ? Number(latestRate.usdTryRate) : 38;
  const rmbUsdRate = latestRate?.rmbUsdRate != null ? Number(latestRate.rmbUsdRate) : 7.25;

  const CARGO_USD_PER_KG = 10; // air freight assumption
  function computeLandedCost(p: {
    unitCostTry: unknown;
    sourceCostRmb: unknown;
    weightKg: unknown;
    customsRatePct: unknown;
    importPaymentFeePct: unknown;
  }): number | null {
    const tryVal = p.unitCostTry != null ? Number(p.unitCostTry) : null;
    if (tryVal != null && tryVal > 0) return tryVal;
    const rmb = p.sourceCostRmb != null ? Number(p.sourceCostRmb) : null;
    if (!rmb || rmb <= 0) return null;
    const kg = p.weightKg != null ? Number(p.weightKg) : 0;
    const payFeePct = p.importPaymentFeePct != null ? Number(p.importPaymentFeePct) : 0;
    const customsPct = p.customsRatePct != null ? Number(p.customsRatePct) : 30;
    const supplierTry = (rmb / rmbUsdRate) * usdTryRate * (1 + payFeePct / 100);
    const cargoTry = kg * CARGO_USD_PER_KG * usdTryRate;
    const customsTry = (supplierTry + cargoTry) * (customsPct / 100);
    return supplierTry + cargoTry + customsTry;
  }

  // Compute investment scores for all products (actual velocity overrides manual)
  const productsWithScore = products.map((p) => {
    const actualQty = actualSales30d.get(p.id) ?? null;
    const effectiveOnlinePotential = actualQty !== null ? actualQty : p.onlineSalesPotential;
    const effectiveCostTry = computeLandedCost(p);

    const sp = calculateSalesPotential({
      unitCostTry: effectiveCostTry,
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
    });
    return {
      id: p.id,
      name: p.name,
      sku: p.sku,
      unitCostTry: effectiveCostTry,
      stockQuantity: p.stockQuantity,
      minimumStock: p.minimumStock,
      onlineSalesPotential: effectiveOnlinePotential,
      wholesaleSalesPotential: p.wholesaleSalesPotential,
      installerSalesPotential: p.installerSalesPotential,
      marketplacePriceTry: p.marketplacePriceTry != null ? Number(p.marketplacePriceTry) : null,
      wholesalePriceTry: p.wholesalePriceTry != null ? Number(p.wholesalePriceTry) : null,
      sellingPriceTry: p.sellingPriceTry != null ? Number(p.sellingPriceTry) : null,
      investmentScore: sp.investmentScore,
      velocitySource: actualQty !== null ? "actual" : "estimated",
    };
  });

  // Phase 73 — Kilitli sermaye dağılımı: top 20 ürün × stok değeri
  type BreakdownRow = { id: string; name: string; sku: string | null; stockQuantity: number; unitCostTry: number; stockValue: number };
  type ScoreItem = { id: string; name: string; sku: string | null; unitCostTry: number | null; stockQuantity: number };
  const capitalBreakdown: BreakdownRow[] = (productsWithScore as ScoreItem[])
    .filter((p: ScoreItem) => p.unitCostTry != null && p.unitCostTry > 0 && p.stockQuantity > 0)
    .map((p: ScoreItem) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      stockQuantity: p.stockQuantity,
      unitCostTry: p.unitCostTry as number,
      stockValue: p.stockQuantity * (p.unitCostTry as number),
    }))
    .sort((a: BreakdownRow, b: BreakdownRow) => b.stockValue - a.stockValue)
    .slice(0, 20);

  const totalLockedValue = (productsWithScore as ScoreItem[])
    .filter((p: ScoreItem) => p.unitCostTry != null && p.unitCostTry > 0)
    .reduce((sum: number, p: ScoreItem) => sum + p.stockQuantity * (p.unitCostTry as number), 0);

  const totalCapital = config ? Number(config.totalCapitalTry) : 0;
  const reservePct = config ? Number(config.reservePct) : 20;
  const turnoverMonths = config ? Number(config.desiredTurnoverMonths) : 3;

  const allocation = config
    ? calculateCapitalAllocation(productsWithScore, totalCapital, reservePct, turnoverMonths)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">Yönetim</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Sermaye dağılımı
        </h1>
        <p className="mt-2 text-sm leading-7 text-slate-600">
          Mevcut sermayeyi en kârlı ürünlere göre dağıtmak için öneri motoru. Satın alma yapılmadan önce yönetici onayı zorunludur.
          {actualDataCount > 0 && (
            <span className="ml-2 font-medium text-emerald-700">
              {actualDataCount} üründe gerçek Trendyol satış hızı kullanılıyor.
            </span>
          )}
        </p>
      </div>

      {/* Real velocity notice */}
      {actualDataCount > 0 && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4">
          <p className="text-sm text-emerald-800">
            <span className="font-semibold">Gerçek Satış Verisi Aktif:</span>{" "}
            {actualDataCount} ürün için son 30 günlük Trendyol sipariş verisi yatırım skoru hesabında kullanılıyor.
            Gerçek satış verisi olan ürünlerin önceliği daha güvenilirdir.
          </p>
        </div>
      )}

      {/* Capital config form */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold text-slate-950">Sermaye ayarları</h2>
        <p className="mt-1 text-sm text-slate-500">
          Toplam sermayenizi ve rezerv oranınızı girin. Sistem kilitli stok değerini otomatik hesaplar.
        </p>
        <div className="mt-5">
          <CapitalConfigForm
            initialValues={{
              totalCapitalTry: config ? String(config.totalCapitalTry) : "",
              reservePct: config ? String(config.reservePct) : "20",
              desiredTurnoverMonths: config ? String(config.desiredTurnoverMonths) : "3",
            }}
          />
        </div>
      </Card>

      {allocation ? (
        <>
          {/* Capital summary */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <SummaryCard label="Toplam sermaye" value={fmt(allocation.totalCapital)} />
            <SummaryCard label="Stok değeri (kilitli)" value={fmt(allocation.lockedCapital)} subtitle="iniş maliyeti × stok adeti" />
            <SummaryCard label="Serbest sermaye" value={fmt(allocation.availableCapital)} />
            <SummaryCard label={`Rezerv (${fmtPct(reservePct)})`} value={fmt(allocation.reserveAmount)} />
            <SummaryCard label="Kullanılabilir" value={fmt(allocation.deployableCapital)} highlight />
          </div>

          {/* Safety notice */}
          <Card className="border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">
              ⚠ Bu liste öneridir — satın alma kararı vermez.
            </p>
            <p className="mt-1 text-sm text-amber-800">
              Aşağıdaki miktarlar yatırım skoru ve aylık talep tahminine dayanır.
              Satın alma yapılmadan önce yönetici onayı zorunludur.
              Sermayenin %{reservePct.toFixed(0)}&apos;i ({fmt(allocation.reserveAmount)}) her zaman rezervde tutulur.
            </p>
          </Card>

          {/* Suggestions table */}
          {allocation.suggestions.length > 0 ? (
            <Card className="overflow-hidden p-0">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-slate-950">Satın alma önerileri</h2>
                  <Badge>{allocation.suggestions.length} ürün</Badge>
                </div>
                {/* Phase 77: direct link to create purchase order pre-filled from capital */}
                <a
                  href="/admin/purchase-orders/new?from=capital"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 transition"
                >
                  📦 Satın Alma Siparişi Oluştur
                </a>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-widest text-slate-500">
                      <th className="px-6 py-3 text-left">Ürün</th>
                      <th className="px-4 py-3 text-right">Skor</th>
                      <th className="px-4 py-3 text-center">Hız</th>
                      <th className="px-4 py-3 text-right">Mevcut stok</th>
                      <th className="px-4 py-3 text-right">Hedef stok</th>
                      <th className="px-4 py-3 text-right">Öneri adet</th>
                      <th className="px-4 py-3 text-right">Stok değeri</th>
                      <th className="px-4 py-3 text-right">Birim maliyet</th>
                      <th className="px-4 py-3 text-right">Tahsis</th>
                      <th className="px-4 py-3 text-right">Tahmini aylık ROI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {allocation.suggestions.map((s, i) => (
                      <tr key={s.product.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                        <td className="px-6 py-3">
                          <p className="font-medium text-slate-900">{s.product.name}</p>
                          <p className="font-mono text-xs text-slate-400">{s.product.sku}</p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-bold tabular-nums text-slate-700">{s.product.investmentScore}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {(s.product as { velocitySource?: string }).velocitySource === "actual" ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Gerçek</span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">Tahmin</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">{s.product.stockQuantity}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">{s.targetStock}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-bold tabular-nums text-slate-900">{s.allocatedQty}</span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                          {fmt(s.currentStockValue)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                          {s.product.unitCostTry != null ? fmt(s.product.unitCostTry) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">
                          {fmt(s.allocatedAmount)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {s.expectedMonthlyROI != null ? (
                            <span className={s.expectedMonthlyROI >= 0 ? "text-emerald-700 font-medium" : "text-red-600 font-medium"}>
                              {fmtPct(s.expectedMonthlyROI)}
                            </span>
                          ) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50">
                      <td colSpan={8} className="px-6 py-3 text-sm font-semibold text-slate-700">Toplam tahsis</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">{fmt(allocation.allocatedTotal)}</td>
                      <td />
                    </tr>
                    <tr className="bg-slate-50">
                      <td colSpan={8} className="px-6 py-2 text-xs text-slate-500">Tahsis sonrası kalan kullanılabilir sermaye</td>
                      <td className="px-4 py-2 text-right text-xs font-semibold text-emerald-700">{fmt(allocation.remainingAfterAllocation)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          ) : (
            <Card className="p-6 text-center text-slate-500 text-sm">
              Şu an satın alma önerisi oluşturulamadı. Ürünlere maliyet, fiyat ve aylık talep bilgisi girildiğinde öneriler burada görünür.
            </Card>
          )}

          {allocation.skippedCount > 0 ? (
            <p className="text-xs text-slate-400">
              {allocation.skippedCount} ürün maliyet veya talep verisi eksik olduğu için hesaplamaya dahil edilmedi.
            </p>
          ) : null}

          {/* Phase 73 — Kilitli sermaye dağılımı */}
          {capitalBreakdown.length > 0 && (
            <Card className="overflow-hidden p-0">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">Kilitli sermaye dağılımı</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Hangi ürünler sermayeni bağlıyor? En yüksek stok değeri × maliyet (iniş maliyeti) — ilk 20 ürün.
                  </p>
                </div>
                <Badge>{capitalBreakdown.length} ürün</Badge>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-xs uppercase tracking-widest text-slate-500">
                      <th className="px-6 py-3 text-left">Ürün</th>
                      <th className="px-4 py-3 text-right">Stok</th>
                      <th className="px-4 py-3 text-right">Birim maliyet</th>
                      <th className="px-4 py-3 text-right">Stok değeri</th>
                      <th className="px-4 py-3 text-right">Toplam içindeki pay</th>
                      <th className="px-6 py-3 text-left w-48">Dağılım</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {capitalBreakdown.map((p: BreakdownRow, i: number) => {
                      const pct = totalLockedValue > 0 ? (p.stockValue / totalLockedValue) * 100 : 0;
                      const barWidth = Math.min(100, pct * 4); // scale for visual
                      return (
                        <tr key={p.id} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                          <td className="px-6 py-3 max-w-[240px]">
                            <p className="font-medium text-slate-900 line-clamp-1">{p.name}</p>
                            <p className="font-mono text-xs text-slate-400">{p.sku ?? "—"}</p>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-700">{p.stockQuantity}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">{fmt(p.unitCostTry)}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-900">{fmt(p.stockValue)}</td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            <span className={pct >= 10 ? "font-bold text-amber-700" : "text-slate-600"}>
                              %{pct.toFixed(1)}
                            </span>
                          </td>
                          <td className="px-6 py-3">
                            <div className="h-2 w-full max-w-[160px] rounded-full bg-slate-100">
                              <div
                                className={`h-2 rounded-full ${pct >= 10 ? "bg-amber-400" : "bg-slate-400"}`}
                                style={{ width: `${Math.max(2, barWidth)}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-slate-50">
                      <td colSpan={3} className="px-6 py-3 text-sm font-semibold text-slate-700">Toplam kilitli sermaye</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">{fmt(totalLockedValue)}</td>
                      <td colSpan={2} className="px-4 py-3 text-xs text-slate-400">iniş maliyeti × stok adeti (maliyet verisi olan tüm ürünler)</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          )}
        </>
      ) : (
        <Card className="p-6 text-center text-slate-500 text-sm">
          Sermaye dağılım analizini başlatmak için yukarıdaki formu doldurun.
        </Card>
      )}
    </div>
  );
}

function SummaryCard({ label, value, highlight, subtitle }: { label: string; value: string; highlight?: boolean; subtitle?: string }) {
  return (
    <div className={`rounded-2xl border p-4 ${highlight ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"}`}>
      <p className={`text-xs font-semibold uppercase tracking-widest ${highlight ? "text-slate-400" : "text-slate-500"}`}>{label}</p>
      <p className={`mt-2 text-lg font-bold tabular-nums ${highlight ? "text-white" : "text-slate-900"}`}>{value}</p>
      {subtitle && (
        <p className={`mt-1 text-xs ${highlight ? "text-slate-400" : "text-slate-400"}`}>{subtitle}</p>
      )}
    </div>
  );
}

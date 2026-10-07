// /admin/sermaye → "Satış ve kârlılık" bölümü (eski /admin/executive "Yönetici Paneli"nden taşındı, 2026-10-07).
// Kopya olan stok değeri / serbest sermaye / kur kartları kaldırıldı — onlar sayfanın üstünde CFO kaynağından tek kez gösterilir.

import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { calculateProfitability } from "@/lib/profitability";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtTry as fmt, fmtPct } from "./parts";

function isCancelledStatus(s: string | null) {
  if (!s) return false;
  const lower = s.toLowerCase();
  return lower.includes("iptal") || lower.includes("cancel");
}

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

export async function OperationsSection() {
  const since90 = new Date();
  since90.setDate(since90.getDate() - 90);

  const [products, listingCount, salesRecords90d] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true, name: true, sku: true, unitCostTry: true, stockQuantity: true, minimumStock: true,
        sellingPriceTry: true, wholesalePriceTry: true, marketplacePriceTry: true,
        shippingCost: true, shippingCostOverride: true, marketplaceCommission: true, marketplaceCommissionOverride: true,
        packagingCost: true, vatRate: true, paymentFeeRate: true, returnReserveRate: true,
      },
    }),
    prisma.marketplaceListing.count({ where: { status: "ACTIVE" } }),
    prisma.trendyolSalesRecord.findMany({
      where: { orderDate: { gte: since90 } },
      select: { productId: true, status: true, totalPriceTry: true, product: { select: { name: true, sku: true } } },
    }),
  ]);

  const num = (v: unknown) => (v != null ? Number(v) : null);
  const prods = products.map((p) => ({
    ...p,
    unitCostTry: num(p.unitCostTry), sellingPriceTry: num(p.sellingPriceTry), wholesalePriceTry: num(p.wholesalePriceTry),
    marketplacePriceTry: num(p.marketplacePriceTry), shippingCost: num(p.shippingCost), shippingCostOverride: num(p.shippingCostOverride),
    marketplaceCommission: num(p.marketplaceCommission), marketplaceCommissionOverride: num(p.marketplaceCommissionOverride),
    packagingCost: num(p.packagingCost), vatRate: num(p.vatRate), paymentFeeRate: num(p.paymentFeeRate), returnReserveRate: num(p.returnReserveRate),
  }));

  const zeroStockCount = prods.filter((p) => (p.stockQuantity ?? 0) === 0).length;
  const belowMinCount = prods.filter((p) => (p.minimumStock ?? 0) > 0 && (p.stockQuantity ?? 0) < (p.minimumStock ?? 0)).length;

  const withProfit = prods
    .map((p) => {
      const prof = calculateProfitability(p);
      return {
        id: p.id, name: p.name, sku: p.sku,
        marketplaceMargin: prof.marketplace?.margin ?? null,
        retailMargin: prof.retail?.margin ?? null,
      };
    })
    .filter((p) => p.marketplaceMargin != null || p.retailMargin != null);
  const losingProductCount = withProfit.filter((p) => p.marketplaceMargin != null && p.marketplaceMargin < 0).length;
  const top5Marketplace = [...withProfit]
    .filter((p) => p.marketplaceMargin != null)
    .sort((a, b) => (b.marketplaceMargin ?? 0) - (a.marketplaceMargin ?? 0))
    .slice(0, 5);

  const activeSales90d = salesRecords90d.filter((r) => !isCancelledStatus(r.status));
  const totalRevenue90d = activeSales90d.reduce((sum, r) => sum + Number(r.totalPriceTry), 0);
  const unmatchedCount90d = activeSales90d.filter((r) => !r.productId).length;
  const revenueByProduct = new Map<string, { name: string; sku: string | null; revenue: number }>();
  for (const r of activeSales90d) {
    if (!r.productId || !r.product) continue;
    const cur = revenueByProduct.get(r.productId);
    if (cur) cur.revenue += Number(r.totalPriceTry);
    else revenueByProduct.set(r.productId, { name: r.product.name, sku: r.product.sku ?? null, revenue: Number(r.totalPriceTry) });
  }
  const top5Revenue90d = [...revenueByProduct.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const distinctProducts90d = revenueByProduct.size;

  return (
    <section id="operasyon" className="scroll-mt-20 space-y-4">
      <h2 className="text-base font-semibold text-[var(--text-primary)]">Satış ve kârlılık</h2>
      <div className="grid gap-4 sm:grid-cols-3">
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
        <KpiCard label="Aktif pazar yeri listesi" value={String(listingCount)} sub="tüm platformlarda ACTIVE" tone="neutral" />
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
            90 günlük Trendyol satış verisi bulunamadı. Trendyol senkronu çalıştığında dolar.
          </div>
        )}
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

    </section>
  );
}

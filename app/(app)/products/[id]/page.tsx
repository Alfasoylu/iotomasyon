import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  Plane,
  Ship,
  Lock,
  Star,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";

import { prisma } from "@/lib/prisma";
import { ProductDeleteButton } from "@/components/products/product-delete-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import { getProductById } from "@/services/product-service";
import { getProductIntelligence } from "@/services/category-service";
import { requirePermission, requireUser, checkPermission, isOwner } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { resolveFinanceGate } from "@/lib/finance-visibility";
import { CUSTOMER_TYPE_LABELS } from "@/types/customers";
import {
  calculateProfitability,
  hasProfitabilityData,
  isLosingProduct,
  formatCurrency,
  formatPct,
  type ChannelResult,
} from "@/lib/profitability";
import {
  calculateSalesPotential,
  BUY_SIGNAL_LABELS,
  BUY_SIGNAL_TONES,
} from "@/lib/sales-potential";
import {
  calculateImportDecision,
  RECOMMENDATION_LABELS,
  RECOMMENDATION_TONES,
  DEFAULT_USD_TRY_RATE,
} from "@/lib/import-decision";
import { ImportSnapshotButton } from "@/components/products/import-snapshot-button";
import { getProductImportSnapshotsAction } from "@/lib/actions/import-snapshot-actions";
import { StockAdjustmentCard } from "@/components/products/stock-adjustment-card";
import { getProductStockAdjustments } from "@/lib/actions/stock-adjustment-actions";
import {
  calcMarketplacePricingRow,
  priceSourceLabel,
  priceSourceColor,
  shippingSourceLabel,
  policySourceLabel,
  policySourceColor,
} from "@/lib/marketplace-pricing";

export const dynamic = "force-dynamic";

const STOCK_SOURCE_LABELS: Record<string, string> = {
  MANUAL: "Manuel giriş",
  XML: "XML senkronizasyon",
  API: "API entegrasyonu",
  IMPORT: "İthalat",
};

const STOCK_CONFIDENCE_LABELS: Record<string, string> = {
  HIGH: "Yüksek",
  MEDIUM: "Orta",
  LOW: "Düşük",
};

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission(PERMISSIONS.PRODUCTS_READ);
  const { id } = await params;
  // eslint-disable-next-line react-hooks/purity -- server component; Date.now() is safe here
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const user = await requireUser();
  const { canViewFinance } = await resolveFinanceGate(user);
  const [canUpdate, canDelete, canCreateCustomer, canInventoryCount] = await Promise.all([
    checkPermission(user, PERMISSIONS.PRODUCTS_UPDATE),
    checkPermission(user, PERMISSIONS.PRODUCTS_DELETE),
    checkPermission(user, PERMISSIONS.CUSTOMERS_CREATE),
    checkPermission(user, PERMISSIONS.INVENTORY_COUNT),
  ]);

  // Finance/import-only datasets are fetched only when the viewer is permitted
  // to see them. This is the server-side data contract: non-finance viewers
  // never get cost / profit / supplier rows in their response.
  const [
    { databaseAvailable, product },
    intelligenceResult,
    latestRate,
    salesRecords,
    canViewPrivate,
    supplierLinks,
    importSnapshots,
    platformPolicies,
    stockAdjustments,
    xmlStockChangeLogs,
  ] = await Promise.all([
    getProductById(id),
    getProductIntelligence(id),
    canViewFinance
      ? prisma.monthlyExchangeRate.findFirst({
          orderBy: [{ year: "desc" }, { month: "desc" }],
        })
      : Promise.resolve(null),
    canViewFinance
      ? prisma.trendyolSalesRecord.findMany({
          where: { productId: id },
          select: { orderDate: true, status: true, quantity: true, totalPriceTry: true, unitPriceTry: true },
        })
      : Promise.resolve([] as Array<{ orderDate: Date; status: string; quantity: number; totalPriceTry: unknown; unitPriceTry: unknown }>),
    Promise.resolve(isOwner(user)),
    canViewFinance
      ? prisma.supplierProduct.findMany({
          where: { productId: id },
          include: { supplier: { select: { name: true } } },
          orderBy: [{ isPreferred: "desc" }, { createdAt: "asc" }],
        })
      : Promise.resolve([] as never[]),
    canViewFinance
      ? getProductImportSnapshotsAction(id)
      : Promise.resolve([] as never[]),
    canViewFinance
      ? prisma.marketplacePlatformPolicy.findMany()
      : Promise.resolve([] as never[]),
    getProductStockAdjustments(id),
    // Phase 68 — XML stock movement history (operational, visible to all readers)
    prisma.xmlStockChangeLog.findMany({
      where: { productId: id },
      orderBy: { syncedAt: "desc" },
      take: 30,
      select: { id: true, previousQty: true, newQty: true, delta: true, syncedAt: true },
    }),
  ]);

  if (!databaseAvailable) {
    return (
      <div className="space-y-6">
        <div>
          <Link
            href="/products"
            className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
          >
            <ChevronLeft size={14} strokeWidth={1.5} />
            Ürünler
          </Link>
          <h1 className="mt-3 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
            Ürün detayı geçici olarak kullanılamıyor
          </h1>
          <p className="mt-2 text-[13px] leading-6 text-[var(--text-secondary)]">
            Veritabanı bağlantısı şu anda kullanılamıyor.
          </p>
        </div>
        <Card className="border-[var(--warn-border)] bg-[var(--warn-dim)] p-6 text-[13px] leading-6 text-[var(--warn)]">
          Canlı ürün verisi alınamadığı için detay ekranı gösterilemiyor.
        </Card>
      </div>
    );
  }

  if (!product) notFound();

  // Server-side data contract — non-finance viewers never receive cost / margin /
  // import / supplier fields on the product object. Even though server-component
  // output is server-only, this prevents future accidental serialization to
  // client components and keeps a single audit-friendly redaction point.
  if (!canViewFinance) {
    const FINANCE_FIELDS = [
      "unitCostTry",
      "unitCostUsd",
      "sourceCostRmb",
      "importUnitCostUsd",
      "importPaymentFeePct",
      "wholesalePriceTry",
      "marketplacePriceTry",
      "marketplaceCommission",
      "marketplaceCommissionOverride",
      "shippingCost",
      "shippingCostOverride",
      "packagingCost",
      "vatRate",
      "paymentFeeRate",
      "returnReserveRate",
      "weightKg",
      "customsRatePct",
      "shippingMethodPref",
      "onlineSalesPotential",
      "wholesaleSalesPotential",
      "installerSalesPotential",
      "importDate",
      "importQuantity",
      "privateNote",
    ] as const;
    for (const f of FINANCE_FIELDS) {
      (product as Record<string, unknown>)[f] = null;
    }
    (product as { xmlData: unknown }).xmlData = null;
    (product as { marketplacePrices: unknown }).marketplacePrices = [];
  }

  const isLowStock = product.stockQuantity <= product.minimumStock;
  const { directInterests, attributeInterests, categoryInterests } = intelligenceResult;

  const profitability = calculateProfitability({
    unitCostTry: product.unitCostTry != null ? Number(product.unitCostTry) : null,
    sellingPriceTry: product.sellingPriceTry != null ? Number(product.sellingPriceTry) : null,
    wholesalePriceTry: product.wholesalePriceTry != null ? Number(product.wholesalePriceTry) : null,
    marketplacePriceTry: product.marketplacePriceTry != null ? Number(product.marketplacePriceTry) : null,
    shippingCost: product.shippingCost != null ? Number(product.shippingCost) : null,
    shippingCostOverride: product.shippingCostOverride != null ? Number(product.shippingCostOverride) : null,
    marketplaceCommission: product.marketplaceCommission != null ? Number(product.marketplaceCommission) : null,
    marketplaceCommissionOverride: product.marketplaceCommissionOverride != null ? Number(product.marketplaceCommissionOverride) : null,
    packagingCost: product.packagingCost != null ? Number(product.packagingCost) : null,
    vatRate: product.vatRate != null ? Number(product.vatRate) : null,
    paymentFeeRate: product.paymentFeeRate != null ? Number(product.paymentFeeRate) : null,
    returnReserveRate: product.returnReserveRate != null ? Number(product.returnReserveRate) : null,
  });
  const hasProfit = hasProfitabilityData(profitability);
  const isLosing = isLosingProduct(profitability);

  const salesPotential = calculateSalesPotential({
    unitCostTry: product.unitCostTry != null ? Number(product.unitCostTry) : null,
    sellingPriceTry: product.sellingPriceTry != null ? Number(product.sellingPriceTry) : null,
    wholesalePriceTry: product.wholesalePriceTry != null ? Number(product.wholesalePriceTry) : null,
    marketplacePriceTry: product.marketplacePriceTry != null ? Number(product.marketplacePriceTry) : null,
    shippingCost: product.shippingCost != null ? Number(product.shippingCost) : null,
    shippingCostOverride: product.shippingCostOverride != null ? Number(product.shippingCostOverride) : null,
    marketplaceCommission: product.marketplaceCommission != null ? Number(product.marketplaceCommission) : null,
    marketplaceCommissionOverride: product.marketplaceCommissionOverride != null ? Number(product.marketplaceCommissionOverride) : null,
    packagingCost: product.packagingCost != null ? Number(product.packagingCost) : null,
    vatRate: product.vatRate != null ? Number(product.vatRate) : null,
    paymentFeeRate: product.paymentFeeRate != null ? Number(product.paymentFeeRate) : null,
    returnReserveRate: product.returnReserveRate != null ? Number(product.returnReserveRate) : null,
    onlineSalesPotential: product.onlineSalesPotential,
    wholesaleSalesPotential: product.wholesaleSalesPotential,
    installerSalesPotential: product.installerSalesPotential,
    stockQuantity: product.stockQuantity,
    minimumStock: product.minimumStock,
  });
  const hasSalesPotential = salesPotential.totalMonthlyUnits > 0;

  // Phase 11C — Import decision
  const usdTryRate = latestRate ? Number(latestRate.usdTryRate) : DEFAULT_USD_TRY_RATE;
  // Phase 31 — RMB/USD rate from latest exchange rate entry
  const rmbUsdRate = latestRate?.rmbUsdRate != null ? Number(latestRate.rmbUsdRate) : 7.0; // 1 USD ≈ 7 RMB varsayılanı
  const importDecision = calculateImportDecision({
    sourcePriceUsd:
      product.importUnitCostUsd != null
        ? Number(product.importUnitCostUsd)
        : product.unitCostUsd != null
          ? Number(product.unitCostUsd)
          : null,
    // Phase 31 — RMB-first path
    sourceCostRmb: product.sourceCostRmb != null ? Number(product.sourceCostRmb) : null,
    rmbUsdRate,
    importPaymentFeePct: product.importPaymentFeePct != null ? Number(product.importPaymentFeePct) : null,
    weightKg: product.weightKg != null ? Number(product.weightKg) : null,
    customsRatePct: product.customsRatePct != null ? Number(product.customsRatePct) : null,
    shippingMethodPref: product.shippingMethodPref ?? null,
    sellingPriceTry:
      product.marketplacePriceTry != null
        ? Number(product.marketplacePriceTry)
        : product.sellingPriceTry != null
          ? Number(product.sellingPriceTry)
          : product.xmlData?.xmlTrendyolPrice != null
            ? Number(product.xmlData.xmlTrendyolPrice) * usdTryRate
            : null,
    commissionPct:
      product.marketplaceCommissionOverride != null
        ? Number(product.marketplaceCommissionOverride)
        : product.marketplaceCommission != null
          ? Number(product.marketplaceCommission)
          : null,
    domesticShippingTry:
      product.shippingCostOverride != null
        ? Number(product.shippingCostOverride)
        : product.shippingCost != null
          ? Number(product.shippingCost)
          : null,
    usdTryRate,
    monthlyUnits:
      (product.onlineSalesPotential ?? 0) +
      (product.wholesaleSalesPotential ?? 0) +
      (product.installerSalesPotential ?? 0) || null,
    airFreightPerKgOverride: null,
    seaFreightPerKgOverride: null,
  });

  // Phase 26 — Realized sales aggregation from TrendyolSalesRecord
  const isCancelledStatus = (s: string) => {
    const low = s.toLowerCase();
    return low.includes("iptal") || low.includes("cancel");
  };
  const activeRecords = salesRecords.filter((r) => !isCancelledStatus(r.status));
  const records30d = activeRecords.filter((r) => r.orderDate >= thirtyDaysAgo);
  const totalQtyAll = activeRecords.reduce((s, r) => s + r.quantity, 0);
  const totalRevAll = activeRecords.reduce((s, r) => s + Number(r.totalPriceTry), 0);
  const totalQty30d = records30d.reduce((s, r) => s + r.quantity, 0);
  const totalRev30d = records30d.reduce((s, r) => s + Number(r.totalPriceTry), 0);
  const avgUnitPrice = totalQtyAll > 0 ? totalRevAll / totalQtyAll : null;
  const unitCostNum = product.unitCostTry ? Number(product.unitCostTry) : null;
  const realizedMargin =
    avgUnitPrice && unitCostNum && avgUnitPrice > 0
      ? ((avgUnitPrice - unitCostNum) / avgUnitPrice) * 100
      : null;

  // Phase 64 — Monthly trend (last 6 months)
  const toMonthKey = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const monthTrendMap = new Map<string, { qty: number; rev: number }>();
  for (const r of activeRecords) {
    const key = toMonthKey(r.orderDate);
    const prev = monthTrendMap.get(key) ?? { qty: 0, rev: 0 };
    monthTrendMap.set(key, { qty: prev.qty + r.quantity, rev: prev.rev + Number(r.totalPriceTry) });
  }
  const trendMonths = [...monthTrendMap.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 6);
  const trendDir: "up" | "down" | "flat" | "none" =
    trendMonths.length >= 2
      ? trendMonths[0][1].qty > trendMonths[1][1].qty
        ? "up"
        : trendMonths[0][1].qty < trendMonths[1][1].qty
        ? "down"
        : "flat"
      : "none";
  const trendMonthLabel = (key: string) => {
    const [year, month] = key.split("-").map(Number);
    const names = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
    return `${names[month - 1]} ${year}`;
  };

  return (
    <div className="space-y-6">
      <Link
        href="/products"
        className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
      >
        <ChevronLeft size={14} strokeWidth={1.5} />
        Ürünler
      </Link>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant={product.isActive ? "ok" : "neutral"}>
              {product.isActive ? "Aktif" : "Pasif"}
            </Badge>
            {isLowStock ? <Badge variant="warn">Düşük stok</Badge> : null}
            {canViewFinance && hasProfit && isLosing ? <Badge variant="danger">Kaybettiriyor</Badge> : null}
            {canViewFinance && hasProfit && !isLosing ? <Badge variant="ok">Kârlı</Badge> : null}
            {canViewFinance && salesPotential.buySignal !== "UNKNOWN" ? (
              <Badge tone={BUY_SIGNAL_TONES[salesPotential.buySignal]}>
                {BUY_SIGNAL_LABELS[salesPotential.buySignal]}
              </Badge>
            ) : null}
            {product.xmlImported ? <Badge variant="neutral">XML İthalatı</Badge> : null}
            {product.productKind === "LISTING_PACKAGE" ? <Badge variant="neutral">Listeleme Paketi</Badge> : null}
          </div>
          <h1 className="mt-3 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
            {product.name}
          </h1>
          <p className="mt-1 font-mono text-[12px] text-[var(--text-muted)]">{product.sku}</p>
          {product.productCategory ? (
            <Link
              href={`/categories/${product.productCategory.id}`}
              className="mt-2 inline-flex items-center gap-1 text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
            >
              {product.productCategory.name}
            </Link>
          ) : null}
        </div>

        <div className="flex gap-2">
          {canCreateCustomer && (
            <Link href={`/customers/new?productId=${product.id}`}>
              <Button variant="secondary">Yeni Müşteri Ekle</Button>
            </Link>
          )}
          {canUpdate && (
            <Link href={`/products/${product.id}/edit`}>
              <Button>Düzenle</Button>
            </Link>
          )}
          {canDelete && <ProductDeleteButton productId={product.id} />}
        </div>
      </div>

      {/* Phase 11A — Image gallery (multi-image from XML, falls back to single imageUrl) */}
      {product.images && product.images.length > 0 ? (
        <Card className="overflow-hidden p-4">
          <div className="flex gap-3 overflow-x-auto">
            {product.images.map((img, idx) => (
              <a key={img.id} href={img.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.altText ?? `${product.name} — resim ${idx + 1}`}
                  className={`rounded-md object-contain bg-[var(--surface-1)] ${idx === 0 ? "h-64 w-64" : "h-24 w-24 border border-[var(--border-default)]"}`}
                />
              </a>
            ))}
          </div>
        </Card>
      ) : product.imageUrl ? (
        <Card className="overflow-hidden p-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-64 w-full object-contain bg-[var(--surface-1)] p-4"
          />
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="p-6">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Ürün bilgileri</p>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <Info label="Kategori" value={product.productCategory?.name ?? product.category} />
            <Info label="Marka" value={product.brand} />
            <Info label="Model" value={product.model} />
            <Info label="Tedarikçi" value={product.supplier} />
            {product.barcode ? <Info label="Barkod" value={product.barcode} mono /> : null}
            {product.gtip1 ? (
              <Info
                label="GTİP 1"
                value={product.gtip1Desc ? `${product.gtip1} — ${product.gtip1Desc}` : product.gtip1}
                mono
              />
            ) : null}
            {product.gtip2 ? (
              <Info
                label="GTİP 2"
                value={product.gtip2Desc ? `${product.gtip2} — ${product.gtip2Desc}` : product.gtip2}
                mono
              />
            ) : null}
            {product.gtip3 ? (
              <Info
                label="GTİP 3"
                value={product.gtip3Desc ? `${product.gtip3} — ${product.gtip3Desc}` : product.gtip3}
                mono
              />
            ) : null}
            <Info label="Konum" value={product.location} />
            <Info label="Stok" value={`${product.stockQuantity}`} />
            <Info label="Minimum stok" value={`${product.minimumStock}`} />
            {(product.reorderLeadTime) != null ? (
              <Info label="Temin süresi" value={`${product.reorderLeadTime} gün`} />
            ) : null}
            {product.stockSource ? (
              <Info label="Stok kaynağı" value={STOCK_SOURCE_LABELS[product.stockSource] ?? product.stockSource} />
            ) : null}
            {product.stockConfidence ? (
              <Info label="Stok güvenilirliği" value={STOCK_CONFIDENCE_LABELS[product.stockConfidence] ?? product.stockConfidence} />
            ) : null}
            {product.lastStockSyncAt ? (
              <Info label="Son senkronizasyon" value={formatDateTime(product.lastStockSyncAt)} />
            ) : null}
            {product.lastStockCountBy ? (
              <Info label="Son sayımı yapan" value={product.lastStockCountBy.name} />
            ) : null}
            {canViewFinance && product.shippingCost != null ? (
              <Info label="Kargo maliyeti" value={`₺${Number(product.shippingCost).toFixed(2)}`} />
            ) : null}
            {canViewFinance && product.shippingCostOverride != null ? (
              <Info label="Kargo (override)" value={`₺${Number(product.shippingCostOverride).toFixed(2)}`} />
            ) : null}
            {canViewFinance && product.marketplaceCommission != null ? (
              <Info label="Pazar komisyonu" value={`%${Number(product.marketplaceCommission).toFixed(1)}`} />
            ) : null}
            {canViewFinance && product.marketplaceCommissionOverride != null ? (
              <Info label="Komisyon (override)" value={`%${Number(product.marketplaceCommissionOverride).toFixed(1)}`} />
            ) : null}
            {canViewFinance && product.importDate ? (
              <Info label="İthalat tarihi" value={formatDateTime(product.importDate)} />
            ) : null}
            {canViewFinance && product.importQuantity != null ? (
              <Info label="İthalatta gelen adet" value={`${product.importQuantity}`} />
            ) : null}
            {canViewFinance && product.importUnitCostUsd != null ? (
              <Info label="İthalat birim maliyeti (USD)" value={`$${Number(product.importUnitCostUsd).toFixed(2)}`} />
            ) : null}
            {product.inventoryCountDate ? (
              <Info label="Depo sayım tarihi" value={formatDateTime(product.inventoryCountDate)} />
            ) : null}
            {product.inventoryCountStock != null ? (
              <Info label="Sayım tarihindeki stok" value={`${product.inventoryCountStock}`} />
            ) : null}
          </dl>
          {product.attributeAssignments.length > 0 && (
            <div className="mt-6">
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Özellikler</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {product.attributeAssignments.map((a) => (
                  <span
                    key={a.attributeId}
                    className="inline-flex rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--text-secondary)]"
                  >
                    {a.attribute.name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {/* Issue 3 fix — Tiptap stores HTML; render it as rich text, not raw string */}
          {product.description ? (
            product.description.trimStart().startsWith("<") ? (
              <div
                className="mt-6 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 text-[13px] leading-6 text-[var(--text-secondary)] [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-[14px] [&_h2]:font-semibold [&_h2]:text-[var(--text-primary)] [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:text-[var(--text-primary)] [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-0.5 [&_strong]:font-semibold [&_em]:italic [&_a]:text-[var(--info)] [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: product.description }}
              />
            ) : (
              <div className="mt-6 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 text-[13px] leading-6 text-[var(--text-secondary)]">
                {product.description}
              </div>
            )
          ) : (
            <div className="mt-6 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-1)] p-4 text-[13px] leading-6 text-[var(--text-muted)]">
              Bu ürün için açıklama eklenmedi.
            </div>
          )}
        </Card>

        <Card className="p-6">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Kayıt metrikleri</p>
          <dl className="mt-5 space-y-4">
            <Info label="Oluşturulma" value={formatDateTime(product.createdAt)} />
            <Info label="Güncellenme" value={formatDateTime(product.updatedAt)} />
            <Info label="Oluşturan" value={product.createdBy?.name ?? "Sistem"} />
            <Info label="Oluşturan e-posta" value={product.createdBy?.email ?? "-"} />
          </dl>
        </Card>
      </div>

      {canViewFinance && hasProfit ? (
        <Card className="p-6">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Kârlılık analizi</p>
          <p className="mt-1 text-sm text-slate-500">
            KDV dahil fiyat varsayımı. Maliyet: birim + kargo + ambalaj. Pazar yeri kanalında komisyon uygulanır.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {profitability.retail ? (
              <ProfitCard title="Perakende" result={profitability.retail} />
            ) : null}
            {profitability.wholesale ? (
              <ProfitCard title="Toptan" result={profitability.wholesale} />
            ) : null}
            {profitability.marketplace ? (
              <ProfitCard title="Pazar yeri" result={profitability.marketplace} />
            ) : null}
          </div>
        </Card>
      ) : null}

      {/* Phase 33 — Marketplace Pricing Normalization (finance only) */}
      {canViewFinance && (() => {
        if (!product.xmlData && !product.marketplacePriceTry) return null;
        const policyMap = Object.fromEntries(
          platformPolicies.map((p) => [p.platform, {
            standardShippingTry: p.standardShippingTry != null ? Number(p.standardShippingTry) : null,
            standardCommissionPct: p.standardCommissionPct != null ? Number(p.standardCommissionPct) : null,
            paymentFeePct: p.paymentFeePct != null ? Number(p.paymentFeePct) : null,
            returnReservePct: p.returnReservePct != null ? Number(p.returnReservePct) : null,
            vatPct: p.vatPct != null ? Number(p.vatPct) : null,
          }])
        );
        const productPolicy = {
          shippingCost: product.shippingCost != null ? Number(product.shippingCost) : null,
          shippingCostOverride: product.shippingCostOverride != null ? Number(product.shippingCostOverride) : null,
          marketplaceCommission: product.marketplaceCommission != null ? Number(product.marketplaceCommission) : null,
          marketplaceCommissionOverride: product.marketplaceCommissionOverride != null ? Number(product.marketplaceCommissionOverride) : null,
          vatRate: product.vatRate != null ? Number(product.vatRate) : null,
          paymentFeeRate: product.paymentFeeRate != null ? Number(product.paymentFeeRate) : null,
          returnReserveRate: product.returnReserveRate != null ? Number(product.returnReserveRate) : null,
        };
        const manualPriceTry = product.marketplacePriceTry != null ? Number(product.marketplacePriceTry) : null;
        const platforms = [
          { key: "TRENDYOL",    label: "Trendyol",     xmlPriceUsd: product.xmlData?.xmlTrendyolPrice != null ? Number(product.xmlData.xmlTrendyolPrice) : null },
          { key: "HEPSIBURADA", label: "Hepsiburada",  xmlPriceUsd: product.xmlData?.xmlHbPrice != null ? Number(product.xmlData.xmlHbPrice) : null },
          { key: "AMAZON",      label: "Amazon",        xmlPriceUsd: product.xmlData?.xmlAmazonPrice != null ? Number(product.xmlData.xmlAmazonPrice) : null },
          { key: "PAZARAMA",    label: "Pazarama",      xmlPriceUsd: product.xmlData?.xmlPazaramaPrice != null ? Number(product.xmlData.xmlPazaramaPrice) : null },
          { key: "IDEFIX",      label: "Idefix",        xmlPriceUsd: product.xmlData?.xmlIdefixPrice != null ? Number(product.xmlData.xmlIdefixPrice) : null },
        ];
        const rows = platforms
          .map((p) => calcMarketplacePricingRow({
            platform: p.key,
            platformLabel: p.label,
            xmlPriceUsd: p.xmlPriceUsd,
            manualOverrideTry: manualPriceTry,
            product: productPolicy,
            platformPolicy: policyMap[p.key] ?? null,
            usdTryRate,
          }))
          .filter((r) => r.priceSource !== "none");
        if (rows.length === 0) return null;
        return (
          <Card className="p-6">
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Pazar Yeri Fiyatlandırması</p>
            <p className="mt-1 text-sm text-slate-500">
              Etkin fiyat, kargo, komisyon ve net kalan gelir. Kur: 1 USD = ₺{usdTryRate.toFixed(2)}
            </p>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)] text-left">
                    <th className="pb-2 pr-4">Platform</th>
                    <th className="pb-2 pr-4">XML Fiyat</th>
                    <th className="pb-2 pr-4">Etkin Fiyat</th>
                    <th className="pb-2 pr-4">Kaynak</th>
                    <th className="pb-2 pr-4 text-right">Kargo ₺</th>
                    <th className="pb-2 pr-4 text-right">Komisyon %</th>
                    <th className="pb-2 pr-4 text-right">Net Kalan ₺</th>
                    <th className="pb-2 text-right">Net Marj %</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.platform} className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                      <td className="py-2 pr-4 font-medium text-[var(--text-primary)]">{r.platformLabel}</td>
                      <td className="py-2 pr-4 font-mono tabular-nums">
                        {r.xmlPriceTry != null ? `₺${r.xmlPriceTry.toFixed(2)}` : <span className="text-[var(--text-muted)]">—</span>}
                      </td>
                      <td className="py-2 pr-4 font-mono tabular-nums font-semibold text-[var(--text-primary)]">
                        {r.effectivePriceTry != null ? `₺${r.effectivePriceTry.toFixed(2)}` : <span className="text-[var(--text-muted)] font-normal">—</span>}
                      </td>
                      <td className="py-2 pr-4">
                        <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium ${priceSourceColor(r.priceSource)}`}>
                          {priceSourceLabel(r.priceSource)}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums">
                        {r.hasData ? `₺${r.shippingTry.toFixed(2)}` : <span className="text-[var(--text-muted)]">—</span>}
                        {r.hasData && (
                          <span className={`ml-1 inline-flex rounded px-1 text-[11px] font-medium ${policySourceColor(r.shippingSource === "price_tier" ? "system_default" : r.shippingSource as "product_override" | "product_value" | "platform_standard" | "system_default")}`}>
                            {shippingSourceLabel(r.shippingSource)}
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums">
                        {r.commissionPct.toFixed(1)}%
                        <span className={`ml-1 inline-flex rounded px-1 text-[11px] font-medium ${policySourceColor(r.commissionSource)}`}>
                          {policySourceLabel(r.commissionSource)}
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums">
                        {r.netRevenueTry != null ? (
                          <span className={r.netRevenueTry >= 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"}>
                            ₺{r.netRevenueTry.toFixed(2)}
                          </span>
                        ) : <span className="text-[var(--text-muted)]">—</span>}
                      </td>
                      <td className="py-2 text-right font-mono tabular-nums">
                        {r.netMarginPct != null ? (
                          <span className={r.netMarginPct >= 15 ? "text-[var(--ok)]" : r.netMarginPct >= 5 ? "text-[var(--warn)]" : "text-[var(--danger)]"}>
                            %{r.netMarginPct.toFixed(1)}
                          </span>
                        ) : <span className="text-[var(--text-muted)]">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] text-[var(--text-muted)]">
              Net kalan = Etkin fiyat − Kargo − Komisyon − Ödeme komisyonu − İade rezervi
              · Kargo yok ise fiyat dilimine göre hesaplanır (&lt;5$→₺{(1.2 * usdTryRate).toFixed(0)}, 5–7.5$→₺{(2 * usdTryRate).toFixed(0)}, &gt;7.5$→₺{(3.3 * usdTryRate).toFixed(0)})
            </p>
          </Card>
        );
      })()}

      {canViewFinance && hasSalesPotential ? (
        <Card className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Yatırım skoru</p>
              <p className="mt-1 text-sm text-slate-500">
                Aylık satış tahminine göre hesaplanır. Stok devir hızı ve kârlılık dikkate alınır.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-[28px] font-semibold leading-none tabular-nums font-mono text-[var(--text-primary)]">
                  {salesPotential.investmentScore}
                  <span className="text-[13px] font-normal text-[var(--text-muted)]">/100</span>
                </p>
              </div>
              <Badge tone={BUY_SIGNAL_TONES[salesPotential.buySignal]}>
                {BUY_SIGNAL_LABELS[salesPotential.buySignal]}
              </Badge>
            </div>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatBox label="Tahmini aylık ciro" value={formatCurrency(salesPotential.projectedMonthlyRevenue)} />
            <StatBox label="Tahmini aylık kâr" value={formatCurrency(salesPotential.projectedMonthlyProfit)} positive={salesPotential.projectedMonthlyProfit > 0} />
            <StatBox label="Toplam aylık adet" value={`${salesPotential.totalMonthlyUnits} adet`} />
            <StatBox
              label="Stok devir süresi"
              value={salesPotential.turnoverMonths != null
                ? `${salesPotential.turnoverMonths.toFixed(1)} ay`
                : "—"}
            />
          </div>
          {(salesPotential.onlineMonthlyRevenue > 0 || salesPotential.wholesaleMonthlyRevenue > 0 || salesPotential.installerMonthlyRevenue > 0) ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-3 text-[12px] text-[var(--text-secondary)]">
              {salesPotential.onlineMonthlyRevenue > 0 ? (
                <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Online</p>
                  <p className="mt-1 text-[13px] font-medium tabular-nums text-[var(--text-primary)]">{product.onlineSalesPotential} adet/ay</p>
                  <p className="tabular-nums font-mono text-[var(--text-secondary)]">{formatCurrency(salesPotential.onlineMonthlyRevenue)} ciro</p>
                  <p className={`tabular-nums font-mono ${salesPotential.onlineMonthlyProfit >= 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}>
                    {formatCurrency(salesPotential.onlineMonthlyProfit)} kâr
                  </p>
                </div>
              ) : null}
              {salesPotential.wholesaleMonthlyRevenue > 0 ? (
                <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Toptan</p>
                  <p className="mt-1 text-[13px] font-medium tabular-nums text-[var(--text-primary)]">{product.wholesaleSalesPotential} adet/ay</p>
                  <p className="tabular-nums font-mono text-[var(--text-secondary)]">{formatCurrency(salesPotential.wholesaleMonthlyRevenue)} ciro</p>
                  <p className={`tabular-nums font-mono ${salesPotential.wholesaleMonthlyProfit >= 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}>
                    {formatCurrency(salesPotential.wholesaleMonthlyProfit)} kâr
                  </p>
                </div>
              ) : null}
              {salesPotential.installerMonthlyRevenue > 0 ? (
                <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Montör/Kurumsal</p>
                  <p className="mt-1 text-[13px] font-medium tabular-nums text-[var(--text-primary)]">{product.installerSalesPotential} adet/ay</p>
                  <p className="tabular-nums font-mono text-[var(--text-secondary)]">{formatCurrency(salesPotential.installerMonthlyRevenue)} ciro</p>
                  <p className={`tabular-nums font-mono ${salesPotential.installerMonthlyProfit >= 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}>
                    {formatCurrency(salesPotential.installerMonthlyProfit)} kâr
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* Trendyol Kâr Analizi Kartı — finance only */}
      {canViewFinance && (() => {
        const trendyolMpPrice = product.marketplacePrices?.find(p => p.marketplace === "TRENDYOL");
        const trendyolPriceTry =
          trendyolMpPrice != null
            ? Number(trendyolMpPrice.priceTry)
            : product.xmlData?.xmlTrendyolPrice != null
              ? Number(product.xmlData.xmlTrendyolPrice) * usdTryRate
              : null;

        const hasTrendyolKarData =
          product.sourceCostRmb != null &&
          product.weightKg != null &&
          trendyolPriceTry != null;

        if (!hasTrendyolKarData) return null;

        // ── Maliyet tarafı (TL + USD)
        const rmbTl = (Number(product.sourceCostRmb) / rmbUsdRate) * usdTryRate;
        const cargoTl = Number(product.weightKg) * 8 * usdTryRate; // AIR_FREIGHT_PER_KG=8 USD/kg
        const customsRate = Number(product.customsRatePct ?? 30) / 100;
        const customsTl = (rmbTl + cargoTl) * customsRate;
        const totalMaliyetTl = rmbTl + cargoTl + customsTl;

        const rmbUsd = totalMaliyetTl > 0 ? rmbTl / usdTryRate : 0;
        const cargoUsd = Number(product.weightKg) * 8;
        const customsUsd = (rmbUsd + cargoUsd) * customsRate;
        const totalMaliyetUsd = rmbUsd + cargoUsd + customsUsd;

        // ── Kanonik formül: lib/marketplace-pricing.ts (Pazaryeri tablosuyla aynı)
        const trendyolPolicy = platformPolicies.find((p) => p.platform === "TRENDYOL");
        const trendyolRow = calcMarketplacePricingRow({
          platform: "TRENDYOL",
          platformLabel: "Trendyol",
          xmlPriceUsd: product.xmlData?.xmlTrendyolPrice != null ? Number(product.xmlData.xmlTrendyolPrice) : null,
          manualOverrideTry: trendyolMpPrice != null ? Number(trendyolMpPrice.priceTry) : (product.marketplacePriceTry != null ? Number(product.marketplacePriceTry) : null),
          product: {
            shippingCost: product.shippingCost != null ? Number(product.shippingCost) : null,
            shippingCostOverride: product.shippingCostOverride != null ? Number(product.shippingCostOverride) : null,
            marketplaceCommission: product.marketplaceCommission != null ? Number(product.marketplaceCommission) : null,
            marketplaceCommissionOverride: product.marketplaceCommissionOverride != null ? Number(product.marketplaceCommissionOverride) : null,
            vatRate: product.vatRate != null ? Number(product.vatRate) : null,
            paymentFeeRate: product.paymentFeeRate != null ? Number(product.paymentFeeRate) : null,
            returnReserveRate: product.returnReserveRate != null ? Number(product.returnReserveRate) : null,
          },
          platformPolicy: trendyolPolicy ? {
            standardShippingTry: trendyolPolicy.standardShippingTry != null ? Number(trendyolPolicy.standardShippingTry) : null,
            standardCommissionPct: trendyolPolicy.standardCommissionPct != null ? Number(trendyolPolicy.standardCommissionPct) : null,
            paymentFeePct: trendyolPolicy.paymentFeePct != null ? Number(trendyolPolicy.paymentFeePct) : null,
            returnReservePct: trendyolPolicy.returnReservePct != null ? Number(trendyolPolicy.returnReservePct) : null,
            vatPct: trendyolPolicy.vatPct != null ? Number(trendyolPolicy.vatPct) : null,
          } : null,
          usdTryRate,
        });

        const effectivePriceTry = trendyolRow.effectivePriceTry ?? trendyolPriceTry!;
        const shippingTry = trendyolRow.shippingTry;
        const commissionTry = trendyolRow.commissionTry;
        const paymentFeeTry = trendyolRow.paymentFeeTry;
        const returnReserveTry = trendyolRow.returnReserveTry;
        const trendyolNetKalan = trendyolRow.netRevenueTry ?? 0;

        const netKar = trendyolNetKalan - totalMaliyetTl;
        const karMarji = effectivePriceTry > 0 ? (netKar / effectivePriceTry) * 100 : 0;
        const roi = totalMaliyetTl > 0 ? (netKar / totalMaliyetTl) * 100 : 0;

        // USD karşılıkları
        const toUsd = (tl: number) => usdTryRate > 0 ? tl / usdTryRate : 0;
        const priceUsd = toUsd(effectivePriceTry);
        const shippingUsd = toUsd(shippingTry);
        const commissionUsd = toUsd(commissionTry);
        const paymentFeeUsd = toUsd(paymentFeeTry);
        const returnReserveUsd = toUsd(returnReserveTry);
        const netKalanUsd = toUsd(trendyolNetKalan);
        const netKarUsd = toUsd(netKar);

        return (
          <Card className="p-6">
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Trendyol Kâr Analizi</p>
            <p className="mt-1 text-sm text-slate-500">
              RMB alış + ağırlık + XML/Manuel Trendyol fiyatı üzerinden hesaplanmıştır.
              Kur: 1 USD = ₺{usdTryRate.toFixed(2)} · 1 USD = {rmbUsdRate.toFixed(1)} RMB
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] p-3">
                <div className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">RMB Alış</div>
                <div className="mt-1 text-[18px] font-semibold tabular-nums font-mono text-[var(--text-primary)]">¥{Number(product.sourceCostRmb).toFixed(2)}</div>
                <div className="text-[11px] tabular-nums font-mono text-[var(--text-muted)]">₺{rmbTl.toFixed(2)} · ${rmbUsd.toFixed(2)}</div>
              </div>
              <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] p-3">
                <div className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Ağırlık + Kargo</div>
                <div className="mt-1 text-[18px] font-semibold tabular-nums font-mono text-[var(--text-primary)]">{Number(product.weightKg).toFixed(3)} kg</div>
                <div className="text-[11px] tabular-nums font-mono text-[var(--text-muted)]">₺{cargoTl.toFixed(2)} · ${cargoUsd.toFixed(2)}</div>
              </div>
              <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] p-3">
                <div className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Gümrük (%{Number(product.customsRatePct ?? 30).toFixed(0)})</div>
                <div className="mt-1 text-[18px] font-semibold tabular-nums font-mono text-[var(--text-primary)]">₺{customsTl.toFixed(2)}</div>
                <div className="text-[11px] tabular-nums font-mono text-[var(--text-muted)]">${customsUsd.toFixed(2)}</div>
              </div>
              <div className="rounded-md border border-[var(--warn-border)] bg-[var(--warn-dim)] p-3">
                <div className="text-[11px] font-medium uppercase tracking-widest text-[var(--warn)]">Toplam İthalat Maliyeti</div>
                <div className="mt-1 text-[18px] font-semibold tabular-nums font-mono text-[var(--warn)]">₺{totalMaliyetTl.toFixed(2)}</div>
                <div className="text-[11px] tabular-nums font-mono text-[var(--warn)] opacity-80">${totalMaliyetUsd.toFixed(2)}</div>
              </div>
              <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] p-3">
                <div className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Trendyol Satış Fiyatı</div>
                <div className="mt-1 text-[18px] font-semibold tabular-nums font-mono text-[var(--text-primary)]">₺{effectivePriceTry.toFixed(2)}</div>
                <div className="text-[11px] tabular-nums font-mono text-[var(--text-muted)]">
                  ${priceUsd.toFixed(2)} ·{" "}
                  {trendyolMpPrice
                    ? (trendyolMpPrice.source === "MANUAL" ? "Manuel" : "XML")
                    : product.xmlData?.xmlTrendyolPrice != null
                      ? `XML $${Number(product.xmlData.xmlTrendyolPrice).toFixed(3)}`
                      : "Manuel"}
                </div>
              </div>
              <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] p-3">
                <div className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Trendyol Net Kalan</div>
                <div className="mt-1 text-[18px] font-semibold tabular-nums font-mono text-[var(--text-primary)]">₺{trendyolNetKalan.toFixed(2)}</div>
                <div className="text-[11px] tabular-nums font-mono text-[var(--text-muted)]">${netKalanUsd.toFixed(2)}</div>
                <div className="mt-1 text-[10px] tabular-nums font-mono text-[var(--text-muted)] leading-tight">
                  −kargo ₺{shippingTry.toFixed(2)} · −kom %{trendyolRow.commissionPct.toFixed(1)} (₺{commissionTry.toFixed(2)})
                  {paymentFeeTry > 0 && <> · −fee ₺{paymentFeeTry.toFixed(2)}</>}
                  {returnReserveTry > 0 && <> · −iade ₺{returnReserveTry.toFixed(2)}</>}
                </div>
              </div>
              <div className={`rounded-md border p-3 ${netKar >= 0 ? "border-[var(--ok-border)] bg-[var(--ok-dim)]" : "border-[var(--danger-border)] bg-[var(--danger-dim)]"}`}>
                <div className={`text-[11px] font-medium uppercase tracking-widest ${netKar >= 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}>Net Kâr</div>
                <div className={`mt-1 text-[18px] font-semibold tabular-nums font-mono ${netKar >= 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}>₺{netKar.toFixed(2)}</div>
                <div className={`text-[11px] font-semibold tabular-nums font-mono ${netKar >= 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}>${netKarUsd.toFixed(2)}</div>
                <div className={`text-[11px] tabular-nums ${netKar >= 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"} opacity-80`}>
                  Marj: %{karMarji.toFixed(1)}
                </div>
              </div>
              <div className={`rounded-md border p-3 ${roi >= 20 ? "border-[var(--ok-border)] bg-[var(--ok-dim)]" : roi >= 0 ? "border-[var(--warn-border)] bg-[var(--warn-dim)]" : "border-[var(--danger-border)] bg-[var(--danger-dim)]"}`}>
                <div className={`text-[11px] font-medium uppercase tracking-widest ${roi >= 20 ? "text-[var(--ok)]" : roi >= 0 ? "text-[var(--warn)]" : "text-[var(--danger)]"}`}>ROI</div>
                <div className={`mt-1 text-[18px] font-semibold tabular-nums font-mono ${roi >= 20 ? "text-[var(--ok)]" : roi >= 0 ? "text-[var(--warn)]" : "text-[var(--danger)]"}`}>%{roi.toFixed(1)}</div>
                <div className="text-[11px] text-[var(--text-muted)]">USD bazlı sermaye getirisi</div>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-[var(--text-muted)]">
              İthalat kargosu: Hava yolu 8 USD/kg · Trendyol kargo/komisyon: <code>lib/marketplace-pricing.ts</code> kanonik formülü (Pazaryeri tablosu ile birebir tutarlı) · Gümrük oran: DB değeri ·{" "}
              {paymentFeeUsd > 0 && <>Ödeme fee ${paymentFeeUsd.toFixed(2)} · </>}
              {returnReserveUsd > 0 && <>İade rezervi ${returnReserveUsd.toFixed(2)} · </>}
              Kargo ${shippingUsd.toFixed(2)} · Komisyon ${commissionUsd.toFixed(2)}
            </p>
          </Card>
        );
      })()}

      {/* Phase 11C — Import Decision Card — finance only */}
      {canViewFinance && (
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">İthalat Kararı</p>
            <p className="mt-1 text-sm text-slate-500">
              Hava/deniz kargo ekonomisi. Kur: 1 USD = ₺{usdTryRate.toFixed(2)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ImportSnapshotButton productId={product.id} />
            <Badge tone={RECOMMENDATION_TONES[importDecision.decision] as "success" | "warning" | "danger" | "default"}>
              {RECOMMENDATION_LABELS[importDecision.decision]}
            </Badge>
          </div>
        </div>

        {importDecision.hasData ? (
          <div className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Air scenario */}
              {importDecision.air ? (
                <div className={`rounded-md border p-4 ${importDecision.effectiveMethod === "AIR" ? "border-[var(--info-border)] bg-[var(--info-dim)]" : "border-[var(--border-default)] bg-[var(--surface-2)]"}`}>
                  <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest text-[var(--info)]">
                    <Plane size={14} strokeWidth={1.5} /> Hava yolu ({120} gün)
                  </p>
                  <div className="mt-3 space-y-1 text-[13px]">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">İniş maliyeti</span>
                      <span className="font-mono tabular-nums font-medium text-[var(--text-primary)]">${importDecision.air.landedCostUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Kâr oranı</span>
                      <span className={`font-mono tabular-nums font-medium ${importDecision.air.profitRatio >= 1 ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}>
                        {importDecision.air.profitRatio.toFixed(3)}×
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Aylık kâr</span>
                      <span className="font-mono tabular-nums font-medium text-[var(--text-primary)]">${importDecision.air.monthlyProfitUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Yıllık kâr</span>
                      <span className="font-mono tabular-nums font-medium text-[var(--text-primary)]">${importDecision.air.annualProfitUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Gerekli sermaye</span>
                      <span className="font-mono tabular-nums font-medium text-[var(--text-primary)]">${importDecision.air.requiredCapitalUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Yıllık ROI</span>
                      <span className="font-mono tabular-nums font-medium text-[var(--text-primary)]">{importDecision.air.annualRoiMultiplier.toFixed(3)}×</span>
                    </div>
                  </div>
                </div>
              ) : null}
              {/* Sea scenario */}
              {importDecision.sea ? (
                <div className={`rounded-md border p-4 ${importDecision.effectiveMethod === "SEA" ? "border-[var(--info-border)] bg-[var(--info-dim)]" : "border-[var(--border-default)] bg-[var(--surface-2)]"}`}>
                  <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-widest text-[var(--info)]">
                    <Ship size={14} strokeWidth={1.5} /> Deniz yolu ({210} gün)
                  </p>
                  <div className="mt-3 space-y-1 text-[13px]">
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">İniş maliyeti</span>
                      <span className="font-mono tabular-nums font-medium text-[var(--text-primary)]">${importDecision.sea.landedCostUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Kâr oranı</span>
                      <span className={`font-mono tabular-nums font-medium ${importDecision.sea.profitRatio >= 1 ? "text-[var(--ok)]" : "text-[var(--danger)]"}`}>
                        {importDecision.sea.profitRatio.toFixed(3)}×
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Aylık kâr</span>
                      <span className="font-mono tabular-nums font-medium text-[var(--text-primary)]">${importDecision.sea.monthlyProfitUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Yıllık kâr</span>
                      <span className="font-mono tabular-nums font-medium text-[var(--text-primary)]">${importDecision.sea.annualProfitUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Gerekli sermaye</span>
                      <span className="font-mono tabular-nums font-medium text-[var(--text-primary)]">${importDecision.sea.requiredCapitalUsd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[var(--text-muted)]">Yıllık ROI</span>
                      <span className="font-mono tabular-nums font-medium text-[var(--text-primary)]">{importDecision.sea.annualRoiMultiplier.toFixed(3)}×</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">
              Önerilen yöntem:{" "}
              <span className="font-semibold text-[var(--text-secondary)]">
                {importDecision.recommendedMethod === "AIR" ? "Hava yolu" : "Deniz yolu"}
              </span>
              {importDecision.effectiveMethod !== importDecision.recommendedMethod
                ? ` (manuel override: ${importDecision.effectiveMethod})`
                : ""}
              {" · "}Skor: <span className="tabular-nums font-mono">{importDecision.score.toFixed(3)}</span>
            </p>
          </div>
        ) : (
          <div className="mt-4 rounded-md border border-[var(--warn-border)] bg-[var(--warn-dim)] px-4 py-3 text-[13px] text-[var(--warn)]">
            <p className="font-medium">Hesaplama için eksik veri:</p>
            <ul className="mt-1 list-inside list-disc text-[12px]">
              {importDecision.missingFields.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <p className="mt-2 text-[12px]">
              Ürünü düzenleyerek ağırlık, gümrük oranı, satış fiyatı ve aylık talep bilgilerini girin.
            </p>
          </div>
        )}
      </Card>
      )}

      {/* Phase 32 — Import Decision Snapshot History — finance only */}
      {canViewFinance && importSnapshots.length > 0 && (
        <Card className="p-6">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Karar Geçmişi</p>
          <p className="mt-1 text-sm text-slate-500">
            Son {importSnapshots.length} kaydedilmiş ithalat kararı.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                  <th className="pb-2 pr-4 text-left">Tarih</th>
                  <th className="pb-2 pr-4 text-left">Karar</th>
                  <th className="pb-2 pr-4 text-right">Skor</th>
                  <th className="pb-2 pr-4 text-left">Yöntem</th>
                  <th className="pb-2 pr-4 text-right">İniş USD</th>
                  <th className="pb-2 pr-4 text-right">Kâr Oranı</th>
                  <th className="pb-2 pr-4 text-right">Kur</th>
                  <th className="pb-2 text-left">Kaydeden</th>
                </tr>
              </thead>
              <tbody>
                {importSnapshots.map((s) => (
                  <tr key={s.id} className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                    <td className="py-2 pr-4 font-mono tabular-nums text-[var(--text-muted)]">
                      {new Date(s.createdAt).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium border ${
                        s.decision === "ALWAYS_STOCK" ? "border-[var(--ok-border)] bg-[var(--ok-dim)] text-[var(--ok)]" :
                        s.decision === "BUY_SMALL" ? "border-[var(--warn-border)] bg-[var(--warn-dim)] text-[var(--warn)]" :
                        s.decision === "DO_NOT_BUY" ? "border-[var(--danger-border)] bg-[var(--danger-dim)] text-[var(--danger)]" :
                        "border-[var(--border-subtle)] bg-[var(--surface-3)] text-[var(--text-muted)]"
                      }`}>
                        {RECOMMENDATION_LABELS[s.decision as keyof typeof RECOMMENDATION_LABELS] ?? s.decision}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{Number(s.score).toFixed(3)}</td>
                    <td className="py-2 pr-4">
                      <span className="inline-flex items-center gap-1">
                        {s.effectiveMethod === "AIR" ? <Plane size={14} strokeWidth={1.5} /> : <Ship size={14} strokeWidth={1.5} />}
                        {s.effectiveMethod === "AIR" ? "Hava" : "Deniz"}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">${Number(s.landedCostUsd).toFixed(2)}</td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{Number(s.profitRatio).toFixed(3)}×</td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">₺{Number(s.usdTryRate).toFixed(2)}</td>
                    <td className="py-2 text-[var(--text-muted)]">{s.createdBy?.name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Phase 26 — Realized Sales Card — finance only (realized margin + avg unit price) */}
      {canViewFinance && (
      <Card className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Trendyol Satış Performansı</p>
            <p className="mt-1 text-sm text-slate-500">
              Senkronize edilmiş Trendyol sipariş verisi (iptal siparişler hariç).
            </p>
          </div>
          <Link
            href="/admin/product-performance"
            className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
          >
            Tüm Sıralama
          </Link>
        </div>

        {salesRecords.length === 0 ? (
          <p className="mt-4 text-[13px] text-[var(--text-muted)]">
            Bu ürün için henüz senkronize satış verisi yok.{" "}
            <Link href="/admin/product-performance" className="underline hover:text-[var(--text-secondary)]">
              Satış Performansı
            </Link>{" "}
            sayfasından senkronize edin.
          </p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Son 30G Satış</p>
              <p className="mt-1 text-[24px] font-semibold tabular-nums font-mono leading-none text-[var(--text-primary)]">{totalQty30d}</p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">adet</p>
            </div>
            <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Son 30G Ciro</p>
              <p className="mt-1 text-[18px] font-semibold tabular-nums font-mono leading-none text-[var(--text-primary)]">
                ₺{totalRev30d.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}
              </p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">TRY</p>
            </div>
            <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Toplam Satış</p>
              <p className="mt-1 text-[24px] font-semibold tabular-nums font-mono leading-none text-[var(--text-primary)]">{totalQtyAll}</p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">adet (tüm zamanlar)</p>
            </div>
            <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Gerçekleşen Marj</p>
              {realizedMargin !== null ? (
                <>
                  <p className={`mt-1 text-[24px] font-semibold tabular-nums font-mono leading-none ${realizedMargin >= 25 ? "text-[var(--ok)]" : realizedMargin >= 10 ? "text-[var(--warn)]" : "text-[var(--danger)]"}`}>
                    %{realizedMargin.toFixed(1)}
                  </p>
                  <p className="mt-1 text-[11px] tabular-nums font-mono text-[var(--text-muted)]">
                    ort. ₺{avgUnitPrice?.toFixed(2)} / birim
                  </p>
                </>
              ) : (
                <p className="mt-1 text-[13px] text-[var(--text-muted)]">Maliyet eksik</p>
              )}
            </div>
          </div>
        )}
      </Card>
      )}

      {/* Phase 64 — Monthly Sales Trend Card — finance only (ciro / avg price) */}
      {canViewFinance && trendMonths.length > 0 && (
        <Card className="p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Trendyol Aylık Satış Trendi</p>
              <p className="mt-1 text-sm text-slate-500">Son 6 aylık sipariş ve ciro dağılımı (iptal hariç).</p>
            </div>
            {trendDir !== "none" && (
              <span
                className={`mt-1 inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                  trendDir === "up"
                    ? "border-[var(--ok-border)] bg-[var(--ok-dim)] text-[var(--ok)]"
                    : trendDir === "down"
                    ? "border-[var(--danger-border)] bg-[var(--danger-dim)] text-[var(--danger)]"
                    : "border-[var(--border-subtle)] bg-[var(--surface-3)] text-[var(--text-muted)]"
                }`}
              >
                {trendDir === "up" ? <ArrowUpRight size={14} strokeWidth={1.5} /> : trendDir === "down" ? <ArrowDownRight size={14} strokeWidth={1.5} /> : <Minus size={14} strokeWidth={1.5} />}
                {trendDir === "up" ? "Artış" : trendDir === "down" ? "Düşüş" : "Sabit"}
              </span>
            )}
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                  <th className="pb-2 text-left">Ay</th>
                  <th className="pb-2 text-right">Adet</th>
                  <th className="pb-2 text-right">Ciro</th>
                  <th className="pb-2 text-right">Ort. Fiyat</th>
                </tr>
              </thead>
              <tbody>
                {trendMonths.map(([key, d], i) => {
                  const avgPrice = d.qty > 0 ? d.rev / d.qty : null;
                  const prevQty = i < trendMonths.length - 1 ? trendMonths[i + 1][1].qty : null;
                  const delta = prevQty !== null ? d.qty - prevQty : null;
                  return (
                    <tr key={key} className={`border-b border-[var(--border-subtle)] ${i === 0 ? "font-medium" : ""}`}>
                      <td className="py-2 text-[var(--text-primary)]">
                        {trendMonthLabel(key)}
                        {i === 0 && (
                          <span className="ml-2 rounded border border-[var(--border-subtle)] bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                            Son
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right tabular-nums font-mono text-[var(--text-primary)]">
                        <span className="inline-flex items-center gap-1">
                          {d.qty}
                          {delta !== null && delta !== 0 && (
                            <span
                              className={`text-[10px] font-semibold ${
                                delta > 0 ? "text-[var(--ok)]" : "text-[var(--danger)]"
                              }`}
                            >
                              {delta > 0 ? `+${delta}` : delta}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="py-2 text-right tabular-nums font-mono text-[var(--text-primary)]">
                        ₺{d.rev.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}
                      </td>
                      <td className="py-2 text-right tabular-nums font-mono text-[var(--text-secondary)]">
                        {avgPrice != null
                          ? `₺${avgPrice.toLocaleString("tr-TR", { maximumFractionDigits: 0 })}`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-[var(--border-default)] text-[12px] font-semibold text-[var(--text-primary)]">
                  <td className="pt-2">Toplam</td>
                  <td className="pt-2 text-right tabular-nums font-mono">
                    {trendMonths.reduce((s, [, d]) => s + d.qty, 0)}
                  </td>
                  <td className="pt-2 text-right tabular-nums font-mono">
                    ₺{trendMonths.reduce((s, [, d]) => s + d.rev, 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}
                  </td>
                  <td className="pt-2 text-right">—</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {(directInterests.length > 0 || attributeInterests.length > 0 || categoryInterests.length > 0) ? (
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-700">
            {directInterests.length + attributeInterests.length + categoryInterests.length} potansiyel alıcı
          </p>
          <Link href={`/campaigns/new?productId=${product.id}`}>
            <Button>WhatsApp kampanyası oluştur</Button>
          </Link>
        </div>
      ) : null}

      {(directInterests.length > 0 || attributeInterests.length > 0 || categoryInterests.length > 0) ? (
        <div className="grid gap-4 xl:grid-cols-3">
          {directInterests.length > 0 ? (
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Doğrudan ilgili</p>
                <Badge>{directInterests.length}</Badge>
              </div>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Bu ürünü özellikle talep edenler.
              </p>
              <div className="mt-5 space-y-2">
                {directInterests.map((interest) => (
                  <Link key={interest.id} href={`/customers/${interest.customer.id}`}>
                    <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-4 py-3 transition hover:border-[var(--border-strong)]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-medium text-[var(--text-primary)]">{interest.customer.name}</p>
                        {interest.customer.customerType ? (
                          <Badge variant="neutral">{CUSTOMER_TYPE_LABELS[interest.customer.customerType]}</Badge>
                        ) : null}
                      </div>
                      {interest.customer.company ? (
                        <p className="text-[12px] text-[var(--text-muted)]">{interest.customer.company}</p>
                      ) : null}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {interest.stage ? (
                          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium ${
                            interest.stage === "INTERESTED" ? "border-[var(--info-border)] bg-[var(--info-dim)] text-[var(--info)]" :
                            interest.stage === "PRICE_SENT" ? "border-[var(--warn-border)] bg-[var(--warn-dim)] text-[var(--warn)]" :
                            interest.stage === "NEGOTIATING" ? "border-[var(--info-border)] bg-[var(--info-dim)] text-[var(--info)]" :
                            interest.stage === "WAITING" ? "border-[var(--border-subtle)] bg-[var(--surface-3)] text-[var(--text-muted)]" :
                            interest.stage === "ORDERED" ? "border-[var(--ok-border)] bg-[var(--ok-dim)] text-[var(--ok)]" :
                            "border-[var(--danger-border)] bg-[var(--danger-dim)] text-[var(--danger)]"
                          }`}>
                            {interest.stage === "INTERESTED" ? "İlgileniyor" :
                             interest.stage === "PRICE_SENT" ? "Fiyat Gönderildi" :
                             interest.stage === "NEGOTIATING" ? "Müzakerede" :
                             interest.stage === "WAITING" ? "Bekliyor" :
                             interest.stage === "ORDERED" ? "Sipariş Verdi" :
                             "İptal"}
                          </span>
                        ) : null}
                        {(interest.priority === "HIGH" || interest.priority === "URGENT") ? (
                          <span className={`text-[10px] font-medium ${interest.priority === "URGENT" ? "text-[var(--danger)]" : "text-[var(--warn)]"}`}>
                            {interest.priority === "URGENT" ? "Acil" : "Yüksek öncelik"}
                          </span>
                        ) : null}
                      </div>
                      {interest.lastContactedAt ? (
                        <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                          Son temas: {formatDateTime(interest.lastContactedAt)}
                        </p>
                      ) : null}
                      {interest.assignedTo ? (
                        <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                          Temsilci: {interest.assignedTo.name}
                        </p>
                      ) : null}
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          ) : null}

          {attributeInterests.length > 0 ? (
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Özellik ilgili</p>
                <Badge>{attributeInterests.length}</Badge>
              </div>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Bu ürünün özellikleriyle eşleşen müşteriler.
              </p>
              <div className="mt-5 space-y-2">
                {attributeInterests.map((ai) => (
                  <Link key={`${ai.customerId}-${ai.attributeId}`} href={`/customers/${ai.customer.id}`}>
                    <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-4 py-3 transition hover:border-[var(--border-strong)]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-medium text-[var(--text-primary)]">{ai.customer.name}</p>
                        {ai.customer.customerType ? (
                          <Badge variant="neutral">{CUSTOMER_TYPE_LABELS[ai.customer.customerType]}</Badge>
                        ) : null}
                      </div>
                      {ai.customer.company ? (
                        <p className="text-[12px] text-[var(--text-muted)]">{ai.customer.company}</p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">{ai.attribute.name}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          ) : null}

          {categoryInterests.length > 0 ? (
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Kategori ilgili</p>
                <Badge>{categoryInterests.length}</Badge>
              </div>
              <p className="mt-2 text-sm leading-7 text-slate-600">
                Bu ürünün kategorisiyle ilgilenen potansiyel alıcılar.
              </p>
              <div className="mt-5 space-y-2">
                {categoryInterests.map((interest) => (
                  <Link key={interest.id} href={`/customers/${interest.customer.id}`}>
                    <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-4 py-3 transition hover:border-[var(--border-strong)]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[13px] font-medium text-[var(--text-primary)]">{interest.customer.name}</p>
                        {interest.customer.customerType ? (
                          <Badge variant="neutral">{CUSTOMER_TYPE_LABELS[interest.customer.customerType]}</Badge>
                        ) : null}
                      </div>
                      {interest.customer.company ? (
                        <p className="text-[12px] text-[var(--text-muted)]">{interest.customer.company}</p>
                      ) : null}
                    </div>
                  </Link>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* Phase 11A — XML source data section — finance only (contains per-channel prices) */}
      {canViewFinance && product.xmlData && (
        <Card className="p-6">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">XML Kaynak Verisi</p>
          <p className="mt-1 text-sm text-slate-500">
            Entegra feed&apos;inden son alınan ham değerler. Bunlar bilgilendirme amaçlıdır;
            ürün alanları iş verisidir.
          </p>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Info label="XML SKU" value={product.xmlData.xmlSku} mono />
            <Info label="XML Adı" value={product.xmlData.xmlName} />
            <Info label="XML Marka" value={product.xmlData.xmlBrand} />
            <Info label="Para Birimi" value={product.xmlData.xmlCurrencyType} />
            <Info label="KDV" value={product.xmlData.xmlKdv != null ? `%${Number(product.xmlData.xmlKdv)}` : null} />
            <Info label="Ürün Tipi" value={product.xmlData.xmlUrunTipi} />
            <Info label="Ana Ürün Kodu" value={product.xmlData.xmlAnaUrunKodu} mono />
            <Info label="İlk Görülme" value={product.xmlData.firstSeenAt ? formatDateTime(product.xmlData.firstSeenAt) : null} />
            <Info label="Son Görülme" value={product.xmlData.lastSeenAt ? formatDateTime(product.xmlData.lastSeenAt) : null} />
            {product.xmlData.missingFromLatestFeed && (
              <div className="sm:col-span-2 lg:col-span-3">
                <Badge variant="warn">Son feed&apos;de bu ürün bulunamadı</Badge>
              </div>
            )}
          </dl>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {product.xmlData.xmlPrice4 != null && <Info label="Fiyat (price4/USD)" value={`$${Number(product.xmlData.xmlPrice4).toFixed(4)}`} />}
            {product.xmlData.xmlTrendyolPrice != null && <Info label="Trendyol Fiyatı" value={`$${Number(product.xmlData.xmlTrendyolPrice).toFixed(4)}`} />}
            {product.xmlData.xmlHbPrice != null && <Info label="HB Fiyatı" value={`$${Number(product.xmlData.xmlHbPrice).toFixed(4)}`} />}
            {product.xmlData.xmlAmazonPrice != null && <Info label="Amazon Fiyatı" value={`$${Number(product.xmlData.xmlAmazonPrice).toFixed(4)}`} />}
            {product.xmlData.xmlPazaramaPrice != null && <Info label="Pazarama Fiyatı" value={`$${Number(product.xmlData.xmlPazaramaPrice).toFixed(4)}`} />}
            {product.xmlData.xmlIdefixPrice != null && <Info label="Idefix Fiyatı" value={`$${Number(product.xmlData.xmlIdefixPrice).toFixed(4)}`} />}
            {product.xmlData.xmlBayiPrice != null && <Info label="Bayi Fiyatı" value={`$${Number(product.xmlData.xmlBayiPrice).toFixed(4)}`} />}
            {product.xmlData.xmlKoctasPrice != null && <Info label="Koçtaş Fiyatı" value={`$${Number(product.xmlData.xmlKoctasPrice).toFixed(4)}`} />}
            {product.xmlData.xmlTeknosaPrice != null && <Info label="Teknosa Fiyatı" value={`$${Number(product.xmlData.xmlTeknosaPrice).toFixed(4)}`} />}
            {product.xmlData.xmlTemuPrice != null && <Info label="Temu Fiyatı" value={`$${Number(product.xmlData.xmlTemuPrice).toFixed(4)}`} />}
          </div>
        </Card>
      )}

      {/* Phase 11A — Classification: parent product link */}
      {product.mainProduct && (
        <Card className="p-6">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Ürün Hiyerarşisi</p>
          <p className="mt-2 text-sm text-slate-500">Bu ürün bir listeleme paketidir.</p>
          <div className="mt-3">
            <Link href={`/products/${product.mainProduct.id}`} className="text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline">
              Ana ürün: {product.mainProduct.name} ({product.mainProduct.sku})
            </Link>
          </div>
        </Card>
      )}

      {/* Phase 28 — Preferred supplier summary — finance only (supplier cost / lead days) */}
      {canViewFinance && supplierLinks.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Tedarikçi Kaynağı</p>
            <Link href={`/products/${product.id}/edit`} className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)] hover:text-[var(--text-primary)] transition">
              Düzenle
            </Link>
          </div>
          <p className="mt-1 text-[12px] text-[var(--text-muted)]">Bu ürünü sağlayan tedarikçiler.</p>
          <div className="mt-4 space-y-2">
            {supplierLinks.map((sl) => (
              <div key={sl.supplierId} className="flex items-center justify-between rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-4 py-3">
                <div className="flex items-center gap-2">
                  {sl.isPreferred && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-[var(--ok-border)] bg-[var(--ok-dim)] px-2 py-0.5 text-[11px] font-medium text-[var(--ok)]">
                      <Star size={12} strokeWidth={1.5} />
                      Tercihli
                    </span>
                  )}
                  <span className="text-[13px] font-medium text-[var(--text-primary)]">{sl.supplier.name}</span>
                </div>
                <div className="flex items-center gap-4 text-[12px] text-[var(--text-muted)]">
                  {sl.unitCostUsd != null && (
                    <span className="font-mono tabular-nums">${Number(sl.unitCostUsd).toFixed(2)}</span>
                  )}
                  {sl.leadDays != null && (
                    <span className="tabular-nums">{sl.leadDays} gün</span>
                  )}
                  {sl.moq != null && (
                    <span className="tabular-nums">MOQ: {sl.moq}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Phase 28 — Owner-only private note (isOwner gated — ADMIN_EMAIL only) */}
      {canViewPrivate && product.privateNote && (
        <Card className="overflow-hidden border-[var(--warn-border)]">
          <div className="border-b border-[var(--warn-border)] bg-[var(--warn-dim)] px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md border border-[var(--warn-border)] bg-[var(--warn-dim)] px-2 py-0.5 text-[11px] font-medium text-[var(--warn)]">
                  <Lock size={12} strokeWidth={1.5} />
                  Özel Not
                </span>
                <span className="text-[11px] text-[var(--warn)]">Sadece sahip görebilir</span>
              </div>
              <Link href={`/products/${product.id}/edit`} className="text-[11px] font-medium uppercase tracking-widest text-[var(--warn)] hover:opacity-80 transition">
                Düzenle
              </Link>
            </div>
          </div>
          <div className="px-6 py-4">
            <p className="whitespace-pre-wrap text-[13px] leading-6 text-[var(--text-secondary)]">{product.privateNote}</p>
          </div>
        </Card>
      )}

      {/* Phase 68 — XML Stock Movement History */}
      {xmlStockChangeLogs.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-[var(--border-subtle)] px-6 py-4">
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
              XML Stok Değişim Geçmişi
            </p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">Son {xmlStockChangeLogs.length} XML senkronizasyon değişimi</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                  <th className="px-4 py-3">Tarih</th>
                  <th className="px-4 py-3 text-right">Önceki</th>
                  <th className="px-4 py-3 text-right">Yeni</th>
                  <th className="px-4 py-3 text-right">Değişim</th>
                </tr>
              </thead>
              <tbody className="text-[13px]">
                {xmlStockChangeLogs.map((log) => (
                  <tr key={log.id} className="border-b border-[var(--border-subtle)] transition hover:bg-[var(--surface-3)]">
                    <td className="px-4 py-2 text-[12px] text-[var(--text-muted)]">
                      {formatDateTime(log.syncedAt)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-[12px] text-[var(--text-muted)]">
                      {log.previousQty}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-[12px] font-semibold text-[var(--text-primary)]">
                      {log.newQty}
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-[12px] font-semibold">
                      <span className={log.delta > 0 ? "text-[var(--ok)]" : log.delta < 0 ? "text-[var(--danger)]" : "text-[var(--text-muted)]"}>
                        {log.delta > 0 ? `+${log.delta}` : log.delta}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Phase 42 + Phase 89 — Physical Count Adjustment Log (INVENTORY_COUNT-gated) */}
      {canInventoryCount && (
        <StockAdjustmentCard
          productId={product.id}
          entegraStock={product.stockQuantity}
          physicalCount={product.physicalCountQuantity ?? null}
          physicalCountAt={product.physicalCountAt}
          physicalCountByName={product.physicalCountBy?.name ?? null}
          initialAdjustments={stockAdjustments.map((a) => ({
            ...a,
            createdAt: new Date(a.createdAt),
          }))}
        />
      )}
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">{label}</dt>
      <dd className={`mt-1.5 text-[13px] font-medium text-[var(--text-primary)] ${mono ? "font-mono tabular-nums" : ""}`}>{value || "-"}</dd>
    </div>
  );
}

function StatBox({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  const valueColor =
    positive === true ? "text-[var(--ok)]" :
    positive === false ? "text-[var(--danger)]" :
    "text-[var(--text-primary)]";
  return (
    <div className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
      <p className={`mt-1 text-[16px] font-semibold tabular-nums font-mono ${valueColor}`}>{value}</p>
    </div>
  );
}

function ProfitCard({ title, result }: { title: string; result: ChannelResult }) {
  const profitColor = result.profitable ? "text-[var(--ok)]" : "text-[var(--danger)]";
  const bgColor = result.profitable
    ? "border-[var(--ok-border)] bg-[var(--ok-dim)]"
    : "border-[var(--danger-border)] bg-[var(--danger-dim)]";

  return (
    <div className={`rounded-md border p-4 ${bgColor}`}>
      <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">{title}</p>
      <p className={`mt-2 text-[24px] font-semibold tabular-nums font-mono leading-none ${profitColor}`}>
        {formatCurrency(result.netProfit)}
      </p>
      <p className={`mt-1 text-[12px] font-medium ${profitColor}`}>
        Marj: {formatPct(result.margin)}
        {result.roi != null ? ` · ROI: ${formatPct(result.roi)}` : ""}
      </p>
      <div className="mt-3 space-y-1 text-[12px] text-[var(--text-secondary)]">
        <div className="flex justify-between">
          <span>Satış fiyatı</span>
          <span className="font-medium tabular-nums font-mono text-[var(--text-primary)]">{formatCurrency(result.revenue)}</span>
        </div>
        <div className="flex justify-between text-[var(--text-muted)]" title="KDV cash-flow'dan düşülmez; bilgi amaçlı gösterilir. Trendyol komisyonu KDV dahil tutar üzerinden alındığı için kâr hesabımız da KDV dahil tutara göre yapılır.">
          <span>İçerdiği KDV (bilgi)</span>
          <span className="tabular-nums font-mono">{formatCurrency(result.vatAmt)}</span>
        </div>
        <div className="flex justify-between">
          <span>Birim maliyet</span>
          <span className="tabular-nums font-mono">−{formatCurrency(result.unitCost)}</span>
        </div>
        <div className="flex justify-between">
          <span>Kargo + ambalaj</span>
          <span className="tabular-nums font-mono">−{formatCurrency(result.shippingCost)}</span>
        </div>
        {result.commissionAmt > 0 ? (
          <div className="flex justify-between">
            <span>Komisyon</span>
            <span className="tabular-nums font-mono">−{formatCurrency(result.commissionAmt)}</span>
          </div>
        ) : null}
        {result.paymentAmt > 0 ? (
          <div className="flex justify-between">
            <span>Ödeme ücreti</span>
            <span className="tabular-nums font-mono">−{formatCurrency(result.paymentAmt)}</span>
          </div>
        ) : null}
        {result.returnAmt > 0 ? (
          <div className="flex justify-between">
            <span>İade karşılığı</span>
            <span className="tabular-nums font-mono">−{formatCurrency(result.returnAmt)}</span>
          </div>
        ) : null}
        <div className="mt-2 flex justify-between border-t border-[var(--border-subtle)] pt-2">
          <span className="font-semibold text-[var(--text-secondary)]">Net kâr</span>
          <span className={`font-semibold tabular-nums font-mono ${profitColor}`}>{formatCurrency(result.netProfit)}</span>
        </div>
      </div>
    </div>
  );
}

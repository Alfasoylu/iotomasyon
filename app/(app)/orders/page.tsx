/**
 * Phase 29 — Order Ledger and Return Claims
 *
 * Local order ledger sourced from TrendyolSalesRecord + TrendyolReturnRecord.
 * Sorted newest-first. Tabs: Tümü | Teslim | İptal/Beklemede | İade | Eşleşmemiş.
 * Survives API retention gaps — historical rows are always available from local DB.
 */

import Link from "next/link";
import { X } from "lucide-react";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { OrdersSyncButton } from "@/components/orders/orders-sync-button";

export const dynamic = "force-dynamic";

type Tab = "all" | "delivered" | "cancelled" | "returns" | "unmatched";

const TAB_LABELS: Record<Tab, string> = {
  all:       "Tümü",
  delivered: "Teslim Edildi",
  cancelled: "İptal / Beklemede",
  returns:   "İadeler",
  unmatched: "Eşleşmemiş",
};

type BadgeVariant = "neutral" | "ok" | "warn" | "danger" | "info";

const STATUS_VARIANT: Record<string, BadgeVariant> = {
  "Delivered":         "ok",
  "Teslim Edildi":     "ok",
  "Cancelled":         "danger",
  "İptal":             "danger",
  "Picking":           "warn",
  "Created":           "neutral",
  "Accepted":          "ok",
  "WaitingForArrival": "warn",
  "Refunded":          "info",
  "InAnalysis":        "info",
};

function statusBadge(status: string) {
  const variant = STATUS_VARIANT[status] ?? "neutral";
  return <Badge variant={variant}>{status}</Badge>;
}

function fmt(d: Date) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  }).format(d);
}

function fmtPrice(n: number | { toNumber(): number } | null) {
  if (n === null || n === undefined) return "—";
  const val = typeof n === "object" ? n.toNumber() : n;
  return new Intl.NumberFormat("tr-TR", {
    style: "currency", currency: "TRY", maximumFractionDigits: 2,
  }).format(val);
}

function isCancelled(status: string) {
  const s = status.toLowerCase();
  return s.includes("iptal") || s.includes("cancel");
}

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  const sp   = await searchParams;
  const tab  = (sp.tab as Tab | undefined) ?? "all";
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const q    = typeof sp.q === "string" ? sp.q.trim() : "";
  const PAGE_SIZE = 100;

  // Phase 69 — Search filter for sales records
  const searchFilter: Prisma.TrendyolSalesRecordWhereInput = q.length >= 2
    ? {
        OR: [
          { productName: { contains: q, mode: "insensitive" } },
          { barcode: { contains: q, mode: "insensitive" } },
          { merchantSku: { contains: q, mode: "insensitive" } },
          { orderId: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};

  // ── Counts for tab badges ────────────────────────────────────────────────────
  const [
    totalOrders,
    totalDelivered,
    totalCancelled,
    totalUnmatched,
    totalReturns,
  ] = await Promise.all([
    prisma.trendyolSalesRecord.count({ where: searchFilter }),
    prisma.trendyolSalesRecord.count({
      where: { AND: [searchFilter, { status: { contains: "Delivered", mode: "insensitive" } }] },
    }),
    prisma.trendyolSalesRecord.count({
      where: {
        AND: [
          searchFilter,
          {
            OR: [
              { status: { contains: "Cancel", mode: "insensitive" } },
              { status: { contains: "İptal", mode: "insensitive" } },
            ],
          },
        ],
      },
    }),
    prisma.trendyolSalesRecord.count({ where: { AND: [searchFilter, { productId: null }] } }),
    prisma.trendyolReturnRecord.count(
      q.length >= 2
        ? { where: { productName: { contains: q, mode: "insensitive" } } }
        : undefined
    ),
  ]);

  // ── Query based on active tab ────────────────────────────────────────────────
  const isReturnsTab = tab === "returns";

  let rows: Array<{
    id: string;
    orderId: string;
    orderDate: Date;
    status: string;
    productName: string;
    productId: string | null;
    productSku?: string | null;
    quantity: number;
    totalPriceTry: { toNumber(): number };
    isReturn: boolean;
    returnReason?: string | null;
  }> = [];

  let totalCount = 0;

  if (isReturnsTab) {
    const where: Prisma.TrendyolReturnRecordWhereInput = q.length >= 2
      ? { productName: { contains: q, mode: "insensitive" } }
      : {};
    totalCount = totalReturns;
    const returns = await prisma.trendyolReturnRecord.findMany({
      where,
      orderBy: { claimDate: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        product: { select: { sku: true } },
      },
    });
    rows = returns.map((r) => ({
      id: r.id,
      orderId: r.orderNumber,
      orderDate: r.claimDate,
      status: r.status,
      productName: r.productName,
      productId: r.productId,
      productSku: r.product?.sku ?? null,
      quantity: 1,
      totalPriceTry: { toNumber: () => Number(r.unitPriceTry) },
      isReturn: true,
      returnReason: r.reasonName,
    }));
  } else {
    let salesWhere: Prisma.TrendyolSalesRecordWhereInput = searchFilter;
    if (tab === "delivered") {
      salesWhere = {
        AND: [
          searchFilter,
          {
            OR: [
              { status: { contains: "Delivered", mode: "insensitive" } },
              { status: { contains: "Teslim", mode: "insensitive" } },
            ],
          },
        ],
      };
      totalCount = totalDelivered;
    } else if (tab === "cancelled") {
      salesWhere = {
        AND: [
          searchFilter,
          {
            OR: [
              { status: { contains: "Cancel", mode: "insensitive" } },
              { status: { contains: "İptal", mode: "insensitive" } },
            ],
          },
        ],
      };
      totalCount = totalCancelled;
    } else if (tab === "unmatched") {
      salesWhere = { AND: [searchFilter, { productId: null }] };
      totalCount = totalUnmatched;
    } else {
      totalCount = totalOrders;
    }

    const sales = await prisma.trendyolSalesRecord.findMany({
      where: salesWhere,
      orderBy: { orderDate: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        product: { select: { sku: true } },
      },
    });
    rows = sales.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      orderDate: r.orderDate,
      status: r.status,
      productName: r.productName,
      productId: r.productId,
      productSku: r.product?.sku ?? null,
      quantity: r.quantity,
      totalPriceTry: r.totalPriceTry as { toNumber(): number },
      isReturn: false,
    }));
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  function tabHref(t: Tab) {
    return q ? `/orders?tab=${t}&q=${encodeURIComponent(q)}` : `/orders?tab=${t}`;
  }

  const tabCounts: Record<Tab, number> = {
    all:       totalOrders,
    delivered: totalDelivered,
    cancelled: totalCancelled,
    returns:   totalReturns,
    unmatched: totalUnmatched,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Faz 29 — Sipariş Defteri
          </p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
            Siparişler ve İadeler
          </h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Trendyol sipariş ve iade geçmişi — yerel veritabanından, API süresi dolmuş kayıtlar dahil.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/marketplace-mappings"
            className="inline-flex h-9 items-center rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition"
          >
            Ürün Eşleştirme →
          </Link>
        </div>
      </div>

      {/* Sync card */}
      <Card className="p-4 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)] mb-1">Senkronizasyon</p>
          <p className="text-xs text-[var(--text-secondary)]">
            Son 365 günün sipariş ve iade kayıtlarını Trendyol&apos;dan çeker. Mevcut kayıtlar güncellenir, yeniler eklenir.
          </p>
        </div>
        <OrdersSyncButton />
      </Card>

      {/* Phase 69 — Search bar */}
      <form method="GET" action="/orders" className="flex gap-2">
        {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Ürün adı, barkod, SKU veya sipariş no..."
          className="h-9 flex-1 rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-border)] transition"
        />
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-4 text-sm font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition"
        >
          Ara
        </button>
        {q && (
          <a
            href={`/orders?tab=${tab}`}
            className="inline-flex h-9 items-center gap-1 rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
          >
            <X size={14} strokeWidth={1.5} /> Temizle
          </a>
        )}
      </form>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 border-b border-[var(--border-subtle)] pb-0">
        {(Object.entries(TAB_LABELS) as [Tab, string][]).map(([t, label]) => (
          <Link
            key={t}
            href={tabHref(t)}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2 text-sm font-medium transition ${
              tab === t
                ? "border-[var(--accent)] text-[var(--text-primary)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            {label}
            <span className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[var(--text-secondary)]">
              {tabCounts[t].toLocaleString("tr-TR")}
            </span>
          </Link>
        ))}
      </div>

      {/* Unmatched hint */}
      {tab === "unmatched" && totalUnmatched > 0 && (
        <div className="rounded-md border border-[var(--warn-border)] bg-[var(--warn-dim)] p-3 text-sm text-[var(--warn)]">
          <strong className="tabular-nums">{totalUnmatched}</strong> sipariş satırı iç ürünle eşleşmedi. Eşleştirmek için{" "}
          <Link href="/admin/marketplace-mappings" className="font-medium underline">
            Ürün Eşleştirme
          </Link>{" "}
          sayfasını kullanın.
        </div>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-[var(--text-muted)]">
            {tab === "returns"
              ? "Henüz iade kaydı yok. Senkronize etmek için yukarıdaki butonu kullanın."
              : "Bu filtre için kayıt bulunamadı."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-[var(--text-secondary)] border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-1)]">
                  <th className="py-2.5 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Tarih</th>
                  <th className="py-2.5 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Sipariş No</th>
                  <th className="py-2.5 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Ürün</th>
                  <th className="py-2.5 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Durum</th>
                  {tab === "returns" && (
                    <th className="py-2.5 px-4 text-left text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">İade Nedeni</th>
                  )}
                  {tab !== "returns" && (
                    <th className="py-2.5 px-4 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Adet</th>
                  )}
                  <th className="py-2.5 px-4 text-right text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={`border-b border-[var(--border-subtle)] hover:bg-[var(--surface-3)] ${isCancelled(row.status) ? "opacity-60" : ""}`}>
                    <td className="py-2.5 px-4 text-xs tabular-nums font-mono text-[var(--text-muted)] whitespace-nowrap">{fmt(row.orderDate)}</td>
                    <td className="py-2.5 px-4 font-mono text-xs tabular-nums text-[var(--text-secondary)]">{row.orderId.slice(0, 16)}</td>
                    <td className="py-2.5 px-4 max-w-[240px]">
                      {row.productId ? (
                        <Link
                          href={`/products/${row.productId}`}
                          className="font-medium text-[var(--text-primary)] hover:text-[var(--accent)] underline decoration-dotted line-clamp-1"
                        >
                          {row.productName}
                        </Link>
                      ) : (
                        <span className="text-[var(--text-secondary)] line-clamp-1">{row.productName}</span>
                      )}
                      {row.productSku && (
                        <span className="block font-mono text-[10px] text-[var(--text-muted)]">{row.productSku}</span>
                      )}
                      {!row.productId && (
                        <span className="mt-0.5 inline-block">
                          <Badge variant="warn">Eşleşmemiş</Badge>
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4">{statusBadge(row.status)}</td>
                    {tab === "returns" && (
                      <td className="py-2.5 px-4 text-xs text-[var(--text-muted)] max-w-[160px] truncate">
                        {row.returnReason ?? "—"}
                      </td>
                    )}
                    {tab !== "returns" && (
                      <td className="py-2.5 px-4 text-right text-xs tabular-nums font-mono">{row.quantity}</td>
                    )}
                    <td className="py-2.5 px-4 text-right text-xs tabular-nums font-mono text-[var(--text-secondary)]">
                      {fmtPrice(row.totalPriceTry)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-[var(--border-subtle)] px-4 py-3">
            <p className="text-xs tabular-nums text-[var(--text-muted)]">
              Toplam {totalCount.toLocaleString("tr-TR")} kayıt · Sayfa {page} / {totalPages}
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`/orders?tab=${tab}&page=${page - 1}`}
                  className="rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition"
                >
                  ← Önceki
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`/orders?tab=${tab}&page=${page + 1}`}
                  className="rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] transition"
                >
                  Sonraki →
                </Link>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

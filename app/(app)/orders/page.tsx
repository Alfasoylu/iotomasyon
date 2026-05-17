/**
 * Phase 29 — Order Ledger and Return Claims
 *
 * Local order ledger sourced from TrendyolSalesRecord + TrendyolReturnRecord.
 * Sorted newest-first. Tabs: Tümü | Teslim | İptal/Beklemede | İade | Eşleşmemiş.
 * Survives API retention gaps — historical rows are always available from local DB.
 */

import Link from "next/link";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
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

const STATUS_TONE: Record<string, string> = {
  "Delivered":         "bg-emerald-100 text-emerald-700",
  "Teslim Edildi":     "bg-emerald-100 text-emerald-700",
  "Cancelled":         "bg-red-100 text-red-600",
  "İptal":             "bg-red-100 text-red-600",
  "Picking":           "bg-amber-100 text-amber-700",
  "Created":           "bg-slate-100 text-slate-600",
  "Accepted":          "bg-emerald-100 text-emerald-700",
  "WaitingForArrival": "bg-amber-100 text-amber-700",
  "Refunded":          "bg-blue-100 text-blue-700",
  "InAnalysis":        "bg-purple-100 text-purple-700",
};

function statusBadge(status: string) {
  const cls = STATUS_TONE[status] ?? "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {status}
    </span>
  );
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
  const PAGE_SIZE = 100;

  // ── Counts for tab badges ────────────────────────────────────────────────────
  const [
    totalOrders,
    totalDelivered,
    totalCancelled,
    totalUnmatched,
    totalReturns,
  ] = await Promise.all([
    prisma.trendyolSalesRecord.count(),
    prisma.trendyolSalesRecord.count({
      where: { status: { contains: "Delivered", mode: "insensitive" } },
    }),
    prisma.trendyolSalesRecord.count({
      where: {
        OR: [
          { status: { contains: "Cancel", mode: "insensitive" } },
          { status: { contains: "İptal", mode: "insensitive" } },
        ],
      },
    }),
    prisma.trendyolSalesRecord.count({ where: { productId: null } }),
    prisma.trendyolReturnRecord.count(),
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
    const where = {};
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
    let salesWhere: Prisma.TrendyolSalesRecordWhereInput = {};
    if (tab === "delivered") {
      salesWhere = {
        OR: [
          { status: { contains: "Delivered", mode: "insensitive" } },
          { status: { contains: "Teslim", mode: "insensitive" } },
        ],
      };
      totalCount = totalDelivered;
    } else if (tab === "cancelled") {
      salesWhere = {
        OR: [
          { status: { contains: "Cancel", mode: "insensitive" } },
          { status: { contains: "İptal", mode: "insensitive" } },
        ],
      };
      totalCount = totalCancelled;
    } else if (tab === "unmatched") {
      salesWhere = { productId: null };
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
    return `/orders?tab=${t}`;
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
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
            Faz 29 — Sipariş Defteri
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
            Siparişler ve İadeler
          </h1>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Trendyol sipariş ve iade geçmişi — yerel veritabanından, API süresi dolmuş kayıtlar dahil.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/marketplace-mappings"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
          >
            Ürün Eşleştirme →
          </Link>
        </div>
      </div>

      {/* Sync card */}
      <Card className="p-4 flex flex-wrap items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Senkronizasyon</p>
          <p className="text-xs text-slate-500">
            Son 365 günün sipariş ve iade kayıtlarını Trendyol&apos;dan çeker. Mevcut kayıtlar güncellenir, yeniler eklenir.
          </p>
        </div>
        <OrdersSyncButton />
      </Card>

      {/* Phase 43 — Stock deduction card */}
      {/* Tab bar */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-0">
        {(Object.entries(TAB_LABELS) as [Tab, string][]).map(([t, label]) => (
          <Link
            key={t}
            href={tabHref(t)}
            className={`inline-flex items-center gap-1.5 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-medium transition ${
              tab === t
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
              {tabCounts[t].toLocaleString("tr-TR")}
            </span>
          </Link>
        ))}
      </div>

      {/* Unmatched hint */}
      {tab === "unmatched" && totalUnmatched > 0 && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
          <strong>{totalUnmatched}</strong> sipariş satırı iç ürünle eşleşmedi. Eşleştirmek için{" "}
          <Link href="/admin/marketplace-mappings" className="font-medium underline">
            Ürün Eşleştirme
          </Link>{" "}
          sayfasını kullanın.
        </div>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-400">
            {tab === "returns"
              ? "Henüz iade kaydı yok. Senkronize etmek için yukarıdaki butonu kullanın."
              : "Bu filtre için kayıt bulunamadı."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-slate-700 border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Tarih</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Sipariş No</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Ürün</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">Durum</th>
                  {tab === "returns" && (
                    <th className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">İade Nedeni</th>
                  )}
                  {tab !== "returns" && (
                    <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Adet</th>
                  )}
                  <th className="py-3 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-400">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={`border-b border-slate-50 hover:bg-slate-50/50 ${isCancelled(row.status) ? "opacity-60" : ""}`}>
                    <td className="py-2.5 px-4 text-xs text-slate-500 whitespace-nowrap">{fmt(row.orderDate)}</td>
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-600">{row.orderId.slice(0, 16)}</td>
                    <td className="py-2.5 px-4 max-w-[240px]">
                      {row.productId ? (
                        <Link
                          href={`/products/${row.productId}`}
                          className="font-medium text-slate-800 hover:text-slate-950 underline decoration-dotted line-clamp-1"
                        >
                          {row.productName}
                        </Link>
                      ) : (
                        <span className="text-slate-500 line-clamp-1">{row.productName}</span>
                      )}
                      {row.productSku && (
                        <span className="block font-mono text-[10px] text-slate-400">{row.productSku}</span>
                      )}
                      {!row.productId && (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 mt-0.5">
                          Eşleşmemiş
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4">{statusBadge(row.status)}</td>
                    {tab === "returns" && (
                      <td className="py-2.5 px-4 text-xs text-slate-500 max-w-[160px] truncate">
                        {row.returnReason ?? "—"}
                      </td>
                    )}
                    {tab !== "returns" && (
                      <td className="py-2.5 px-4 text-right text-xs tabular-nums">{row.quantity}</td>
                    )}
                    <td className="py-2.5 px-4 text-right text-xs tabular-nums text-slate-700">
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
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-400">
              Toplam {totalCount.toLocaleString("tr-TR")} kayıt · Sayfa {page} / {totalPages}
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`/orders?tab=${tab}&page=${page - 1}`}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                >
                  ← Önceki
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`/orders?tab=${tab}&page=${page + 1}`}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
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

/**
 * Phase 77 — Satın Alma Siparişleri
 *
 * Lists all purchase orders with status, total, item count.
 * Links to individual order detail + provides "Yeni Sipariş" action.
 *
 * Status flow: TASLAK → ONAYLANDI → SİPARİŞ VERİLDİ → YOLDA → TESLİM ALINDI
 */

import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { PurchaseOrderStatusButton } from "@/components/purchase-orders/purchase-order-status-button";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  DRAFT:     "Taslak",
  CONFIRMED: "Onaylandı",
  ORDERED:   "Sipariş Verildi",
  SHIPPED:   "Yolda",
  RECEIVED:  "Teslim Alındı",
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT:     "bg-slate-100 text-slate-600",
  CONFIRMED: "bg-blue-100 text-blue-700",
  ORDERED:   "bg-amber-100 text-amber-700",
  SHIPPED:   "bg-violet-100 text-violet-700",
  RECEIVED:  "bg-emerald-100 text-emerald-700",
};

function fmt(n: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(d));
}

export default async function PurchaseOrdersPage() {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  const orders = await prisma.purchaseOrder.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      supplier: { select: { id: true, name: true } },
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true, sourceCostRmb: true, weightKg: true } },
        },
      },
      createdBy: { select: { name: true } },
    },
  });

  type OrderRow = (typeof orders)[number];

  const statusCounts = {
    DRAFT:     orders.filter((o: OrderRow) => o.status === "DRAFT").length,
    CONFIRMED: orders.filter((o: OrderRow) => o.status === "CONFIRMED").length,
    ORDERED:   orders.filter((o: OrderRow) => o.status === "ORDERED").length,
    SHIPPED:   orders.filter((o: OrderRow) => o.status === "SHIPPED").length,
    RECEIVED:  orders.filter((o: OrderRow) => o.status === "RECEIVED").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Tedarik</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Satın Alma Siparişleri</h1>
          <p className="mt-1 text-sm text-slate-500">
            İthalat siparişlerini takip edin. Sermaye dağılımı önerilerinden veya manuel olarak oluşturun.
          </p>
        </div>
        <Link
          href="/admin/purchase-orders/new"
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition"
        >
          + Yeni Sipariş
        </Link>
      </div>

      {/* Status summary pills */}
      <div className="flex flex-wrap gap-2">
        {(Object.entries(statusCounts) as Array<[string, number]>).map(([status, count]) => (
          <span key={status} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${STATUS_COLORS[status]}`}>
            {STATUS_LABELS[status]}
            <span className="font-bold">{count}</span>
          </span>
        ))}
      </div>

      {/* Orders list */}
      {orders.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-slate-400 text-sm">Henüz sipariş oluşturulmamış.</p>
          <Link
            href="/admin/purchase-orders/new"
            className="mt-4 inline-block text-sm font-semibold text-slate-900 underline"
          >
            İlk siparişi oluştur →
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((order: OrderRow) => {
            const totalCost = order.totalCostTry != null ? Number(order.totalCostTry) : null;
            const itemCount = order.items.length;
            type ItemRow = (typeof order.items)[number];
            const totalQty = order.items.reduce((s: number, i: ItemRow) => s + i.qty, 0);

            return (
              <Card key={order.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  {/* Left: order info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-bold text-slate-900">{order.orderNo}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[order.status]}`}>
                        {STATUS_LABELS[order.status]}
                      </span>
                      {order.shippingMethod && (
                        <span className={`text-xs font-medium ${order.shippingMethod === "SEA" ? "text-blue-600" : "text-orange-500"}`}>
                          {order.shippingMethod === "SEA" ? "🚢 Deniz" : "✈ Hava"}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {fmtDate(order.createdAt)}
                      {order.supplier && <> · {order.supplier.name}</>}
                      {order.createdBy && <> · {order.createdBy.name}</>}
                    </p>
                    {/* Items summary */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {order.items.slice(0, 4).map((item: ItemRow) => (
                        <span key={item.id} className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                          <span className="font-mono">{item.qty}×</span>
                          <span className="max-w-[160px] truncate">{item.product.name}</span>
                        </span>
                      ))}
                      {order.items.length > 4 && (
                        <span className="text-xs text-slate-400">+{order.items.length - 4} daha</span>
                      )}
                    </div>
                    {order.notes && (
                      <p className="mt-1 text-xs text-slate-400 italic">{order.notes}</p>
                    )}
                  </div>

                  {/* Right: totals + actions */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="text-right">
                      {totalCost != null ? (
                        <p className="text-base font-bold text-slate-900">{fmt(totalCost)}</p>
                      ) : (
                        <p className="text-sm text-slate-400">Maliyet hesaplanmadı</p>
                      )}
                      <p className="text-xs text-slate-400">{itemCount} ürün · {totalQty} adet</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/purchase-orders/${order.id}`}
                        className="text-xs font-semibold text-slate-900 underline hover:text-slate-600"
                      >
                        Detay
                      </Link>
                      <PurchaseOrderStatusButton orderId={order.id} currentStatus={order.status} />
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

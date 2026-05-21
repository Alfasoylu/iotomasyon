/**
 * Phase 77 — Satın Alma Siparişleri
 *
 * Lists all purchase orders with status, total, item count.
 * Links to individual order detail + provides "Yeni Sipariş" action.
 *
 * Status flow: TASLAK → ONAYLANDI → SİPARİŞ VERİLDİ → YOLDA → TESLİM ALINDI
 */

import Link from "next/link";
import { Plus, Plane, Ship } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PurchaseOrderStatusButton } from "@/components/purchase-orders/purchase-order-status-button";

export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = {
  DRAFT:     "Taslak",
  CONFIRMED: "Onaylandı",
  ORDERED:   "Sipariş Verildi",
  SHIPPED:   "Yolda",
  RECEIVED:  "Teslim Alındı",
};

const STATUS_VARIANT: Record<string, "neutral" | "info" | "warn" | "accent" | "ok"> = {
  DRAFT:     "neutral",
  CONFIRMED: "info",
  ORDERED:   "warn",
  SHIPPED:   "accent",
  RECEIVED:  "ok",
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
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">Tedarik</p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">Satın Alma Siparişleri</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            İthalat siparişlerini takip edin. Sermaye dağılımı önerilerinden veya manuel olarak oluşturun.
          </p>
        </div>
        <Link
          href="/admin/purchase-orders/new"
          className="inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-fg)] hover:brightness-110 transition"
        >
          <Plus size={14} strokeWidth={1.5} /> Yeni Sipariş
        </Link>
      </div>

      {/* Status summary pills */}
      <div className="flex flex-wrap gap-2">
        {(Object.entries(statusCounts) as Array<[string, number]>).map(([status, count]) => (
          <Badge key={status} variant={STATUS_VARIANT[status]}>
            <span className="mr-1">{STATUS_LABELS[status]}</span>
            <span className="font-mono tabular-nums font-semibold">{count}</span>
          </Badge>
        ))}
      </div>

      {/* Orders list */}
      {orders.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-[var(--text-muted)] text-sm">Henüz sipariş oluşturulmamış.</p>
          <Link
            href="/admin/purchase-orders/new"
            className="mt-4 inline-block text-sm font-semibold text-[var(--accent)] hover:brightness-110"
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
                      <span className="font-mono tabular-nums text-sm font-semibold text-[var(--text-primary)]">{order.orderNo}</span>
                      <Badge variant={STATUS_VARIANT[order.status]}>
                        {STATUS_LABELS[order.status]}
                      </Badge>
                      {order.shippingMethod && (
                        <span className={`inline-flex items-center gap-1 text-xs font-medium ${order.shippingMethod === "SEA" ? "text-[var(--info)]" : "text-[var(--warn)]"}`}>
                          {order.shippingMethod === "SEA" ? <Ship size={14} strokeWidth={1.5} /> : <Plane size={14} strokeWidth={1.5} />}
                          {order.shippingMethod === "SEA" ? "Deniz" : "Hava"}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-[var(--text-muted)] tabular-nums">
                      {fmtDate(order.createdAt)}
                      {order.supplier && <> · {order.supplier.name}</>}
                      {order.createdBy && <> · {order.createdBy.name}</>}
                    </p>
                    {/* Items summary */}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {order.items.slice(0, 4).map((item: ItemRow) => (
                        <span key={item.id} className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-3)] px-2 py-0.5 text-xs text-[var(--text-secondary)]">
                          <span className="font-mono tabular-nums">{item.qty}×</span>
                          <span className="max-w-[160px] truncate">{item.product.name}</span>
                        </span>
                      ))}
                      {order.items.length > 4 && (
                        <span className="text-xs text-[var(--text-muted)]">+{order.items.length - 4} daha</span>
                      )}
                    </div>
                    {order.notes && (
                      <p className="mt-1 text-xs text-[var(--text-muted)] italic">{order.notes}</p>
                    )}
                  </div>

                  {/* Right: totals + actions */}
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div className="text-right">
                      {totalCost != null ? (
                        <p className="text-base font-semibold font-mono tabular-nums text-[var(--text-primary)]">{fmt(totalCost)}</p>
                      ) : (
                        <p className="text-sm text-[var(--text-muted)]">Maliyet hesaplanmadı</p>
                      )}
                      <p className="text-xs text-[var(--text-muted)] tabular-nums">{itemCount} ürün · {totalQty} adet</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/purchase-orders/${order.id}`}
                        className="text-xs font-semibold text-[var(--accent)] hover:brightness-110"
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

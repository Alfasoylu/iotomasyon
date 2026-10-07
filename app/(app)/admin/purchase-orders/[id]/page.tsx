import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PurchaseOrderStatusButton } from "@/components/purchase-orders/purchase-order-status-button";

// Satın alma siparişi detayı (2026-10-07 panel taraması: liste "Detay" linki ve oluşturma sonrası yönlendirme
// bu sayfaya gidiyordu ama sayfa yoktu → 404). Salt-okunur; durum değişikliği mevcut buton/aksiyonla.
export const dynamic = "force-dynamic";

const STATUS_LABELS: Record<string, string> = { DRAFT: "Taslak", CONFIRMED: "Onaylandı", ORDERED: "Sipariş Verildi", SHIPPED: "Yolda", RECEIVED: "Teslim Alındı" };
const tl = (n: number | null | undefined) => (n == null ? "—" : new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(n));
const date = (d: Date | null) => (d ? new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" }).format(d) : "—");

export default async function PurchaseOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);
  const { id } = await params;
  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    include: {
      supplier: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      items: { orderBy: { createdAt: "asc" }, include: { product: { select: { id: true, name: true, sku: true } } } },
    },
  });
  if (!order) notFound();
  const totalQty = order.items.reduce((s, i) => s + i.qty, 0);
  const totalCost = order.items.reduce((s, i) => s + Number(i.totalCostTry ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            <Link href="/admin/purchase-orders" className="hover:underline">Satın alma siparişleri</Link>
          </p>
          <h1 className="mt-1 text-2xl font-semibold">{order.orderNo}</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {order.supplier?.name ?? "Tedarikçi yok"} · {order.shippingMethod === "AIR" ? "Hava" : order.shippingMethod === "SEA" ? "Deniz" : "Yöntem seçilmedi"} · oluşturan {order.createdBy?.name ?? "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{STATUS_LABELS[order.status] ?? order.status}</Badge>
          <PurchaseOrderStatusButton orderId={order.id} currentStatus={order.status} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4"><p className="text-xs text-[var(--text-muted)]">Sipariş tarihi</p><p className="mt-1 font-semibold">{date(order.orderDate)}</p></Card>
        <Card className="p-4"><p className="text-xs text-[var(--text-muted)]">Tahmini varış</p><p className="mt-1 font-semibold">{date(order.estimatedArrival)}</p></Card>
        <Card className="p-4"><p className="text-xs text-[var(--text-muted)]">Kalem · adet</p><p className="mt-1 font-semibold">{order.items.length} · {totalQty}</p></Card>
        <Card className="p-4"><p className="text-xs text-[var(--text-muted)]">Toplam maliyet</p><p className="mt-1 font-semibold">{tl(order.totalCostTry != null ? Number(order.totalCostTry) : totalCost || null)}</p></Card>
      </div>
      {order.notes && <Card className="p-4 text-sm">{order.notes}</Card>}
      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-[var(--text-muted)]"><tr>
            <th className="p-3">Ürün</th><th className="p-3">SKU</th><th className="p-3 text-right">Adet</th><th className="p-3 text-right">Birim (RMB)</th><th className="p-3 text-right">Birim (TL)</th><th className="p-3 text-right">Toplam (TL)</th>
          </tr></thead>
          <tbody>{order.items.map(i => <tr key={i.id} className="border-t border-[var(--border)]">
            <td className="p-3"><Link href={`/products/${i.product.id}`} className="hover:underline">{i.product.name}</Link></td>
            <td className="p-3 font-mono text-xs">{i.product.sku}</td>
            <td className="p-3 text-right tabular-nums">{i.qty}</td>
            <td className="p-3 text-right tabular-nums">{i.unitCostRmb == null ? "—" : Number(i.unitCostRmb).toLocaleString("tr-TR")}</td>
            <td className="p-3 text-right tabular-nums">{tl(i.unitCostTry == null ? null : Number(i.unitCostTry))}</td>
            <td className="p-3 text-right tabular-nums">{tl(i.totalCostTry == null ? null : Number(i.totalCostTry))}</td>
          </tr>)}</tbody>
        </table>
      </Card>
    </div>
  );
}

"use server";

/**
 * Phase 77 — Satın Alma Siparişi (Purchase Order) Actions
 *
 * Handles CRUD for PurchaseOrder and PurchaseOrderItem.
 * Orders pre-fill from capital allocation suggestions or manual product search.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import type { ActionResult } from "@/types/actions";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

// ── Generate unique order number ─────────────────────────────────────────────

async function generateOrderNo(): Promise<string> {
  const today = new Date();
  const ymd = today.toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
  const prefix = `PO-${ymd}-`;

  const latest = await prisma.purchaseOrder.findFirst({
    where: { orderNo: { startsWith: prefix } },
    orderBy: { orderNo: "desc" },
    select: { orderNo: true },
  });

  let seq = 1;
  if (latest) {
    const parts = latest.orderNo.split("-");
    const lastSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return `${prefix}${String(seq).padStart(3, "0")}`;
}

// ── Create a new purchase order (DRAFT) ──────────────────────────────────────

export type CreatePurchaseOrderInput = {
  supplierId: string | null;
  shippingMethod: "AIR" | "SEA" | null;
  notes: string;
  items: Array<{
    productId: string;
    qty: number;
    unitCostRmb: number | null;
    unitCostTry: number | null;
  }>;
};

export async function createPurchaseOrderAction(
  input: CreatePurchaseOrderInput,
): Promise<ActionResult & { orderId?: string }> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXECUTIVE_READ))) return PERM_DENIED;

  if (input.items.length === 0) {
    return { ok: false, message: "En az bir ürün eklemelisiniz." };
  }

  try {
    const orderNo = await generateOrderNo();
    const now = new Date();

    // Calculate totals
    const totalCostTry = input.items.reduce((sum, item) => {
      const itemTotal = item.unitCostTry != null ? item.unitCostTry * item.qty : 0;
      return sum + itemTotal;
    }, 0);

    const order = await prisma.purchaseOrder.create({
      data: {
        orderNo,
        supplierId: input.supplierId || null,
        status: "DRAFT",
        shippingMethod: input.shippingMethod ?? null,
        notes: input.notes.trim() || null,
        totalCostTry: totalCostTry > 0 ? totalCostTry : null,
        createdById: user.id,
        updatedAt: now,
        items: {
          create: input.items.map((item) => ({
            productId: item.productId,
            qty: item.qty,
            unitCostRmb: item.unitCostRmb ?? null,
            unitCostTry: item.unitCostTry ?? null,
            totalCostTry:
              item.unitCostTry != null ? item.unitCostTry * item.qty : null,
            updatedAt: now,
          })),
        },
      },
    });

    revalidatePath("/admin/purchase-orders");
    return { ok: true, orderId: order.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
    return { ok: false, message: msg };
  }
}

// ── Update order status ──────────────────────────────────────────────────────

export async function updatePurchaseOrderStatusAction(
  orderId: string,
  status: "DRAFT" | "CONFIRMED" | "ORDERED" | "SHIPPED" | "RECEIVED",
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXECUTIVE_READ))) return PERM_DENIED;

  try {
    await prisma.purchaseOrder.update({
      where: { id: orderId },
      data: { status, updatedAt: new Date() },
    });
    revalidatePath("/admin/purchase-orders");
    return { ok: true };
  } catch {
    return { ok: false, message: "Durum güncellenemedi." };
  }
}

// ── Delete a DRAFT order ─────────────────────────────────────────────────────

export async function deletePurchaseOrderAction(orderId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXECUTIVE_READ))) return PERM_DENIED;

  try {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id: orderId },
      select: { status: true },
    });
    if (!order) return { ok: false, message: "Sipariş bulunamadı." };
    if (order.status !== "DRAFT") {
      return { ok: false, message: "Yalnızca TASLAK durumundaki siparişler silinebilir." };
    }

    await prisma.purchaseOrder.delete({ where: { id: orderId } });
    revalidatePath("/admin/purchase-orders");
    return { ok: true };
  } catch {
    return { ok: false, message: "Sipariş silinemedi." };
  }
}

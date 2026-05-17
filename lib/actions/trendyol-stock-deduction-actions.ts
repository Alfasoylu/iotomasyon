"use server";

/**
 * Phase 43 — Trendyol → Stock Auto-Deduction
 *
 * Processes TrendyolSalesRecord rows where:
 *   - stockDeducted = false
 *   - productId IS NOT NULL (matched)
 *   - status is NOT a cancelled status
 *
 * For each matched product, sums all pending order quantities and:
 *   1. Creates a StockAdjustmentLog entry (type SALE, quantityChange = -total)
 *   2. Updates Product.stockQuantity (floored at 0)
 *   3. Marks all contributing TrendyolSalesRecord rows as stockDeducted = true
 *
 * Requires PRODUCTS_UPDATE permission.
 */

import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { StockAdjustmentType } from "@prisma/client";
import type { ActionResult } from "@/types/actions";
import { revalidatePath } from "next/cache";

function isCancelledStatus(s: string | null): boolean {
  if (!s) return false;
  const lower = s.toLowerCase();
  return lower.includes("iptal") || lower.includes("cancel");
}

/** Returns the number of unprocessed (pending) deductable order lines. */
export async function getPendingDeductionCount(): Promise<number> {
  const rows = await prisma.trendyolSalesRecord.findMany({
    where: { stockDeducted: false, productId: { not: null } },
    select: { status: true },
  });
  return rows.filter((r) => !isCancelledStatus(r.status)).length;
}

export async function applyTrendyolStockDeductionAction(): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.PRODUCTS_UPDATE))) {
    return { ok: false, message: "Bu işlem için yetkiniz yok." };
  }

  // Fetch all pending matched non-cancelled records
  const pending = await prisma.trendyolSalesRecord.findMany({
    where: { stockDeducted: false, productId: { not: null } },
    select: { id: true, productId: true, orderId: true, quantity: true, status: true },
  });

  const deductable = pending.filter((r) => !isCancelledStatus(r.status));

  if (deductable.length === 0) {
    return { ok: true, message: "Bekleyen stok düşümü yok." };
  }

  // Group by productId → sum quantities and collect record IDs
  const byProduct = new Map<string, { totalQty: number; ids: string[]; orderIds: string[] }>();
  for (const r of deductable) {
    const pid = r.productId!;
    const entry = byProduct.get(pid) ?? { totalQty: 0, ids: [], orderIds: [] };
    entry.totalQty += r.quantity;
    entry.ids.push(r.id);
    if (!entry.orderIds.includes(r.orderId)) entry.orderIds.push(r.orderId);
    byProduct.set(pid, entry);
  }

  let deductedProducts = 0;

  for (const [productId, { totalQty, ids, orderIds }] of byProduct) {
    const notesPreview = orderIds.slice(0, 3).join(", ") + (orderIds.length > 3 ? ` +${orderIds.length - 3}` : "");

    await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUniqueOrThrow({
        where: { id: productId },
        select: { stockQuantity: true },
      });

      const previousQty = product.stockQuantity;
      const newQty = Math.max(0, previousQty - totalQty);

      await tx.product.update({
        where: { id: productId },
        data: { stockQuantity: newQty },
      });

      await tx.stockAdjustmentLog.create({
        data: {
          id: crypto.randomUUID(),
          productId,
          adjustmentType: StockAdjustmentType.SALE,
          quantityChange: -(previousQty - newQty),
          previousQty,
          newQty,
          notes: `Trendyol otomatik düşüm — ${ids.length} satır (#${notesPreview})`,
          createdById: user.id,
        },
      });

      await tx.trendyolSalesRecord.updateMany({
        where: { id: { in: ids } },
        data: { stockDeducted: true },
      });
    });

    deductedProducts++;
    revalidatePath(`/products/${productId}`);
  }

  revalidatePath("/orders");

  return {
    ok: true,
    message: `${deductedProducts} üründen toplam ${deductable.length} sipariş satırı stoktan düşüldü.`,
  };
}

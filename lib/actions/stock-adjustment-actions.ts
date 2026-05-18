"use server";

/**
 * Phase 42 — Stock Adjustment Log
 * Phase 89 — Stock Source-of-Truth Fix (Entegra Authoritative)
 *
 * Records manual stock movements in StockAdjustmentLog and updates
 * Product.physicalCountQuantity atomically via a Prisma transaction.
 *
 * IMPORTANT: As of Phase 89, this action NEVER mutates Product.stockQuantity.
 * stockQuantity is owned by XML sync (Entegra ERP) exclusively. Manual
 * adjustments (RESTOCK / CORRECTION / DAMAGE / RETURN / SALE / OTHER) are
 * applied as deltas to physicalCountQuantity — variance vs Entegra stock is
 * computed in the UI as `stockQuantity - physicalCountQuantity`.
 *
 * Requires INVENTORY_COUNT permission (was: PRODUCTS_UPDATE).
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { StockAdjustmentType } from "@prisma/client";
import type { ActionResult } from "@/types/actions";
import { revalidatePath } from "next/cache";

const adjustmentSchema = z.object({
  productId: z.string().min(1),
  adjustmentType: z.nativeEnum(StockAdjustmentType),
  quantityChange: z
    .number()
    .int()
    .refine((n) => n !== 0, { message: "Miktar sıfır olamaz." }),
  notes: z.string().max(500).optional(),
});

export type StockAdjustmentFormValues = z.infer<typeof adjustmentSchema>;

export async function createStockAdjustmentAction(
  values: StockAdjustmentFormValues,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.INVENTORY_COUNT))) {
    return { ok: false, message: "Bu işlem için yetkiniz yok (inventory.count gerekli)." };
  }

  const parsed = adjustmentSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Geçersiz form verisi." };
  }

  const { productId, adjustmentType, quantityChange, notes } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUniqueOrThrow({
        where: { id: productId },
        select: {
          stockQuantity: true,
          physicalCountQuantity: true,
        },
      });

      // Baseline: existing physical count if present, else Entegra stock
      const previousQty = product.physicalCountQuantity ?? product.stockQuantity;
      const newQty = previousQty + quantityChange;

      // Prevent negative physical count
      if (newQty < 0) {
        throw new Error(`Fiziksel sayım sıfırın altına düşemez. Mevcut: ${previousQty}, değişim: ${quantityChange}`);
      }

      // Update physical count + metadata (stockQuantity is NEVER touched in Phase 89)
      await tx.product.update({
        where: { id: productId },
        data: {
          physicalCountQuantity: newQty,
          physicalCountAt: new Date(),
          physicalCountById: user.id,
          physicalCountNote: notes?.trim() || null,
        },
      });

      // Write log entry (audit trail unchanged)
      await tx.stockAdjustmentLog.create({
        data: {
          id: crypto.randomUUID(),
          productId,
          adjustmentType,
          quantityChange,
          previousQty,
          newQty,
          notes: notes?.trim() || null,
          createdById: user.id,
        },
      });
    });

    revalidatePath(`/products/${productId}`);
    revalidatePath(`/products/${productId}/edit`);
    return { ok: true, message: "Fiziksel sayım hareketi kaydedildi." };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Stok hareketi kaydedilemedi.";
    return { ok: false, message: msg };
  }
}

export async function getProductStockAdjustments(productId: string) {
  return prisma.stockAdjustmentLog.findMany({
    where: { productId },
    include: { createdBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

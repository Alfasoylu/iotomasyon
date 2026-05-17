"use server";

/**
 * Phase 42 — Stock Adjustment Log
 *
 * Records manual stock movements in StockAdjustmentLog and updates
 * Product.stockQuantity atomically via a Prisma transaction.
 *
 * Requires PRODUCTS_UPDATE permission.
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
  if (!(await checkPermission(user, PERMISSIONS.PRODUCTS_UPDATE))) {
    return { ok: false, message: "Bu işlem için yetkiniz yok." };
  }

  const parsed = adjustmentSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Geçersiz form verisi." };
  }

  const { productId, adjustmentType, quantityChange, notes } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      // Lock and read current qty
      const product = await tx.product.findUniqueOrThrow({
        where: { id: productId },
        select: { stockQuantity: true },
      });

      const previousQty = product.stockQuantity;
      const newQty = previousQty + quantityChange;

      // Prevent negative stock
      if (newQty < 0) {
        throw new Error(`Stok sıfırın altına düşemez. Mevcut: ${previousQty}, değişim: ${quantityChange}`);
      }

      // Update product stock
      await tx.product.update({
        where: { id: productId },
        data: { stockQuantity: newQty },
      });

      // Write log entry
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
    return { ok: true, message: "Stok hareketi kaydedildi." };
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

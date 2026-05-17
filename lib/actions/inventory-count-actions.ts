"use server";

/**
 * Phase 55 — Inventory Count Action
 *
 * Allows WAREHOUSE (and OPERATIONS) users to record an absolute stock count.
 * Requires INVENTORY_COUNT permission (NOT PRODUCTS_UPDATE — safer for warehouse staff).
 *
 * Takes an absolute newQuantity, computes the delta against current stock,
 * then atomically updates Product.stockQuantity and writes a CORRECTION StockAdjustmentLog.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { checkPermission, requireUser } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { StockAdjustmentType } from "@prisma/client";
import type { ActionResult } from "@/types/actions";

const countSchema = z.object({
  productId: z.string().min(1, "Ürün seçilmedi."),
  newQuantity: z
    .number()
    .int()
    .min(0, "Adet sıfır veya daha fazla olmalı."),
  notes: z.string().max(500).optional(),
});

export async function createInventoryCountAction(values: {
  productId: string;
  newQuantity: number;
  notes?: string;
}): Promise<ActionResult> {
  const user = await requireUser();

  if (!(await checkPermission(user, PERMISSIONS.INVENTORY_COUNT))) {
    return { ok: false, message: "Bu işlem için yetkiniz yok (inventory.count gerekli)." };
  }

  const parsed = countSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Geçersiz form verisi." };
  }

  const { productId, newQuantity, notes } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUniqueOrThrow({
        where: { id: productId },
        select: { stockQuantity: true, name: true },
      });

      const previousQty = product.stockQuantity;
      const delta = newQuantity - previousQty;

      // If nothing changed, skip (idempotent)
      if (delta === 0) return;

      await tx.product.update({
        where: { id: productId },
        data: { stockQuantity: newQuantity },
      });

      await tx.stockAdjustmentLog.create({
        data: {
          productId,
          adjustmentType: StockAdjustmentType.CORRECTION,
          quantityChange: delta,
          previousQty,
          newQty: newQuantity,
          notes: notes?.trim() || `Depo sayımı — ${new Date().toLocaleDateString("tr-TR")}`,
          createdById: user.id,
        },
      });
    });

    revalidatePath(`/products`);
    revalidatePath(`/warehouse`);
    revalidatePath(`/admin/stock-health`);

    return { ok: true, message: "Stok sayımı kaydedildi." };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Beklenmeyen hata.";
    return { ok: false, message: msg };
  }
}

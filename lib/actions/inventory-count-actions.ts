"use server";

/**
 * Phase 55 — Inventory Count Action
 * Phase 89 — Stock Source-of-Truth Fix (Entegra Authoritative)
 *
 * Allows WAREHOUSE (and OPERATIONS / ADMIN) users to record an absolute
 * physical count. The recorded count is written to physicalCountQuantity —
 * NEVER to Product.stockQuantity. stockQuantity remains source-of-truth for
 * Entegra (XML sync only).
 *
 * Variance (stockQuantity - physicalCountQuantity) is derived in the UI.
 * StockAdjustmentLog audit trail is preserved.
 *
 * Requires INVENTORY_COUNT permission.
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
        select: {
          stockQuantity: true,
          physicalCountQuantity: true,
          name: true,
        },
      });

      // Baseline for audit log: existing physical count if present, else Entegra stock
      const previousQty = product.physicalCountQuantity ?? product.stockQuantity;
      const delta = newQuantity - previousQty;

      // Idempotent: if neither physical count nor metadata change is meaningful, still
      // write the new physicalCountAt (re-confirms the count) but skip log entry when delta=0.
      const now = new Date();

      await tx.product.update({
        where: { id: productId },
        data: {
          physicalCountQuantity: newQuantity,
          physicalCountAt: now,
          physicalCountById: user.id,
          physicalCountNote: notes?.trim() || null,
          // NOTE: Phase 89 — stockQuantity is NEVER mutated here.
        },
      });

      if (delta !== 0) {
        await tx.stockAdjustmentLog.create({
          data: {
            productId,
            adjustmentType: StockAdjustmentType.CORRECTION,
            quantityChange: delta,
            previousQty,
            newQty: newQuantity,
            notes: notes?.trim() || `Depo sayımı — ${now.toLocaleDateString("tr-TR")}`,
            createdById: user.id,
          },
        });
      }
    });

    revalidatePath(`/products`);
    revalidatePath(`/products/${productId}`);
    revalidatePath(`/warehouse`);
    revalidatePath(`/admin/stock-health`);

    return { ok: true, message: "Fiziksel sayım kaydedildi." };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Beklenmeyen hata.";
    return { ok: false, message: msg };
  }
}

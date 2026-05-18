"use server";

/**
 * Phase 84 — Trendyol Group → Product Link Action
 *
 * Links all TrendyolSalesRecord rows belonging to a given
 * (merchantSku, barcode) group to a chosen Product.id.
 *
 * ADMIN-only. No schema change — writes productId onto
 * existing TrendyolSalesRecord rows.
 */

import { getCurrentSession, isOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type LinkResult =
  | { success: true; linked: number }
  | { success: false; error: string };

export async function linkTrendyolGroupAction(params: {
  merchantSku: string;
  barcode: string;
  productId: string;
}): Promise<LinkResult> {
  const user = await getCurrentSession();
  if (!user || (user.role !== "ADMIN" && !isOwner(user))) {
    return { success: false, error: "Yetki yok" };
  }

  const { merchantSku, barcode, productId } = params;

  // Verify the target product exists
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true },
  });
  if (!product) {
    return { success: false, error: "Ürün bulunamadı" };
  }

  // Link all unmatched records matching this (merchantSku, barcode) pair
  const whereClause = barcode
    ? {
        productId: null,
        merchantSku,
        barcode,
      }
    : {
        productId: null,
        merchantSku,
      };

  const result = await prisma.trendyolSalesRecord.updateMany({
    where: whereClause,
    data: {
      productId,
      syncedAt: new Date(),
    },
  });

  return { success: true, linked: result.count };
}

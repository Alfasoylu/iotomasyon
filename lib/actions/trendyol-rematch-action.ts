"use server";

/**
 * Phase 83 — Trendyol Satış Kaydı Yeniden Eşleştirme
 *
 * TrendyolSalesRecord rows that have productId=NULL are re-matched against
 * the current Product catalog using exact SKU and barcode lookups.
 *
 * No Trendyol API call needed — this is a pure DB re-match.
 */

import { getCurrentSession, isOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type RematchResult =
  | {
      success: true;
      fixedBySku: number;
      fixedByBarcode: number;
      totalFixed: number;
      remainingUnmatched: number;
    }
  | { success: false; error: string };

export async function rematchTrendyolSalesAction(): Promise<RematchResult> {
  const user = await getCurrentSession();
  if (!user || (user.role !== "ADMIN" && !isOwner(user))) {
    return { success: false, error: "Yetki yok" };
  }

  try {
    // Step 1: Re-match by merchantSku = Product.sku (case-insensitive)
    const skuFixed = await prisma.$executeRaw`
      UPDATE "TrendyolSalesRecord" tsr
      SET "productId" = p.id,
          "syncedAt" = NOW()
      FROM "Product" p
      WHERE tsr."productId" IS NULL
        AND p.sku IS NOT NULL
        AND LOWER(tsr."merchantSku") = LOWER(p.sku)
    `;

    // Step 2: Re-match by barcode = Product.barcode (case-insensitive, only still-unmatched)
    const barcodeFixed = await prisma.$executeRaw`
      UPDATE "TrendyolSalesRecord" tsr
      SET "productId" = p.id,
          "syncedAt" = NOW()
      FROM "Product" p
      WHERE tsr."productId" IS NULL
        AND p.barcode IS NOT NULL
        AND LOWER(tsr."barcode") = LOWER(p.barcode)
    `;

    const remainingUnmatched = await prisma.trendyolSalesRecord.count({
      where: { productId: null },
    });

    return {
      success: true,
      fixedBySku: Number(skuFixed),
      fixedByBarcode: Number(barcodeFixed),
      totalFixed: Number(skuFixed) + Number(barcodeFixed),
      remainingUnmatched,
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Bilinmeyen hata",
    };
  }
}

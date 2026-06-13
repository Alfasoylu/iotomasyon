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
      fixedByName: number;
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

    // Step 3: Re-match by the stock code Trendyol appends to the product name.
    // Trendyol listings carry their own merchantSku/barcode, but the seller's
    // catalog SKU is embedded as the last token of productName (e.g.
    // "...Adaptör AL4858, one size" → "AL4858"). We strip a trailing ", one size",
    // take the last whitespace token, and match it to Product.sku — but ONLY when
    // exactly one product has that SKU, so an ambiguous code never mis-links.
    // POSIX character classes ([[:space:]]) are used instead of \s/\S to avoid
    // backslash-escape pitfalls inside the JS tagged-template string.
    const nameFixed = await prisma.$executeRaw`
      UPDATE "TrendyolSalesRecord" t
      SET "productId" = sub.pid,
          "syncedAt" = NOW()
      FROM (
        SELECT tsr.id AS rec_id, p.id AS pid
        FROM "TrendyolSalesRecord" tsr
        JOIN "Product" p
          ON p.sku IS NOT NULL
         AND LOWER(p.sku) = LOWER(trim(substring(
               regexp_replace(tsr."productName", ',[[:space:]]*one size[[:space:]]*$', '', 'i')
               from '([^[:space:]]+)[[:space:]]*$')))
        WHERE tsr."productId" IS NULL
          AND (
            SELECT count(*) FROM "Product" p2
            WHERE p2.sku IS NOT NULL
              AND LOWER(p2.sku) = LOWER(trim(substring(
                    regexp_replace(tsr."productName", ',[[:space:]]*one size[[:space:]]*$', '', 'i')
                    from '([^[:space:]]+)[[:space:]]*$')))
          ) = 1
      ) sub
      WHERE t.id = sub.rec_id
    `;

    const remainingUnmatched = await prisma.trendyolSalesRecord.count({
      where: { productId: null },
    });

    return {
      success: true,
      fixedBySku: Number(skuFixed),
      fixedByBarcode: Number(barcodeFixed),
      fixedByName: Number(nameFixed),
      totalFixed: Number(skuFixed) + Number(barcodeFixed) + Number(nameFixed),
      remainingUnmatched,
    };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Bilinmeyen hata",
    };
  }
}

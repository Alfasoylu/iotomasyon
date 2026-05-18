"use server";

/**
 * Phase 84 — Product search server action
 *
 * Used by the Trendyol matching page's "link" modal to find
 * candidate products to bind to an unmatched group.
 */

import { getCurrentSession, isOwner } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type ProductSearchResult = {
  id: string;
  sku: string | null;
  name: string;
  barcode: string | null;
  stockQuantity: number;
};

export async function searchProductsAction(
  query: string,
): Promise<{ success: true; products: ProductSearchResult[] } | { success: false; error: string }> {
  const user = await getCurrentSession();
  if (!user || (user.role !== "ADMIN" && !isOwner(user))) {
    return { success: false, error: "Yetki yok" };
  }

  const q = query.trim();
  if (q.length < 2) return { success: true, products: [] };

  const products = await prisma.product.findMany({
    where: {
      isActive: true,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { barcode: { contains: q, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      sku: true,
      name: true,
      barcode: true,
      stockQuantity: true,
    },
    orderBy: { name: "asc" },
    take: 12,
  });

  return { success: true, products };
}

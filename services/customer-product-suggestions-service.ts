/**
 * services/customer-product-suggestions-service.ts — Phase 96c
 *
 * Müşterinin geçmiş kategori + ürün ilgisinden öneri çıkarıyor.
 * Çağrı sırasında sales rep "şu kategorideki yeni ürünler" görmek isterse hızlı erişim.
 */
import "server-only";
import { prisma } from "@/lib/prisma";

export interface SuggestedProduct {
  id: string;
  name: string;
  sku: string | null;
  brand: string | null;
  categoryId: string | null;
  categoryName: string | null;
  priceTry: number | null;
  stockQuantity: number | null;
  reason: "category_interest" | "product_interest" | "popular";
}

export async function getProductSuggestionsForCustomer(
  customerId: string,
  limit = 8,
): Promise<SuggestedProduct[]> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      categoryInterests: { select: { categoryId: true } },
      interests: { select: { productId: true } },
    },
  });
  if (!customer) return [];

  const categoryIds = customer.categoryInterests
    .map((c) => c.categoryId)
    .filter((id): id is string => !!id);
  const knownProductIds = new Set(
    customer.interests.map((i) => i.productId).filter((id): id is string => !!id),
  );

  if (categoryIds.length === 0) return [];

  const products = await prisma.product.findMany({
    where: {
      categoryId: { in: categoryIds },
      isActive: true,
      id: { notIn: Array.from(knownProductIds) },
    },
    select: {
      id: true,
      name: true,
      sku: true,
      brand: true,
      categoryId: true,
      productCategory: { select: { name: true } },
      sellingPriceTry: true,
      stockQuantity: true,
    },
    orderBy: [{ stockQuantity: "desc" }, { updatedAt: "desc" }],
    take: limit,
  });

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    brand: p.brand,
    categoryId: p.categoryId,
    categoryName: p.productCategory?.name ?? null,
    priceTry: p.sellingPriceTry ? Number(p.sellingPriceTry) : null,
    stockQuantity: p.stockQuantity,
    reason: "category_interest" as const,
  }));
}

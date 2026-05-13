import "server-only";

import { prisma } from "@/lib/prisma";

export async function getDashboardStats() {
  const [productCount, activeProducts, locations] = await Promise.all([
    prisma.product.count(),
    prisma.product.findMany({
      where: { isActive: true },
      select: {
        stockQuantity: true,
        minimumStock: true,
      },
    }),
    prisma.product.findMany({
      where: { location: { not: null } },
      select: { location: true },
      distinct: ["location"],
    }),
  ]);

  const activeProductCount = activeProducts.length;
  const lowStockCount = activeProducts.filter(
    (product) => product.stockQuantity <= product.minimumStock,
  ).length;

  return {
    productCount,
    activeProductCount,
    lowStockCount,
    locationCount: locations.length,
  };
}

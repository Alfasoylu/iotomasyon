import "server-only";

import { isDatabaseUnavailableError } from "@/lib/database";
import { prisma } from "@/lib/prisma";

export async function getDashboardStats() {
  try {
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
      databaseAvailable: true as const,
      productCount,
      activeProductCount,
      lowStockCount,
      locationCount: locations.length,
    };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return {
        databaseAvailable: false as const,
        productCount: 0,
        activeProductCount: 0,
        lowStockCount: 0,
        locationCount: 0,
      };
    }

    throw error;
  }
}

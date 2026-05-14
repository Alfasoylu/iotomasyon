import "server-only";

import { isDatabaseUnavailableError } from "@/lib/database";
import { prisma } from "@/lib/prisma";

export async function getDashboardStats() {
  try {
    const [
      productCount,
      activeProducts,
      locations,
      customerCount,
      newCustomerCount,
      quotedCustomerCount,
      negotiatingCustomerCount,
      wonCustomerCount,
      openFollowups,
      overdueTasks,
    ] = await Promise.all([
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
      prisma.customer.count(),
      prisma.customer.count({ where: { status: "NEW" } }),
      prisma.customer.count({ where: { status: "QUOTED" } }),
      prisma.customer.count({ where: { status: "NEGOTIATING" } }),
      prisma.customer.count({ where: { status: "WON" } }),
      prisma.followUpTask.count({ where: { status: "OPEN" } }),
      prisma.followUpTask.count({
        where: {
          status: "OPEN",
          dueDate: { lt: new Date() },
        },
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
      customerCount,
      newCustomerCount,
      quotedCustomerCount,
      negotiatingCustomerCount,
      wonCustomerCount,
      openFollowups,
      overdueTasks,
    };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return {
        databaseAvailable: false as const,
        productCount: 0,
        activeProductCount: 0,
        lowStockCount: 0,
        locationCount: 0,
        customerCount: 0,
        newCustomerCount: 0,
        quotedCustomerCount: 0,
        negotiatingCustomerCount: 0,
        wonCustomerCount: 0,
        openFollowups: 0,
        overdueTasks: 0,
      };
    }

    throw error;
  }
}

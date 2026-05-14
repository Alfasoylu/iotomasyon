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
      quotesSent,
      acceptedRevenue,
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
      prisma.quote.count({
        where: {
          status: { in: ["SENT", "ACCEPTED", "DECLINED"] },
        },
      }),
      prisma.quote.aggregate({
        where: { status: "ACCEPTED" },
        _sum: { total: true },
      }),
    ]);

    const activeProductCount = activeProducts.length;
    const lowStockCount = activeProducts.filter(
      (product) => product.stockQuantity <= product.minimumStock,
    ).length;

    const openDeals = newCustomerCount + quotedCustomerCount + negotiatingCustomerCount;
    const lostDeals = await prisma.customer.count({ where: { status: "LOST" } });
    const conversionRate = customerCount > 0 ? (wonCustomerCount / customerCount) * 100 : 0;

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
      quotesSent,
      wonRevenue: Number(acceptedRevenue._sum.total ?? 0),
      lostDeals,
      openDeals,
      conversionRate,
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
        quotesSent: 0,
        wonRevenue: 0,
        lostDeals: 0,
        openDeals: 0,
        conversionRate: 0,
      };
    }

    throw error;
  }
}

export async function getDueTodayFollowups() {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    return {
      databaseAvailable: true as const,
      tasks: await prisma.followUpTask.findMany({
        where: {
          status: "OPEN",
          dueDate: {
            gte: startOfDay,
            lt: endOfDay,
          },
        },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              company: true,
            },
          },
        },
        orderBy: { dueDate: "asc" },
        take: 10,
      }),
    };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return {
        databaseAvailable: false as const,
        tasks: [],
      };
    }

    throw error;
  }
}

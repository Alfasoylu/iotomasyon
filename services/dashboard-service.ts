import "server-only";

import { isDatabaseUnavailableError } from "@/lib/database";
import { prisma } from "@/lib/prisma";

export async function getDashboardStats() {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

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
      monthlyRevenue,
      averageDeal,
      topProducts,
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
          status: { in: ["SENT", "VIEWED", "ACCEPTED", "DECLINED", "WON", "LOST"] },
        },
      }),
      prisma.quote.aggregate({
        where: { status: { in: ["ACCEPTED", "WON"] } },
        _sum: { total: true },
      }),
      prisma.quote.aggregate({
        where: {
          status: { in: ["ACCEPTED", "WON"] },
          createdAt: { gte: startOfMonth },
        },
        _sum: { total: true },
      }),
      prisma.quote.aggregate({
        where: { status: { in: ["ACCEPTED", "WON"] } },
        _avg: { total: true },
      }),
      prisma.quoteItem.groupBy({
        by: ["productId"],
        where: {
          productId: { not: null },
          quote: { status: { in: ["ACCEPTED", "WON"] } },
        },
        _sum: { quantity: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 5,
      }),
    ]);

    const activeProductCount = activeProducts.length;
    const lowStockCount = activeProducts.filter(
      (product) => product.stockQuantity <= product.minimumStock,
    ).length;

    const openDeals = newCustomerCount + quotedCustomerCount + negotiatingCustomerCount;
    const lostDeals = await prisma.customer.count({ where: { status: "LOST" } });
    const conversionRate = customerCount > 0 ? (wonCustomerCount / customerCount) * 100 : 0;

    // Resolve top product names
    const productIds = topProducts.map((r) => r.productId).filter(Boolean) as string[];
    const productNames =
      productIds.length > 0
        ? await prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true, sku: true },
          })
        : [];
    const productMap = Object.fromEntries(productNames.map((p) => [p.id, p]));

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
      monthlyRevenue: Number(monthlyRevenue._sum.total ?? 0),
      averageDealSize: Number(averageDeal._avg.total ?? 0),
      lostDeals,
      openDeals,
      conversionRate,
      topProducts: topProducts.map((r) => ({
        productId: r.productId!,
        name: productMap[r.productId!]?.name ?? r.productId!,
        sku: productMap[r.productId!]?.sku ?? "",
        totalQty: r._sum.quantity ?? 0,
      })),
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
        monthlyRevenue: 0,
        averageDealSize: 0,
        lostDeals: 0,
        openDeals: 0,
        conversionRate: 0,
        topProducts: [],
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

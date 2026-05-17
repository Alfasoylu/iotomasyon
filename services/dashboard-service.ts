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

// ─── Phase 47 — Operational Alerts ────────────────────────────────────────────
// Fast DB-only signals for the dashboard operational section.
function _isCancelledStatus(s: string | null): boolean {
  if (!s) return false;
  const l = s.toLowerCase();
  return l.includes("iptal") || l.includes("cancel");
}

export async function getOperationalAlerts() {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      criticalStockCount,
      unmatchedOrdersCount,
      recentRows,
      revenueRows,
    ] = await Promise.all([
      prisma.product.count({ where: { stockQuantity: { lte: 0 } } }),
      // Unmatched Trendyol order lines (no internal product linked)
      prisma.trendyolSalesRecord.count({ where: { productId: null } }),
      // Recent 7-day order lines
      prisma.trendyolSalesRecord.findMany({
        where: { orderDate: { gte: sevenDaysAgo } },
        select: { status: true, quantity: true },
      }),
      // 30-day revenue (for financial summary)
      prisma.trendyolSalesRecord.findMany({
        where: { orderDate: { gte: thirtyDaysAgo } },
        select: { status: true, totalPriceTry: true },
      }),
    ]);

    const recentOrderQty7d = recentRows
      .filter((r) => !_isCancelledStatus(r.status))
      .reduce((s, r) => s + r.quantity, 0);

    const trendyolRevenue30d = revenueRows
      .filter((r) => !_isCancelledStatus(r.status))
      .reduce((s, r) => s + Number(r.totalPriceTry), 0);

    return {
      databaseAvailable: true as const,
      criticalStockCount,
      unmatchedOrdersCount,
      recentOrderQty7d,
      trendyolRevenue30d,
    };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return {
        databaseAvailable: false as const,
        criticalStockCount: 0,
        unmatchedOrdersCount: 0,
        recentOrderQty7d: 0,
        trendyolRevenue30d: 0,
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

// ─── Phase 54 Faz B — Sales Pipeline Data ────────────────────────────────────
// SECURITY RULE: This function MUST NEVER return financial fields (cost, margin,
// trendyolRevenue, unitCostTry, sourceCostRmb, etc.). Only safe CRM fields.
export async function getSalesPipelineData(userId: string) {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      activeInterests,
      dueTodayTasks,
      recentCustomers,
      openTasksCount,
      overdueTasksCount,
    ] = await Promise.all([
      // Active product interests assigned to this sales rep
      prisma.productInterest.findMany({
        where: {
          assignedToId: userId,
          status: { in: ["NEW", "WAITING_STOCK", "CONTACTED", "QUOTED"] },
        },
        select: {
          id: true,
          status: true,
          followUpAt: true,
          customer: { select: { id: true, name: true } },
          product: { select: { id: true, name: true, sku: true, imageUrl: true } },
          // NOTE: quotedPrice is intentionally omitted — sales reps don't need it in the dashboard
        },
        orderBy: { followUpAt: "asc" },
        take: 10,
      }),
      // Follow-up tasks due today, assigned to this user
      prisma.followUpTask.findMany({
        where: {
          assignedToId: userId,
          status: "OPEN",
          dueDate: { gte: todayStart, lt: todayEnd },
        },
        select: {
          id: true,
          title: true,
          dueDate: true,
          priority: true,
          customer: { select: { id: true, name: true } },
        },
        orderBy: { dueDate: "asc" },
        take: 10,
      }),
      // Recently active customers (status changed in last 7 days)
      prisma.customer.findMany({
        where: {
          updatedAt: { gte: sevenDaysAgo },
          status: { in: ["QUOTED", "NEGOTIATING", "WON"] },
        },
        select: {
          id: true,
          name: true,
          status: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 5,
      }),
      // Open tasks count for this user
      prisma.followUpTask.count({
        where: { assignedToId: userId, status: "OPEN" },
      }),
      // Overdue tasks count for this user
      prisma.followUpTask.count({
        where: {
          assignedToId: userId,
          status: "OPEN",
          dueDate: { lt: now },
        },
      }),
    ]);

    return {
      databaseAvailable: true as const,
      activeInterests,
      dueTodayTasks,
      recentCustomers,
      openTasksCount,
      overdueTasksCount,
    };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return {
        databaseAvailable: false as const,
        activeInterests: [],
        dueTodayTasks: [],
        recentCustomers: [],
        openTasksCount: 0,
        overdueTasksCount: 0,
      };
    }
    throw error;
  }
}

// ─── Exported return types (for workspace components) ────────────────────────
export type DashboardStats = Awaited<ReturnType<typeof getDashboardStats>>;
export type OperationalAlerts = Awaited<ReturnType<typeof getOperationalAlerts>>;
export type DueTodayFollowups = Awaited<ReturnType<typeof getDueTodayFollowups>>;
export type SalesPipelineData = Awaited<ReturnType<typeof getSalesPipelineData>>;

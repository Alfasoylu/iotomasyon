import { requireUser } from "@/lib/auth";
import { getSmartRecommendations } from "@/lib/smart-recommendations";
import {
  getAdminEnhancedData,
  getCapitalSnapshot,
  getDashboardStats,
  getDueTodayFollowups,
  getMarketplaceDashboardData,
  getOperationalAlerts,
  getOperationsDashboardData,
  getSalesPipelineData,
} from "@/services/dashboard-service";
import { getSalesRepKPIs } from "@/services/sales-rep-kpi-service";
import { getCustomerCohortCounts, getPowerQueueIds } from "@/services/customer-cohort-service";
import { prisma } from "@/lib/prisma";
import { AdminWorkspace } from "./_components/admin-workspace";
import { MarketplaceWorkspace } from "./_components/marketplace-workspace";
import { OperationsWorkspace } from "./_components/operations-workspace";
import { SalesWorkspace } from "./_components/sales-workspace";
import { WarehouseWorkspace } from "./_components/warehouse-workspace";
import { SalesRepDashboard } from "@/components/dashboard/sales-rep-dashboard";
import { DashboardViewToggle } from "@/components/dashboard/dashboard-view-toggle";

export const dynamic = "force-dynamic";

const SEGMENT_LABELS: Record<string, string> = {
  B2B_RESELLER: "B2B Bayi",
  INSTALLATION: "Montaj",
  MARKETPLACE: "Pazaryeri",
};

async function fetchSalesRepDashboardData(userId: string) {
  const [kpis, cohortCounts, queueIds] = await Promise.all([
    getSalesRepKPIs(userId),
    getCustomerCohortCounts(userId),
    getPowerQueueIds(1),
  ]);

  let nowCallCustomer = null;
  if (queueIds.length > 0) {
    const top = await prisma.customer.findUnique({
      where: { id: queueIds[0] },
      select: {
        id: true,
        name: true,
        company: true,
        phone: true,
        whatsapp: true,
        city: true,
        district: true,
        status: true,
        lastContactedAt: true,
        segment: true,
        industry: { select: { name: true } },
      },
    });
    if (top) {
      const days = top.lastContactedAt
        ? Math.floor((Date.now() - top.lastContactedAt.getTime()) / (24 * 60 * 60 * 1000))
        : null;
      nowCallCustomer = {
        id: top.id,
        name: top.name,
        company: top.company,
        phone: top.phone,
        whatsapp: top.whatsapp,
        city: top.city,
        district: top.district,
        status: top.status,
        lastContactedAt: top.lastContactedAt,
        segmentLabel: top.segment ? SEGMENT_LABELS[top.segment] ?? null : null,
        industryLabel: top.industry?.name ?? null,
        daysSinceContact: days,
      };
      // Anti-monotony: queue gösterildi say
      await prisma.customer.update({
        where: { id: top.id },
        data: { shownInQueueCount: { increment: 1 } },
      }).catch(() => null);
    }
  }

  // Görevlerim
  const myTaskRows = await prisma.followUpTask.findMany({
    where: {
      OR: [
        { assignedToId: userId },
        { createdById: userId, assignedToId: null },
      ],
      status: { not: "DONE" },
    },
    orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
    take: 10,
    select: {
      id: true,
      title: true,
      dueDate: true,
      priority: true,
      customerId: true,
      customer: { select: { name: true } },
    },
  });
  const now = new Date();
  const myTasks = myTaskRows.map((t) => ({
    id: t.id,
    title: t.title,
    dueDate: t.dueDate,
    priority: t.priority as "LOW" | "MEDIUM" | "HIGH" | "URGENT",
    customerId: t.customerId,
    customerName: t.customer?.name ?? null,
    isOverdue: t.dueDate ? t.dueDate < now : false,
  }));

  return { kpis, cohortCounts, nowCallCustomer, myTasks };
}

/**
 * Phase 54 — Role-Based Workspace Dashboards
 *
 * Faz A (2026-05-17): Role router structure established.
 * Faz B (2026-05-17): SalesWorkspace wired — pipeline, today's tasks, recent activity.
 *   getSalesPipelineData() NEVER returns financial fields.
 * Faz C (2026-05-17): OperationsWorkspace wired — tasks, stock alerts, order signals.
 *   getOperationsDashboardData() NEVER returns financial fields.
 *
 * Faz D (2026-05-17): AdminWorkspace enhanced — exchange rate, pipeline summary,
 *   import snapshots, reorder signal, completed tasks. Admin-only financial context.
 *
 * Faz E (2026-05-17): WarehouseWorkspace wired — stock + task signals, no financial data.
 *   WAREHOUSE enum migration done (Phase 55). getOperationsDashboardData() reused.
 *
 * Faz F (2026-05-17): MarketplaceWorkspace wired — listing/order/return/task signals.
 *   getMarketplaceDashboardData() NEVER returns financial fields.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = (await searchParams) ?? {};
  const viewParam = typeof params.view === "string" ? params.view : null;

  // SALES role: yeni Sales Rep Dashboard (P1)
  // Admin de ?view=sales ile bu görünümü görebilir
  const isAdminViewingSales = user.role === "ADMIN" && viewParam === "sales";
  if (user.role === "SALES" || isAdminViewingSales) {
    const data = await fetchSalesRepDashboardData(user.id);
    return (
      <div className="space-y-3">
        {user.role === "ADMIN" && (
          <div className="flex justify-end">
            <DashboardViewToggle currentView="sales" />
          </div>
        )}
        <SalesRepDashboard
          userName={user.name}
          kpis={data.kpis}
          cohortCounts={data.cohortCounts}
          nowCallCustomer={data.nowCallCustomer}
          myTasks={data.myTasks}
          weeklyTarget={{ calls: 150, quotes: 20, deals: 5 }}
        />
      </div>
    );
  }

  // OPERATIONS role: operational signals only (never financial data)
  if (user.role === "OPERATIONS") {
    const opsData = await getOperationsDashboardData();
    return <OperationsWorkspace data={opsData} />;
  }

  // WAREHOUSE role: operational signals only (stock + tasks, never financial data)
  if (user.role === "WAREHOUSE") {
    const warehouseData = await getOperationsDashboardData();
    return <WarehouseWorkspace data={warehouseData} />;
  }

  // MARKETPLACE_OPERATOR role: listing/order/return signals only (never financial data)
  if (user.role === "MARKETPLACE_OPERATOR") {
    const marketplaceData = await getMarketplaceDashboardData();
    return <MarketplaceWorkspace data={marketplaceData} />;
  }

  // ADMIN, CUSTOM — full admin view with enhanced signals + capital snapshot + smart recs.
  const [stats, dueToday, alerts, enhanced, capital, smartRecs] = await Promise.all([
    getDashboardStats(),
    getDueTodayFollowups(),
    getOperationalAlerts(),
    getAdminEnhancedData(),
    getCapitalSnapshot(),
    getSmartRecommendations(),
  ]);

  return (
    <div className="space-y-3">
      {user.role === "ADMIN" && (
        <div className="flex justify-end">
          <DashboardViewToggle currentView="admin" />
        </div>
      )}
      <AdminWorkspace
        user={{ name: user.name }}
        stats={stats}
        dueToday={dueToday}
        alerts={alerts}
        enhanced={enhanced}
        capital={capital}
        smartRecs={smartRecs.recs}
      />
    </div>
  );
}

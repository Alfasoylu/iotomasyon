import { requireUser } from "@/lib/auth";
import {
  getAdminEnhancedData,
  getDashboardStats,
  getDueTodayFollowups,
  getMarketplaceDashboardData,
  getOperationalAlerts,
  getOperationsDashboardData,
  getSalesPipelineData,
} from "@/services/dashboard-service";
import { AdminWorkspace } from "./_components/admin-workspace";
import { MarketplaceWorkspace } from "./_components/marketplace-workspace";
import { OperationsWorkspace } from "./_components/operations-workspace";
import { SalesWorkspace } from "./_components/sales-workspace";
import { WarehouseWorkspace } from "./_components/warehouse-workspace";

export const dynamic = "force-dynamic";

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
export default async function DashboardPage() {
  const user = await requireUser();

  // SALES role: only fetch pipeline data (never financial data)
  if (user.role === "SALES") {
    const salesData = await getSalesPipelineData(user.id);
    return <SalesWorkspace data={salesData} />;
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

  // ADMIN, CUSTOM — full admin view with enhanced signals.
  const [stats, dueToday, alerts, enhanced] = await Promise.all([
    getDashboardStats(),
    getDueTodayFollowups(),
    getOperationalAlerts(),
    getAdminEnhancedData(),
  ]);

  return <AdminWorkspace stats={stats} dueToday={dueToday} alerts={alerts} enhanced={enhanced} />;
}

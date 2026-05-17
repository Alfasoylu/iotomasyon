import { requireUser } from "@/lib/auth";
import {
  getAdminEnhancedData,
  getDashboardStats,
  getDueTodayFollowups,
  getOperationalAlerts,
  getOperationsDashboardData,
  getSalesPipelineData,
} from "@/services/dashboard-service";
import { AdminWorkspace } from "./_components/admin-workspace";
import { OperationsWorkspace } from "./_components/operations-workspace";
import { SalesWorkspace } from "./_components/sales-workspace";

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
 * Future Faz:
 *   Faz E: WarehouseWorkspace — requires WAREHOUSE enum migration (Phase 55)
 *   Faz F: MarketplaceWorkspace — requires Phase 14 read intelligence
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

  // ADMIN, MARKETPLACE_OPERATOR, CUSTOM — full admin view with enhanced signals.
  // Faz E will wire WarehouseWorkspace (requires Phase 55 WAREHOUSE enum migration).
  const [stats, dueToday, alerts, enhanced] = await Promise.all([
    getDashboardStats(),
    getDueTodayFollowups(),
    getOperationalAlerts(),
    getAdminEnhancedData(),
  ]);

  return <AdminWorkspace stats={stats} dueToday={dueToday} alerts={alerts} enhanced={enhanced} />;
}

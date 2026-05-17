import { requireUser } from "@/lib/auth";
import {
  getDashboardStats,
  getDueTodayFollowups,
  getOperationalAlerts,
  getSalesPipelineData,
} from "@/services/dashboard-service";
import { AdminWorkspace } from "./_components/admin-workspace";
import { SalesWorkspace } from "./_components/sales-workspace";

export const dynamic = "force-dynamic";

/**
 * Phase 54 — Role-Based Workspace Dashboards
 *
 * Faz A (2026-05-17): Role router structure established.
 * Faz B (2026-05-17): SalesWorkspace wired — pipeline, today's tasks, recent activity.
 *   getSalesPipelineData() NEVER returns financial fields.
 *
 * Future Faz:
 *   Faz C: OperationsWorkspace — getOperationsDashboardData(), NO financial fields
 *   Faz D: AdminWorkspace enhancement — import intelligence signals
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

  // All other roles (ADMIN, OPERATIONS, MARKETPLACE_OPERATOR, CUSTOM) get full admin view for now.
  // Faz C will wire OperationsWorkspace; Faz E will wire WarehouseWorkspace.
  const [stats, dueToday, alerts] = await Promise.all([
    getDashboardStats(),
    getDueTodayFollowups(),
    getOperationalAlerts(),
  ]);

  return <AdminWorkspace stats={stats} dueToday={dueToday} alerts={alerts} />;
}

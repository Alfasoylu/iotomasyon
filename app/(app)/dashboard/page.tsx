import { requireUser } from "@/lib/auth";
import {
  getDashboardStats,
  getDueTodayFollowups,
  getOperationalAlerts,
} from "@/services/dashboard-service";
import { AdminWorkspace } from "./_components/admin-workspace";

export const dynamic = "force-dynamic";

/**
 * Phase 54 — Role-Based Workspace Dashboards
 *
 * Faz A (2026-05-17): Role router structure established.
 *   AdminWorkspace: extracted from inline, receives typed props.
 *   StatCard + LinkedStatCard: moved to _components/shared/stat-card.tsx.
 *   Non-admin workspace stubs to be added in Faz B (SALES) and Faz C (OPERATIONS).
 *
 * Future Faz:
 *   Faz B: SalesWorkspace — getSalesPipelineData(), NO financial fields
 *   Faz C: OperationsWorkspace — getOperationsDashboardData(), NO financial fields
 *   Faz D: AdminWorkspace enhancement — import intelligence signals
 *   Faz E: WarehouseWorkspace — requires WAREHOUSE enum migration (Phase 55)
 *   Faz F: MarketplaceWorkspace — requires Phase 14 read intelligence
 */
export default async function DashboardPage() {
  const user = await requireUser();
  const [stats, dueToday, alerts] = await Promise.all([
    getDashboardStats(),
    getDueTodayFollowups(),
    getOperationalAlerts(),
  ]);

  // Role branching — all roles currently fall through to AdminWorkspace.
  // Non-admin workspaces are wired in Faz B/C/E/F.
  switch (user.role) {
    // Faz B: case "SALES": return <SalesWorkspace userId={user.id} />;
    // Faz C: case "OPERATIONS": return <OperationsWorkspace />;
    // Faz E: case "WAREHOUSE": return <WarehouseWorkspace />;
    default:
      return <AdminWorkspace stats={stats} dueToday={dueToday} alerts={alerts} />;
  }
}

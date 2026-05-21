/**
 * Phase 87 — Ekip Görev Panosu
 *
 * Operations koordinatörü için ekip görev panosu.
 * Tüm açık görevler atanana göre gruplandırılır.
 * ReassignForm ile inline atama yapılabilir.
 *
 * Permission: TASKS_ASSIGN
 * Schema değişikliği: YOK
 */

import Link from "next/link";
import { Check, AlertTriangle } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReassignForm } from "./reassign-form";

export const dynamic = "force-dynamic";

// ── Priority helpers ─────────────────────────────────────────────────────────
const PRIORITY_LABEL: Record<string, string> = {
  URGENT: "Acil",
  HIGH:   "Yüksek",
  MEDIUM: "Orta",
  LOW:    "Düşük",
};

const PRIORITY_VARIANT: Record<string, "danger" | "warn" | "info" | "neutral"> = {
  URGENT: "danger",
  HIGH:   "warn",
  MEDIUM: "info",
  LOW:    "neutral",
};

const PRIORITY_SORT: Record<string, number> = {
  URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3,
};

type TaskRow = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: Date | null;
  assignedToId: string | null;
  customer: { id: string; name: string; company: string | null } | null;
};

type UserGroup = {
  userId: string | null;
  userName: string;
  tasks: TaskRow[];
  openCount: number;
  overdueCount: number;
};

export default async function TaskBoardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePermission(PERMISSIONS.TASKS_ASSIGN);

  const sp = await searchParams;
  const showDone = sp.done === "1";
  const now = new Date();

  // Fetch tasks + users in parallel
  const [tasks, users] = await Promise.all([
    prisma.followUpTask.findMany({
      where: showDone ? undefined : { status: "OPEN" },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        assignedToId: true,
        customer: {
          select: { id: true, name: true, company: true },
        },
      },
      orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
    }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // ── Group by assignee ─────────────────────────────────────────────────────
  const groupMap = new Map<string | null, TaskRow[]>();

  // Ensure "unassigned" group exists first
  groupMap.set(null, []);
  for (const u of users) {
    groupMap.set(u.id, []);
  }

  for (const t of tasks) {
    const key = t.assignedToId;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(t as TaskRow);
  }

  // Build groups, sort by open count desc
  const groups: UserGroup[] = [...groupMap.entries()]
    .map(([userId, taskList]) => {
      const u = users.find((u) => u.id === userId);
      const openTasks = taskList.filter((t) => t.status === "OPEN");
      const overdueTasks = openTasks.filter(
        (t) => t.dueDate && new Date(t.dueDate) < now,
      );
      return {
        userId,
        userName: u ? u.name : "Atanmamış",
        tasks: [...taskList].sort(
          (a, b) =>
            (PRIORITY_SORT[a.priority] ?? 2) - (PRIORITY_SORT[b.priority] ?? 2),
        ),
        openCount: openTasks.length,
        overdueCount: overdueTasks.length,
      };
    })
    .filter((g) => g.tasks.length > 0 || g.userId === null)
    .sort((a, b) => {
      // Unassigned last, then by openCount desc
      if (a.userId === null) return 1;
      if (b.userId === null) return -1;
      return b.openCount - a.openCount;
    });

  // ── Summary counts ────────────────────────────────────────────────────────
  const totalOpen = tasks.filter((t) => t.status === "OPEN").length;
  const totalOverdue = tasks.filter(
    (t) => t.status === "OPEN" && t.dueDate && new Date(t.dueDate) < now,
  ).length;
  const totalUnassigned = tasks.filter(
    (t) => t.status === "OPEN" && !t.assignedToId,
  ).length;
  const activeUsers = groups.filter(
    (g) => g.userId !== null && g.openCount > 0,
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
            Operasyon / Koordinasyon
          </p>
          <h1 className="mt-2 text-[22px] font-semibold tracking-tight text-[var(--text-primary)]">
            Ekip Görev Panosu
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Açık görevler atanana göre gruplandırıldı. Selectbox ile anında atama yapabilirsiniz.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={showDone ? "/admin/task-board" : "/admin/task-board?done=1"}
            className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-3)]"
          >
            {showDone ? "Sadece Açık" : "Tamamlananları Göster"}
          </Link>
          <Link
            href="/tasks"
            className="rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-3)]"
          >
            Liste Görünümü →
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Açık Görev", value: totalOpen, tone: "neutral" as const },
          { label: "Gecikmiş", value: totalOverdue, tone: totalOverdue > 0 ? ("danger" as const) : ("neutral" as const) },
          { label: "Atanmamış", value: totalUnassigned, tone: totalUnassigned > 0 ? ("warn" as const) : ("neutral" as const) },
          { label: "Aktif Kullanıcı", value: activeUsers, tone: "neutral" as const },
        ].map(({ label, value, tone }) => (
          <Card key={label} className="p-4 rounded-lg">
            <p className="text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">{label}</p>
            <p
              className={`mt-2 text-2xl font-semibold tabular-nums font-mono ${
                tone === "danger"
                  ? "text-[var(--danger)]"
                  : tone === "warn"
                  ? "text-[var(--warn)]"
                  : "text-[var(--text-primary)]"
              }`}
            >
              {value}
            </p>
          </Card>
        ))}
      </div>

      {/* Groups */}
      {groups.length === 0 ? (
        <Card className="p-8 text-center text-sm text-[var(--text-muted)] rounded-lg">
          Görev bulunamadı.
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.userId ?? "__unassigned__"} className="overflow-hidden rounded-lg">
              {/* Group header */}
              <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-1)] px-5 py-3">
                {/* Avatar initial — kept rounded-full as per spec exception (iconic round) */}
                <span
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    g.userId
                      ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                      : "bg-[var(--surface-3)] text-[var(--text-muted)]"
                  }`}
                >
                  {g.userName.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {g.userName}
                  </span>
                  <span className="text-xs text-[var(--text-muted)] tabular-nums font-mono">
                    {g.openCount} açık
                  </span>
                  {g.overdueCount > 0 && (
                    <Badge variant="danger" className="text-[10px] font-semibold">
                      {g.overdueCount} gecikmiş
                    </Badge>
                  )}
                </div>
              </div>

              {/* Tasks */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-subtle)] text-[11px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
                      <th className="px-5 py-2 text-left">Görev</th>
                      <th className="px-3 py-2 text-left">Müşteri</th>
                      <th className="px-3 py-2 text-center">Öncelik</th>
                      <th className="px-3 py-2 text-right">Bitiş</th>
                      <th className="px-3 py-2 text-left">Ata</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-subtle)]">
                    {g.tasks.map((t) => {
                      const isOverdue =
                        t.status === "OPEN" &&
                        t.dueDate != null &&
                        new Date(t.dueDate) < now;
                      const isDone = t.status === "DONE";
                      return (
                        <tr
                          key={t.id}
                          className={`hover:bg-[var(--surface-3)] ${isDone ? "opacity-40" : ""}`}
                        >
                          <td className="px-5 py-2.5 font-medium text-[var(--text-primary)]">
                            <span className="inline-flex items-center gap-1.5">
                              {t.title}
                              {isDone && (
                                <Check size={14} strokeWidth={1.5} className="text-[var(--text-muted)]" />
                              )}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            {t.customer ? (
                              <Link
                                href={`/customers/${t.customer.id}`}
                                className="text-xs text-[var(--text-secondary)] hover:underline"
                              >
                                {t.customer.company ?? t.customer.name}
                              </Link>
                            ) : (
                              <span className="text-xs text-[var(--text-muted)]">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <Badge
                              variant={PRIORITY_VARIANT[t.priority] ?? "neutral"}
                              className="text-[10px]"
                            >
                              {PRIORITY_LABEL[t.priority] ?? t.priority}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 text-right text-xs tabular-nums font-mono">
                            {t.dueDate ? (
                              <span
                                className={`inline-flex items-center gap-1 ${
                                  isOverdue
                                    ? "font-semibold text-[var(--danger)]"
                                    : "text-[var(--text-muted)]"
                                }`}
                              >
                                {new Date(t.dueDate).toLocaleDateString("tr-TR")}
                                {isOverdue && (
                                  <AlertTriangle size={14} strokeWidth={1.5} />
                                )}
                              </span>
                            ) : (
                              <span className="text-[var(--text-muted)]">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <ReassignForm
                              taskId={t.id}
                              currentAssigneeId={t.assignedToId}
                              users={users}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

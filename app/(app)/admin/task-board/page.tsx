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
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { ReassignForm } from "./reassign-form";

export const dynamic = "force-dynamic";

// ── Priority helpers ─────────────────────────────────────────────────────────
const PRIORITY_LABEL: Record<string, string> = {
  URGENT: "Acil",
  HIGH:   "Yüksek",
  MEDIUM: "Orta",
  LOW:    "Düşük",
};

const PRIORITY_STYLE: Record<string, string> = {
  URGENT: "bg-red-100 text-red-700",
  HIGH:   "bg-amber-100 text-amber-700",
  MEDIUM: "bg-sky-100 text-sky-700",
  LOW:    "bg-slate-100 text-slate-500",
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
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
            Operasyon / Koordinasyon
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
            Ekip Görev Panosu
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Açık görevler atanana göre gruplandırıldı. Selectbox ile anında atama yapabilirsiniz.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href={showDone ? "/admin/task-board" : "/admin/task-board?done=1"}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            {showDone ? "Sadece Açık" : "Tamamlananları Göster"}
          </Link>
          <Link
            href="/tasks"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Liste Görünümü →
          </Link>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Açık Görev", value: totalOpen, tone: "slate" },
          { label: "Gecikmiş", value: totalOverdue, tone: totalOverdue > 0 ? "red" : "slate" },
          { label: "Atanmamış", value: totalUnassigned, tone: totalUnassigned > 0 ? "amber" : "slate" },
          { label: "Aktif Kullanıcı", value: activeUsers, tone: "slate" },
        ].map(({ label, value, tone }) => (
          <Card key={label} className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
            <p
              className={`mt-1 text-2xl font-semibold ${
                tone === "red"
                  ? "text-red-600"
                  : tone === "amber"
                  ? "text-amber-700"
                  : "text-slate-800"
              }`}
            >
              {value}
            </p>
          </Card>
        ))}
      </div>

      {/* Groups */}
      {groups.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-400">
          Görev bulunamadı.
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.userId ?? "__unassigned__"} className="overflow-hidden">
              {/* Group header */}
              <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3">
                {/* Avatar initial */}
                <span
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                    g.userId ? "bg-slate-700" : "bg-slate-300"
                  }`}
                >
                  {g.userName.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-semibold text-slate-800">
                    {g.userName}
                  </span>
                  <span className="ml-2 text-xs text-slate-400">
                    {g.openCount} açık
                    {g.overdueCount > 0 && (
                      <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-600">
                        {g.overdueCount} gecikmiş
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* Tasks */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-50 text-[10px] uppercase tracking-widest text-slate-400">
                      <th className="px-5 py-2 text-left">Görev</th>
                      <th className="px-3 py-2 text-left">Müşteri</th>
                      <th className="px-3 py-2 text-center">Öncelik</th>
                      <th className="px-3 py-2 text-right">Bitiş</th>
                      <th className="px-3 py-2 text-left">Ata</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {g.tasks.map((t) => {
                      const isOverdue =
                        t.status === "OPEN" &&
                        t.dueDate != null &&
                        new Date(t.dueDate) < now;
                      const isDone = t.status === "DONE";
                      return (
                        <tr
                          key={t.id}
                          className={`hover:bg-slate-50/60 ${isDone ? "opacity-40" : ""}`}
                        >
                          <td className="px-5 py-2.5 font-medium text-slate-800">
                            {t.title}
                            {isDone && (
                              <span className="ml-1.5 text-[10px] text-slate-400">✓</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            {t.customer ? (
                              <Link
                                href={`/customers/${t.customer.id}`}
                                className="text-xs text-slate-600 hover:underline"
                              >
                                {t.customer.company ?? t.customer.name}
                              </Link>
                            ) : (
                              <span className="text-xs text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                PRIORITY_STYLE[t.priority] ?? "bg-slate-100 text-slate-500"
                              }`}
                            >
                              {PRIORITY_LABEL[t.priority] ?? t.priority}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-right text-xs">
                            {t.dueDate ? (
                              <span
                                className={
                                  isOverdue
                                    ? "font-semibold text-red-600"
                                    : "text-slate-500"
                                }
                              >
                                {new Date(t.dueDate).toLocaleDateString("tr-TR")}
                                {isOverdue && " ⚠"}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
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

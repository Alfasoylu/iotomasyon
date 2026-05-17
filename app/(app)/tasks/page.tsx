import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CustomerTaskCompleteButton } from "@/components/customers/customer-task-complete-button";
import {
  formatTaskPriority,
  formatTaskStatus,
  getTaskPriorityTone,
  getTaskStatusTone,
} from "@/lib/customer-utils";
import { formatDateTime } from "@/lib/utils";
import { listTasks, listUsersWithTasks } from "@/services/task-service";
import type { TaskPriority, TaskStatus } from "@/types/customers";
import { requirePermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = [
  { value: "OPEN", label: "Açık" },
  { value: "all", label: "Tümü" },
  { value: "DONE", label: "Tamamlandı" },
  { value: "CANCELLED", label: "İptal" },
];

const PRIORITY_OPTIONS = [
  { value: "all", label: "Tüm öncelikler" },
  { value: "URGENT", label: "Acil" },
  { value: "HIGH", label: "Yüksek" },
  { value: "MEDIUM", label: "Orta" },
  { value: "LOW", label: "Düşük" },
];

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    priority?: string;
    userId?: string;
    page?: string;
  }>;
}) {
  await requirePermission(PERMISSIONS.TASKS_READ);
  const sp = await searchParams;
  const status = sp.status ?? "OPEN";
  const priority = sp.priority ?? "all";
  const userId = sp.userId ?? "all";
  const page = Math.max(1, Number(sp.page ?? 1));

  const [{ tasks, total, pageSize }, users] = await Promise.all([
    listTasks({ status, priority, userId, page }),
    listUsersWithTasks(),
  ]);

  const totalPages = Math.ceil(total / pageSize);
  const overdueCount = tasks.filter(
    (t) =>
      t.status === "OPEN" && t.dueDate && new Date(t.dueDate) < new Date(),
  ).length;

  function pageUrl(p: number) {
    const params = new URLSearchParams();
    if (status !== "OPEN") params.set("status", status);
    if (priority !== "all") params.set("priority", priority);
    if (userId !== "all") params.set("userId", userId);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return `/tasks${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="overflow-hidden rounded-3xl bg-slate-950">
        <div className="h-1 bg-orange-500" />
        <div className="px-6 py-8 xl:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">
                Takip Görevleri
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                Görev Listesi
              </h1>
              <p className="mt-2 text-sm text-slate-400">
                {total.toLocaleString("tr-TR")} görev
                {overdueCount > 0 && (
                  <span className="ml-2 rounded-full bg-red-500/20 px-2 py-0.5 text-xs font-semibold text-red-400">
                    {overdueCount} gecikmiş
                  </span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <form method="GET" action="/tasks" className="flex flex-wrap gap-3">
          {/* Status tabs */}
          <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 gap-1">
            {STATUS_OPTIONS.map((opt) => (
              <Link
                key={opt.value}
                href={`/tasks?status=${opt.value}${priority !== "all" ? `&priority=${priority}` : ""}${userId !== "all" ? `&userId=${userId}` : ""}`}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  status === opt.value
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {opt.label}
              </Link>
            ))}
          </div>

          <select
            name="priority"
            defaultValue={priority}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
          >
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <select
            name="userId"
            defaultValue={userId}
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-slate-400"
          >
            <option value="all">Tüm atananlar</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>

          <input type="hidden" name="status" value={status} />

          <button
            type="submit"
            className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-700"
          >
            Filtrele
          </button>
        </form>
      </Card>

      {/* Task list */}
      <div className="space-y-3">
        {tasks.length === 0 ? (
          <Card className="p-10 text-center text-sm text-slate-500">
            Bu filtreye uygun görev bulunamadı.
          </Card>
        ) : (
          tasks.map((task) => {
            const isOverdue =
              task.status === "OPEN" &&
              task.dueDate &&
              new Date(task.dueDate) < new Date();

            return (
              <Card key={task.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={getTaskStatusTone(task.status as TaskStatus)}>
                        {formatTaskStatus(task.status as TaskStatus)}
                      </Badge>
                      <Badge tone={getTaskPriorityTone(task.priority as TaskPriority)}>
                        {formatTaskPriority(task.priority as TaskPriority)}
                      </Badge>
                      {isOverdue && (
                        <Badge tone="danger">Gecikmiş</Badge>
                      )}
                    </div>

                    <p className="text-sm font-semibold text-slate-900">
                      {task.title}
                    </p>

                    {task.description && (
                      <p className="text-sm text-slate-500">{task.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                      {task.customer && (
                        <Link
                          href={`/customers/${task.customer.id}`}
                          className="font-medium text-slate-600 hover:underline"
                        >
                          {task.customer.name}
                          {task.customer.company
                            ? ` · ${task.customer.company}`
                            : ""}
                        </Link>
                      )}
                      {task.dueDate && (
                        <span>
                          Son tarih:{" "}
                          <span
                            className={
                              isOverdue ? "font-semibold text-red-500" : ""
                            }
                          >
                            {formatDateTime(task.dueDate)}
                          </span>
                        </span>
                      )}
                      <span>
                        Oluşturan: {task.createdBy?.name ?? "Sistem"}
                      </span>
                      {task.assignedTo && (
                        <span className="font-medium text-slate-500">
                          → {task.assignedTo.name}
                        </span>
                      )}
                    </div>
                  </div>

                  {task.status === "OPEN" && task.customerId && (
                    <CustomerTaskCompleteButton
                      customerId={task.customerId}
                      taskId={task.id}
                    />
                  )}
                </div>
              </Card>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={pageUrl(page - 1)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              ← Önceki
            </Link>
          )}
          <span className="text-sm text-slate-500">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={pageUrl(page + 1)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Sonraki →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

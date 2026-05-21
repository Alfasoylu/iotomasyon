import Link from "next/link";
import { CheckSquare, CircleAlert, ChevronLeft, ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { CustomerTaskCompleteButton } from "@/components/customers/customer-task-complete-button";
import { TaskCohortCards } from "@/components/tasks/task-cohort-cards";
import {
  formatTaskPriority,
  formatTaskStatus,
  getTaskStatusTone,
} from "@/lib/customer-utils";
import { formatDateTime } from "@/lib/utils";
import { getTaskCohortCounts, listTasks, listUsersWithTasks } from "@/services/task-service";
import type { TaskPriority, TaskStatus } from "@/types/customers";
import { requireUser } from "@/lib/auth";
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

// Priority → semantic token + label. Replaces emoji + Badge tone combos with
// a unified CircleAlert + accent color for industrial minimal feel.
const PRIORITY_META: Record<
  TaskPriority,
  { color: string; label: string }
> = {
  URGENT: { color: "var(--danger)", label: "Acil" },
  HIGH: { color: "var(--danger)", label: "Yüksek" },
  MEDIUM: { color: "var(--warn)", label: "Orta" },
  LOW: { color: "var(--text-muted)", label: "Düşük" },
};

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    priority?: string;
    userId?: string;
    page?: string;
    cohort?: string;
    mine?: string;
  }>;
}) {
  await requirePermission(PERMISSIONS.TASKS_READ);
  const currentUser = await requireUser();
  const sp = await searchParams;
  const status = sp.status ?? "OPEN";
  const priority = sp.priority ?? "all";
  const cohort = sp.cohort ?? null;
  const mineFilter = sp.mine !== "0"; // P3: varsayılan "bana atanmış"
  // P6/T2-03: ADMIN dahil tüm roller için "Bana atanmış" varsayılan + sıkı filtre.
  const userId = sp.userId ?? (mineFilter ? currentUser.id : "all");
  const page = Math.max(1, Number(sp.page ?? 1));

  const [{ tasks, total, pageSize }, , cohortCounts] = await Promise.all([
    listTasks({ status, priority, userId, page, cohort: cohort ?? undefined }),
    listUsersWithTasks(),
    getTaskCohortCounts(currentUser.role === "SALES" ? currentUser.id : undefined),
  ]);

  const totalPages = Math.ceil(total / pageSize);
  const now = Date.now();
  const overdueCount = tasks.filter(
    (t) =>
      t.status === "OPEN" && t.dueDate && new Date(t.dueDate).getTime() < now,
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
      <PageHeader
        icon={CheckSquare}
        breadcrumb={[{ label: "Satış" }, { label: "Görevler" }]}
        title="Görevler"
        subtitle="Tüm takip görevleri. Vadesi gelen, gecikmiş ve devam eden işler."
        meta={
          <>
            <span className="inline-flex items-center rounded-md border border-[var(--border-subtle)] bg-[var(--surface-3)] px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-[var(--text-secondary)] tabular-nums">
              {total.toLocaleString("tr-TR")} görev
            </span>
            {overdueCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-md border border-[var(--danger-border)] bg-[var(--danger-dim)] px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-[var(--danger)] tabular-nums">
                <CircleAlert size={12} strokeWidth={1.5} />
                {overdueCount} gecikmiş
              </span>
            )}
          </>
        }
      />

      {/* P3 — Cohort kartları */}
      <TaskCohortCards counts={cohortCounts} activeCohort={cohort} />

      {/* P3 — "Bana atanmış" / "Tümü" hızlı toggle + filtre */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-md border border-[var(--border-default)] bg-[var(--surface-1)] p-0.5 gap-0.5">
            <Link
              href={`/tasks${cohort ? `?cohort=${cohort}` : ""}`}
              className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition ${
                mineFilter
                  ? "border border-[var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]"
                  : "border border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Bana atanmış
            </Link>
            <Link
              href={`/tasks?mine=0${cohort ? `&cohort=${cohort}` : ""}`}
              className={`rounded-md px-3 py-1.5 text-[12px] font-medium transition ${
                !mineFilter
                  ? "border border-[var(--accent-border)] bg-[var(--accent-dim)] text-[var(--accent)]"
                  : "border border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              Tümü
            </Link>
          </div>
          <form method="GET" action="/tasks" className="flex flex-wrap items-center gap-2">
            <select
              name="priority"
              defaultValue={priority}
              className="h-9 rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 text-[13px] text-[var(--text-primary)] outline-none transition focus:border-[var(--border-strong)]"
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <select
              name="status"
              defaultValue={status}
              className="h-9 rounded-md border border-[var(--border-default)] bg-[var(--surface-3)] px-3 text-[13px] text-[var(--text-primary)] outline-none transition focus:border-[var(--border-strong)]"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {cohort && <input type="hidden" name="cohort" value={cohort} />}
            <input type="hidden" name="mine" value={userId === "all" ? "0" : "1"} />
            <Button type="submit" size="md" variant="secondary">
              Filtrele
            </Button>
          </form>
        </div>
      </Card>

      {/* Task list */}
      <div className="space-y-2">
        {tasks.length === 0 ? (
          <Card className="p-10 text-center text-[13px] text-[var(--text-muted)]">
            Bu filtreye uygun görev bulunamadı.
          </Card>
        ) : (
          tasks.map((task) => {
            const isOverdue =
              task.status === "OPEN" &&
              task.dueDate &&
              new Date(task.dueDate).getTime() < now;
            const prioMeta = PRIORITY_META[task.priority as TaskPriority];

            return (
              <Card
                key={task.id}
                className="p-4 transition hover:bg-[var(--surface-3)]"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider"
                        style={{ color: prioMeta.color }}
                        title={`Öncelik: ${formatTaskPriority(task.priority as TaskPriority)}`}
                      >
                        <CircleAlert size={14} strokeWidth={1.5} />
                        {prioMeta.label}
                      </span>
                      <Badge tone={getTaskStatusTone(task.status as TaskStatus)}>
                        {formatTaskStatus(task.status as TaskStatus)}
                      </Badge>
                      {isOverdue && (
                        <Badge tone="danger">Gecikmiş</Badge>
                      )}
                    </div>

                    <p className="text-[14px] font-medium text-[var(--text-primary)]">
                      {task.title}
                    </p>

                    {task.description && (
                      <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
                        {task.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[var(--text-muted)]">
                      {task.customer && (
                        <Link
                          href={`/customers/${task.customer.id}`}
                          className="font-medium text-[var(--text-secondary)] transition hover:text-[var(--accent)]"
                        >
                          {task.customer.name}
                          {task.customer.company
                            ? ` · ${task.customer.company}`
                            : ""}
                        </Link>
                      )}
                      {task.dueDate && (
                        <span className="inline-flex items-center gap-1">
                          <span className="uppercase tracking-wider text-[11px]">Son tarih</span>
                          <span
                            className={`font-mono tabular-nums ${
                              isOverdue ? "text-[var(--danger)]" : "text-[var(--text-secondary)]"
                            }`}
                          >
                            {formatDateTime(task.dueDate)}
                          </span>
                        </span>
                      )}
                      <span>
                        <span className="uppercase tracking-wider text-[11px]">Oluşturan</span>{" "}
                        <span className="text-[var(--text-secondary)]">
                          {task.createdBy?.name ?? "Sistem"}
                        </span>
                      </span>
                      {task.assignedTo && (
                        <span className="font-medium text-[var(--text-secondary)]">
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
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-3.5 text-[13px] font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
            >
              <ChevronLeft size={14} strokeWidth={1.5} />
              Önceki
            </Link>
          )}
          <span className="font-mono text-[12px] tabular-nums text-[var(--text-muted)]">
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={pageUrl(page + 1)}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--surface-2)] px-3.5 text-[13px] font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
            >
              Sonraki
              <ChevronRight size={14} strokeWidth={1.5} />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

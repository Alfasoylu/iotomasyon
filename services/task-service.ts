import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type TaskFilters = {
  status?: string;
  priority?: string;
  userId?: string;
  page?: number;
  cohort?: string; // P3: overdue | today | week | done
};

export interface TaskCohortCounts {
  overdue: number;
  today: number;
  week: number;
  done: number; // son 30 gün
  total: number;
}

export async function getTaskCohortCounts(userId?: string): Promise<TaskCohortCounts> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const weekEnd = new Date(todayStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const last30Days = new Date(now);
  last30Days.setDate(last30Days.getDate() - 30);

  const userFilter = userId
    ? { OR: [{ assignedToId: userId }, { createdById: userId, assignedToId: null }] }
    : {};

  try {
    const [overdue, today, week, done, total] = await Promise.all([
      prisma.followUpTask.count({
        where: { ...userFilter, status: { not: "DONE" }, dueDate: { lt: now } },
      }),
      prisma.followUpTask.count({
        where: {
          ...userFilter,
          status: { not: "DONE" },
          dueDate: { gte: todayStart, lt: todayEnd },
        },
      }),
      prisma.followUpTask.count({
        where: {
          ...userFilter,
          status: { not: "DONE" },
          dueDate: { gte: todayStart, lt: weekEnd },
        },
      }),
      prisma.followUpTask.count({
        where: { ...userFilter, status: "DONE", updatedAt: { gte: last30Days } },
      }),
      prisma.followUpTask.count({ where: userFilter }),
    ]);
    return { overdue, today, week, done, total };
  } catch {
    return { overdue: 0, today: 0, week: 0, done: 0, total: 0 };
  }
}

const TASK_PAGE_SIZE = 50;

const taskInclude = Prisma.validator<Prisma.FollowUpTaskInclude>()({
  customer: { select: { id: true, name: true, company: true } },
  createdBy: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
});

export type TaskEntry = Prisma.FollowUpTaskGetPayload<{
  include: typeof taskInclude;
}>;

export async function listTasks(filters: TaskFilters) {
  const where: Prisma.FollowUpTaskWhereInput = {};

  const status = filters.status ?? "OPEN";
  if (status !== "all") {
    where.status = status as Prisma.EnumTaskStatusFilter["equals"];
  }

  if (filters.priority && filters.priority !== "all") {
    where.priority = filters.priority as Prisma.EnumTaskPriorityFilter["equals"];
  }

  if (filters.userId && filters.userId !== "all") {
    where.assignedToId = filters.userId;
  }

  // P3: cohort filtreleri
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);
  const weekEnd = new Date(todayStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  if (filters.cohort === "overdue") {
    where.status = { not: "DONE" };
    where.dueDate = { lt: now };
  } else if (filters.cohort === "today") {
    where.status = { not: "DONE" };
    where.dueDate = { gte: todayStart, lt: todayEnd };
  } else if (filters.cohort === "week") {
    where.status = { not: "DONE" };
    where.dueDate = { gte: todayStart, lt: weekEnd };
  } else if (filters.cohort === "done") {
    where.status = "DONE";
    const last30Days = new Date(now);
    last30Days.setDate(last30Days.getDate() - 30);
    where.updatedAt = { gte: last30Days };
  }

  const page = Math.max(1, filters.page ?? 1);
  const skip = (page - 1) * TASK_PAGE_SIZE;

  const [tasks, total] = await Promise.all([
    prisma.followUpTask.findMany({
      where,
      include: taskInclude,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      skip,
      take: TASK_PAGE_SIZE,
    }),
    prisma.followUpTask.count({ where }),
  ]);

  return { tasks, total, page, pageSize: TASK_PAGE_SIZE };
}

export async function listUsersWithTasks() {
  return prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

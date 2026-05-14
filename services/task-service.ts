import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type TaskFilters = {
  status?: string;
  priority?: string;
  userId?: string;
  page?: number;
};

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
    where.createdById = filters.userId;
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

import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type ActivityFilters = {
  userId?: string;
  type?: string;
  page?: number;
};

const PAGE_SIZE = 50;

const activityInclude = Prisma.validator<Prisma.NoteInclude>()({
  createdBy: { select: { id: true, name: true } },
  customer: { select: { id: true, name: true, company: true } },
});

export type ActivityEntry = Prisma.NoteGetPayload<{
  include: typeof activityInclude;
}>;

export async function listActivities(filters: ActivityFilters) {
  const where: Prisma.NoteWhereInput = {};

  if (filters.userId && filters.userId !== "all") {
    where.createdById = filters.userId;
  }

  if (filters.type && filters.type !== "all") {
    where.type = filters.type as Prisma.EnumNoteTypeFilter["equals"];
  }

  const page = filters.page ?? 1;
  const skip = (page - 1) * PAGE_SIZE;

  const [entries, total] = await Promise.all([
    prisma.note.findMany({
      where,
      include: activityInclude,
      orderBy: { createdAt: "desc" },
      skip,
      take: PAGE_SIZE,
    }),
    prisma.note.count({ where }),
  ]);

  return { entries, total, page, pageSize: PAGE_SIZE };
}

export async function listUsersWithActivity() {
  return prisma.user.findMany({
    where: {
      isActive: true,
      notesCreated: { some: {} },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

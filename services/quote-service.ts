import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type QuoteFilters = {
  status?: string;
  q?: string;
  page?: number;
};

const QUOTE_PAGE_SIZE = 30;

export async function listQuotes(filters: QuoteFilters) {
  const where: Prisma.QuoteWhereInput = {};

  if (filters.status && filters.status !== "all") {
    where.status = filters.status as Prisma.EnumQuoteStatusFilter["equals"];
  }

  if (filters.q) {
    where.OR = [
      { quoteNumber: { contains: filters.q, mode: "insensitive" } },
      { customer: { name: { contains: filters.q, mode: "insensitive" } } },
      { customer: { company: { contains: filters.q, mode: "insensitive" } } },
    ];
  }

  const page = Math.max(1, filters.page ?? 1);
  const skip = (page - 1) * QUOTE_PAGE_SIZE;

  const [quotes, total] = await Promise.all([
    prisma.quote.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, company: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: QUOTE_PAGE_SIZE,
    }),
    prisma.quote.count({ where }),
  ]);

  return { quotes, total, page, pageSize: QUOTE_PAGE_SIZE };
}

export async function getQuoteById(id: string) {
  return prisma.quote.findUnique({
    where: { id },
    include: {
      customer: true,
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      items: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

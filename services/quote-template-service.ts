import { prisma } from "@/lib/prisma";

export async function listQuoteTemplates() {
  return prisma.quoteTemplate.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          product: { select: { id: true, name: true, sku: true } },
        },
      },
      createdBy: { select: { id: true, name: true } },
    },
  });
}

export async function getQuoteTemplateById(id: string) {
  return prisma.quoteTemplate.findUnique({
    where: { id },
    include: {
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          product: { select: { id: true, name: true, sku: true } },
        },
      },
    },
  });
}

export type QuoteTemplateWithItems = Awaited<ReturnType<typeof listQuoteTemplates>>[number];

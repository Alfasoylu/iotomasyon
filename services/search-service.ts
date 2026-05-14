import "server-only";

import { prisma } from "@/lib/prisma";

export async function globalSearch(q: string) {
  const term = q.trim();
  if (term.length < 2) return { customers: [], quotes: [], products: [], notes: [], categories: [] };

  const contains = { contains: term, mode: "insensitive" as const };

  const [customers, quotes, products, notes, categories] = await Promise.all([
    prisma.customer.findMany({
      where: {
        OR: [
          { name: contains },
          { company: contains },
          { phone: contains },
          { whatsapp: contains },
          { email: contains },
          { taxNumber: contains },
        ],
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    prisma.quote.findMany({
      where: {
        OR: [
          { quoteNumber: contains },
          { customer: { name: contains } },
          { notes: contains },
        ],
      },
      include: {
        customer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.product.findMany({
      where: {
        OR: [
          { name: contains },
          { sku: contains },
          { category: contains },
          { brand: contains },
          { description: contains },
        ],
      },
      orderBy: { name: "asc" },
      take: 10,
    }),
    prisma.note.findMany({
      where: { content: contains },
      include: {
        customer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.productCategory.findMany({
      where: {
        OR: [{ name: contains }, { description: contains }, { slug: contains }],
      },
      include: {
        _count: { select: { products: true, interests: true } },
      },
      orderBy: { name: "asc" },
      take: 10,
    }),
  ]);

  return { customers, quotes, products, notes, categories };
}

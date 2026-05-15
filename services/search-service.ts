import "server-only";

import { prisma } from "@/lib/prisma";

const EMPTY = { customers: [], quotes: [], products: [], notes: [], categories: [] };

export async function globalSearch(q: string) {
  const term = q.trim();
  if (term.length < 2) return EMPTY;

  const contains = { contains: term, mode: "insensitive" as const };

  try {
  const [customers, quotes, products, notes, categories] = await Promise.all([
    // Use explicit select to avoid including Phase 6 columns that may not
    // exist yet on pre-migration databases.
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
      select: {
        id: true, name: true, company: true, phone: true, email: true,
        status: true, city: true, country: true, updatedAt: true,
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
  } catch {
    return EMPTY;
  }
}

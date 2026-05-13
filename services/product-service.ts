import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type ProductFilters = {
  q?: string;
  status?: string;
  stock?: string;
};

export async function listProducts(filters: ProductFilters) {
  const where: Prisma.ProductWhereInput = {};

  if (filters.q) {
    where.OR = [
      { sku: { contains: filters.q } },
      { name: { contains: filters.q } },
      { brand: { contains: filters.q } },
      { model: { contains: filters.q } },
      { location: { contains: filters.q } },
    ];
  }

  if (filters.status === "active") {
    where.isActive = true;
  }

  if (filters.status === "inactive") {
    where.isActive = false;
  }

  const products = await prisma.product.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
  });

  if (filters.stock === "low") {
    return products.filter((product) => product.stockQuantity <= product.minimumStock);
  }

  return products;
}

export async function getProductById(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

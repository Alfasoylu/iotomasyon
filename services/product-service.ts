import "server-only";

import { Prisma } from "@prisma/client";

import { isDatabaseUnavailableError } from "@/lib/database";
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

  try {
    const products = await prisma.product.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    });

    if (filters.stock === "low") {
      return {
        databaseAvailable: true as const,
        products: products.filter((product) => product.stockQuantity <= product.minimumStock),
      };
    }

    return {
      databaseAvailable: true as const,
      products,
    };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return {
        databaseAvailable: false as const,
        products: [],
      };
    }

    throw error;
  }
}

export async function getProductById(id: string) {
  try {
    return {
      databaseAvailable: true as const,
      product: await prisma.product.findUnique({
        where: { id },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true },
          },
          lastStockCountBy: {
            select: { id: true, name: true },
          },
          productCategory: {
            select: { id: true, name: true, slug: true },
          },
          attributeAssignments: {
            include: { attribute: { select: { id: true, name: true } } },
            orderBy: { createdAt: "asc" as const },
          },
          // Phase 11A — XML data & images
          images: {
            orderBy: { sortOrder: "asc" as const },
          },
          xmlData: true,
          mainProduct: {
            select: { id: true, sku: true, name: true },
          },
        },
      }),
    };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return { databaseAvailable: false as const, product: null };
    }
    throw error;
  }
}

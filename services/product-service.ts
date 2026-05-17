import "server-only";

import { Prisma } from "@prisma/client";

import { isDatabaseUnavailableError } from "@/lib/database";
import { prisma } from "@/lib/prisma";

export type ProductFilters = {
  q?: string;
  status?: string;
  stock?: string;
  sort?: string;
};

type SortOption = Prisma.ProductOrderByWithRelationInput[];

function buildOrderBy(sort?: string): SortOption {
  switch (sort) {
    case "stock_desc": return [{ stockQuantity: "desc" }, { name: "asc" }];
    case "stock_asc": return [{ stockQuantity: "asc" }, { name: "asc" }];
    case "price_desc": return [{ sellingPriceTry: { sort: "desc", nulls: "last" } }, { name: "asc" }];
    case "price_asc": return [{ sellingPriceTry: { sort: "asc", nulls: "last" } }, { name: "asc" }];
    case "name_asc": return [{ name: "asc" }];
    case "margin_desc": return [{ updatedAt: "desc" }, { name: "asc" }]; // margin sorted in JS
    default: return [{ updatedAt: "desc" }, { name: "asc" }];
  }
}

export async function listProducts(filters: ProductFilters) {
  const where: Prisma.ProductWhereInput = {};

  if (filters.q && filters.q.length >= 2) {
    where.OR = [
      { sku: { contains: filters.q, mode: "insensitive" } },
      { name: { contains: filters.q, mode: "insensitive" } },
      { brand: { contains: filters.q, mode: "insensitive" } },
      { model: { contains: filters.q, mode: "insensitive" } },
      { barcode: { contains: filters.q, mode: "insensitive" } },
    ];
  }

  if (filters.status === "active") {
    where.isActive = true;
  } else if (filters.status === "inactive") {
    where.isActive = false;
  }

  if (filters.stock === "has_stock") {
    where.stockQuantity = { gt: 0 };
  }

  try {
    const products = await prisma.product.findMany({
      where,
      orderBy: buildOrderBy(filters.sort),
      include: {
        images: { take: 1, orderBy: { sortOrder: "asc" } },
        productCategory: { select: { id: true, name: true } },
      },
    });

    let filtered = products;

    // low-stock filter applied in JS (comparison between two fields)
    if (filters.stock === "low") {
      filtered = products.filter((p) => p.stockQuantity <= p.minimumStock);
    }

    // margin sort applied in JS (computed field)
    if (filters.sort === "margin_desc") {
      filtered = [...filtered].sort((a, b) => {
        const marginA =
          a.sellingPriceTry != null && a.unitCostTry != null
            ? (Number(a.sellingPriceTry) - Number(a.unitCostTry)) / Number(a.sellingPriceTry)
            : -Infinity;
        const marginB =
          b.sellingPriceTry != null && b.unitCostTry != null
            ? (Number(b.sellingPriceTry) - Number(b.unitCostTry)) / Number(b.sellingPriceTry)
            : -Infinity;
        return marginB - marginA;
      });
    }

    return {
      databaseAvailable: true as const,
      products: filtered,
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

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

// Sort values that require a secondary aggregation query against TrendyolSalesRecord.
const SALES_SORTS = new Set(["sales_30d_qty", "sales_30d_rev", "sales_all_rev"]);

function buildOrderBy(sort?: string): SortOption {
  switch (sort) {
    case "stock_desc": return [{ stockQuantity: "desc" }, { name: "asc" }];
    case "stock_asc": return [{ stockQuantity: "asc" }, { name: "asc" }];
    case "price_desc": return [{ sellingPriceTry: { sort: "desc", nulls: "last" } }, { name: "asc" }];
    case "price_asc": return [{ sellingPriceTry: { sort: "asc", nulls: "last" } }, { name: "asc" }];
    case "name_asc": return [{ name: "asc" }];
    // margin_desc and all sales sorts are computed in JS; DB orders by name as stable base
    case "margin_desc":
    case "sales_30d_qty":
    case "sales_30d_rev":
    case "sales_all_rev":
      return [{ name: "asc" }];
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
        xmlData: { select: { xmlTrendyolPrice: true } },
        marketplacePrices: { select: { marketplace: true, priceTry: true, source: true } },
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

    // Phase 26 — Sales-based sorts: aggregate TrendyolSalesRecord then sort in JS.
    // Only runs when one of the three sales sort values is selected.
    if (SALES_SORTS.has(filters.sort ?? "")) {
      const productIds = filtered.map((p) => p.id);

      if (productIds.length > 0) {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        // Fetch sales records for the visible product set only (not the whole table).
        const salesRecords = await prisma.trendyolSalesRecord.findMany({
          where: { productId: { in: productIds } },
          select: {
            productId: true,
            orderDate: true,
            quantity: true,
            totalPriceTry: true,
            status: true,
          },
        });

        // Aggregate per product, excluding cancelled orders (mirrors Phase 26 logic).
        type SalesAgg = { qty30d: number; rev30d: number; revAll: number };
        const agg = new Map<string, SalesAgg>();

        for (const r of salesRecords) {
          if (!r.productId) continue;
          const s = r.status.toLowerCase();
          if (s.includes("iptal") || s.includes("cancel")) continue;

          if (!agg.has(r.productId)) {
            agg.set(r.productId, { qty30d: 0, rev30d: 0, revAll: 0 });
          }
          const entry = agg.get(r.productId)!;
          const rev = Number(r.totalPriceTry);
          entry.revAll += rev;
          if (r.orderDate >= thirtyDaysAgo) {
            entry.qty30d += r.quantity;
            entry.rev30d += rev;
          }
        }

        const empty: SalesAgg = { qty30d: 0, rev30d: 0, revAll: 0 };
        filtered = [...filtered].sort((a, b) => {
          const aggA = agg.get(a.id) ?? empty;
          const aggB = agg.get(b.id) ?? empty;
          switch (filters.sort) {
            case "sales_30d_qty": return aggB.qty30d - aggA.qty30d;
            case "sales_30d_rev": return aggB.rev30d - aggA.rev30d;
            case "sales_all_rev": return aggB.revAll - aggA.revAll;
            default: return 0;
          }
        });
      }
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
          // Phase 71 — Canonical marketplace prices
          marketplacePrices: { select: { marketplace: true, priceTry: true, rawExternalValue: true, source: true } },
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

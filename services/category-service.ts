import "server-only";

import type { CustomerType, InterestStage } from "@prisma/client";

import { isDatabaseUnavailableError } from "@/lib/database";
import { prisma } from "@/lib/prisma";

export type CategoryListItem = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  parent: { id: string; name: string } | null;
  _count: { products: number; interests: number };
};

export type CategoryDetail = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  parent: { id: string; name: string; slug: string } | null;
  children: { id: string; name: string; slug: string }[];
  products: { id: string; name: string; sku: string; stockQuantity: number; minimumStock: number }[];
  interests: {
    id: string;
    stage: InterestStage;
    notes: string | null;
    createdAt: Date;
    customer: { id: string; name: string; company: string | null; phone: string | null; customerType: CustomerType | null };
    createdBy: { id: string; name: string } | null;
  }[];
};

export async function listCategories(): Promise<
  | { databaseAvailable: true; categories: CategoryListItem[] }
  | { databaseAvailable: false; categories: CategoryListItem[] }
> {
  try {
    const categories = await prisma.productCategory.findMany({
      include: {
        parent: { select: { id: true, name: true } },
        _count: { select: { products: true, interests: true } },
      },
      orderBy: [{ parentId: "asc" }, { name: "asc" }],
    });
    return { databaseAvailable: true, categories: categories as CategoryListItem[] };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return { databaseAvailable: false, categories: [] };
    }
    throw error;
  }
}

export async function getCategoryById(id: string): Promise<
  | { databaseAvailable: true; category: CategoryDetail | null }
  | { databaseAvailable: false; category: null }
> {
  try {
    const category = await prisma.productCategory.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, name: true, slug: true } },
        children: { select: { id: true, name: true, slug: true } },
        products: {
          where: { isActive: true },
          select: { id: true, name: true, sku: true, stockQuantity: true, minimumStock: true },
          orderBy: { name: "asc" },
        },
        interests: {
          include: {
            customer: { select: { id: true, name: true, company: true, phone: true, customerType: true } },
            createdBy: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    return { databaseAvailable: true, category: category as CategoryDetail | null };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return { databaseAvailable: false, category: null };
    }
    throw error;
  }
}

export async function listCategoriesForSelect() {
  try {
    return {
      databaseAvailable: true as const,
      categories: await prisma.productCategory.findMany({
        select: { id: true, name: true, slug: true, parentId: true },
        orderBy: [{ parentId: "asc" }, { name: "asc" }],
      }),
    };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return { databaseAvailable: false as const, categories: [] };
    }
    throw error;
  }
}

export async function getProductIntelligence(productId: string) {
  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        categoryId: true,
        interests: {
          include: {
            customer: { select: { id: true, name: true, company: true, phone: true, customerType: true } },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!product) {
      return { databaseAvailable: true as const, directInterests: [], attributeInterests: [], categoryInterests: [] };
    }

    const directCustomerIds = new Set(product.interests.map((i) => i.customer.id));

    // Run category and attribute-ID lookups in parallel — both depend only on Q1.
    const [categoryInterests, productAttrRows] = await Promise.all([
      product.categoryId
        ? prisma.categoryInterest.findMany({
            where: { categoryId: product.categoryId },
            include: {
              customer: { select: { id: true, name: true, company: true, phone: true, customerType: true } },
            },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
      prisma.productAttributeAssignment.findMany({
        where: { productId },
        select: { attributeId: true },
      }),
    ]);

    const attrInterests = productAttrRows.length > 0
      ? await prisma.customerAttributeInterest.findMany({
          where: { attributeId: { in: productAttrRows.map((r) => r.attributeId) } },
          include: {
            customer: { select: { id: true, name: true, company: true, phone: true, customerType: true } },
            attribute: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 500,
        })
      : [];

    const seenForAttribute = new Set(directCustomerIds);
    const uniqueAttrInterests = attrInterests.filter((ai) => {
      if (seenForAttribute.has(ai.customer.id)) return false;
      seenForAttribute.add(ai.customer.id);
      return true;
    });

    const categoryCustomerIds = new Set([...directCustomerIds, ...uniqueAttrInterests.map((ai) => ai.customer.id)]);

    return {
      databaseAvailable: true as const,
      directInterests: product.interests,
      attributeInterests: uniqueAttrInterests,
      categoryInterests: categoryInterests.filter(
        (ci) => !categoryCustomerIds.has(ci.customer.id),
      ),
    };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return { databaseAvailable: false as const, directInterests: [], attributeInterests: [], categoryInterests: [] };
    }
    throw error;
  }
}

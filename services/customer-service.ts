import "server-only";

import { Prisma } from "@prisma/client";

import { isDatabaseUnavailableError, isSchemaMismatchError } from "@/lib/database";
import { prisma } from "@/lib/prisma";

export type CustomerFilters = {
  q?: string;
  status?: string;
  source?: string;
  ownedById?: string;
  attributeId?: string;
  customerType?: string;
  leadListId?: string;
  segment?: string;
  city?: string;
  district?: string;
  industryId?: string;
  industryGroupId?: string;
  categoryId?: string;
};

export type UserOption = {
  id: string;
  name: string;
};

const customerDetailInclude = Prisma.validator<Prisma.CustomerInclude>()({
  owner: { select: { id: true, name: true } },
  attributeInterests: {
    include: { attribute: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" as const },
  },
  interests: {
    include: {
      product: { select: { id: true, name: true, sku: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  },
  categoryInterests: {
    include: {
      category: { select: { id: true, name: true, slug: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  },
  timelineEntries: {
    include: {
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  },
  tasks: {
    include: {
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  },
  quotes: {
    include: {
      items: { orderBy: { createdAt: "asc" } },
    },
    orderBy: { createdAt: "desc" },
  },
});

export type CustomerDetail = Prisma.CustomerGetPayload<{
  include: typeof customerDetailInclude;
}>;

export async function listUsersForSelect(): Promise<UserOption[]> {
  try {
    return await prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  } catch {
    return [];
  }
}

export async function listCustomers(filters: CustomerFilters) {
  const where: Prisma.CustomerWhereInput = {};

  if (filters.q) {
    where.OR = [
      { name:      { contains: filters.q, mode: "insensitive" } },
      { company:   { contains: filters.q, mode: "insensitive" } },
      { phone:     { contains: filters.q, mode: "insensitive" } },
      { whatsapp:  { contains: filters.q, mode: "insensitive" } },
      { email:     { contains: filters.q, mode: "insensitive" } },
      { city:      { contains: filters.q, mode: "insensitive" } },
      { country:   { contains: filters.q, mode: "insensitive" } },
      { taxNumber: { contains: filters.q, mode: "insensitive" } },
    ];
  }

  if (filters.status && filters.status !== "all") {
    where.status = filters.status as Prisma.EnumCustomerStatusFilter["equals"];
  }

  if (filters.source && filters.source !== "all") {
    where.source = filters.source;
  }

  if (filters.ownedById && filters.ownedById !== "all") {
    where.ownedById = filters.ownedById;
  }

  if (filters.attributeId && filters.attributeId !== "all") {
    where.attributeInterests = { some: { attributeId: filters.attributeId } };
  }

  if (filters.customerType && filters.customerType !== "all") {
    where.customerType = filters.customerType as import("@prisma/client").CustomerType;
  }

  if (filters.leadListId && filters.leadListId !== "all") {
    where.leadListMemberships = { some: { leadListId: filters.leadListId } };
  }

  if (filters.segment && filters.segment !== "all") {
    where.segment = filters.segment as import("@prisma/client").CustomerSegment;
  }

  if (filters.city && filters.city !== "all") {
    where.city = filters.city;
  }
  if (filters.district && filters.district !== "all") {
    where.district = filters.district;
  }
  if (filters.industryId && filters.industryId !== "all") {
    where.industryId = filters.industryId;
  } else if (filters.industryGroupId && filters.industryGroupId !== "all") {
    // Üst grup seçilirse tüm alt sektörleri kapsa
    where.industry = { parentId: filters.industryGroupId };
  }
  if (filters.categoryId && filters.categoryId !== "all") {
    where.categoryInterests = { some: { categoryId: filters.categoryId } };
  }

  const orderBy = [{ updatedAt: "desc" as const }, { name: "asc" as const }];

  try {
    return {
      databaseAvailable: true as const,
      customers: await prisma.customer.findMany({
        where,
        include: {
          owner: { select: { id: true, name: true } },
        },
        orderBy,
      }),
    };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return { databaseAvailable: false as const, customers: [] };
    }

    if (isSchemaMismatchError(error)) {
      // Phase 6 migration not yet applied — fall back to a query that
      // omits the new columns (monthlySalesPotential, platformNotes) and
      // ignores the customerType enum filter (column is still TEXT).
      const fallbackWhere: Prisma.CustomerWhereInput = { ...where, customerType: undefined };

      try {
        const rows = await prisma.customer.findMany({
          where: fallbackWhere,
          select: {
            id: true, name: true, phone: true, whatsapp: true, email: true,
            company: true, status: true, country: true, customerNotes: true,
            customerType: true, city: true, district: true, address: true,
            taxOffice: true, taxNumber: true, source: true, ownedById: true,
            isActive: true, lastContactedAt: true, createdAt: true, updatedAt: true,
            owner: { select: { id: true, name: true } },
          },
          orderBy,
        });
        // Merge with null stubs for Phase 6 + 95b + 98 + 99 fields to satisfy TypeScript types.
        const customers = rows.map((r) => ({
          ...r,
          monthlySalesPotential: null as null,
          platformNotes: null as null,
          tags: [] as string[],
          doNotCall: false,
          avatarUrl: null as null,
          callAttempts: 0,
          lastCallAttemptAt: null as null,
          shownInQueueCount: 0,
          segment: null as null,
          industryId: null as null,
          usedTech: [] as string[],
          currentSupplier: null as null,
        }));
        return { databaseAvailable: true as const, customers };
      } catch {
        return { databaseAvailable: false as const, customers: [] };
      }
    }

    throw error;
  }
}

export async function getCustomerById(id: string): Promise<
  | { databaseAvailable: true; customer: CustomerDetail | null }
  | { databaseAvailable: false; customer: null }
> {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: customerDetailInclude,
    });

    return { databaseAvailable: true as const, customer };
  } catch (error) {
    if (isDatabaseUnavailableError(error) || isSchemaMismatchError(error)) {
      // Phase 6 migration not yet applied, or DB unavailable.
      return { databaseAvailable: false as const, customer: null };
    }

    throw error;
  }
}

export async function listCustomerInterestProducts() {
  try {
    return {
      databaseAvailable: true as const,
      products: await prisma.product.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          sku: true,
          sellingPriceTry: true,
        },
        orderBy: [{ name: "asc" }, { sku: "asc" }],
      }),
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

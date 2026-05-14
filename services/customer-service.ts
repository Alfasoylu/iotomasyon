import "server-only";

import { Prisma } from "@prisma/client";

import { isDatabaseUnavailableError } from "@/lib/database";
import { prisma } from "@/lib/prisma";

export type CustomerFilters = {
  q?: string;
  status?: string;
  source?: string;
  ownedById?: string;
};

export type UserOption = {
  id: string;
  name: string;
};

const customerDetailInclude = Prisma.validator<Prisma.CustomerInclude>()({
  owner: { select: { id: true, name: true } },
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

  try {
    return {
      databaseAvailable: true as const,
      customers: await prisma.customer.findMany({
        where,
        include: {
          owner: { select: { id: true, name: true } },
        },
        orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      }),
    };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return {
        databaseAvailable: false as const,
        customers: [],
      };
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

    return {
      databaseAvailable: true,
      customer,
    };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return {
        databaseAvailable: false,
        customer: null,
      };
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

import "server-only";

import { Prisma } from "@prisma/client";

import { isDatabaseUnavailableError } from "@/lib/database";
import { prisma } from "@/lib/prisma";

export type CustomerFilters = {
  q?: string;
  status?: string;
};

export async function listCustomers(filters: CustomerFilters) {
  const where: Prisma.CustomerWhereInput = {};

  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q, mode: "insensitive" } },
      { company: { contains: filters.q, mode: "insensitive" } },
      { phone: { contains: filters.q, mode: "insensitive" } },
      { whatsapp: { contains: filters.q, mode: "insensitive" } },
      { email: { contains: filters.q, mode: "insensitive" } },
      { city: { contains: filters.q, mode: "insensitive" } },
      { country: { contains: filters.q, mode: "insensitive" } },
      { taxNumber: { contains: filters.q, mode: "insensitive" } },
    ];
  }

  if (filters.status && filters.status !== "all") {
    where.status = filters.status as Prisma.EnumCustomerStatusFilter["equals"];
  }

  try {
    return {
      databaseAvailable: true as const,
      customers: await prisma.customer.findMany({
        where,
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

export async function getCustomerById(id: string) {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        interests: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
              },
            },
            createdBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        timelineEntries: {
          include: {
            createdBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        tasks: {
          include: {
            createdBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        },
      },
    });

    return {
      databaseAvailable: true as const,
      customer: customer
        ? {
            ...customer,
            tasks: customer.tasks.map((task) => ({
              ...task,
              isOverdue:
                task.status === "OPEN" &&
                !!task.dueDate &&
                task.dueDate.getTime() < Date.now(),
            })),
          }
        : null,
    };
  } catch (error) {
    if (isDatabaseUnavailableError(error)) {
      return {
        databaseAvailable: false as const,
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

import "server-only";

import { prisma } from "@/lib/prisma";

export type AttributeOption = { id: string; name: string };

export async function listAttributes(): Promise<AttributeOption[]> {
  try {
    return await prisma.productAttribute.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  } catch {
    return [];
  }
}

export async function getProductAttributeIds(productId: string): Promise<string[]> {
  try {
    const rows = await prisma.productAttributeAssignment.findMany({
      where: { productId },
      select: { attributeId: true },
    });
    return rows.map((r) => r.attributeId);
  } catch {
    return [];
  }
}

export async function getCustomerAttributeInterestIds(customerId: string): Promise<string[]> {
  try {
    const rows = await prisma.customerAttributeInterest.findMany({
      where: { customerId },
      select: { attributeId: true },
    });
    return rows.map((r) => r.attributeId);
  } catch {
    return [];
  }
}

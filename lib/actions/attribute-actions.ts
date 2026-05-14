"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/types/actions";

// Create attribute if not exists; return its id.
export async function upsertAttributeAction(
  name: string,
): Promise<ActionResult & { id?: string; name?: string }> {
  await requireUser();
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, message: "Özellik adı gereklidir." };

  try {
    const attr = await prisma.productAttribute.upsert({
      where: { name: trimmed },
      update: {},
      create: { name: trimmed },
      select: { id: true, name: true },
    });
    return { ok: true, id: attr.id, name: attr.name };
  } catch {
    return { ok: false, message: "Özellik oluşturulamadı." };
  }
}

// Replace the full attribute set for a product atomically.
export async function setProductAttributesAction(
  productId: string,
  attributeIds: string[],
): Promise<ActionResult> {
  await requireUser();

  try {
    await prisma.$transaction(async (tx) => {
      await tx.productAttributeAssignment.deleteMany({ where: { productId } });
      for (const attributeId of attributeIds) {
        await tx.productAttributeAssignment.create({
          data: { productId, attributeId },
        });
      }
    });
    revalidatePath(`/products/${productId}`);
    revalidatePath("/products");
    return { ok: true };
  } catch {
    return { ok: false, message: "Özellikler kaydedilemedi." };
  }
}

// Toggle a single customer attribute interest on/off.
export async function toggleCustomerAttributeInterestAction(
  customerId: string,
  attributeId: string,
  add: boolean,
): Promise<ActionResult> {
  await requireUser();

  try {
    if (add) {
      await prisma.customerAttributeInterest.upsert({
        where: { customerId_attributeId: { customerId, attributeId } },
        update: {},
        create: { customerId, attributeId },
      });
    } else {
      await prisma.customerAttributeInterest.delete({
        where: { customerId_attributeId: { customerId, attributeId } },
      });
    }
    revalidatePath(`/customers/${customerId}`);
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: add ? "Özellik ilgisi eklenemedi." : "Özellik ilgisi kaldırılamadı.",
    };
  }
}

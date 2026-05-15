"use server";

import { revalidatePath } from "next/cache";

import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/types/actions";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

// Canonical normalization: all attribute names stored lowercase.
// Prevents "Inverter" / "inverter" / "INVERTER" fragmentation in the tag namespace.
function normalizeAttributeName(raw: string): string {
  return raw.trim().toLowerCase();
}

// Create attribute if not exists; return its id.
export async function upsertAttributeAction(
  name: string,
): Promise<ActionResult & { id?: string; name?: string }> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.ATTRIBUTES_CREATE))) return PERM_DENIED;
  const normalized = normalizeAttributeName(name);
  if (!normalized) return { ok: false, message: "Özellik adı gereklidir." };

  try {
    const attr = await prisma.productAttribute.upsert({
      where: { name: normalized },
      update: {},
      create: { name: normalized },
      select: { id: true, name: true },
    });
    return { ok: true, id: attr.id, name: attr.name };
  } catch {
    return { ok: false, message: "Özellik oluşturulamadı." };
  }
}

// Toggle a single customer attribute interest on/off.
export async function toggleCustomerAttributeInterestAction(
  customerId: string,
  attributeId: string,
  add: boolean,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.CUSTOMERS_UPDATE))) return PERM_DENIED;

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

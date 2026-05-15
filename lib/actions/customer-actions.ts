"use server";

import { revalidatePath } from "next/cache";

import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { customerSchema, type CustomerInput } from "@/lib/validations/customer";
import type { ActionResult } from "@/types/actions";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

type CustomerField = keyof CustomerInput;

export async function createCustomerAction(
  values: CustomerInput,
  options?: { productId?: string; categoryId?: string; attributeIds?: string[] },
): Promise<ActionResult<CustomerField>> {
  const parsed = customerSchema.safeParse(values);

  if (!parsed.success) {
    return {
      ok: false,
      message: "Form alanlarını kontrol edin.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.CUSTOMERS_CREATE))) return PERM_DENIED;

  const attributeIds = options?.attributeIds ?? [];
  if (attributeIds.length > 0) {
    const validCount = await prisma.productAttribute.count({
      where: { id: { in: attributeIds } },
    });
    if (validCount !== attributeIds.length) {
      return {
        ok: false,
        message: "Geçersiz özellik seçimi. Sayfayı yenileyip tekrar deneyin.",
      };
    }
  }

  try {
    const customer = await prisma.$transaction(async (tx) => {
      const c = await tx.customer.create({
        data: normalizeCustomerData(parsed.data),
      });

      if (options?.productId) {
        await tx.productInterest.create({
          data: {
            customerId: c.id,
            productId: options.productId,
            createdById: user.id,
          },
        });
      }

      if (options?.categoryId) {
        await tx.categoryInterest.create({
          data: {
            customerId: c.id,
            categoryId: options.categoryId,
            createdById: user.id,
          },
        });
      }

      for (const attributeId of attributeIds) {
        await tx.customerAttributeInterest.create({
          data: { customerId: c.id, attributeId },
        });
      }

      return c;
    });

    revalidatePath("/dashboard");
    revalidatePath("/customers");
    if (options?.productId)  revalidatePath(`/products/${options.productId}`);
    if (options?.categoryId) revalidatePath(`/categories/${options.categoryId}`);

    return {
      ok: true,
      redirectTo: `/customers/${customer.id}`,
    };
  } catch {
    return {
      ok: false,
      message: "Müşteri kaydı oluşturulamadı.",
    };
  }
}

export async function updateCustomerAction(
  customerId: string,
  values: CustomerInput,
  attributeIds: string[] = [],
): Promise<ActionResult<CustomerField>> {
  const parsed = customerSchema.safeParse(values);

  if (!parsed.success) {
    return {
      ok: false,
      message: "Form alanlarını kontrol edin.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.CUSTOMERS_UPDATE))) return PERM_DENIED;

  if (attributeIds.length > 0) {
    const validCount = await prisma.productAttribute.count({
      where: { id: { in: attributeIds } },
    });
    if (validCount !== attributeIds.length) {
      return {
        ok: false,
        message: "Geçersiz özellik seçimi. Sayfayı yenileyip tekrar deneyin.",
      };
    }
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customerId },
        data: normalizeCustomerData(parsed.data),
      });
      await tx.customerAttributeInterest.deleteMany({ where: { customerId } });
      for (const attributeId of attributeIds) {
        await tx.customerAttributeInterest.create({
          data: { customerId, attributeId },
        });
      }
    });

    revalidatePath("/dashboard");
    revalidatePath("/customers");
    revalidatePath(`/customers/${customerId}`);

    return {
      ok: true,
      redirectTo: `/customers/${customerId}`,
    };
  } catch {
    return {
      ok: false,
      message: "Müşteri güncellenemedi.",
    };
  }
}

export async function updateCustomerStatusAction(
  customerId: string,
  status: CustomerInput["status"],
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.CUSTOMERS_UPDATE))) return PERM_DENIED;

  try {
    await prisma.customer.update({
      where: { id: customerId },
      data: { status },
    });

    revalidatePath("/dashboard");
    revalidatePath("/customers");
    revalidatePath(`/customers/${customerId}`);

    return { ok: true };
  } catch {
    return { ok: false, message: "Müşteri durumu güncellenemedi." };
  }
}

export async function deleteCustomerAction(customerId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.CUSTOMERS_DELETE))) return PERM_DENIED;

  try {
    await prisma.customer.delete({
      where: { id: customerId },
    });

    revalidatePath("/dashboard");
    revalidatePath("/customers");

    return {
      ok: true,
      redirectTo: "/customers",
    };
  } catch {
    return {
      ok: false,
      message: "Müşteri silinemedi.",
    };
  }
}

function normalizeCustomerData(input: CustomerInput) {
  return {
    name:         input.name.trim(),
    company:      emptyToNull(input.company),
    phone:        emptyToNull(input.phone),
    whatsapp:     emptyToNull(input.whatsapp),
    email:        emptyToNull(input.email?.toLowerCase()),
    taxNumber:    emptyToNull(input.taxNumber),
    address:      emptyToNull(input.address),
    city:         emptyToNull(input.city),
    district:     emptyToNull(input.district),
    country:      "Türkiye",
    customerNotes: emptyToNull(input.notes),
    status:       input.status,
    source:       emptyToNull(input.source),
    ownedById:    emptyToNull(input.ownedById),
  };
}

function emptyToNull(value: string | undefined) {
  return value && value.trim().length > 0 ? value.trim() : null;
}

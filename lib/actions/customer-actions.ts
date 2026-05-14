"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { customerSchema, type CustomerInput } from "@/lib/validations/customer";
import type { ActionResult } from "@/types/actions";

type CustomerField = keyof CustomerInput;

export async function createCustomerAction(
  values: CustomerInput,
  options?: { productId?: string; categoryId?: string },
): Promise<ActionResult<CustomerField>> {
  const parsed = customerSchema.safeParse(values);

  if (!parsed.success) {
    return {
      ok: false,
      message: "Form alanlarini kontrol edin.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const user = await requireUser();

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
      message: "Musteri kaydi olusturulamadi.",
    };
  }
}

export async function updateCustomerAction(
  customerId: string,
  values: CustomerInput,
): Promise<ActionResult<CustomerField>> {
  const parsed = customerSchema.safeParse(values);

  if (!parsed.success) {
    return {
      ok: false,
      message: "Form alanlarini kontrol edin.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  await requireUser();

  try {
    await prisma.customer.update({
      where: { id: customerId },
      data: normalizeCustomerData(parsed.data),
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
      message: "Musteri guncellenemedi.",
    };
  }
}

export async function updateCustomerStatusAction(
  customerId: string,
  status: CustomerInput["status"],
): Promise<ActionResult> {
  await requireUser();

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
    return { ok: false, message: "Musteri durumu guncellenemedi." };
  }
}

export async function deleteCustomerAction(customerId: string): Promise<ActionResult> {
  await requireUser();

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
      message: "Musteri silinemedi.",
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
    country:      emptyToNull(input.country),
    customerNotes: emptyToNull(input.notes),
    status:       input.status,
    source:       emptyToNull(input.source),
    ownedById:    emptyToNull(input.ownedById),
  };
}

function emptyToNull(value: string | undefined) {
  return value && value.trim().length > 0 ? value.trim() : null;
}

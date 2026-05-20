"use server";

import { revalidatePath } from "next/cache";

import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import {
  categoryInterestSchema,
  customerInterestSchema,
  customerTaskSchema,
  customerTimelineNoteSchema,
  type CategoryInterestInput,
  type CustomerInterestInput,
  type CustomerTaskInput,
  type CustomerTimelineNoteInput,
} from "@/lib/validations/customer-crm";
import type { ActionResult } from "@/types/actions";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

type InterestField = keyof CustomerInterestInput;
type NoteField = keyof CustomerTimelineNoteInput;
type TaskField = keyof CustomerTaskInput;

export async function createCustomerInterestAction(
  customerId: string,
  values: CustomerInterestInput,
): Promise<ActionResult<InterestField>> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.CUSTOMERS_UPDATE))) return PERM_DENIED;
  const parsed = customerInterestSchema.safeParse(values);

  if (!parsed.success) {
    return {
      ok: false,
      message: "Ilgi formunu kontrol edin.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await prisma.productInterest.create({
      data: {
        customerId,
        productId: parsed.data.productId,
        quantity: parsed.data.quantity,
        quotedPrice: decimalOrNull(parsed.data.quotedPrice),
        currency: parsed.data.currency.trim().toUpperCase(),
        stage: parsed.data.stage,
        interestNotes: emptyToNull(parsed.data.notes),
        createdById: user.id,
      },
    });

    revalidatePath(`/customers/${customerId}`);

    return { ok: true };
  } catch {
    return {
      ok: false,
      message: "Ürün ilişkisi kaydedilemedi.",
    };
  }
}

export async function deleteCustomerInterestAction(
  customerId: string,
  interestId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.CUSTOMERS_UPDATE))) return PERM_DENIED;

  try {
    await prisma.productInterest.delete({
      where: { id: interestId },
    });

    revalidatePath(`/customers/${customerId}`);
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: "Ürün ilişkisi silinemedi.",
    };
  }
}

export async function createCustomerNoteAction(
  customerId: string,
  values: CustomerTimelineNoteInput,
): Promise<ActionResult<NoteField>> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.CUSTOMERS_UPDATE))) return PERM_DENIED;
  const parsed = customerTimelineNoteSchema.safeParse(values);

  if (!parsed.success) {
    return {
      ok: false,
      message: "Not formunu kontrol edin.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await prisma.note.create({
      data: {
        customerId,
        content: parsed.data.note.trim(),
        type: parsed.data.type,
        createdById: user.id,
      },
    });

    // Hızlı not de lastContactedAt'i ileri sürmeli (sales rep "konuştum" diye not düşüyor)
    await prisma.customer.update({
      where: { id: customerId },
      data: { lastContactedAt: new Date() },
    });

    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/customers");
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: "Not eklenemedi.",
    };
  }
}

export async function createCustomerTaskAction(
  customerId: string,
  values: CustomerTaskInput,
): Promise<ActionResult<TaskField>> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.TASKS_CREATE))) return PERM_DENIED;
  const parsed = customerTaskSchema.safeParse(values);

  if (!parsed.success) {
    return {
      ok: false,
      message: "Gorev formunu kontrol edin.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  // tasks.assign is required to assign a task to someone other than yourself
  if (
    parsed.data.assignedToId &&
    parsed.data.assignedToId !== user.id &&
    !(await checkPermission(user, PERMISSIONS.TASKS_ASSIGN))
  ) {
    return { ok: false, message: "Başkasına görev atama yetkiniz yok." };
  }

  try {
    await prisma.followUpTask.create({
      data: {
        customerId,
        title: parsed.data.title.trim(),
        description: emptyToNull(parsed.data.description),
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
        priority: parsed.data.priority,
        status: "OPEN",
        createdById: user.id,
        assignedToId: parsed.data.assignedToId || null,
      },
    });

    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/customers");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: "Takip görevi oluşturulamadı.",
    };
  }
}

export async function markCustomerContactedAction(customerId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.CUSTOMERS_UPDATE))) return PERM_DENIED;

  try {
    await prisma.$transaction([
      prisma.customer.update({
        where: { id: customerId },
        data: { lastContactedAt: new Date() },
      }),
      prisma.note.create({
        data: {
          customerId,
          content: "WhatsApp ile iletisim kuruldu.",
          type: "WHATSAPP",
          createdById: user.id,
        },
      }),
    ]);

    revalidatePath(`/customers/${customerId}`);
    return { ok: true };
  } catch {
    return { ok: false, message: "İletişim kaydı oluşturulamadı." };
  }
}

export async function completeCustomerTaskAction(
  customerId: string,
  taskId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.TASKS_UPDATE))) return PERM_DENIED;

  try {
    await prisma.followUpTask.update({
      where: { id: taskId },
      data: {
        status: "DONE",
        completedAt: new Date(),
      },
    });

    revalidatePath("/tasks");
    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: "Gorev tamamlanamadi.",
    };
  }
}

export async function createCategoryInterestAction(
  customerId: string,
  values: CategoryInterestInput,
): Promise<ActionResult<keyof CategoryInterestInput>> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.CUSTOMERS_UPDATE))) return PERM_DENIED;
  const parsed = categoryInterestSchema.safeParse(values);

  if (!parsed.success) {
    return {
      ok: false,
      message: "Kategori ilgi formunu kontrol edin.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await prisma.categoryInterest.create({
      data: {
        customerId,
        categoryId: parsed.data.categoryId,
        stage: parsed.data.stage,
        notes: emptyToNull(parsed.data.notes),
        createdById: user.id,
      },
    });

    revalidatePath(`/customers/${customerId}`);
    return { ok: true };
  } catch {
    return { ok: false, message: "Bu müşteri bu kategoriye zaten eklenmiş." };
  }
}

export async function deleteCategoryInterestAction(
  customerId: string,
  interestId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.CUSTOMERS_UPDATE))) return PERM_DENIED;

  try {
    await prisma.categoryInterest.delete({ where: { id: interestId } });

    revalidatePath(`/customers/${customerId}`);
    return { ok: true };
  } catch {
    return { ok: false, message: "Kategori ilgisi silinemedi." };
  }
}

function emptyToNull(value: string | undefined) {
  return value && value.trim().length > 0 ? value.trim() : null;
}

function decimalOrNull(value: string) {
  if (!value.trim()) {
    return null;
  }

  return value.trim();
}

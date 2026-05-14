"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  customerInterestSchema,
  customerTaskSchema,
  customerTimelineNoteSchema,
  type CustomerInterestInput,
  type CustomerTaskInput,
  type CustomerTimelineNoteInput,
} from "@/lib/validations/customer-crm";
import type { ActionResult } from "@/types/actions";

type InterestField = keyof CustomerInterestInput;
type NoteField = keyof CustomerTimelineNoteInput;
type TaskField = keyof CustomerTaskInput;

export async function createCustomerInterestAction(
  customerId: string,
  values: CustomerInterestInput,
): Promise<ActionResult<InterestField>> {
  const user = await requireUser();
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
      message: "Urun iliskisi kaydedilemedi.",
    };
  }
}

export async function deleteCustomerInterestAction(
  customerId: string,
  interestId: string,
): Promise<ActionResult> {
  await requireUser();

  try {
    await prisma.productInterest.delete({
      where: { id: interestId },
    });

    revalidatePath(`/customers/${customerId}`);
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: "Urun iliskisi silinemedi.",
    };
  }
}

export async function createCustomerNoteAction(
  customerId: string,
  values: CustomerTimelineNoteInput,
): Promise<ActionResult<NoteField>> {
  const user = await requireUser();
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

    revalidatePath(`/customers/${customerId}`);
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
  const parsed = customerTaskSchema.safeParse(values);

  if (!parsed.success) {
    return {
      ok: false,
      message: "Gorev formunu kontrol edin.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
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
      },
    });

    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/dashboard");
    return { ok: true };
  } catch {
    return {
      ok: false,
      message: "Takip gorevi olusturulamadi.",
    };
  }
}

export async function markCustomerContactedAction(customerId: string): Promise<ActionResult> {
  const user = await requireUser();

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
    return { ok: false, message: "Iletisim kaydi olusturulamadi." };
  }
}

export async function completeCustomerTaskAction(
  customerId: string,
  taskId: string,
): Promise<ActionResult> {
  await requireUser();

  try {
    await prisma.followUpTask.update({
      where: { id: taskId },
      data: {
        status: "DONE",
        completedAt: new Date(),
      },
    });

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

function emptyToNull(value: string | undefined) {
  return value && value.trim().length > 0 ? value.trim() : null;
}

function decimalOrNull(value: string) {
  if (!value.trim()) {
    return null;
  }

  return value.trim();
}

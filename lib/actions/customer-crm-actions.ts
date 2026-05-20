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

// ── Phase 95c — Outcome chip server actions ────────────────────────────────

export type CallOutcomeKind =
  | "INTERESTED"      // İlgileniyor → görev oluştur
  | "NO_ANSWER"       // Açmadı → callAttempts++, 3+ olunca auto-snooze
  | "WRONG_NUMBER"    // Yanlış numara
  | "NOT_INTERESTED"  // İlgisiz → status=LOST
  | "DEAL_WON"        // Satış oldu → status=WON
  | "DND"             // Bir daha aramayın → doNotCall=true
  | "CALL_LATER";     // Snooze (tarih ver)

interface CallOutcomeInput {
  outcome: CallOutcomeKind;
  note?: string;
  nextActionDate?: string;   // ISO date YYYY-MM-DD
  nextActionTitle?: string;
}

export async function logCallOutcomeAction(
  customerId: string,
  input: CallOutcomeInput,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.CUSTOMERS_UPDATE))) return PERM_DENIED;

  try {
    const noteContent =
      input.note?.trim() ||
      ({
        INTERESTED: "Telefonla görüşüldü — ilgileniyor",
        NO_ANSWER: "Aradım, açmadı",
        WRONG_NUMBER: "Yanlış numara",
        NOT_INTERESTED: "Görüşüldü — ilgisiz",
        DEAL_WON: "Satış kapatıldı",
        DND: "Müşteri 'aramayın' dedi (DND işaretlendi)",
        CALL_LATER: "Sonra aranacak",
      }[input.outcome]);

    await prisma.note.create({
      data: {
        customerId,
        content: noteContent,
        type: "CALL",
        createdById: user.id,
      },
    });

    // Customer field updates
    const customerUpdates: {
      lastContactedAt: Date;
      status?: "WON" | "LOST";
      doNotCall?: boolean;
      callAttempts?: { increment: number } | number;
      lastCallAttemptAt?: Date;
    } = {
      lastContactedAt: new Date(),
    };

    if (input.outcome === "DEAL_WON") customerUpdates.status = "WON";
    if (input.outcome === "NOT_INTERESTED") customerUpdates.status = "LOST";
    if (input.outcome === "DND") customerUpdates.doNotCall = true;
    if (input.outcome === "NO_ANSWER") {
      customerUpdates.callAttempts = { increment: 1 };
      customerUpdates.lastCallAttemptAt = new Date();
    }
    if (input.outcome === "INTERESTED" || input.outcome === "DEAL_WON") {
      // Successful contact → reset callAttempts
      customerUpdates.callAttempts = 0;
    }

    await prisma.customer.update({
      where: { id: customerId },
      data: customerUpdates,
    });

    // Optional follow-up task (CALL_LATER + INTERESTED with nextActionDate)
    if (
      (input.outcome === "CALL_LATER" || input.outcome === "INTERESTED") &&
      input.nextActionDate
    ) {
      await prisma.followUpTask.create({
        data: {
          customerId,
          title: input.nextActionTitle?.trim() || (
            input.outcome === "CALL_LATER" ? "Geri ara" : "Takip et"
          ),
          dueDate: new Date(input.nextActionDate),
          priority: "MEDIUM",
          status: "OPEN",
          createdById: user.id,
        },
      });
    }

    // NO_ANSWER 3+ kez olduysa auto-snooze (24 saat sonra tekrar dene)
    if (input.outcome === "NO_ANSWER") {
      const updated = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { callAttempts: true },
      });
      if (updated && updated.callAttempts >= 3) {
        const snoozeDate = new Date();
        snoozeDate.setDate(snoozeDate.getDate() + 2);
        await prisma.followUpTask.create({
          data: {
            customerId,
            title: `3 kez açmadı — ${snoozeDate.toLocaleDateString("tr-TR")} sonra dene`,
            dueDate: snoozeDate,
            priority: "LOW",
            status: "OPEN",
            createdById: user.id,
          },
        });
      }
    }

    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/customers");
    revalidatePath("/dashboard");
    return { ok: true };
  } catch {
    return { ok: false, message: "Çağrı sonucu kaydedilemedi." };
  }
}

// Inline status edit
export async function updateCustomerStatusAction(
  customerId: string,
  status: "NEW" | "CONTACTED" | "QUOTED" | "NEGOTIATING" | "WON" | "LOST",
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.CUSTOMERS_UPDATE))) return PERM_DENIED;

  try {
    await prisma.customer.update({
      where: { id: customerId },
      data: { status, lastContactedAt: new Date() },
    });
    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/customers");
    return { ok: true };
  } catch {
    return { ok: false, message: "Durum güncellenemedi." };
  }
}

// DND toggle (ayrı action)
export async function toggleDoNotCallAction(
  customerId: string,
  doNotCall: boolean,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.CUSTOMERS_UPDATE))) return PERM_DENIED;

  try {
    await prisma.customer.update({
      where: { id: customerId },
      data: { doNotCall },
    });
    if (doNotCall) {
      await prisma.note.create({
        data: {
          customerId,
          content: "DND işaretlendi — bir daha aramayın",
          type: "NOTE",
          createdById: user.id,
        },
      });
    }
    revalidatePath(`/customers/${customerId}`);
    revalidatePath("/customers");
    return { ok: true };
  } catch {
    return { ok: false, message: "DND güncellenemedi." };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/types/actions";

/**
 * Phase 96d — Mesaj şablonları (WhatsApp/SMS/Email)
 *
 * Değişkenler: {{musteri_adi}}, {{firma}}, {{teklif_no}}, {{son_gorusme}}, {{telefon}}, {{sehir}}
 */

const ALLOWED_CHANNELS = ["whatsapp", "sms", "email"] as const;

export async function createMessageTemplateAction(input: {
  name: string;
  channel: string;
  category?: string;
  body: string;
}): Promise<ActionResult & { id?: string }> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.CAMPAIGNS_READ))) {
    return { ok: false, message: "Bu işlem için yetkiniz yok." };
  }

  const name = input.name.trim();
  const body = input.body.trim();
  if (!name) return { ok: false, message: "Şablon adı gerekli." };
  if (!body) return { ok: false, message: "Mesaj içeriği gerekli." };
  if (!ALLOWED_CHANNELS.includes(input.channel as (typeof ALLOWED_CHANNELS)[number])) {
    return { ok: false, message: "Geçersiz kanal." };
  }

  const created = await prisma.messageTemplate.create({
    data: {
      name,
      channel: input.channel,
      category: input.category?.trim() || null,
      body,
      createdById: user.id,
    },
  });

  revalidatePath("/admin/message-templates");
  return { ok: true, id: created.id };
}

export async function updateMessageTemplateAction(input: {
  id: string;
  name?: string;
  channel?: string;
  category?: string | null;
  body?: string;
  isActive?: boolean;
}): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.CAMPAIGNS_READ))) {
    return { ok: false, message: "Bu işlem için yetkiniz yok." };
  }

  if (
    input.channel &&
    !ALLOWED_CHANNELS.includes(input.channel as (typeof ALLOWED_CHANNELS)[number])
  ) {
    return { ok: false, message: "Geçersiz kanal." };
  }

  await prisma.messageTemplate.update({
    where: { id: input.id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.channel !== undefined ? { channel: input.channel } : {}),
      ...(input.category !== undefined
        ? { category: input.category?.trim() || null }
        : {}),
      ...(input.body !== undefined ? { body: input.body.trim() } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  });

  revalidatePath("/admin/message-templates");
  return { ok: true };
}

export async function deleteMessageTemplateAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.CAMPAIGNS_READ))) {
    return { ok: false, message: "Bu işlem için yetkiniz yok." };
  }

  await prisma.messageTemplate.delete({ where: { id } });
  revalidatePath("/admin/message-templates");
  return { ok: true };
}

export async function incrementTemplateUsageAction(id: string): Promise<ActionResult> {
  await requireUser();
  await prisma.messageTemplate.update({
    where: { id },
    data: { usageCount: { increment: 1 } },
  }).catch(() => null);
  return { ok: true };
}

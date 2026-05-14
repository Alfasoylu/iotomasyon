"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCampaignSchema } from "@/lib/validations/outreach";
import type { ActionResult } from "@/types/actions";

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<string, readonly string[]> = {
  PENDING: ["SENT"],
  SENT:    ["REPLIED", "QUOTED", "WON", "LOST"],
  REPLIED: ["SENT", "QUOTED", "WON", "LOST"],
  QUOTED:  ["WON", "LOST"],
  WON:     ["QUOTED"],   // reversal only
  LOST:    ["QUOTED"],   // reversal only
};

function checkTransition(current: string, next: string): ActionResult | null {
  const allowed = VALID_TRANSITIONS[current];
  if (!allowed || !allowed.includes(next)) {
    return { ok: false, message: `Geçersiz durum geçişi: ${current} → ${next}` };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function createCampaignAction(
  values: unknown,
): Promise<ActionResult & { campaignId?: string }> {
  const user = await requireUser();
  const parsed = createCampaignSchema.safeParse(values);

  if (!parsed.success) {
    return {
      ok: false,
      message: "Form alanlarini kontrol edin.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { productId, categoryId, message, offerText, price, currency, selectedCustomerIds, customerPhones } =
    parsed.data;

  const campaign = await prisma.outreachCampaign.create({
    data: {
      productId: productId || null,
      categoryId: categoryId || null,
      message,
      offerText: offerText || null,
      price: price ? parseFloat(price) : null,
      currency,
      createdById: user.id,
      recipients: {
        create: selectedCustomerIds.map((customerId) => ({
          customerId,
          phone: customerPhones[customerId] ?? null,
        })),
      },
    },
  });

  revalidatePath("/campaigns");
  if (productId) revalidatePath(`/products/${productId}`);
  if (categoryId) revalidatePath(`/categories/${categoryId}`);

  return { ok: true, campaignId: campaign.id };
}

export async function markRecipientSentAction(recipientId: string): Promise<ActionResult> {
  await requireUser();

  const recipient = await prisma.outreachRecipient.findUnique({
    where: { id: recipientId },
    select: { status: true },
  });
  if (!recipient) return { ok: false, message: "Alıcı bulunamadı." };

  const err = checkTransition(recipient.status, "SENT");
  if (err) return err;

  await prisma.outreachRecipient.update({
    where: { id: recipientId },
    data: { status: "SENT", sentAt: new Date() },
  });

  revalidatePath("/campaigns");
  return { ok: true };
}

// Handles all status updates except PENDING→SENT (handled by markRecipientSentAction)
// and SENT/REPLIED→QUOTED (handled by linkRecipientToQuoteAction).
// Covers: forward (REPLIED, WON, LOST) and reversals (SENT, QUOTED).
export async function updateRecipientStatusAction(
  recipientId: string,
  status: "REPLIED" | "WON" | "LOST" | "SENT" | "QUOTED",
): Promise<ActionResult> {
  await requireUser();

  const recipient = await prisma.outreachRecipient.findUnique({
    where: { id: recipientId },
    select: { status: true, quoteId: true, quote: { select: { total: true } } },
  });
  if (!recipient) return { ok: false, message: "Alıcı bulunamadı." };

  const err = checkTransition(recipient.status, status);
  if (err) return err;

  // Business rule: WON requires a linked quote
  if (status === "WON" && !recipient.quoteId) {
    return { ok: false, message: "Kazanıldı işareti için önce teklif bağlanmalıdır." };
  }

  const data: Record<string, unknown> = { status };

  if (status === "REPLIED") {
    data.repliedAt = new Date();
  }

  if (status === "WON" && recipient.quote?.total) {
    // Snapshot quote total at time of win; survives quote edits/deletes
    data.wonAmount = recipient.quote.total;
  }

  await prisma.outreachRecipient.update({
    where: { id: recipientId },
    data,
  });

  revalidatePath("/campaigns");
  return { ok: true };
}

export async function linkRecipientToQuoteAction(
  recipientId: string,
  quoteNumber: string,
): Promise<ActionResult & { quoteId?: string }> {
  await requireUser();

  const recipient = await prisma.outreachRecipient.findUnique({
    where: { id: recipientId },
    select: { customerId: true, status: true },
  });
  if (!recipient) return { ok: false, message: "Alıcı bulunamadı." };

  // State machine: quote linking is only valid from SENT or REPLIED
  const err = checkTransition(recipient.status, "QUOTED");
  if (err) return err;

  const quote = await prisma.quote.findFirst({
    where: {
      quoteNumber: quoteNumber.trim(),
      customerId: recipient.customerId,
    },
    select: { id: true, total: true },
  });
  if (!quote) return { ok: false, message: "Bu müşteriye ait teklif bulunamadı." };

  await prisma.outreachRecipient.update({
    where: { id: recipientId },
    data: { status: "QUOTED", quoteId: quote.id },
  });

  revalidatePath("/campaigns");
  return { ok: true, quoteId: quote.id };
}

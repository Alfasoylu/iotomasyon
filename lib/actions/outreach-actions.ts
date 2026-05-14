"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createCampaignSchema } from "@/lib/validations/outreach";
import type { ActionResult } from "@/types/actions";

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

  await prisma.outreachRecipient.update({
    where: { id: recipientId },
    data: { status: "SENT", sentAt: new Date() },
  });

  revalidatePath("/campaigns");
  return { ok: true };
}

export async function updateRecipientStatusAction(
  recipientId: string,
  status: "REPLIED" | "WON" | "LOST",
): Promise<ActionResult> {
  await requireUser();

  const data: Record<string, unknown> = { status };
  if (status === "REPLIED") data.repliedAt = new Date();

  if (status === "WON") {
    const recipient = await prisma.outreachRecipient.findUnique({
      where: { id: recipientId },
      select: { quoteId: true, quote: { select: { total: true } } },
    });
    if (recipient?.quote?.total) {
      data.wonAmount = recipient.quote.total;
    }
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
    select: { customerId: true },
  });
  if (!recipient) return { ok: false, message: "Alıcı bulunamadı." };

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

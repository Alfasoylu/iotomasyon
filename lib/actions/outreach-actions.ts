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

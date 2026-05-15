"use server";

import { revalidatePath } from "next/cache";

import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;
import { createCampaignSchema } from "@/lib/validations/outreach";
import type { ActionResult } from "@/types/actions";

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

// Full transition graph used by updateRecipientStatusAction and
// linkRecipientToQuoteAction. markRecipientSentAction uses its own guard
// (PENDING-only) to prevent REPLIED→SENT from using the sentAt-setting path.
const VALID_TRANSITIONS: Record<string, readonly string[]> = {
  PENDING: ["SENT"],
  SENT:    ["REPLIED", "QUOTED", "WON", "LOST"],
  REPLIED: ["SENT", "QUOTED", "WON", "LOST"],
  QUOTED:  ["WON", "LOST"],
  WON:     ["QUOTED"],   // reversal
  LOST:    ["QUOTED"],   // reversal
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
  if (!(await checkPermission(user, PERMISSIONS.CAMPAIGNS_CREATE))) return PERM_DENIED;
  const parsed = createCampaignSchema.safeParse(values);

  if (!parsed.success) {
    return {
      ok: false,
      message: "Form alanlarını kontrol edin.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { productId, categoryId, message, offerText, price, currency, selectedCustomerIds, customerPhones } =
    parsed.data;

  try {
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
  } catch {
    return { ok: false, message: "Kampanya oluşturulamadı." };
  }
}

// PENDING → SENT only. Uses a dedicated guard — not the shared VALID_TRANSITIONS
// map — to prevent REPLIED→SENT from going through the sentAt-updating path.
export async function markRecipientSentAction(recipientId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.CAMPAIGNS_UPDATE))) return PERM_DENIED;

  const recipient = await prisma.outreachRecipient.findUnique({
    where: { id: recipientId },
    select: { status: true },
  });
  if (!recipient) return { ok: false, message: "Alıcı bulunamadı." };

  if (recipient.status !== "PENDING") {
    return { ok: false, message: `Gönderildi işareti yalnızca PENDING durumundaki alıcılar için geçerlidir. Mevcut durum: ${recipient.status}` };
  }

  await prisma.outreachRecipient.update({
    where: { id: recipientId },
    data: { status: "SENT", sentAt: new Date() },
  });

  revalidatePath("/campaigns");
  return { ok: true };
}

// Handles all status transitions except:
//   PENDING → SENT  (markRecipientSentAction)
//   SENT/REPLIED → QUOTED  (linkRecipientToQuoteAction — sets quoteId)
//
// Covers:
//   Forward:  SENT/REPLIED → REPLIED/WON/LOST, QUOTED → WON/LOST
//   Reversal: REPLIED → SENT, WON/LOST → QUOTED
//
// Additional invariants enforced here:
//   WON requires quoteId
//   QUOTED (reversal) only allowed from WON or LOST
export async function updateRecipientStatusAction(
  recipientId: string,
  status: "REPLIED" | "WON" | "LOST" | "SENT" | "QUOTED",
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.CAMPAIGNS_UPDATE))) return PERM_DENIED;

  const recipient = await prisma.outreachRecipient.findUnique({
    where: { id: recipientId },
    select: { status: true, quoteId: true, quote: { select: { total: true } } },
  });
  if (!recipient) return { ok: false, message: "Alıcı bulunamadı." };

  const err = checkTransition(recipient.status, status);
  if (err) return err;

  // QUOTED via this action is only valid as a reversal from WON or LOST.
  // Forward QUOTED (with quote linking) must go through linkRecipientToQuoteAction.
  if (status === "QUOTED" && !["WON", "LOST"].includes(recipient.status)) {
    return { ok: false, message: "Teklif çıktı geçişi yalnızca WON veya LOST durumundan geri alma için kullanılabilir." };
  }

  // Business rule: WON requires a linked quote (quoteId must exist)
  if (status === "WON" && !recipient.quoteId) {
    return { ok: false, message: "Kazanıldı işareti için önce teklif bağlanmalıdır." };
  }

  const data: Record<string, unknown> = { status };

  if (status === "REPLIED") {
    data.repliedAt = new Date();
  }

  if (status === "WON" && recipient.quote?.total) {
    // Snapshot quote total at time of win. Survives quote edits and deletions.
    data.wonAmount = recipient.quote.total;
  }

  await prisma.outreachRecipient.update({
    where: { id: recipientId },
    data,
  });

  revalidatePath("/campaigns");
  return { ok: true };
}

// SENT/REPLIED → QUOTED. Validates quote by number + customerId match.
// Sets quoteId on the recipient. Forbidden from any other source status.
export async function linkRecipientToQuoteAction(
  recipientId: string,
  quoteNumber: string,
): Promise<ActionResult & { quoteId?: string; quoteTotal?: string }> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.CAMPAIGNS_UPDATE))) return PERM_DENIED;

  if (!quoteNumber.trim()) {
    return { ok: false, message: "Teklif numarası gereklidir." };
  }

  const recipient = await prisma.outreachRecipient.findUnique({
    where: { id: recipientId },
    select: { customerId: true, status: true },
  });
  if (!recipient) return { ok: false, message: "Alıcı bulunamadı." };

  // Only SENT or REPLIED may forward to QUOTED via quote linking.
  // Reversal to QUOTED goes through updateRecipientStatusAction.
  if (!["SENT", "REPLIED"].includes(recipient.status)) {
    return { ok: false, message: `${recipient.status} durumunda teklif bağlanamaz.` };
  }

  const quote = await prisma.quote.findFirst({
    where: {
      quoteNumber: quoteNumber.trim(),
      customerId: recipient.customerId,
    },
    select: { id: true, total: true },
  });
  // Catches: invalid number, deleted quote, wrong customer — unified message
  // (intentionally opaque: no detail about which failure mode)
  if (!quote) return { ok: false, message: "Bu müşteriye ait teklif bulunamadı." };

  await prisma.outreachRecipient.update({
    where: { id: recipientId },
    data: { status: "QUOTED", quoteId: quote.id },
  });

  revalidatePath("/campaigns");
  return { ok: true, quoteId: quote.id, quoteTotal: quote.total.toString() };
}

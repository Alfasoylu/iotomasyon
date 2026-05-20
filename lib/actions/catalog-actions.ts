"use server";

import { revalidatePath } from "next/cache";

import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/types/actions";
import type { CatalogPriceMode } from "@/lib/catalog-mapping";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

type RecordCatalogSentInput = {
  customerId: string;
  profileSlug: string;
  profileTitle: string;
  priceMode: CatalogPriceMode;
  coverNote: string | null;
  productCount: number;
  channel: "WHATSAPP" | "EMAIL" | "DOWNLOAD";
};

/**
 * Katalog gönderildiğinde çağrılır:
 * - Note oluştur (type=WHATSAPP, timeline'da görünür)
 * - Customer.lastContactedAt güncelle
 */
export async function recordCatalogSentAction(
  input: RecordCatalogSentInput,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.CATALOGS_CREATE))) return PERM_DENIED;

  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: { id: true },
  });
  if (!customer) return { ok: false, message: "Müşteri bulunamadı." };

  const priceLabel: Record<CatalogPriceMode, string> = {
    wholesale: "Bayi (toptan)",
    retail: "Perakende",
    hidden: "Fiyatsız",
  };
  const channelLabel: Record<RecordCatalogSentInput["channel"], string> = {
    WHATSAPP: "WhatsApp",
    EMAIL: "E-posta",
    DOWNLOAD: "İndirildi",
  };

  const summary = [
    `Katalog gönderildi: ${input.profileTitle}`,
    `Fiyat modu: ${priceLabel[input.priceMode]}`,
    `Ürün sayısı: ${input.productCount}`,
    `Kanal: ${channelLabel[input.channel]}`,
    input.coverNote ? `Ön söz: "${input.coverNote.slice(0, 200)}${input.coverNote.length > 200 ? "…" : ""}"` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    await prisma.$transaction([
      prisma.note.create({
        data: {
          customerId: input.customerId,
          content: summary,
          type: "WHATSAPP",
          createdById: user.id,
        },
      }),
      prisma.customer.update({
        where: { id: input.customerId },
        data: { lastContactedAt: new Date() },
      }),
    ]);

    revalidatePath(`/customers/${input.customerId}`);
    return { ok: true };
  } catch {
    return { ok: false, message: "Katalog gönderim kaydı oluşturulamadı." };
  }
}

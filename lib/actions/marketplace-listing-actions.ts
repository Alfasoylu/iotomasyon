"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import type { ActionResult } from "@/types/actions";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

const listingSchema = z.object({
  productId: z.string().min(1, "Ürün seçimi zorunludur."),
  platform: z.enum(["TRENDYOL", "HEPSIBURADA", "N11", "PTTAVM", "KOCTAS", "TEKNOSA", "TEMU", "CUSTOM"]),
  platformListingId: z.string().trim().max(200),
  listingUrl: z.string().trim().max(1000),
  listingBarcode: z.string().trim().max(100),
  listingSku: z.string().trim().max(200),
  listingTitle: z.string().trim().max(500),
  status: z.enum(["ACTIVE", "INACTIVE", "SUSPENDED", "UNKNOWN"]),
  notes: z.string().trim().max(2000),
  responsibleId: z.string().trim(),
});

export type ListingFormValues = z.infer<typeof listingSchema>;

function normalize(data: ListingFormValues) {
  const e = (v: string) => (v.trim() ? v.trim() : null);
  return {
    productId: data.productId,
    platform: data.platform,
    platformListingId: e(data.platformListingId),
    listingUrl: e(data.listingUrl),
    listingBarcode: e(data.listingBarcode),
    listingSku: e(data.listingSku),
    listingTitle: e(data.listingTitle),
    status: data.status,
    notes: e(data.notes),
    responsibleId: e(data.responsibleId),
  };
}

export async function createListingAction(values: ListingFormValues): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.MARKETPLACE_LISTINGS_WRITE))) return PERM_DENIED;

  const parsed = listingSchema.safeParse(values);
  if (!parsed.success) return { ok: false, message: "Form alanlarını kontrol edin." };

  try {
    const listing = await prisma.marketplaceListing.create({
      data: { ...normalize(parsed.data), updatedAt: new Date() },
    });
    revalidatePath("/marketplace");
    revalidatePath(`/products/${parsed.data.productId}`);
    return { ok: true, redirectTo: `/marketplace/${listing.id}` };
  } catch {
    return { ok: false, message: "Listeleme kaydedilemedi." };
  }
}

export async function updateListingAction(listingId: string, values: ListingFormValues): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.MARKETPLACE_LISTINGS_WRITE))) return PERM_DENIED;

  const parsed = listingSchema.safeParse(values);
  if (!parsed.success) return { ok: false, message: "Form alanlarını kontrol edin." };

  try {
    await prisma.marketplaceListing.update({
      where: { id: listingId },
      data: { ...normalize(parsed.data), updatedAt: new Date() },
    });
    revalidatePath("/marketplace");
    revalidatePath(`/marketplace/${listingId}`);
    revalidatePath(`/products/${parsed.data.productId}`);
    return { ok: true, redirectTo: `/marketplace/${listingId}` };
  } catch {
    return { ok: false, message: "Listeleme güncellenemedi." };
  }
}

export async function deleteListingAction(listingId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.MARKETPLACE_LISTINGS_WRITE))) return PERM_DENIED;

  try {
    const listing = await prisma.marketplaceListing.findUnique({ where: { id: listingId }, select: { productId: true } });
    await prisma.marketplaceListing.delete({ where: { id: listingId } });
    revalidatePath("/marketplace");
    if (listing?.productId) revalidatePath(`/products/${listing.productId}`);
    return { ok: true, redirectTo: "/marketplace" };
  } catch {
    return { ok: false, message: "Listeleme silinemedi." };
  }
}

"use server";

/**
 * Phase 88 — Satış Fırsatları İnline Durum Güncellemesi
 *
 * CUSTOMERS_UPDATE permission gated.
 * Updates status, priority, and/or followUpAt on a ProductInterest record.
 */

import { revalidatePath } from "next/cache";
import { getCurrentSession, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

export type UpdateInterestResult =
  | { ok: true }
  | { ok: false; error: string };

export type InterestUpdate = {
  status?: string;
  priority?: string;
  followUpAt?: string | null; // ISO date string or null
};

export async function updateInterestAction(
  interestId: string,
  update: InterestUpdate,
): Promise<UpdateInterestResult> {
  const user = await getCurrentSession();
  if (!user) return { ok: false, error: "Oturum açık değil." };

  if (!(await checkPermission(user, PERMISSIONS.CUSTOMERS_UPDATE))) {
    return { ok: false, error: "Talep güncelleme yetkiniz yok." };
  }

  const interest = await prisma.productInterest.findUnique({
    where: { id: interestId },
    select: { id: true },
  });
  if (!interest) return { ok: false, error: "Talep kaydı bulunamadı." };

  await prisma.productInterest.update({
    where: { id: interestId },
    data: {
      ...(update.status !== undefined && { status: update.status as never }),
      ...(update.priority !== undefined && { priority: update.priority as never }),
      ...(update.followUpAt !== undefined && {
        followUpAt: update.followUpAt ? new Date(update.followUpAt) : null,
      }),
    },
  });

  revalidatePath("/admin/sales-opportunities");
  revalidatePath("/dashboard");

  return { ok: true };
}

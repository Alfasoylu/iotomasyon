"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/types/actions";

/**
 * Phase 95f — Saved View server actions
 *
 * Kullanıcı filtre kombinasyonlarını isimle kaydeder, sonra tek tıkla açar.
 * Örnek: "Mersin'deki ticarilerim" → ?customerType=TOPTAN&city=Mersin
 */

export async function createSavedViewAction(input: {
  name: string;
  resource: string;
  filtersJson: string;
  isShared?: boolean;
}): Promise<ActionResult & { id?: string }> {
  const user = await requireUser();
  const name = input.name.trim();
  if (!name) return { ok: false, message: "İsim gerekli." };

  try {
    const view = await prisma.savedView.create({
      data: {
        userId: user.id,
        name,
        resource: input.resource,
        filtersJson: input.filtersJson,
        isShared: input.isShared ?? false,
      },
    });
    revalidatePath("/customers");
    revalidatePath("/products");
    return { ok: true, id: view.id };
  } catch {
    return { ok: false, message: "Görünüm kaydedilemedi." };
  }
}

export async function deleteSavedViewAction(viewId: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    const view = await prisma.savedView.findUnique({ where: { id: viewId } });
    if (!view) return { ok: false, message: "Görünüm bulunamadı." };
    if (view.userId !== user.id) return { ok: false, message: "Sadece kendi görünümünüzü silebilirsiniz." };

    await prisma.savedView.delete({ where: { id: viewId } });
    revalidatePath("/customers");
    revalidatePath("/products");
    return { ok: true };
  } catch {
    return { ok: false, message: "Silinemedi." };
  }
}

export async function listMySavedViews(resource: string) {
  const user = await requireUser();
  try {
    return await prisma.savedView.findMany({
      where: { resource, OR: [{ userId: user.id }, { isShared: true }] },
      select: { id: true, name: true, filtersJson: true, isShared: true, userId: true },
      orderBy: [{ isShared: "asc" }, { updatedAt: "desc" }],
    });
  } catch {
    return [];
  }
}

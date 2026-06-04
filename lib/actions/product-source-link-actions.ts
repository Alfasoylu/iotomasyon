"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

import type { ActionResult } from "@/types/actions";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

function canManageSourceLinks(user: Awaited<ReturnType<typeof requireUser>>) {
  return user.role === "ADMIN";
}

function emptyToNull(value: string | undefined) {
  return value && value.trim().length > 0 ? value.trim() : null;
}

export async function saveProductSourceLinkAction(
  productId: string,
  formData: {
    linkId?: string;
    sourceName: string;
    label: string;
    url: string;
    notes: string;
  },
): Promise<ActionResult> {
  const user = await requireUser();
  if (!canManageSourceLinks(user)) return PERM_DENIED;

  const url = formData.url.trim();
  const sourceName = formData.sourceName.trim() || "1688";
  const label = emptyToNull(formData.label);
  const notes = emptyToNull(formData.notes);

  if (!url) {
    return { ok: false, message: "Link adresi zorunlu." };
  }

  try {
    if (formData.linkId) {
      await prisma.productSourceLink.update({
        where: { id: formData.linkId },
        data: {
          sourceName,
          label,
          url,
          notes,
          updatedAt: new Date(),
        },
      });
    } else {
      const { _max } = await prisma.productSourceLink.aggregate({
        where: { productId },
        _max: { sortOrder: true },
      });

      await prisma.productSourceLink.create({
        data: {
          productId,
          sourceName,
          label,
          url,
          notes,
          sortOrder: (_max.sortOrder ?? -1) + 1,
        },
      });
    }

    revalidatePath(`/products/${productId}`);
    revalidatePath(`/products/${productId}/edit`);
    revalidatePath("/products");
    return { ok: true };
  } catch {
    return { ok: false, message: "Kaynak link kaydedilemedi." };
  }
}

export async function deleteProductSourceLinkAction(
  productId: string,
  linkId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!canManageSourceLinks(user)) return PERM_DENIED;

  try {
    await prisma.productSourceLink.delete({
      where: { id: linkId },
    });

    revalidatePath(`/products/${productId}`);
    revalidatePath(`/products/${productId}/edit`);
    revalidatePath("/products");
    return { ok: true };
  } catch {
    return { ok: false, message: "Kaynak link silinemedi." };
  }
}

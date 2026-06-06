"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/types/actions";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

const profileSchema = z.object({
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/, "slug yalnızca küçük harf, rakam ve tire içerebilir"),
  title: z.string().min(1).max(200),
  subtitle: z.string().min(1).max(200),
  categorySlugs: z.array(z.string()).min(1).max(50),
  defaultPriceMode: z.enum(["wholesale", "retail", "hidden"]),
  enabled: z.boolean(),
  sortOrder: z.number().int().min(0).max(99999),
});

export type CatalogProfileInput = z.infer<typeof profileSchema>;

export async function upsertCatalogProfileAction(
  values: CatalogProfileInput,
): Promise<ActionResult<keyof CatalogProfileInput>> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXECUTIVE_READ))) return PERM_DENIED;

  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Geçersiz değerler.",
      fieldErrors: parsed.error.flatten().fieldErrors as Partial<
        Record<keyof CatalogProfileInput, string[]>
      >,
    };
  }

  try {
    await prisma.catalogProfile.upsert({
      where: { slug: parsed.data.slug },
      update: {
        title: parsed.data.title,
        subtitle: parsed.data.subtitle,
        categorySlugs: parsed.data.categorySlugs,
        defaultPriceMode: parsed.data.defaultPriceMode,
        enabled: parsed.data.enabled,
        sortOrder: parsed.data.sortOrder,
      },
      create: parsed.data,
    });
    revalidatePath("/admin/catalog-profiles");
    revalidatePath("/api/catalogs", "layout");
    revalidatePath("/c", "layout");
    return { ok: true };
  } catch {
    return { ok: false, message: "Kaydedilemedi." };
  }
}

export async function deleteCatalogProfileAction(
  slug: string,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXECUTIVE_READ))) return PERM_DENIED;
  if (slug === "general") {
    return { ok: false, message: "GENERAL profili silinemez." };
  }
  try {
    await prisma.catalogProfile.delete({ where: { slug } });
    revalidatePath("/admin/catalog-profiles");
    return { ok: true };
  } catch {
    return { ok: false, message: "Silinemedi." };
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/types/actions";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

const priceSchema = z.object({
  wholesalePriceUsd: z
    .union([z.number().min(0).max(99999999), z.null()])
    .optional(),
  retailPriceUsd: z
    .union([z.number().min(0).max(99999999), z.null()])
    .optional(),
});

export type CatalogPriceInput = z.infer<typeof priceSchema>;

export async function updateCatalogPriceAction(
  productId: string,
  values: CatalogPriceInput,
): Promise<ActionResult<keyof CatalogPriceInput>> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.PRODUCTS_UPDATE))) return PERM_DENIED;

  const parsed = priceSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Geçersiz fiyat değeri.",
      fieldErrors: parsed.error.flatten().fieldErrors as Partial<Record<keyof CatalogPriceInput, string[]>>,
    };
  }

  const data: {
    wholesalePriceUsd?: number | null;
    retailPriceUsd?: number | null;
  } = {};
  if (parsed.data.wholesalePriceUsd !== undefined) {
    data.wholesalePriceUsd = parsed.data.wholesalePriceUsd;
  }
  if (parsed.data.retailPriceUsd !== undefined) {
    data.retailPriceUsd = parsed.data.retailPriceUsd;
  }

  if (Object.keys(data).length === 0) {
    return { ok: true };
  }

  try {
    await prisma.product.update({
      where: { id: productId },
      data,
    });

    revalidatePath("/admin/product-pricing");
    return { ok: true };
  } catch {
    return { ok: false, message: "Fiyat güncellenemedi." };
  }
}

const bulkSchema = z.object({
  categoryId: z.string().nullable().optional(),
  brand: z.string().nullable().optional(),
  sourceField: z.enum(["unitCostUsd", "wholesalePriceUsd"]),
  targetField: z.enum(["wholesalePriceUsd", "retailPriceUsd"]),
  multiplier: z.number().min(0.5).max(10),
  overwriteExisting: z.boolean().default(false),
  onlyActive: z.boolean().default(true),
});

export type BulkMarkupInput = z.infer<typeof bulkSchema>;

export async function bulkApplyMarkupAction(
  values: BulkMarkupInput,
): Promise<ActionResult & { updatedCount?: number }> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.PRODUCTS_UPDATE))) return PERM_DENIED;

  const parsed = bulkSchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, message: "Geçersiz parametreler." };
  }

  const { categoryId, brand, sourceField, targetField, multiplier, overwriteExisting, onlyActive } = parsed.data;

  if (sourceField === targetField) {
    return { ok: false, message: "Kaynak ve hedef alan aynı olamaz." };
  }

  type AnyWhere = Parameters<typeof prisma.product.findMany>[0] extends infer T
    ? T extends { where?: infer W }
      ? NonNullable<W>
      : never
    : never;
  const where = {} as Record<string, unknown>;
  if (onlyActive) where.isActive = true;
  if (categoryId) where.categoryId = categoryId;
  if (brand) where.brand = brand;
  where[sourceField] = { not: null };
  if (!overwriteExisting) {
    where[targetField] = null;
  }

  const products = await prisma.product.findMany({
    where: where as AnyWhere,
    select: {
      id: true,
      unitCostUsd: true,
      wholesalePriceUsd: true,
      retailPriceUsd: true,
    },
  });

  let updatedCount = 0;
  for (const p of products) {
    const sourceRaw =
      sourceField === "unitCostUsd"
        ? p.unitCostUsd
        : p.wholesalePriceUsd;
    if (sourceRaw == null) continue;
    const num = Number(sourceRaw);
    if (!Number.isFinite(num)) continue;
    const target = Math.round(num * multiplier * 100) / 100;

    if (targetField === "wholesalePriceUsd") {
      await prisma.product.update({
        where: { id: p.id },
        data: { wholesalePriceUsd: target },
      });
    } else {
      await prisma.product.update({
        where: { id: p.id },
        data: { retailPriceUsd: target },
      });
    }
    updatedCount++;
  }

  revalidatePath("/admin/product-pricing");
  return { ok: true, message: `${updatedCount} ürün güncellendi.`, updatedCount };
}

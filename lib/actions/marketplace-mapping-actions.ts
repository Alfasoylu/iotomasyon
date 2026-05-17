"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import type { ActionResult } from "@/types/actions";
import { MarketplacePlatform } from "@prisma/client";

/**
 * Phase 1 – Historical backfill.
 * When a new mapping is created or updated, retroactively link any
 * TrendyolSalesRecord / TrendyolReturnRecord rows whose barcode or
 * merchantSku matches this mapping's platformBarcode / platformSku.
 * Only updates rows that currently have no productId (unmatched inbox).
 */
async function backfillMappingProductId(
  productId: string,
  platformBarcode: string | null,
  platformSku: string | null,
): Promise<void> {
  if (!platformBarcode && !platformSku) return;

  // Build OR conditions for matching
  const barcodeOr = platformBarcode
    ? [{ barcode: platformBarcode }, { merchantSku: platformBarcode }]
    : [];
  const skuOr = platformSku
    ? [{ barcode: platformSku }, { merchantSku: platformSku }]
    : [];
  const orConditions = [...barcodeOr, ...skuOr];
  if (orConditions.length === 0) return;

  const matchWhere = { productId: null, OR: orConditions };

  // Run both updates in parallel
  const [salesResult, returnsResult] = await Promise.all([
    prisma.trendyolSalesRecord.updateMany({
      where: matchWhere,
      data: { productId },
    }),
    prisma.trendyolReturnRecord.updateMany({
      where: matchWhere,
      data: { productId },
    }),
  ]);

  if (salesResult.count > 0 || returnsResult.count > 0) {
    console.log(
      `[backfill] Mapping(${productId}): sales=${salesResult.count} returns=${returnsResult.count} rows linked`,
    );
  }
}

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

const mappingSchema = z.object({
  platform: z.nativeEnum(MarketplacePlatform),
  productId: z.string().min(1, "Ürün seçilmeli."),
  platformProductId: z.string().trim().max(200).optional().or(z.literal("")),
  platformListingId: z.string().trim().max(200).optional().or(z.literal("")),
  platformBarcode: z.string().trim().max(200).optional().or(z.literal("")),
  platformSku: z.string().trim().max(200).optional().or(z.literal("")),
  platformTitle: z.string().trim().max(500).optional().or(z.literal("")),
});

export type MappingFormValues = z.infer<typeof mappingSchema>;

function nullify(v: string | undefined | null) {
  return v && v.trim() !== "" ? v.trim() : null;
}

export async function createMarketplaceMappingAction(
  values: MappingFormValues,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.MARKETPLACE_MAPPINGS_WRITE))) return PERM_DENIED;

  const parsed = mappingSchema.safeParse(values);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Geçersiz form verisi." };

  try {
    const barcode = nullify(parsed.data.platformBarcode);
    const sku = nullify(parsed.data.platformSku);
    await prisma.marketplaceProductMapping.create({
      data: {
        id: crypto.randomUUID(),
        platform: parsed.data.platform,
        productId: parsed.data.productId,
        platformProductId: nullify(parsed.data.platformProductId),
        platformListingId: nullify(parsed.data.platformListingId),
        platformBarcode: barcode,
        platformSku: sku,
        platformTitle: nullify(parsed.data.platformTitle),
        confidence: "MANUAL",
        isManual: true,
        createdById: user.id,
      },
    });
    // Retroactively link previously-unmatched sales/return records
    await backfillMappingProductId(parsed.data.productId, barcode, sku);
    return { ok: true };
  } catch (err) {
    console.error("[marketplace-mapping-actions] create:", err);
    return { ok: false, message: "Eşleştirme oluşturulamadı." };
  }
}

export async function updateMarketplaceMappingAction(
  id: string,
  values: MappingFormValues,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.MARKETPLACE_MAPPINGS_WRITE))) return PERM_DENIED;

  const parsed = mappingSchema.safeParse(values);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Geçersiz form verisi." };

  try {
    const barcode = nullify(parsed.data.platformBarcode);
    const sku = nullify(parsed.data.platformSku);
    await prisma.marketplaceProductMapping.update({
      where: { id },
      data: {
        platform: parsed.data.platform,
        productId: parsed.data.productId,
        platformProductId: nullify(parsed.data.platformProductId),
        platformListingId: nullify(parsed.data.platformListingId),
        platformBarcode: barcode,
        platformSku: sku,
        platformTitle: nullify(parsed.data.platformTitle),
        updatedAt: new Date(),
      },
    });
    // Retroactively link previously-unmatched sales/return records
    await backfillMappingProductId(parsed.data.productId, barcode, sku);
    return { ok: true };
  } catch {
    return { ok: false, message: "Eşleştirme güncellenemedi." };
  }
}

export async function deleteMarketplaceMappingAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.MARKETPLACE_MAPPINGS_WRITE))) return PERM_DENIED;

  try {
    await prisma.marketplaceProductMapping.delete({ where: { id } });
    return { ok: true };
  } catch {
    return { ok: false, message: "Eşleştirme silinemedi." };
  }
}

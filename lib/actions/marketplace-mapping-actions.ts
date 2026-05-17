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
 *
 * Phase 41: now returns { sales, returns } counts so callers can surface
 * how many records were newly linked.
 */
async function backfillMappingProductId(
  productId: string,
  platformBarcode: string | null,
  platformSku: string | null,
): Promise<{ sales: number; returns: number }> {
  if (!platformBarcode && !platformSku) return { sales: 0, returns: 0 };

  // Build OR conditions for matching
  const barcodeOr = platformBarcode
    ? [{ barcode: platformBarcode }, { merchantSku: platformBarcode }]
    : [];
  const skuOr = platformSku
    ? [{ barcode: platformSku }, { merchantSku: platformSku }]
    : [];
  const orConditions = [...barcodeOr, ...skuOr];
  if (orConditions.length === 0) return { sales: 0, returns: 0 };

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
  return { sales: salesResult.count, returns: returnsResult.count };
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
    const backfill = await backfillMappingProductId(parsed.data.productId, barcode, sku);
    const backfillMsg =
      backfill.sales > 0 || backfill.returns > 0
        ? ` ${backfill.sales} sipariş, ${backfill.returns} iade bağlandı.`
        : "";
    return { ok: true, message: `Kaydedildi.${backfillMsg}` };
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
    const backfill = await backfillMappingProductId(parsed.data.productId, barcode, sku);
    const backfillMsg =
      backfill.sales > 0 || backfill.returns > 0
        ? ` ${backfill.sales} sipariş, ${backfill.returns} iade bağlandı.`
        : "";
    return { ok: true, message: `Güncellendi.${backfillMsg}` };
  } catch {
    return { ok: false, message: "Eşleştirme güncellenemedi." };
  }
}

/**
 * Phase 41 — Bulk Backfill Engine.
 * Iterates ALL existing MarketplaceProductMapping entries and runs
 * backfillMappingProductId for each one. This is a one-shot operation
 * that links historical unmatched TrendyolSalesRecord / TrendyolReturnRecord
 * rows to their products using every approved mapping on record.
 *
 * Requires MARKETPLACE_MAPPINGS_WRITE permission (same as create/update).
 */
export async function bulkBackfillAllMappingsAction(): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.MARKETPLACE_MAPPINGS_WRITE))) return PERM_DENIED;

  try {
    const mappings = await prisma.marketplaceProductMapping.findMany({
      select: { productId: true, platformBarcode: true, platformSku: true },
    });

    let totalSales = 0;
    let totalReturns = 0;
    for (const m of mappings) {
      const counts = await backfillMappingProductId(m.productId, m.platformBarcode, m.platformSku);
      totalSales += counts.sales;
      totalReturns += counts.returns;
    }

    return {
      ok: true,
      message: `${mappings.length} eşleştirme işlendi. ${totalSales} sipariş, ${totalReturns} iade kaydı bağlandı.`,
    };
  } catch (err) {
    console.error("[marketplace-mapping-actions] bulkBackfill:", err);
    return { ok: false, message: "Toplu backfill sırasında hata oluştu." };
  }
}

/**
 * Phase 61 — Retroactive Normalized Barcode Re-Match.
 * Scans all null-productId TrendyolSalesRecord rows and tries to match
 * them against Product.barcode / Product.sku using normalized comparison
 * (strip non-alphanumeric, lowercase). Does NOT require a manual mapping entry.
 *
 * Safe to run repeatedly — only updates rows where productId IS NULL.
 */
export async function rematchNormalizedBarcodesAction(): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.MARKETPLACE_MAPPINGS_WRITE))) return PERM_DENIED;

  function normalize(s: string): string {
    return s.replace(/[^a-z0-9]/gi, "").toLowerCase();
  }

  try {
    // Build normalized product maps
    const products = await prisma.product.findMany({
      select: { id: true, sku: true, barcode: true },
    });
    const normBarcodeMap = new Map<string, string>();
    const normSkuMap = new Map<string, string>();
    for (const p of products) {
      if (p.barcode) {
        const nb = normalize(p.barcode);
        if (nb && !normBarcodeMap.has(nb)) normBarcodeMap.set(nb, p.id);
      }
      if (p.sku) {
        const ns = normalize(p.sku);
        if (ns && !normSkuMap.has(ns)) normSkuMap.set(ns, p.id);
      }
    }

    // Fetch all unmatched records
    const unmatched = await prisma.trendyolSalesRecord.findMany({
      where: { productId: null },
      select: { id: true, barcode: true, merchantSku: true },
    });

    // Match and collect updates
    const updates: { id: string; productId: string }[] = [];
    for (const rec of unmatched) {
      let productId: string | null = null;
      if (rec.barcode) {
        const nb = normalize(rec.barcode);
        if (nb && normBarcodeMap.has(nb)) productId = normBarcodeMap.get(nb)!;
      }
      if (!productId && rec.merchantSku) {
        const ns = normalize(rec.merchantSku);
        if (ns && normSkuMap.has(ns)) productId = normSkuMap.get(ns)!;
      }
      if (productId) updates.push({ id: rec.id, productId });
    }

    // Bulk update in batches of 100
    let matched = 0;
    for (let i = 0; i < updates.length; i += 100) {
      const batch = updates.slice(i, i + 100);
      await Promise.all(
        batch.map((u) =>
          prisma.trendyolSalesRecord.update({
            where: { id: u.id },
            data: { productId: u.productId },
          }),
        ),
      );
      matched += batch.length;
    }

    const remaining = unmatched.length - matched;
    return {
      ok: true,
      message: `${matched} sipariş kaydı eşleştirildi. ${remaining} kayıt hâlâ eşleşmemiş.`,
    };
  } catch (err) {
    console.error("[marketplace-mapping-actions] rematchNormalized:", err);
    return { ok: false, message: "Yeniden eşleştirme sırasında hata oluştu." };
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

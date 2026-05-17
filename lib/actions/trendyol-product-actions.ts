/**
 * Phase 45 — Trendyol Stock Push
 *
 * Reads MarketplaceProductMapping (TRENDYOL + platformBarcode) joined with
 * Product (stockQuantity, sellingPriceTry) and pushes all matched products to
 * Trendyol via PUT price-and-inventory in batches of 100.
 *
 * Products are skipped if:
 *   - platformBarcode is null
 *   - sellingPriceTry is null (Trendyol requires a price)
 */

"use server";

import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { updateTrendyolInventory, TrendyolApiError } from "@/lib/trendyol-api";
import type { ActionResult } from "@/types/actions";
import { MarketplacePlatform } from "@prisma/client";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;
const BATCH_SIZE = 100; // Trendyol hard limit per request

export interface StockPushPreviewRow {
  mappingId: string;
  productId: string;
  productName: string;
  sku: string | null;
  barcode: string;
  stockQuantity: number;
  sellingPriceTry: number;
}

export interface StockPushPreviewResult {
  rows: StockPushPreviewRow[];
  skippedNoBarcode: number;
  skippedNoPrice: number;
}

/** Read-only: build the preview without touching Trendyol. */
export async function getTrendyolStockPushPreviewAction(): Promise<
  ActionResult & { preview?: StockPushPreviewResult }
> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXECUTIVE_READ))) return PERM_DENIED;

  const config = await prisma.trendyolConfig.findUnique({ where: { id: "singleton" } });
  if (!config?.supplierId || !config?.apiKey || !config?.apiSecret || !config?.isEnabled) {
    return { ok: false, message: "Trendyol API yapılandırması eksik veya devre dışı." };
  }

  const mappings = await prisma.marketplaceProductMapping.findMany({
    where: { platform: MarketplacePlatform.TRENDYOL },
    include: {
      product: {
        select: { id: true, name: true, sku: true, stockQuantity: true, sellingPriceTry: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const rows: StockPushPreviewRow[] = [];
  let skippedNoBarcode = 0;
  let skippedNoPrice = 0;

  for (const m of mappings) {
    if (!m.platformBarcode) { skippedNoBarcode++; continue; }
    if (!m.product?.sellingPriceTry) { skippedNoPrice++; continue; }
    rows.push({
      mappingId: m.id,
      productId: m.product.id,
      productName: m.product.name,
      sku: m.product.sku,
      barcode: m.platformBarcode,
      stockQuantity: m.product.stockQuantity,
      sellingPriceTry: Number(m.product.sellingPriceTry),
    });
  }

  return { ok: true, preview: { rows, skippedNoBarcode, skippedNoPrice } };
}

/** Write: push product quantities + prices to Trendyol in batches of 100. */
export async function pushTrendyolStockAction(): Promise<
  ActionResult & { pushed?: number; skipped?: number; batchIds?: string[] }
> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXECUTIVE_READ))) return PERM_DENIED;

  const config = await prisma.trendyolConfig.findUnique({ where: { id: "singleton" } });
  if (!config?.supplierId || !config?.apiKey || !config?.apiSecret || !config?.isEnabled) {
    return { ok: false, message: "Trendyol API yapılandırması eksik veya devre dışı." };
  }

  const mappings = await prisma.marketplaceProductMapping.findMany({
    where: { platform: MarketplacePlatform.TRENDYOL },
    include: {
      product: {
        select: { stockQuantity: true, sellingPriceTry: true },
      },
    },
  });

  const items: { barcode: string; quantity: number; salePrice: number; listPrice: number }[] = [];
  let skipped = 0;

  for (const m of mappings) {
    if (!m.platformBarcode || !m.product?.sellingPriceTry) { skipped++; continue; }
    const price = Number(m.product.sellingPriceTry);
    items.push({
      barcode: m.platformBarcode,
      quantity: Math.max(0, m.product.stockQuantity),
      salePrice: price,
      listPrice: price,
    });
  }

  if (items.length === 0) {
    return { ok: false, message: `Gönderilebilecek ürün bulunamadı. ${skipped} ürün atlandı.`, skipped };
  }

  const cfg = { supplierId: config.supplierId, apiKey: config.apiKey, apiSecret: config.apiSecret };

  // Split into batches of BATCH_SIZE
  const batches: (typeof items)[] = [];
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    batches.push(items.slice(i, i + BATCH_SIZE));
  }

  const batchIds: string[] = [];
  try {
    for (const batch of batches) {
      const result = await updateTrendyolInventory(cfg, batch);
      if (result.batchRequestId) batchIds.push(result.batchRequestId);
    }
  } catch (err) {
    const msg = err instanceof TrendyolApiError
      ? `Trendyol API ${err.status}: ${err.body.slice(0, 200)}`
      : err instanceof Error ? err.message : "Bilinmeyen hata";
    return { ok: false, message: `Trendyol'a gönderim başarısız: ${msg}`, pushed: batchIds.length * BATCH_SIZE, skipped };
  }

  return {
    ok: true,
    message: `${items.length} ürün stok bilgisi Trendyol'a gönderildi (${batches.length} grup).`,
    pushed: items.length,
    skipped,
    batchIds,
  };
}

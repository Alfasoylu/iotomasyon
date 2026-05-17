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
import type { ActionResult } from "@/types/actions";
import { MarketplacePlatform } from "@prisma/client";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

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
/**
 * Priority 23 — Architecture correction: Trendyol is read-only.
 * Stock is managed by Entegra ERP via XML sync. This function is intentionally disabled.
 */
export async function pushTrendyolStockAction(): Promise<
  ActionResult & { pushed?: number; skipped?: number; batchIds?: string[] }
> {
  return {
    ok: false,
    message: "Trendyol stok push devre dışı. Stok Entegra ERP üzerinden XML sync ile yönetilir.",
  };
}

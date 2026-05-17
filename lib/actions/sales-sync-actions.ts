"use server";

/**
 * Phase 26 — Trendyol Sales Sync
 *
 * Fetches all order pages from Trendyol API (last 365 days),
 * matches each line to an internal Product by barcode or merchantSku,
 * and upserts into TrendyolSalesRecord for performance ranking.
 */

import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchTrendyolOrders } from "@/lib/trendyol-api";
import { PERMISSIONS } from "@/lib/permissions";

export type SalesSyncResult =
  | { success: true; totalOrders: number; totalLines: number; matched: number; newRecords: number }
  | { success: false; error: string };

export async function syncTrendyolSalesAction(): Promise<SalesSyncResult> {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

  // Load Trendyol config
  const config = await prisma.trendyolConfig.findFirst();
  if (!config || !config.isEnabled) {
    return { success: false, error: "Trendyol entegrasyonu aktif değil veya yapılandırılmamış." };
  }

  const cfg = {
    supplierId: config.supplierId,
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
  };

  // Build product lookup maps (barcode → id, sku → id)
  const products = await prisma.product.findMany({
    select: { id: true, sku: true, barcode: true },
  });

  const barcodeMap = new Map<string, string>();
  const skuMap = new Map<string, string>();
  for (const p of products) {
    if (p.barcode) barcodeMap.set(p.barcode.toLowerCase(), p.id);
    if (p.sku) skuMap.set(p.sku.toLowerCase(), p.id);
  }

  // Fetch all order pages — last 365 days
  const startDate = Date.now() - 365 * 24 * 60 * 60 * 1000;
  const endDate = Date.now();

  let page = 0;
  let totalOrders = 0;
  let totalLines = 0;
  let matched = 0;
  let newRecords = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let resp;
    try {
      resp = await fetchTrendyolOrders(cfg, { page, size: 50, startDate, endDate });
    } catch {
      // If a page fails (e.g. network error), stop pagination but don't discard synced data
      break;
    }

    const orders = Array.isArray(resp.content) ? resp.content : [];
    if (orders.length === 0) break;

    totalOrders += orders.length;

    for (const order of orders) {
      const lines = Array.isArray(order.lines) ? order.lines : [];
      for (const line of lines) {
        totalLines++;

        const barcodeKey = line.barcode?.toLowerCase();
        const skuKey = line.merchantSku?.toLowerCase();

        let productId: string | null = null;
        if (barcodeKey && barcodeMap.has(barcodeKey)) {
          productId = barcodeMap.get(barcodeKey)!;
          matched++;
        } else if (skuKey && skuMap.has(skuKey)) {
          productId = skuMap.get(skuKey)!;
          matched++;
        }

        const existing = await prisma.trendyolSalesRecord.findUnique({
          where: { orderId_lineId: { orderId: String(order.id), lineId: line.id } },
          select: { id: true },
        });

        if (existing) {
          // Update product link and status only (price data is immutable)
          await prisma.trendyolSalesRecord.update({
            where: { id: existing.id },
            data: {
              productId,
              status: line.orderLineItemStatusName,
              syncedAt: new Date(),
            },
          });
        } else {
          await prisma.trendyolSalesRecord.create({
            data: {
              orderId: String(order.id),
              lineId: line.id,
              productId,
              orderDate: new Date(order.orderDate),
              status: line.orderLineItemStatusName,
              merchantSku: line.merchantSku ?? null,
              barcode: line.barcode ?? null,
              productName: line.productName,
              quantity: line.quantity,
              unitPriceTry: line.discountedPrice,
              totalPriceTry: line.discountedPrice * line.quantity,
            },
          });
          newRecords++;
        }
      }
    }

    // Stop when we've fetched all pages
    if (page >= (resp.totalPages ?? 1) - 1 || orders.length < 50) break;
    page++;
  }

  return { success: true, totalOrders, totalLines, matched, newRecords };
}

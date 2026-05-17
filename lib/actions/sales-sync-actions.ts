"use server";

/**
 * Phase 26 — Trendyol Sales Sync
 *
 * Fetches all order pages from Trendyol API in 90-day windows (last 365 days),
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

  // Trendyol orders API caps date range at ~90 days.
  // Sweep in 90-day windows from 365 days ago up to today.
  const WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
  const TOTAL_MS  = 365 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  // Build list of [windowStart, windowEnd] pairs (oldest first)
  const windows: Array<[number, number]> = [];
  for (let t = now - TOTAL_MS; t < now; t += WINDOW_MS) {
    windows.push([t, Math.min(t + WINDOW_MS, now)]);
  }

  // Snapshot existing record count so we can report how many are truly new
  const countBefore = await prisma.trendyolSalesRecord.count();

  let totalOrders = 0;
  let totalLines = 0;
  let matched = 0;

  for (const [startDate, endDate] of windows) {
    let page = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      let resp;
      try {
        resp = await fetchTrendyolOrders(cfg, { page, size: 50, startDate, endDate });
      } catch (err) {
        // Page 0 of first window: surface the error so the user can see it
        if (page === 0 && totalOrders === 0) {
          const msg = err instanceof Error ? err.message : "Trendyol API hatası";
          return { success: false, error: msg };
        }
        // Later pages: stop this window's pagination, keep synced data so far
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

          // Trendyol line IDs are int64 — use BigInt to avoid PostgreSQL INT overflow
          const lineIdBig = BigInt(line.id);

          // discountedPrice may be null/undefined at runtime despite the TypeScript type
          // (e.g. returns, gift orders, partial refunds). Fall back to price → 0.
          const rawPrice =
            (line.discountedPrice as number | null | undefined) ??
            (line.price           as number | null | undefined) ??
            0;
          const unitPrice = Number.isFinite(rawPrice) ? rawPrice : 0;

          // Single upsert: on conflict update mutable fields only (price data is immutable).
          const record = await prisma.trendyolSalesRecord.upsert({
            where: { orderId_lineId: { orderId: String(order.id), lineId: lineIdBig } },
            create: {
              orderId: String(order.id),
              lineId: lineIdBig,
              productId,
              orderDate: new Date(order.orderDate),
              status: line.orderLineItemStatusName,
              merchantSku: line.merchantSku ?? null,
              barcode: line.barcode ?? null,
              productName: line.productName,
              quantity: line.quantity,
              unitPriceTry: unitPrice,
              totalPriceTry: unitPrice * line.quantity,
            },
            update: {
              productId,
              status: line.orderLineItemStatusName,
              syncedAt: new Date(),
            },
            select: { id: true },
          });

          void record; // upsert result unused — newRecords computed from count delta below
        }
      }

      // Stop when we've fetched all pages in this window
      if (page >= (resp.totalPages ?? 1) - 1 || orders.length < 50) break;
      page++;
    }
  }

  const countAfter = await prisma.trendyolSalesRecord.count();
  const newRecords = countAfter - countBefore;

  return { success: true, totalOrders, totalLines, matched, newRecords };
}

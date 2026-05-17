"use server";

/**
 * Phase 29 — Trendyol Return Claims Sync
 *
 * Fetches all return/claim pages from Trendyol API in 90-day windows (last 365 days),
 * matches each claim line to an internal Product by barcode or merchantSku,
 * and upserts into TrendyolReturnRecord for the order ledger.
 */

import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchTrendyolReturns } from "@/lib/trendyol-api";
import { PERMISSIONS } from "@/lib/permissions";

export type ReturnsSyncResult =
  | { success: true; totalClaims: number; totalLines: number; matched: number; newRecords: number }
  | { success: false; error: string };

export async function syncTrendyolReturnsAction(): Promise<ReturnsSyncResult> {
  await requirePermission(PERMISSIONS.EXECUTIVE_READ);

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

  // Trendyol claims API caps date range at ~90 days.
  // Sweep in 90-day windows from 365 days ago up to today.
  const WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
  const TOTAL_MS  = 365 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const windows: Array<[number, number]> = [];
  for (let t = now - TOTAL_MS; t < now; t += WINDOW_MS) {
    windows.push([t, Math.min(t + WINDOW_MS, now)]);
  }

  const countBefore = await prisma.trendyolReturnRecord.count();

  let totalClaims = 0;
  let totalLines  = 0;
  let matched     = 0;

  for (const [startDate, endDate] of windows) {
    let page = 0;

    while (true) {
      let resp;
      try {
        resp = await fetchTrendyolReturns(cfg, { page, size: 50, startDate, endDate });
      } catch (err) {
        if (page === 0 && totalClaims === 0) {
          const msg = err instanceof Error ? err.message : "Trendyol API hatası";
          return { success: false, error: msg };
        }
        break;
      }

      const claims = Array.isArray(resp.content) ? resp.content : [];
      if (claims.length === 0) break;

      totalClaims += claims.length;

      for (const claim of claims) {
        const claimDate  = new Date(claim.claimDate);
        const orderDate  = new Date(claim.orderDate);
        const orderNumber = claim.orderNumber;

        for (const lineItem of claim.items ?? []) {
          const orderLine  = lineItem.orderLine;
          const claimItems = lineItem.claimItems ?? [];

          totalLines++;

          const barcodeKey = orderLine.barcode?.toLowerCase();
          const skuKey     = orderLine.merchantSku?.toLowerCase();

          let productId: string | null = null;
          if (barcodeKey && barcodeMap.has(barcodeKey)) {
            productId = barcodeMap.get(barcodeKey)!;
            matched++;
          } else if (skuKey && skuMap.has(skuKey)) {
            productId = skuMap.get(skuKey)!;
            matched++;
          }

          // Use first claim item's status and reason for the row
          const firstItem    = claimItems[0];
          const status       = firstItem?.claimItemStatus?.name ?? "Unknown";
          const reasonName   =
            firstItem?.customerClaimItemReason?.name ??
            firstItem?.trendyolClaimItemReason?.name ??
            null;
          const reasonCode   =
            firstItem?.customerClaimItemReason?.code ??
            firstItem?.trendyolClaimItemReason?.code ??
            null;

          await prisma.trendyolReturnRecord.upsert({
            where: {
              claimId_orderLineId: {
                claimId: claim.claimId,
                orderLineId: orderLine.id,
              },
            },
            create: {
              claimId: claim.claimId,
              orderLineId: orderLine.id,
              productId,
              orderNumber,
              orderDate,
              claimDate,
              status,
              reasonName,
              reasonCode,
              productName:  orderLine.productName,
              barcode:      orderLine.barcode ?? null,
              merchantSku:  orderLine.merchantSku ?? null,
              unitPriceTry: orderLine.price ?? 0,
            },
            update: {
              productId,
              status,
              reasonName,
              reasonCode,
              syncedAt: new Date(),
            },
          });
        }
      }

      if (page >= (resp.totalPages ?? 1) - 1 || claims.length < 50) break;
      page++;
    }
  }

  const countAfter = await prisma.trendyolReturnRecord.count();
  const newRecords = countAfter - countBefore;

  return { success: true, totalClaims, totalLines, matched, newRecords };
}

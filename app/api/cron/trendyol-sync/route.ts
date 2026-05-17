/**
 * Phase 48 — Trendyol Daily Order + Return Sync Cron
 *
 * Called by Vercel Cron (vercel.json) daily at 06:00 UTC.
 * Syncs the last 14 days of Trendyol orders and return claims.
 * A 14-day window catches any orders that might have been missed
 * by the previous run (status changes, late deliveries, etc.).
 *
 * Unlike the manual syncTrendyolSalesAction (365-day sweep), this
 * only covers a short recent window to stay well within Vercel's
 * 5-minute function timeout.
 *
 * Security: Vercel sets `Authorization: Bearer <CRON_SECRET>` on
 * cron calls. We validate it to prevent public triggering.
 */

import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { fetchTrendyolOrders, fetchTrendyolReturns } from "@/lib/trendyol-api";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // dev: no secret set
  return req.headers.get("Authorization") === `Bearer ${cronSecret}`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const config = await prisma.trendyolConfig.findFirst();
  if (!config || !config.isEnabled) {
    return NextResponse.json({ ok: false, reason: "Trendyol config missing or disabled" });
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
  // Phase 61: normalized maps (strip non-alphanumeric, lowercase)
  const normalizedBarcodeMap = new Map<string, string>();
  const normalizedSkuMap = new Map<string, string>();
  for (const p of products) {
    if (p.barcode) {
      barcodeMap.set(p.barcode.toLowerCase(), p.id);
      normalizedBarcodeMap.set(normalizeKey(p.barcode), p.id);
    }
    if (p.sku) {
      skuMap.set(p.sku.toLowerCase(), p.id);
      normalizedSkuMap.set(normalizeKey(p.sku), p.id);
    }
  }

  // 14-day window — catches recent orders + status changes
  const endDate   = Date.now();
  const startDate = endDate - 14 * 24 * 60 * 60 * 1000;

  const [ordersResult, returnsResult] = await Promise.allSettled([
    syncOrders(cfg, barcodeMap, skuMap, normalizedBarcodeMap, normalizedSkuMap, startDate, endDate),
    syncReturns(cfg, barcodeMap, skuMap, normalizedBarcodeMap, normalizedSkuMap, startDate, endDate),
  ]);

  return NextResponse.json({
    ok: true,
    syncedAt: new Date().toISOString(),
    orders:
      ordersResult.status === "fulfilled"
        ? ordersResult.value
        : { error: String(ordersResult.reason) },
    returns:
      returnsResult.status === "fulfilled"
        ? returnsResult.value
        : { error: String(returnsResult.reason) },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Phase 61: strip non-alphanumeric and lowercase for fuzzy barcode/SKU matching */
function normalizeKey(s: string): string {
  return s.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/** Resolve productId using exact then normalized barcode/SKU fallbacks */
function resolveProductId(
  barcodeKey: string | undefined,
  skuKey: string | undefined,
  barcodeMap: Map<string, string>,
  skuMap: Map<string, string>,
  normalizedBarcodeMap: Map<string, string>,
  normalizedSkuMap: Map<string, string>,
): string | null {
  if (barcodeKey) {
    if (barcodeMap.has(barcodeKey)) return barcodeMap.get(barcodeKey)!;
    const nb = normalizeKey(barcodeKey);
    if (nb && normalizedBarcodeMap.has(nb)) return normalizedBarcodeMap.get(nb)!;
  }
  if (skuKey) {
    if (skuMap.has(skuKey)) return skuMap.get(skuKey)!;
    const ns = normalizeKey(skuKey);
    if (ns && normalizedSkuMap.has(ns)) return normalizedSkuMap.get(ns)!;
  }
  return null;
}

// ─── Orders ───────────────────────────────────────────────────────────────────

async function syncOrders(
  cfg: { supplierId: string; apiKey: string; apiSecret: string },
  barcodeMap: Map<string, string>,
  skuMap: Map<string, string>,
  normalizedBarcodeMap: Map<string, string>,
  normalizedSkuMap: Map<string, string>,
  startDate: number,
  endDate: number,
) {
  let totalLines = 0;
  let matched = 0;
  let page = 0;

  while (true) {
    let resp;
    try {
      resp = await fetchTrendyolOrders(cfg, { page, size: 50, startDate, endDate });
    } catch {
      break;
    }

    const orders = Array.isArray(resp.content) ? resp.content : [];
    if (orders.length === 0) break;

    for (const order of orders) {
      for (const line of Array.isArray(order.lines) ? order.lines : []) {
        totalLines++;

        const barcodeKey = line.barcode?.toLowerCase();
        const skuKey = line.merchantSku?.toLowerCase();
        const productId = resolveProductId(barcodeKey, skuKey, barcodeMap, skuMap, normalizedBarcodeMap, normalizedSkuMap);
        if (productId) matched++;

        const lineIdBig = BigInt(line.id);
        const rawPrice =
          (line.discountedPrice as number | null | undefined) ??
          (line.price as number | null | undefined) ??
          0;
        const unitPrice = Number.isFinite(rawPrice) ? rawPrice : 0;

        await prisma.trendyolSalesRecord.upsert({
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
      }
    }

    if (orders.length < 50) break;
    page++;
  }

  return { totalLines, matched };
}

// ─── Returns ──────────────────────────────────────────────────────────────────

async function syncReturns(
  cfg: { supplierId: string; apiKey: string; apiSecret: string },
  barcodeMap: Map<string, string>,
  skuMap: Map<string, string>,
  normalizedBarcodeMap: Map<string, string>,
  normalizedSkuMap: Map<string, string>,
  startDate: number,
  endDate: number,
) {
  let totalLines = 0;
  let matched = 0;
  let page = 0;

  while (true) {
    let resp;
    try {
      resp = await fetchTrendyolReturns(cfg, { page, size: 50, startDate, endDate });
    } catch {
      break;
    }

    const claims = Array.isArray(resp.content) ? resp.content : [];
    if (claims.length === 0) break;

    for (const claim of claims) {
      const claimDate = new Date(claim.claimDate);
      const orderDate = new Date(claim.orderDate);
      const orderNumber = claim.orderNumber;

      for (const lineItem of claim.items ?? []) {
        const orderLine = lineItem.orderLine;
        const claimItems = lineItem.claimItems ?? [];

        totalLines++;

        const barcodeKey = orderLine.barcode?.toLowerCase();
        const skuKey = orderLine.merchantSku?.toLowerCase();
        const productId = resolveProductId(barcodeKey, skuKey, barcodeMap, skuMap, normalizedBarcodeMap, normalizedSkuMap);
        if (productId) matched++;

        const firstItem = claimItems[0];
        const status = firstItem?.claimItemStatus?.name ?? "Unknown";
        const reasonName =
          firstItem?.customerClaimItemReason?.name ??
          firstItem?.trendyolClaimItemReason?.name ??
          null;
        const reasonCode =
          firstItem?.customerClaimItemReason?.code ??
          firstItem?.trendyolClaimItemReason?.code ??
          null;

        await prisma.trendyolReturnRecord.upsert({
          where: {
            claimId_orderLineId: { claimId: claim.claimId, orderLineId: orderLine.id },
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
            productName: orderLine.productName,
            barcode: orderLine.barcode ?? null,
            merchantSku: orderLine.merchantSku ?? null,
            unitPriceTry: orderLine.price ?? 0,
          },
          update: { productId, status, reasonName, reasonCode, syncedAt: new Date() },
        });
      }
    }

    if (claims.length < 50) break;
    page++;
  }

  return { totalLines, matched };
}

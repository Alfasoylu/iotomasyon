"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { parseXmlFeed, type XmlProductRecord } from "@/lib/xml-sync";
import type { ActionResult } from "@/types/actions";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

// ── Save / upsert an XML source ─────────────────────────────────────────────

export async function saveXmlSourceAction(
  sourceId: string | null,
  name: string,
  url: string,
  isEnabled: boolean,
  authHeader: string,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXECUTIVE_READ))) return PERM_DENIED;

  name = name.trim();
  url = url.trim();
  if (!name) return { ok: false, message: "Kaynak adı boş olamaz." };
  if (!url) return { ok: false, message: "URL boş olamaz." };

  try {
    if (sourceId) {
      await prisma.xmlSyncSource.update({
        where: { id: sourceId },
        data: {
          name,
          url,
          isEnabled,
          authHeader: authHeader.trim() || null,
          updatedAt: new Date(),
        },
      });
    } else {
      await prisma.xmlSyncSource.create({
        data: {
          name,
          url,
          isEnabled,
          authHeader: authHeader.trim() || null,
          updatedAt: new Date(),
        },
      });
    }
    revalidatePath("/admin/xml-sync");
    return { ok: true };
  } catch {
    return { ok: false, message: "Kaynak kaydedilemedi." };
  }
}

// ── Delete a source ──────────────────────────────────────────────────────────

export async function deleteXmlSourceAction(sourceId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXECUTIVE_READ))) return PERM_DENIED;

  try {
    await prisma.xmlSyncSource.delete({ where: { id: sourceId } });
    revalidatePath("/admin/xml-sync");
    return { ok: true };
  } catch {
    return { ok: false, message: "Kaynak silinemedi." };
  }
}

// ── Manual trigger: run sync for one source ──────────────────────────────────

export async function triggerXmlSyncAction(sourceId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXECUTIVE_READ))) return PERM_DENIED;

  const source = await prisma.xmlSyncSource.findUnique({ where: { id: sourceId } });
  if (!source) return { ok: false, message: "Kaynak bulunamadı." };

  return runSync(source.id, source.url, source.authHeader);
}

// ── XML Overwrite Policy (Phase 11 / Phase 28) ───────────────────────────────
//
// IOTOMASYON is the source of truth. XML (Entegra feed) is an ingestion source only.
//
// Field boundary:
//
//   SOURCE-MANAGED (XML may auto-update these on existing products):
//     - stockQuantity   — only when stockSource != "MANUAL"
//     - lastStockSyncAt — set to sync timestamp
//     - stockSource     — set to "XML"
//     - imageUrl        — FALLBACK ONLY: set only when Product.imageUrl IS NULL
//
//   CURATED — NEVER overwritten by XML sync on existing products:
//     - name, brand, model, category, categoryId
//     - description    (use Tiptap editor → saved to Product.description)
//     - sellingPriceTry, unitCostTry, wholesalePriceTry, marketplacePriceTry
//     - all other financial/cost fields
//     - privateNote    (owner-only; separate action)
//     - xmlLocked      (when true, skip entire product from sync)
//
//   XML-ONLY STORAGE (raw feed values; informational only; never promoted to Product):
//     - XmlProductData.xmlName, xmlBrand, xmlDescription, xmlPriceN, etc.
//     - ProductImage rows with source="XML" (refreshed every sync)
//
// For NEW products (SKU not found): all available XML fields are used to bootstrap
// the record — this is correct because there is no curated data yet to protect.

// ── Core sync logic (Phase 11A — Optimized batched version) ──────────────────
//
// Behaviour:
//   1. Fix any stuck RUNNING logs (from previous timeout)
//   2. Parse all records from the Entegra feed
//   3. findMany ALL existing products by SKU list (1 query)
//   4. createManyAndReturn new products (1 query)
//   5. $transaction batch update existing product stock/imageUrl
//   6. $transaction batch upsert XmlProductData (chunked)
//   7. deleteMany + createMany for ProductImage (2 queries per chunk)
//   8. Finalize log
//
// This reduces DB roundtrips from O(N*6) to O(N/100 * 3 + 10).

export async function runSync(
  sourceId: string,
  url: string,
  authHeader: string | null,
): Promise<ActionResult> {
  // Fix any stuck RUNNING logs from previous timeouts
  await prisma.xmlSyncLog.updateMany({
    where: { sourceId, status: "RUNNING" },
    data: {
      status: "ERROR",
      completedAt: new Date(),
      errorMessage: "Önceki çalışma yarıda kesildi (zaman aşımı).",
    },
  });

  const log = await prisma.xmlSyncLog.create({
    data: { sourceId, status: "RUNNING" },
  });

  try {
    // ── 1. Fetch XML ──────────────────────────────────────────────────────────
    const headers: Record<string, string> = { Accept: "application/xml, text/xml, */*" };
    if (authHeader) headers["Authorization"] = authHeader;

    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) {
      const msg = `HTTP ${res.status} ${res.statusText}`;
      await finalizeLog(log.id, sourceId, "ERROR", 0, 0, 0, 0, msg);
      return { ok: false, message: msg };
    }

    const xmlText = await res.text();
    const records = parseXmlFeed(xmlText);

    if (records.length === 0) {
      const msg = "XML ayrıştırıldı ancak ürün kaydı bulunamadı.";
      await finalizeLog(log.id, sourceId, "PARTIAL", 0, 0, 0, 0, msg);
      return { ok: false, message: msg };
    }

    const now = new Date();

    // ── 2. Mark ALL previously-seen XmlProductData as missing ─────────────────
    await prisma.xmlProductData.updateMany({
      where: { sourceId },
      data: { missingFromLatestFeed: true },
    });

    // ── 3. Fetch all existing products matching feed SKUs (ONE query) ──────────
    const allSkus = records.map((r) => r.sku);
    const existingProducts = await prisma.product.findMany({
      where: { sku: { in: allSkus } },
      select: { id: true, sku: true, xmlLocked: true, stockSource: true, imageUrl: true, stockQuantity: true },
    });
    const existingBySku = new Map(existingProducts.map((p) => [p.sku, p]));

    const newRecords = records.filter((r) => !existingBySku.has(r.sku));
    const existingRecords = records.filter((r) => existingBySku.has(r.sku));

    // ── 4. Create new products in batch (ONE query) ────────────────────────────
    let created = 0;
    const newProductIds = new Map<string, string>(); // sku → id

    if (newRecords.length > 0) {
      const createdProducts = await prisma.product.createManyAndReturn({
        data: newRecords.map((rec) => ({
          sku: rec.sku,
          name: rec.name ?? rec.sku,
          brand: rec.brand ?? null,
          description: rec.description ?? null,
          imageUrl: rec.resim1 ?? null,
          stockQuantity: rec.stock ?? 0,
          stockSource: rec.stock !== undefined ? "XML" : null,
          lastStockSyncAt: rec.stock !== undefined ? now : null,
          isActive: true,
          xmlImported: true,
        })),
        skipDuplicates: true,
        select: { id: true, sku: true },
      });
      created = createdProducts.length;
      for (const p of createdProducts) newProductIds.set(p.sku, p.id);
    }

    // ── 5. Update existing products (non-locked) in batches ────────────────────
    // Per the XML Overwrite Policy above:
    //   - Only SOURCE-MANAGED fields are written here.
    //   - CURATED fields (name, brand, description, prices, etc.) are never touched.
    let updated = 0;
    let skipped = 0;

    type StockUpdate = { id: string; data: Record<string, unknown> };
    const stockUpdates: StockUpdate[] = [];

    // Capture stock changes for XmlStockChangeLog
    const stockChanges: Array<{ productId: string; previousQty: number; newQty: number; delta: number }> = [];

    for (const rec of existingRecords) {
      const p = existingBySku.get(rec.sku)!;
      if (p.xmlLocked) {
        skipped++;
        continue;
      }
      const data: Record<string, unknown> = {};
      // SOURCE-MANAGED: stock sync (skipped for MANUAL-managed products)
      if (p.stockSource !== "MANUAL" && rec.stock !== undefined) {
        data.stockQuantity = rec.stock;
        data.lastStockSyncAt = now;
        data.stockSource = "XML";
        // Track stock change delta (log only when value actually changes)
        if (p.stockQuantity !== rec.stock) {
          stockChanges.push({
            productId: p.id,
            previousQty: p.stockQuantity,
            newQty: rec.stock,
            delta: rec.stock - p.stockQuantity,
          });
        }
      }
      // FALLBACK-FILL: imageUrl set only when the product has no image yet
      if (!p.imageUrl && rec.resim1) data.imageUrl = rec.resim1;
      if (Object.keys(data).length > 0) {
        stockUpdates.push({ id: p.id, data });
      }
      updated++;
    }

    // Run stock updates in parallel batches (independent updates — no transaction needed)
    for (const batch of chunks(stockUpdates, 20)) {
      await Promise.all(
        batch.map(({ id, data }) => prisma.product.update({ where: { id }, data })),
      );
    }

    // Write stock change logs (batch insert, chunked)
    if (stockChanges.length > 0) {
      for (const batch of chunks(stockChanges, 200)) {
        await prisma.xmlStockChangeLog.createMany({
          data: batch.map(({ productId, previousQty, newQty, delta }) => ({
            productId,
            syncLogId: log.id,
            sourceId,
            previousQty,
            newQty,
            delta,
            syncedAt: now,
          })),
        });
      }
    }

    // ── 6. Build unified productId map ─────────────────────────────────────────
    const productIdBySku = new Map<string, string>();
    for (const p of existingProducts) productIdBySku.set(p.sku, p.id);
    for (const [sku, id] of newProductIds) productIdBySku.set(sku, id);

    // ── 7. Batch upsert XmlProductData (chunked transactions) ─────────────────
    type XmlItem = { productId: string; rec: XmlProductRecord };
    const xmlItems: XmlItem[] = [];
    for (const rec of records) {
      const productId = productIdBySku.get(rec.sku);
      if (productId) xmlItems.push({ productId, rec });
    }

    // XmlProductData upserts: parallel batches (each upsert is independent by productId)
    for (const batch of chunks(xmlItems, 20)) {
      await Promise.all(
        batch.map(({ productId, rec }) => {
          const data = buildXmlDataPayload(sourceId, rec, now);
          return prisma.xmlProductData.upsert({
            where: { productId },
            create: { productId, ...data },
            update: data,
          });
        }),
      );
    }

    // ── 8. Batch upsert ProductImages ──────────────────────────────────────────
    // Strategy: delete all existing XML images for affected products, then createMany.
    // Simpler and faster than per-image compare.
    const affectedIds = [...productIdBySku.values()];

    for (const batch of chunks(affectedIds, 200)) {
      await prisma.productImage.deleteMany({
        where: { productId: { in: batch }, source: "XML" },
      });
    }

    const imageRows: Array<{ productId: string; url: string; sortOrder: number; source: string }> =
      [];
    for (const rec of records) {
      const productId = productIdBySku.get(rec.sku);
      if (!productId) continue;
      if (rec.resim1) imageRows.push({ productId, url: rec.resim1, sortOrder: 0, source: "XML" });
      if (rec.resim2) imageRows.push({ productId, url: rec.resim2, sortOrder: 1, source: "XML" });
      if (rec.resim3) imageRows.push({ productId, url: rec.resim3, sortOrder: 2, source: "XML" });
      if (rec.resim4) imageRows.push({ productId, url: rec.resim4, sortOrder: 3, source: "XML" });
      if (rec.resim5) imageRows.push({ productId, url: rec.resim5, sortOrder: 4, source: "XML" });
    }

    for (const batch of chunks(imageRows, 500)) {
      await prisma.productImage.createMany({ data: batch, skipDuplicates: true });
    }

    // ── 9. Finalize ────────────────────────────────────────────────────────────
    const status = created + updated > 0 ? "SUCCESS" : "PARTIAL";
    await finalizeLog(log.id, sourceId, status, records.length, created, updated, skipped, null);

    revalidatePath("/products");
    revalidatePath("/admin/xml-sync");

    return {
      ok: true,
      message: `${created} yeni ürün oluşturuldu, ${updated} ürün güncellendi, ${skipped} atlandı. ${stockChanges.length} ürünün stoğu değişti.`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
    await finalizeLog(log.id, sourceId, "ERROR", 0, 0, 0, 0, msg);
    return { ok: false, message: msg };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Split an array into chunks of `size`. */
function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}

/** Build the XmlProductData payload from a parsed record. */
function buildXmlDataPayload(sourceId: string, rec: XmlProductRecord, now: Date) {
  return {
    sourceId,
    xmlSku: rec.sku,
    xmlName: rec.name ?? null,
    xmlBrand: rec.brand ?? null,
    xmlUrunTipi: rec.urunTipi ?? null,
    xmlCurrencyType: rec.currencyType ?? null,
    xmlKdv: rec.kdv ?? null,
    xmlDateChange: rec.dateChange ?? null,
    xmlDateAdd: rec.dateAdd ?? null,
    xmlAnaUrunKodu: rec.anaUrunKodu ?? null,
    xmlPrice4: rec.price4 ?? null,
    xmlTrendyolPrice: rec.trendyolPrice ?? null,
    xmlHbPrice: rec.hbPrice ?? null,
    xmlAmazonPrice: rec.amazonPrice ?? null,
    xmlPazaramaPrice: rec.pazaramaPrice ?? null,
    xmlIdefixPrice: rec.idefixPrice ?? null,
    xmlBayiPrice: rec.bayiPrice ?? null,
    xmlKoctasPrice: rec.koctasPrice ?? null,
    xmlTeknosaPrice: rec.teknosaPrice ?? null,
    xmlTemuPrice: rec.temuPrice ?? null,
    xmlDescription: rec.description ?? null,
    xmlImage1: rec.resim1 ?? null,
    xmlImage2: rec.resim2 ?? null,
    xmlImage3: rec.resim3 ?? null,
    xmlImage4: rec.resim4 ?? null,
    xmlImage5: rec.resim5 ?? null,
    lastSeenAt: now,
    missingFromLatestFeed: false,
    updatedAt: now,
  };
}

async function finalizeLog(
  logId: string,
  sourceId: string,
  status: "SUCCESS" | "PARTIAL" | "ERROR",
  recordsFound: number,
  recordsCreated: number,
  recordsUpdated: number,
  recordsSkipped: number,
  errorMessage: string | null,
) {
  await prisma.xmlSyncLog.update({
    where: { id: logId },
    data: {
      status,
      completedAt: new Date(),
      recordsFound,
      recordsCreated,
      recordsUpdated,
      recordsSkipped,
      errorMessage,
    },
  });
  await prisma.xmlSyncSource.update({
    where: { id: sourceId },
    data: { lastSyncAt: new Date(), lastStatus: status, updatedAt: new Date() },
  });
}

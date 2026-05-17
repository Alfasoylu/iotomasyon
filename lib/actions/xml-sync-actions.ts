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
  secondaryUrl: string,
  isEnabled: boolean,
  authHeader: string,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXECUTIVE_READ))) return PERM_DENIED;

  name = name.trim();
  url = url.trim();
  if (!name) return { ok: false, message: "Kaynak adı boş olamaz." };
  if (!url) return { ok: false, message: "URL boş olamaz." };

  const secondaryUrlTrimmed = secondaryUrl.trim() || null;

  try {
    if (sourceId) {
      await prisma.xmlSyncSource.update({
        where: { id: sourceId },
        data: {
          name,
          url,
          secondaryUrl: secondaryUrlTrimmed,
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
          secondaryUrl: secondaryUrlTrimmed,
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

  return runSync(source.id, source.url, source.secondaryUrl ?? null, source.authHeader);
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
  secondaryUrl: string | null,
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
    // ── 1. Fetch XML (primary + optional secondary in parallel) ───────────────
    const headers: Record<string, string> = { Accept: "application/xml, text/xml, */*" };
    if (authHeader) headers["Authorization"] = authHeader;

    let records: XmlProductRecord[];

    if (secondaryUrl) {
      // Phase 75: Fetch both feeds in parallel, then merge by SKU
      const [primaryRes, secondaryRes] = await Promise.all([
        fetch(url, { headers, cache: "no-store" }),
        fetch(secondaryUrl, { headers, cache: "no-store" }),
      ]);

      if (!primaryRes.ok) {
        const msg = `Birincil XML HTTP ${primaryRes.status} ${primaryRes.statusText}`;
        await finalizeLog(log.id, sourceId, "ERROR", 0, 0, 0, 0, msg);
        return { ok: false, message: msg };
      }
      if (!secondaryRes.ok) {
        const msg = `İkincil XML HTTP ${secondaryRes.status} ${secondaryRes.statusText}`;
        await finalizeLog(log.id, sourceId, "ERROR", 0, 0, 0, 0, msg);
        return { ok: false, message: msg };
      }

      const [primaryText, secondaryText] = await Promise.all([
        primaryRes.text(),
        secondaryRes.text(),
      ]);

      const primaryRecords = parseXmlFeed(primaryText);
      const secondaryRecords = parseXmlFeed(secondaryText);
      records = mergeXmlRecords(primaryRecords, secondaryRecords);
    } else {
      const res = await fetch(url, { headers, cache: "no-store" });
      if (!res.ok) {
        const msg = `HTTP ${res.status} ${res.statusText}`;
        await finalizeLog(log.id, sourceId, "ERROR", 0, 0, 0, 0, msg);
        return { ok: false, message: msg };
      }
      const xmlText = await res.text();
      records = parseXmlFeed(xmlText);
    }

    if (records.length === 0) {
      const msg = "XML ayrıştırıldı ancak ürün kaydı bulunamadı.";
      await finalizeLog(log.id, sourceId, "PARTIAL", 0, 0, 0, 0, msg);
      return { ok: false, message: msg };
    }

    const now = new Date();

    // Fetch latest exchange rate for USD→TRY conversion
    const latestRate = await prisma.monthlyExchangeRate.findFirst({
      orderBy: [{ year: "desc" }, { month: "desc" }],
      select: { usdTryRate: true },
    });
    const usdTryRate = latestRate?.usdTryRate ? Number(latestRate.usdTryRate) : 45;

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

    // ── 7b. Batch upsert MarketplacePrice (Phase 71) ──────────────────────────
    // Maps XML USD prices → TRY using the current exchange rate.
    // Each marketplace × product pair is unique (@@unique constraint).
    type MpItem = { productId: string; marketplace: "TRENDYOL" | "HEPSIBURADA" | "AMAZON" | "PAZARAMA" | "IDEFIX"; usdPrice: number };
    const mpItems: MpItem[] = [];

    for (const rec of records) {
      const productId = productIdBySku.get(rec.sku);
      if (!productId) continue;
      const pairs: Array<[MpItem["marketplace"], number | undefined]> = [
        ["TRENDYOL",    rec.trendyolPrice],
        ["HEPSIBURADA", rec.hbPrice],
        ["AMAZON",      rec.amazonPrice],
        ["PAZARAMA",    rec.pazaramaPrice],
        ["IDEFIX",      rec.idefixPrice],
      ];
      for (const [marketplace, usdPrice] of pairs) {
        if (usdPrice && usdPrice > 0) {
          mpItems.push({ productId, marketplace, usdPrice });
        }
      }
    }

    for (const batch of chunks(mpItems, 20)) {
      await Promise.all(
        batch.map(({ productId, marketplace, usdPrice }) => {
          const priceTry = Math.round(usdPrice * usdTryRate * 100) / 100;
          return prisma.marketplacePrice.upsert({
            where: { productId_marketplace: { productId, marketplace } },
            create: {
              productId,
              marketplace,
              priceTry,
              currency: "TRY",
              source: "XML",
              rawExternalValue: usdPrice,
            },
            update: {
              priceTry,
              rawExternalValue: usdPrice,
              source: "XML",
            },
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

// ── Phase 75: Multi-feed merge helpers ───────────────────────────────────────
//
// Merge strategy when two XML feeds come from the same supplier (Entegra):
//
//   1. Primary feed records are the authoritative base.
//   2. Secondary feed adds SKUs missing from the primary.
//   3. For overlapping SKUs, primary fields take priority; secondary fills null gaps.
//   4. Stock exception: if both feeds carry stock and secondary has a more recent
//      date_change, the secondary's stock value is used (fresher data wins).
//
// This covers the real-world case where the supplier creates a second feed to expose
// products not present in the original feed, without changing any shared products.

function mergeXmlRecords(
  primary: XmlProductRecord[],
  secondary: XmlProductRecord[],
): XmlProductRecord[] {
  const merged = new Map<string, XmlProductRecord>();

  // Index primary records first
  for (const r of primary) merged.set(r.sku, r);

  // Merge secondary records
  for (const r of secondary) {
    const existing = merged.get(r.sku);
    if (!existing) {
      // SKU only in secondary feed → include as-is
      merged.set(r.sku, r);
    } else {
      // Overlapping SKU → merge field-by-field
      merged.set(r.sku, mergeXmlRecord(existing, r));
    }
  }

  return [...merged.values()];
}

/** Merge two records for the same SKU. Primary fields win; secondary fills nulls.
 *  Exception: stock uses the more recently updated feed (by date_change). */
function mergeXmlRecord(primary: XmlProductRecord, secondary: XmlProductRecord): XmlProductRecord {
  // Choose stock from the feed with the fresher date_change
  let stock = primary.stock;
  let dateChange = primary.dateChange;

  const primaryDate = primary.dateChange ?? "";
  const secondaryDate = secondary.dateChange ?? "";

  if (secondary.stock !== undefined) {
    if (primary.stock === undefined) {
      // Primary has no stock at all — use secondary
      stock = secondary.stock;
      dateChange = secondary.dateChange ?? primaryDate;
    } else if (secondaryDate > primaryDate) {
      // Secondary is more recently updated — trust its stock value
      stock = secondary.stock;
      dateChange = secondary.dateChange ?? primaryDate;
    }
  }

  function pick<T>(a: T | undefined, b: T | undefined): T | undefined {
    return a !== undefined ? a : b;
  }

  return {
    sku: primary.sku,
    name:          pick(primary.name,          secondary.name),
    brand:         pick(primary.brand,         secondary.brand),
    description:   pick(primary.description,   secondary.description),
    stock,
    urunTipi:      pick(primary.urunTipi,      secondary.urunTipi),
    currencyType:  pick(primary.currencyType,  secondary.currencyType),
    kdv:           pick(primary.kdv,           secondary.kdv),
    dateChange,
    dateAdd:       pick(primary.dateAdd,       secondary.dateAdd),
    anaUrunKodu:   pick(primary.anaUrunKodu,   secondary.anaUrunKodu),
    price4:        pick(primary.price4,        secondary.price4),
    trendyolPrice: pick(primary.trendyolPrice, secondary.trendyolPrice),
    hbPrice:       pick(primary.hbPrice,       secondary.hbPrice),
    amazonPrice:   pick(primary.amazonPrice,   secondary.amazonPrice),
    pazaramaPrice: pick(primary.pazaramaPrice, secondary.pazaramaPrice),
    idefixPrice:   pick(primary.idefixPrice,   secondary.idefixPrice),
    bayiPrice:     pick(primary.bayiPrice,     secondary.bayiPrice),
    koctasPrice:   pick(primary.koctasPrice,   secondary.koctasPrice),
    teknosaPrice:  pick(primary.teknosaPrice,  secondary.teknosaPrice),
    temuPrice:     pick(primary.temuPrice,     secondary.temuPrice),
    resim1:        pick(primary.resim1,        secondary.resim1),
    resim2:        pick(primary.resim2,        secondary.resim2),
    resim3:        pick(primary.resim3,        secondary.resim3),
    resim4:        pick(primary.resim4,        secondary.resim4),
    resim5:        pick(primary.resim5,        secondary.resim5),
  };
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

"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { parseXmlFeed } from "@/lib/xml-sync";
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

// ── Core sync logic ──────────────────────────────────────────────────────────
//
// Phase 11A behaviour:
//   1. Parse all 21+ fields from the Entegra feed
//   2. Match existing products by SKU (no barcode in this feed)
//   3. For matched products:
//      - If xmlLocked → skip entirely
//      - Update stock/price only when not manually overridden
//      - Upsert XmlProductData (full raw snapshot)
//      - Upsert ProductImage rows (resim1-5, sortOrder 0-4)
//      - Populate Product.imageUrl if currently empty
//   4. For unmatched SKUs → create a new Product (xmlImported=true) + XmlProductData + images
//   5. Mark XmlProductData.missingFromLatestFeed=true for any row NOT seen in this run
//   6. Log recordsCreated in XmlSyncLog
//
// Prices are stored raw (USD) in XmlProductData — not pushed to Product price fields.
// Product.sellingPriceTry etc. remain the business truth.

export async function runSync(
  sourceId: string,
  url: string,
  authHeader: string | null,
): Promise<ActionResult> {
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

    // ── 2. Mark ALL previously-seen XmlProductData for this source as missing ──
    //    We will un-mark (set false) each record we actually encounter below.
    await prisma.xmlProductData.updateMany({
      where: { sourceId },
      data: { missingFromLatestFeed: true },
    });

    // ── 3. Build a set of SKUs seen in this run for quick lookup ──────────────
    const seenSkus = new Set(records.map((r) => r.sku));

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const rec of records) {
      try {
        // ── 3a. Find existing product by SKU ─────────────────────────────────
        const product = await prisma.product.findUnique({
          where: { sku: rec.sku },
          select: { id: true, xmlLocked: true, stockSource: true, imageUrl: true },
        });

        if (product) {
          // ── Existing product ──────────────────────────────────────────────

          if (product.xmlLocked) {
            skipped++;
            // Still update XmlProductData snapshot & images, but don't touch Product fields
            await upsertXmlData(product.id, sourceId, rec);
            await upsertImages(product.id, rec);
            // un-mark missing
            await prisma.xmlProductData.updateMany({
              where: { productId: product.id, sourceId },
              data: { missingFromLatestFeed: false, lastSeenAt: new Date() },
            });
            continue;
          }

          // Stock update (honour MANUAL override)
          const stockData: Record<string, unknown> = {};
          if (product.stockSource !== "MANUAL" && rec.stock !== undefined) {
            stockData.stockQuantity = rec.stock;
            stockData.lastStockSyncAt = new Date();
            stockData.stockSource = "XML";
          }

          // Populate imageUrl from resim1 if currently empty
          if (!product.imageUrl && rec.resim1) {
            stockData.imageUrl = rec.resim1;
          }

          if (Object.keys(stockData).length > 0) {
            await prisma.product.update({ where: { id: product.id }, data: stockData });
          }

          // Upsert XML snapshot
          await upsertXmlData(product.id, sourceId, rec);
          // Upsert images
          await upsertImages(product.id, rec);

          // un-mark missing
          await prisma.xmlProductData.updateMany({
            where: { productId: product.id, sourceId },
            data: { missingFromLatestFeed: false, lastSeenAt: new Date() },
          });

          updated++;
        } else {
          // ── New product — create from XML ─────────────────────────────────
          const newProduct = await prisma.product.create({
            data: {
              sku: rec.sku,
              name: rec.name ?? rec.sku,        // fallback to sku if name absent
              brand: rec.brand ?? null,
              description: rec.description ?? null,
              imageUrl: rec.resim1 ?? null,
              stockQuantity: rec.stock ?? 0,
              stockSource: rec.stock !== undefined ? "XML" : null,
              lastStockSyncAt: rec.stock !== undefined ? new Date() : null,
              isActive: true,
              xmlImported: true,
              // productKind defaults to MAIN_STOCK
            },
          });

          // Upsert XML snapshot
          await upsertXmlData(newProduct.id, sourceId, rec);
          // Upsert images
          await upsertImages(newProduct.id, rec);

          created++;
        }
      } catch (recErr) {
        // Don't abort the entire sync for a single bad record
        console.error(`[xml-sync] SKU ${rec.sku} error:`, recErr);
        skipped++;
      }
    }

    // ── 4. Finalize ───────────────────────────────────────────────────────────
    // Note: records that remained missingFromLatestFeed=true are those that
    // appeared in a previous sync but not in this one — already marked above.
    // We deliberately do NOT delete them.

    const status = created + updated > 0 ? "SUCCESS" : "PARTIAL";
    await finalizeLog(log.id, sourceId, status, records.length, created, updated, skipped, null);

    revalidatePath("/products");
    revalidatePath("/admin/xml-sync");

    return {
      ok: true,
      message: `${created} yeni ürün oluşturuldu, ${updated} ürün güncellendi, ${skipped} atlandı.`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
    await finalizeLog(log.id, sourceId, "ERROR", 0, 0, 0, 0, msg);
    return { ok: false, message: msg };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Upsert the XmlProductData snapshot for a product. */
async function upsertXmlData(
  productId: string,
  sourceId: string,
  rec: Awaited<ReturnType<typeof parseXmlFeed>>[number],
) {
  const data = {
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
    lastSeenAt: new Date(),
    missingFromLatestFeed: false,
    updatedAt: new Date(),
  };

  await prisma.xmlProductData.upsert({
    where: { productId },
    create: { productId, ...data },
    update: data,
  });
}

/** Upsert ProductImage rows for resim1-5 (sortOrder 0-4). */
async function upsertImages(
  productId: string,
  rec: Awaited<ReturnType<typeof parseXmlFeed>>[number],
) {
  const images: { url: string; sortOrder: number }[] = [];
  if (rec.resim1) images.push({ url: rec.resim1, sortOrder: 0 });
  if (rec.resim2) images.push({ url: rec.resim2, sortOrder: 1 });
  if (rec.resim3) images.push({ url: rec.resim3, sortOrder: 2 });
  if (rec.resim4) images.push({ url: rec.resim4, sortOrder: 3 });
  if (rec.resim5) images.push({ url: rec.resim5, sortOrder: 4 });

  if (images.length === 0) return;

  // Fetch existing XML images for this product
  const existing = await prisma.productImage.findMany({
    where: { productId, source: "XML" },
    select: { id: true, sortOrder: true, url: true },
  });

  for (const img of images) {
    const existingRow = existing.find((e) => e.sortOrder === img.sortOrder);
    if (existingRow) {
      if (existingRow.url !== img.url) {
        await prisma.productImage.update({
          where: { id: existingRow.id },
          data: { url: img.url, updatedAt: new Date() },
        });
      }
      // same URL — no write needed
    } else {
      await prisma.productImage.create({
        data: {
          productId,
          url: img.url,
          sortOrder: img.sortOrder,
          source: "XML",
        },
      });
    }
  }
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

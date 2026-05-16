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

// ── Core sync logic (shared by cron endpoint + manual trigger) ───────────────

export async function runSync(
  sourceId: string,
  url: string,
  authHeader: string | null,
): Promise<ActionResult> {
  const log = await prisma.xmlSyncLog.create({
    data: { sourceId, status: "RUNNING" },
  });

  try {
    // Fetch XML
    const headers: Record<string, string> = { Accept: "application/xml, text/xml, */*" };
    if (authHeader) headers["Authorization"] = authHeader;

    const res = await fetch(url, { headers, cache: "no-store" });
    if (!res.ok) {
      const msg = `HTTP ${res.status} ${res.statusText}`;
      await finalizeLog(log.id, sourceId, "ERROR", 0, 0, 0, msg);
      return { ok: false, message: msg };
    }

    const xmlText = await res.text();
    const records = parseXmlFeed(xmlText);

    if (records.length === 0) {
      await finalizeLog(log.id, sourceId, "PARTIAL", 0, 0, 0, "XML ayrıştırıldı ancak ürün kaydı bulunamadı.");
      return { ok: false, message: "XML ayrıştırıldı ancak ürün kaydı bulunamadı." };
    }

    let updated = 0;
    let skipped = 0;

    for (const rec of records) {
      // Find matching product (barcode first, then SKU)
      let product: { id: string; xmlLocked: boolean; stockSource: string | null } | null = null;

      if (rec.barcode) {
        product = await prisma.product.findUnique({
          where: { barcode: rec.barcode },
          select: { id: true, xmlLocked: true, stockSource: true },
        });
      }
      if (!product && rec.sku) {
        product = await prisma.product.findUnique({
          where: { sku: rec.sku },
          select: { id: true, xmlLocked: true, stockSource: true },
        });
      }

      if (!product) { skipped++; continue; }

      // xmlLocked = skip entirely
      if (product.xmlLocked) { skipped++; continue; }

      const isManualStock = product.stockSource === "MANUAL";
      const updateData: Record<string, unknown> = {};

      // Stock: skip if stockSource = MANUAL
      if (!isManualStock && rec.stock !== undefined) {
        updateData.stockQuantity = rec.stock;
        updateData.lastStockSyncAt = new Date();
        updateData.stockSource = "XML";
      }

      // Price: always update (unless xmlLocked — already handled)
      if (rec.price !== undefined) {
        updateData.sellingPriceTry = rec.price;
      }
      if (rec.dealerPrice !== undefined) {
        updateData.wholesalePriceTry = rec.dealerPrice;
      }

      if (Object.keys(updateData).length === 0) { skipped++; continue; }

      await prisma.product.update({ where: { id: product.id }, data: updateData });
      updated++;
    }

    const status = updated > 0 ? "SUCCESS" : "PARTIAL";
    await finalizeLog(log.id, sourceId, status, records.length, updated, skipped, null);
    revalidatePath("/products");
    revalidatePath("/admin/xml-sync");

    return { ok: true, message: `${updated} ürün güncellendi, ${skipped} atlandı.` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Bilinmeyen hata";
    await finalizeLog(log.id, sourceId, "ERROR", 0, 0, 0, msg);
    return { ok: false, message: msg };
  }
}

async function finalizeLog(
  logId: string,
  sourceId: string,
  status: "SUCCESS" | "PARTIAL" | "ERROR",
  recordsFound: number,
  recordsUpdated: number,
  recordsSkipped: number,
  errorMessage: string | null,
) {
  await prisma.xmlSyncLog.update({
    where: { id: logId },
    data: { status, completedAt: new Date(), recordsFound, recordsUpdated, recordsSkipped, errorMessage },
  });
  await prisma.xmlSyncSource.update({
    where: { id: sourceId },
    data: { lastSyncAt: new Date(), lastStatus: status, updatedAt: new Date() },
  });
}

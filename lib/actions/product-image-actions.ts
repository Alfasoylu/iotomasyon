"use server";

/**
 * Phase 27 — Product Media and Content Studio
 *
 * Server actions for managing ProductImage records:
 * - add by URL (MANUAL source)
 * - delete
 * - set as primary (sortOrder 0)
 * - upload to Supabase Storage
 */

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PERMISSIONS } from "@/lib/permissions";
import { getStorageConfig, uploadObject } from "@/lib/storage/supabase-storage";

export type ImageActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

// ── Add image by URL ──────────────────────────────────────────────────────────

export async function addProductImageByUrlAction(
  productId: string,
  url: string,
): Promise<ImageActionResult> {
  await requirePermission(PERMISSIONS.PRODUCTS_UPDATE);

  const trimmedUrl = url.trim();
  if (!trimmedUrl) return { ok: false, error: "URL boş olamaz" };

  try {
    new URL(trimmedUrl);
  } catch {
    return { ok: false, error: "Geçerli bir URL girin" };
  }

  const existingCount = await prisma.productImage.count({ where: { productId } });

  await prisma.productImage.create({
    data: {
      productId,
      url: trimmedUrl,
      sortOrder: existingCount,
      source: "MANUAL",
    },
  });

  revalidatePath(`/products/${productId}/edit`);
  return { ok: true, message: "Görsel eklendi" };
}

// ── Delete image ──────────────────────────────────────────────────────────────

export async function deleteProductImageAction(
  imageId: string,
  productId: string,
): Promise<ImageActionResult> {
  await requirePermission(PERMISSIONS.PRODUCTS_UPDATE);

  const image = await prisma.productImage.findUnique({ where: { id: imageId } });
  if (!image || image.productId !== productId) {
    return { ok: false, error: "Görsel bulunamadı" };
  }

  await prisma.productImage.delete({ where: { id: imageId } });

  // Compact sortOrders after deletion
  const remaining = await prisma.productImage.findMany({
    where: { productId },
    orderBy: { sortOrder: "asc" },
  });
  for (let i = 0; i < remaining.length; i++) {
    if (remaining[i].sortOrder !== i) {
      await prisma.productImage.update({
        where: { id: remaining[i].id },
        data: { sortOrder: i },
      });
    }
  }

  revalidatePath(`/products/${productId}/edit`);
  return { ok: true, message: "Görsel silindi" };
}

// ── Set primary image (sortOrder 0) ──────────────────────────────────────────

export async function setPrimaryImageAction(
  imageId: string,
  productId: string,
): Promise<ImageActionResult> {
  await requirePermission(PERMISSIONS.PRODUCTS_UPDATE);

  const images = await prisma.productImage.findMany({
    where: { productId },
    orderBy: { sortOrder: "asc" },
  });

  const target = images.find((img) => img.id === imageId);
  if (!target) return { ok: false, error: "Görsel bulunamadı" };

  // Reorder: target → 0, others keep their relative order
  const reordered = [target, ...images.filter((img) => img.id !== imageId)];
  for (let i = 0; i < reordered.length; i++) {
    if (reordered[i].sortOrder !== i) {
      await prisma.productImage.update({
        where: { id: reordered[i].id },
        data: { sortOrder: i },
      });
    }
  }

  revalidatePath(`/products/${productId}/edit`);
  return { ok: true, message: "Birincil görsel güncellendi" };
}

// ── Upload image to Supabase Storage ─────────────────────────────────────────

type DetectedImage = { mime: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; ext: "jpg" | "png" | "webp" | "gif" };

/**
 * Dosyanın gerçek türünü magic byte'lardan tespit eder. SVG ve diğer her tür
 * reddedilir (public bucket'ta script içeren SVG barındırmamak için).
 *
 *   JPEG : FF D8 FF
 *   PNG  : 89 50 4E 47
 *   WebP : "RIFF" .... "WEBP"
 *   GIF  : "GIF8"
 */
function detectImageType(buf: Buffer): DetectedImage | null {
  if (buf.length < 12) return null;

  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { mime: "image/png", ext: "png" };
  }
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return { mime: "image/webp", ext: "webp" };
  }
  if (buf.toString("ascii", 0, 4) === "GIF8") {
    return { mime: "image/gif", ext: "gif" };
  }
  return null;
}

export async function uploadProductImageAction(
  productId: string,
  formData: FormData,
): Promise<ImageActionResult & { url?: string }> {
  await requirePermission(PERMISSIONS.PRODUCTS_UPDATE);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Dosya seçilmedi" };
  }

  const storage = getStorageConfig();
  if (!storage.ok) {
    return { ok: false, error: storage.reason };
  }

  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: "Maksimum dosya boyutu 5 MB'dir" };
  }

  // Güvenlik: istemcinin bildirdiği `file.type` ve dosya adındaki uzantıya
  // güvenilmez — gerçek tür dosyanın ilk baytlarından (magic bytes) tespit
  // edilir; uzantı da tespit edilen türden sabit haritayla türetilir.
  const bytes = Buffer.from(await file.arrayBuffer());
  const detected = detectImageType(bytes);
  if (!detected) {
    return { ok: false, error: "Sadece JPEG, PNG, WebP veya GIF yükleyebilirsiniz" };
  }

  // Ürün gerçekten var mı? (storage anahtarı productId ile başlıyor — sahte
  // id ile public bucket'a rastgele yol yazılmasın)
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!product) {
    return { ok: false, error: "Ürün bulunamadı" };
  }

  const path = `${productId}/${Date.now()}.${detected.ext}`;

  // Yükleme main'deki ortak yardımcıyla; Content-Type istemcinin bildirdiği değil,
  // magic byte'lardan tespit edilen tür.
  const res = await uploadObject(
    storage.config,
    "product-images",
    path,
    new File([bytes], `upload.${detected.ext}`, { type: detected.mime }),
  );
  if (!res.ok) {
    return { ok: false, error: res.reason };
  }

  const publicUrl = res.publicUrl;

  const existingCount = await prisma.productImage.count({ where: { productId } });
  await prisma.productImage.create({
    data: {
      productId,
      url: publicUrl,
      sortOrder: existingCount,
      source: "MANUAL",
    },
  });

  revalidatePath(`/products/${productId}/edit`);
  return { ok: true, message: "Görsel yüklendi", url: publicUrl };
}

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

export async function uploadProductImageAction(
  productId: string,
  formData: FormData,
): Promise<ImageActionResult & { url?: string }> {
  await requirePermission(PERMISSIONS.PRODUCTS_UPDATE);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Dosya seçilmedi" };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return { ok: false, error: "Depolama yapılandırması eksik (SUPABASE_URL veya SUPABASE_SERVICE_ROLE_KEY)" };
  }

  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowed.includes(file.type)) {
    return { ok: false, error: "Sadece JPEG, PNG, WebP veya GIF yükleyebilirsiniz" };
  }

  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: "Maksimum dosya boyutu 5 MB'dir" };
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const path = `${productId}/${Date.now()}.${ext}`;

  const res = await fetch(
    `${supabaseUrl}/storage/v1/object/product-images/${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": file.type,
        "x-upsert": "false",
      },
      body: Buffer.from(await file.arrayBuffer()),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { ok: false, error: `Yükleme başarısız (${res.status}): ${body}` };
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/product-images/${path}`;

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

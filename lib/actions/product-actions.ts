"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission, isOwner } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { productSchema, type ProductInput } from "@/lib/validations/product";
import type { ActionResult } from "@/types/actions";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

type ProductField = keyof ProductInput;

export async function createProductAction(
  values: ProductInput,
  attributeIds: string[] = [],
): Promise<ActionResult<ProductField>> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.PRODUCTS_CREATE))) return PERM_DENIED;

  const parsed = productSchema.safeParse(values);

  if (!parsed.success) {
    return {
      ok: false,
      message: "Form alanlarını kontrol edin.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const product = await prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: {
          ...normalizeProductData(parsed.data),
          createdById: user.id,
        },
      });
      for (const attributeId of attributeIds) {
        await tx.productAttributeAssignment.create({
          data: { productId: p.id, attributeId },
        });
      }
      return p;
    });

    revalidatePath("/dashboard");
    revalidatePath("/products");

    return {
      ok: true,
      redirectTo: `/products/${product.id}`,
    };
  } catch (error) {
    if (isUniqueSkuError(error)) {
      return {
        ok: false,
        message: "Bu SKU zaten kullanılıyor.",
        fieldErrors: {
          sku: ["Bu SKU zaten kullanılıyor."],
        },
      };
    }

    return {
      ok: false,
      message: "Ürün kaydı oluşturulamadı.",
    };
  }
}

export async function updateProductAction(
  productId: string,
  values: ProductInput,
  attributeIds: string[] = [],
): Promise<ActionResult<ProductField>> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.PRODUCTS_UPDATE))) return PERM_DENIED;

  const parsed = productSchema.safeParse(values);

  if (!parsed.success) {
    return {
      ok: false,
      message: "Form alanlarını kontrol edin.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  // Phase 57: non-admin users cannot write financial/import fields.
  // Server-side enforcement — UI may also hide these fields, but we guard here regardless.
  const canWriteFinancials = await checkPermission(user, PERMISSIONS.EXECUTIVE_READ);
  const productData = canWriteFinancials
    ? normalizeProductData(parsed.data)
    : normalizeProductDataNonFinancial(parsed.data);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: productData,
      });
      await tx.productAttributeAssignment.deleteMany({ where: { productId } });
      for (const attributeId of attributeIds) {
        await tx.productAttributeAssignment.create({
          data: { productId, attributeId },
        });
      }
    });

    revalidatePath("/dashboard");
    revalidatePath("/products");
    revalidatePath(`/products/${productId}`);

    return {
      ok: true,
      redirectTo: `/products/${productId}`,
    };
  } catch (error) {
    if (isUniqueSkuError(error)) {
      return {
        ok: false,
        message: "Bu SKU zaten kullanılıyor.",
        fieldErrors: {
          sku: ["Bu SKU zaten kullanılıyor."],
        },
      };
    }

    return {
      ok: false,
      message: "Ürün güncellenemedi.",
    };
  }
}

export async function deleteProductAction(productId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.PRODUCTS_DELETE))) return PERM_DENIED;

  try {
    await prisma.product.delete({
      where: { id: productId },
    });

    revalidatePath("/dashboard");
    revalidatePath("/products");

    return {
      ok: true,
      redirectTo: "/products",
    };
  } catch {
    return {
      ok: false,
      message: "Ürün silinemedi.",
    };
  }
}

function normalizeProductData(input: ProductInput) {
  const stockSource = emptyToNull(input.stockSource) as "MANUAL" | "XML" | "API" | "IMPORT" | null;
  const stockConfidence = emptyToNull(input.stockConfidence) as "HIGH" | "MEDIUM" | "LOW" | null;
  return {
    sku: input.sku.trim().toUpperCase(),
    barcode: emptyToNull(input.barcode),
    name: input.name.trim(),
    imageUrl: emptyToNull(input.imageUrl),
    category: emptyToNull(input.category),
    categoryId: emptyToNull(input.categoryId),
    brand: emptyToNull(input.brand),
    model: emptyToNull(input.model),
    supplier: emptyToNull(input.supplier),
    stockQuantity: input.stockQuantity,
    minimumStock: input.minimumStock,
    reorderLeadTime: positiveIntOrNull(input.reorderLeadTime),
    stockSource,
    stockConfidence,
    lastStockSyncAt: emptyToNull(input.lastStockSyncAt) ? new Date(input.lastStockSyncAt) : null,
    lastStockCountById: emptyToNull(input.lastStockCountById),
    location: emptyToNull(input.location),
    description: emptyToNull(input.description),
    isActive: input.isActive,
    shippingCost: emptyToNull(input.shippingCost),
    shippingCostOverride: emptyToNull(input.shippingCostOverride),
    marketplaceCommission: emptyToNull(input.marketplaceCommission),
    marketplaceCommissionOverride: emptyToNull(input.marketplaceCommissionOverride),
    importDate: emptyToNull(input.importDate) ? new Date(input.importDate) : null,
    importQuantity: positiveIntOrNull(input.importQuantity),
    importUnitCostUsd: emptyToNull(input.importUnitCostUsd),
    inventoryCountDate: emptyToNull(input.inventoryCountDate) ? new Date(input.inventoryCountDate) : null,
    inventoryCountStock: positiveIntOrNull(input.inventoryCountStock),
    // Phase 8 — Profitability Engine
    unitCostTry: emptyToNull(input.unitCostTry),
    sellingPriceTry: emptyToNull(input.sellingPriceTry),
    wholesalePriceTry: emptyToNull(input.wholesalePriceTry),
    marketplacePriceTry: emptyToNull(input.marketplacePriceTry),
    packagingCost: emptyToNull(input.packagingCost),
    vatRate: emptyToNull(input.vatRate),
    paymentFeeRate: emptyToNull(input.paymentFeeRate),
    returnReserveRate: emptyToNull(input.returnReserveRate),
    // Phase 9 — Sales Potential Engine
    onlineSalesPotential: positiveIntOrNull(input.onlineSalesPotential),
    wholesaleSalesPotential: positiveIntOrNull(input.wholesaleSalesPotential),
    installerSalesPotential: positiveIntOrNull(input.installerSalesPotential),
    // Phase 11 — XML Sync override protection
    xmlLocked: input.xmlLocked,
    // Phase 11C — Import decision inputs
    weightKg: emptyToNull(input.weightKg),
    customsRatePct: emptyToNull(input.customsRatePct),
    shippingMethodPref: emptyToNull(input.shippingMethodPref),
    // Phase 31 — RMB-first import economics
    sourceCostRmb: emptyToNull(input.sourceCostRmb),
    importPaymentFeePct: emptyToNull(input.importPaymentFeePct),
    // Phase 28: privateNote is intentionally omitted here.
    // It is saved exclusively via updatePrivateNoteAction (EXECUTIVE_READ required).
  };
}

/**
 * Phase 57: Non-financial subset — safe to write for any PRODUCTS_UPDATE user.
 * Financial, cost, and import fields are intentionally omitted so existing DB
 * values are preserved unchanged when a non-admin user saves a product.
 */
function normalizeProductDataNonFinancial(input: ProductInput) {
  const stockSource = emptyToNull(input.stockSource) as "MANUAL" | "XML" | "API" | "IMPORT" | null;
  const stockConfidence = emptyToNull(input.stockConfidence) as "HIGH" | "MEDIUM" | "LOW" | null;
  return {
    sku: input.sku.trim().toUpperCase(),
    barcode: emptyToNull(input.barcode),
    name: input.name.trim(),
    imageUrl: emptyToNull(input.imageUrl),
    category: emptyToNull(input.category),
    categoryId: emptyToNull(input.categoryId),
    brand: emptyToNull(input.brand),
    model: emptyToNull(input.model),
    supplier: emptyToNull(input.supplier),
    stockQuantity: input.stockQuantity,
    minimumStock: input.minimumStock,
    reorderLeadTime: positiveIntOrNull(input.reorderLeadTime),
    stockSource,
    stockConfidence,
    lastStockSyncAt: emptyToNull(input.lastStockSyncAt) ? new Date(input.lastStockSyncAt) : null,
    lastStockCountById: emptyToNull(input.lastStockCountById),
    location: emptyToNull(input.location),
    description: emptyToNull(input.description),
    isActive: input.isActive,
    importDate: emptyToNull(input.importDate) ? new Date(input.importDate) : null,
    importQuantity: positiveIntOrNull(input.importQuantity),
    inventoryCountDate: emptyToNull(input.inventoryCountDate) ? new Date(input.inventoryCountDate) : null,
    inventoryCountStock: positiveIntOrNull(input.inventoryCountStock),
    xmlLocked: input.xmlLocked,
    // shippingCost / marketplaceCommission hidden passthrough fields are also omitted
    // Financial fields intentionally excluded:
    // unitCostTry, sellingPriceTry, wholesalePriceTry, marketplacePriceTry, packagingCost,
    // vatRate, paymentFeeRate, returnReserveRate, shippingCostOverride,
    // marketplaceCommissionOverride, importUnitCostUsd, sourceCostRmb, importPaymentFeePct,
    // weightKg, customsRatePct, shippingMethodPref,
    // onlineSalesPotential, wholesaleSalesPotential, installerSalesPotential
  };
}

function positiveIntOrNull(value: string | undefined): number | null {
  if (!value || !value.trim()) return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function emptyToNull(value: string | undefined) {
  return value && value.trim().length > 0 ? value.trim() : null;
}

// Phase 28 — Separate privileged action for owner-only private note.
// This is intentionally separate from updateProductAction so that
// non-owner users who call updateProductAction cannot touch it.
// Gate: isOwner() (stricter than EXECUTIVE_READ — only the ADMIN_EMAIL account).
export async function updatePrivateNoteAction(
  productId: string,
  privateNote: string,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!isOwner(user)) return PERM_DENIED;
  if (!(await checkPermission(user, PERMISSIONS.PRODUCTS_UPDATE))) return PERM_DENIED;

  try {
    await prisma.product.update({
      where: { id: productId },
      data: { privateNote: privateNote.trim() || null },
    });

    revalidatePath(`/products/${productId}`);
    revalidatePath(`/products/${productId}/edit`);

    return { ok: true };
  } catch {
    return { ok: false, message: "Özel not kaydedilemedi." };
  }
}

function isUniqueSkuError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

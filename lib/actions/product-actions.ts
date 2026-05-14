"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { productSchema, type ProductInput } from "@/lib/validations/product";
import type { ActionResult } from "@/types/actions";

type ProductField = keyof ProductInput;

export async function createProductAction(
  values: ProductInput,
  attributeIds: string[] = [],
): Promise<ActionResult<ProductField>> {
  const user = await requireUser();
  const parsed = productSchema.safeParse(values);

  if (!parsed.success) {
    return {
      ok: false,
      message: "Form alanlarini kontrol edin.",
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
        message: "Bu SKU zaten kullaniliyor.",
        fieldErrors: {
          sku: ["Bu SKU zaten kullaniliyor."],
        },
      };
    }

    return {
      ok: false,
      message: "Urun kaydi olusturulamadi.",
    };
  }
}

export async function updateProductAction(
  productId: string,
  values: ProductInput,
  attributeIds: string[] = [],
): Promise<ActionResult<ProductField>> {
  await requireUser();
  const parsed = productSchema.safeParse(values);

  if (!parsed.success) {
    return {
      ok: false,
      message: "Form alanlarini kontrol edin.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: normalizeProductData(parsed.data),
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
        message: "Bu SKU zaten kullaniliyor.",
        fieldErrors: {
          sku: ["Bu SKU zaten kullaniliyor."],
        },
      };
    }

    return {
      ok: false,
      message: "Urun guncellenemedi.",
    };
  }
}

export async function deleteProductAction(productId: string): Promise<ActionResult> {
  await requireUser();

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
      message: "Urun silinemedi.",
    };
  }
}

function normalizeProductData(input: ProductInput) {
  return {
    sku: input.sku.trim().toUpperCase(),
    name: input.name.trim(),
    category: emptyToNull(input.category),
    categoryId: emptyToNull(input.categoryId),
    brand: emptyToNull(input.brand),
    model: emptyToNull(input.model),
    stockQuantity: input.stockQuantity,
    minimumStock: input.minimumStock,
    location: emptyToNull(input.location),
    description: emptyToNull(input.description),
    isActive: input.isActive,
  };
}

function emptyToNull(value: string | undefined) {
  return value && value.trim().length > 0 ? value.trim() : null;
}

function isUniqueSkuError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { categorySchema, type CategoryInput } from "@/lib/validations/category";
import type { ActionResult } from "@/types/actions";

type CategoryField = keyof CategoryInput;

export async function createCategoryAction(
  values: CategoryInput,
): Promise<ActionResult<CategoryField>> {
  await requireUser();
  const parsed = categorySchema.safeParse(values);

  if (!parsed.success) {
    return {
      ok: false,
      message: "Form alanlarini kontrol edin.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  try {
    const category = await prisma.productCategory.create({
      data: {
        name: parsed.data.name.trim(),
        slug: parsed.data.slug.trim().toLowerCase(),
        description: emptyToNull(parsed.data.description),
        parentId: emptyToNull(parsed.data.parentId),
      },
    });

    revalidatePath("/categories");
    revalidatePath("/dashboard");

    return { ok: true, redirectTo: `/categories/${category.id}` };
  } catch (error) {
    if (isUniqueSlugError(error)) {
      return {
        ok: false,
        message: "Bu slug zaten kullaniliyor.",
        fieldErrors: { slug: ["Bu slug zaten kullaniliyor."] },
      };
    }

    return { ok: false, message: "Kategori olusturulamadi." };
  }
}

export async function updateCategoryAction(
  categoryId: string,
  values: CategoryInput,
): Promise<ActionResult<CategoryField>> {
  await requireUser();
  const parsed = categorySchema.safeParse(values);

  if (!parsed.success) {
    return {
      ok: false,
      message: "Form alanlarini kontrol edin.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  if (parsed.data.parentId === categoryId) {
    return {
      ok: false,
      message: "Bir kategori kendisinin ust kategorisi olamaz.",
      fieldErrors: { parentId: ["Kendi kendine baglanti kurulamaz."] },
    };
  }

  try {
    await prisma.productCategory.update({
      where: { id: categoryId },
      data: {
        name: parsed.data.name.trim(),
        slug: parsed.data.slug.trim().toLowerCase(),
        description: emptyToNull(parsed.data.description),
        parentId: emptyToNull(parsed.data.parentId),
      },
    });

    revalidatePath("/categories");
    revalidatePath(`/categories/${categoryId}`);
    revalidatePath("/dashboard");

    return { ok: true, redirectTo: `/categories/${categoryId}` };
  } catch (error) {
    if (isUniqueSlugError(error)) {
      return {
        ok: false,
        message: "Bu slug zaten kullaniliyor.",
        fieldErrors: { slug: ["Bu slug zaten kullaniliyor."] },
      };
    }

    return { ok: false, message: "Kategori guncellenemedi." };
  }
}

export async function deleteCategoryAction(categoryId: string): Promise<ActionResult> {
  await requireUser();

  try {
    await prisma.productCategory.delete({ where: { id: categoryId } });

    revalidatePath("/categories");
    revalidatePath("/dashboard");

    return { ok: true, redirectTo: "/categories" };
  } catch {
    return { ok: false, message: "Kategori silinemedi. Bagli urunler veya ilgiler olabilir." };
  }
}

function emptyToNull(value: string | undefined) {
  return value && value.trim().length > 0 ? value.trim() : null;
}

function isUniqueSlugError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

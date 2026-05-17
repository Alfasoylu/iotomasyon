"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import type { ActionResult } from "@/types/actions";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

// ── Supplier CRUD ────────────────────────────────────────────────────────────

export async function saveSupplierAction(
  id: string | null,
  formData: {
    name: string;
    contactName: string;
    phone: string;
    email: string;
    countryOfOrigin: string;
    paymentTerms: string;
    defaultLeadDays: string;
    notes: string;
    isActive: boolean;
    // Phase 32 — supplier-level import defaults
    defaultAirFreightUsdPerKg: string;
    defaultSeaFreightUsdPerKg: string;
    defaultPaymentFeePct: string;
  },
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.SUPPLIERS_WRITE))) return PERM_DENIED;

  const name = formData.name.trim();
  if (!name) return { ok: false, message: "Tedarikçi adı boş olamaz." };

  const defaultLeadDays = formData.defaultLeadDays
    ? parseInt(formData.defaultLeadDays, 10)
    : null;

  const parseDecimal = (v: string) => {
    const n = parseFloat(v.replace(",", "."));
    return isFinite(n) && n > 0 ? n : null;
  };

  const data = {
    name,
    contactName: formData.contactName.trim() || null,
    phone: formData.phone.trim() || null,
    email: formData.email.trim() || null,
    countryOfOrigin: formData.countryOfOrigin.trim() || null,
    paymentTerms: formData.paymentTerms.trim() || null,
    defaultLeadDays: defaultLeadDays && defaultLeadDays > 0 ? defaultLeadDays : null,
    notes: formData.notes.trim() || null,
    isActive: formData.isActive,
    // Phase 32 — supplier-level import defaults
    defaultAirFreightUsdPerKg: parseDecimal(formData.defaultAirFreightUsdPerKg),
    defaultSeaFreightUsdPerKg: parseDecimal(formData.defaultSeaFreightUsdPerKg),
    defaultPaymentFeePct: parseDecimal(formData.defaultPaymentFeePct),
    updatedAt: new Date(),
  };

  try {
    if (id) {
      await prisma.supplier.update({ where: { id }, data });
    } else {
      await prisma.supplier.create({ data });
    }
    revalidatePath("/admin/suppliers");
    return { ok: true };
  } catch {
    return { ok: false, message: "Tedarikçi kaydedilemedi." };
  }
}

export async function deleteSupplierAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.SUPPLIERS_WRITE))) return PERM_DENIED;

  try {
    await prisma.supplier.delete({ where: { id } });
    revalidatePath("/admin/suppliers");
    return { ok: true };
  } catch {
    return { ok: false, message: "Tedarikçi silinemedi." };
  }
}

// ── SupplierProduct link ─────────────────────────────────────────────────────

export async function upsertSupplierProductAction(
  supplierId: string,
  productId: string,
  formData: {
    unitCostUsd: string;
    moq: string;
    leadDays: string;
    isPreferred: boolean;
    notes: string;
  },
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.SUPPLIERS_WRITE))) return PERM_DENIED;

  const unitCostUsd = formData.unitCostUsd ? parseFloat(formData.unitCostUsd) : null;
  const moq = formData.moq ? parseInt(formData.moq, 10) : null;
  const leadDays = formData.leadDays ? parseInt(formData.leadDays, 10) : null;

  const data = {
    unitCostUsd: unitCostUsd && unitCostUsd > 0 ? unitCostUsd : null,
    moq: moq && moq > 0 ? moq : null,
    leadDays: leadDays && leadDays > 0 ? leadDays : null,
    isPreferred: formData.isPreferred,
    notes: formData.notes.trim() || null,
    updatedAt: new Date(),
  };

  try {
    await prisma.supplierProduct.upsert({
      where: { supplierId_productId: { supplierId, productId } },
      create: { supplierId, productId, ...data },
      update: data,
    });
    revalidatePath("/admin/suppliers");
    revalidatePath(`/products/${productId}`);
    return { ok: true };
  } catch {
    return { ok: false, message: "Tedarikçi-ürün bağlantısı kaydedilemedi." };
  }
}

export async function deleteSupplierProductAction(
  supplierId: string,
  productId: string,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.SUPPLIERS_WRITE))) return PERM_DENIED;

  try {
    await prisma.supplierProduct.delete({
      where: { supplierId_productId: { supplierId, productId } },
    });
    revalidatePath("/admin/suppliers");
    revalidatePath(`/products/${productId}`);
    return { ok: true };
  } catch {
    return { ok: false, message: "Bağlantı silinemedi." };
  }
}

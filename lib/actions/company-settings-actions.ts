"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import type { ActionResult } from "@/types/actions";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

const companySettingsSchema = z.object({
  companyName: z.string().min(1).max(200),
  legalName: z.string().min(1).max(300),
  tagline: z.string().max(300),
  salesContact: z.string().max(100),
  website: z.string().max(150),
  email: z.string().email().max(150),
  phone: z.string().min(1).max(50),
  phoneSecondary: z.string().max(50),
  address: z.string().min(1).max(1000),
  perpaAddress: z.string().max(1000),
  city: z.string().max(100),
  district: z.string().max(100),
  country: z.string().max(100),
  taxOffice: z.string().min(1).max(100),
  taxNumber: z.string().min(1).max(50),
  bankName: z.string().min(1).max(150),
  bankIban: z.string().min(1).max(50),
  bankAccountHolder: z.string().min(1).max(300),
  bankAccountType: z.string().max(50),
  paymentTerms: z.string().min(1).max(2000),
  deliveryTerms: z.string().min(1).max(2000),
  warrantyTerms: z.string().min(1).max(2000),
});

export type CompanySettingsInput = z.infer<typeof companySettingsSchema>;

export async function updateCompanySettingsAction(
  values: CompanySettingsInput,
): Promise<ActionResult<keyof CompanySettingsInput>> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.EXECUTIVE_READ))) return PERM_DENIED;

  const parsed = companySettingsSchema.safeParse(values);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Geçersiz değerler.",
      fieldErrors: parsed.error.flatten().fieldErrors as Partial<
        Record<keyof CompanySettingsInput, string[]>
      >,
    };
  }

  try {
    await prisma.companySettings.upsert({
      where: { id: "default" },
      update: parsed.data,
      create: { id: "default", ...parsed.data },
    });
    // PDF generator'lar ve admin sayfası cache'i tazele
    revalidatePath("/admin/company-settings");
    revalidatePath("/api/catalogs", "layout");
    revalidatePath("/quotes", "layout");
    return { ok: true };
  } catch {
    return { ok: false, message: "Kaydedilemedi." };
  }
}

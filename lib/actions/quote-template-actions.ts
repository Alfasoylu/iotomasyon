"use server";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, checkPermission } from "@/lib/auth";
import { PERMISSIONS } from "@/lib/permissions";
import type { ActionResult } from "@/types/actions";

const PERM_DENIED = { ok: false, message: "Bu işlem için yetkiniz yok." } as const;

const templateItemSchema = z.object({
  productId: z.string().optional(),
  description: z.string().trim().min(1, "Açıklama zorunludur.").max(500),
  quantity: z.number().int().min(1).max(9999),
  unitPrice: z.number().nonnegative("Birim fiyat negatif olamaz."),
  currency: z.string().default("TRY"),
  discount: z.number().min(0).max(100).default(0),
  tax: z.number().min(0).max(100).default(20),
  sortOrder: z.number().int().default(0),
});

const templateSchema = z.object({
  name: z.string().trim().min(1, "Şablon adı zorunludur.").max(150),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  paymentTerms: z.string().trim().max(500).optional().or(z.literal("")),
  deliveryTerms: z.string().trim().max(500).optional().or(z.literal("")),
  warrantyTerms: z.string().trim().max(500).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
  currencyMode: z.enum(["TRY", "USD", "BOTH"]).default("TRY"),
  items: z.array(templateItemSchema).min(0),
});

export type QuoteTemplateFormValues = z.infer<typeof templateSchema>;

export async function createQuoteTemplateAction(
  values: QuoteTemplateFormValues,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.QUOTE_TEMPLATES_WRITE))) return PERM_DENIED;

  const parsed = templateSchema.safeParse(values);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Geçersiz form verisi." };

  const d = parsed.data;

  try {
    await prisma.quoteTemplate.create({
      data: {
        id: crypto.randomUUID(),
        name: d.name,
        description: d.description || null,
        paymentTerms: d.paymentTerms || null,
        deliveryTerms: d.deliveryTerms || null,
        warrantyTerms: d.warrantyTerms || null,
        notes: d.notes || null,
        currencyMode: d.currencyMode as "TRY" | "USD" | "BOTH",
        createdById: user.id,
        items: {
          create: d.items.map((item, idx) => ({
            id: crypto.randomUUID(),
            productId: item.productId || null,
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            currency: item.currency,
            discount: item.discount,
            tax: item.tax,
            sortOrder: item.sortOrder ?? idx,
          })),
        },
      },
    });
    return { ok: true };
  } catch (err) {
    console.error("[quote-template-actions] create:", err);
    return { ok: false, message: "Şablon oluşturulamadı." };
  }
}

export async function updateQuoteTemplateAction(
  id: string,
  values: QuoteTemplateFormValues,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.QUOTE_TEMPLATES_WRITE))) return PERM_DENIED;

  const parsed = templateSchema.safeParse(values);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Geçersiz form verisi." };

  const d = parsed.data;

  try {
    // Delete existing items and recreate (simplest safe update)
    await prisma.$transaction([
      prisma.quoteTemplateItem.deleteMany({ where: { templateId: id } }),
      prisma.quoteTemplate.update({
        where: { id },
        data: {
          name: d.name,
          description: d.description || null,
          paymentTerms: d.paymentTerms || null,
          deliveryTerms: d.deliveryTerms || null,
          warrantyTerms: d.warrantyTerms || null,
          notes: d.notes || null,
          currencyMode: d.currencyMode as "TRY" | "USD" | "BOTH",
          updatedAt: new Date(),
          items: {
            create: d.items.map((item, idx) => ({
              id: crypto.randomUUID(),
              productId: item.productId || null,
              description: item.description,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              currency: item.currency,
              discount: item.discount,
              tax: item.tax,
              sortOrder: item.sortOrder ?? idx,
            })),
          },
        },
      }),
    ]);
    return { ok: true };
  } catch (err) {
    console.error("[quote-template-actions] update:", err);
    return { ok: false, message: "Şablon güncellenemedi." };
  }
}

export async function deleteQuoteTemplateAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!(await checkPermission(user, PERMISSIONS.QUOTE_TEMPLATES_WRITE))) return PERM_DENIED;

  try {
    await prisma.quoteTemplate.delete({ where: { id } });
    return { ok: true };
  } catch {
    return { ok: false, message: "Şablon silinemedi." };
  }
}

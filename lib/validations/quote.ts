import { z } from "zod";

export const quoteItemSchema = z.object({
  productId: z.string().trim(),
  description: z.string().trim().min(2, "Kalem aciklamasi gerekli.").max(300),
  quantity: z.number().int().min(1, "Miktar en az 1 olmali."),
  unitPrice: z.string().trim().min(1, "Birim fiyat gerekli."),
  currency: z.string().trim().min(1, "Para birimi gerekli.").max(12),
  discount: z.string().trim().min(1, "Indirim alani gerekli."),
  tax: z.string().trim().min(1, "Vergi alani gerekli."),
});

export const quoteSchema = z.object({
  notes: z.string().trim().max(2000),
  validityDate: z.string().trim().optional(),
  items: z.array(quoteItemSchema).min(1, "En az bir kalem gerekli."),
});

export type QuoteInput = z.infer<typeof quoteSchema>;

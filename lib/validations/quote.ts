import { z } from "zod";

export const quoteItemSchema = z.object({
  productId: z.string().trim(),
  description: z.string().trim().min(2, "Kalem açıklaması gerekli.").max(300),
  quantity: z.number().int().min(1, "Miktar en az 1 olmalı."),
  unitPrice: z.string().trim().min(1, "Birim fiyat gerekli."),
  currency: z.string().trim().min(1, "Para birimi gerekli.").max(12),
  discount: z.string().trim().min(1, "İndirim alanı gerekli."),
  tax: z.string().trim().min(1, "Vergi alanı gerekli."),
});

export const quoteSchema = z.object({
  currencyMode: z.enum(["USD", "TRY", "BOTH"]),
  exchangeRate: z.string().trim(),
  notes: z.string().trim().max(2000),
  validityDate: z.string().trim().optional(),
  paymentTerms: z.string().trim().max(500).optional(),
  deliveryTerms: z.string().trim().max(500).optional(),
  warrantyTerms: z.string().trim().max(500).optional(),
  items: z.array(quoteItemSchema).min(1, "En az bir kalem gerekli."),
});

export type QuoteInput = z.infer<typeof quoteSchema>;

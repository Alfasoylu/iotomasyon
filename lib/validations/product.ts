import { z } from "zod";

export const productSchema = z.object({
  sku: z.string().trim().min(2, "SKU gerekli."),
  name: z.string().trim().min(2, "Urun adi gerekli."),
  category: z.string().trim().max(120),
  brand: z.string().trim().max(120),
  model: z.string().trim().max(120),
  stockQuantity: z.number().int().min(0, "Stok negatif olamaz."),
  minimumStock: z.number().int().min(0, "Minimum stok negatif olamaz."),
  location: z.string().trim().max(120),
  description: z.string().trim().max(2000),
  isActive: z.boolean(),
});

export type ProductInput = z.infer<typeof productSchema>;

import { z } from "zod";

export const productSchema = z.object({
  sku: z.string().trim().min(2, "SKU gerekli."),
  name: z.string().trim().min(2, "Ürün adı gerekli."),
  category: z.string().trim().max(120),
  categoryId: z.string().trim(),
  brand: z.string().trim().max(120),
  model: z.string().trim().max(120),
  stockQuantity: z.number().int().min(0, "Stok negatif olamaz."),
  minimumStock: z.number().int().min(0, "Minimum stok negatif olamaz."),
  location: z.string().trim().max(120),
  description: z.string().trim().max(2000),
  isActive: z.boolean(),
  importDate: z.string().trim(),
  importQuantity: z.string().trim(),
  importUnitCostUsd: z.string().trim(),
  inventoryCountDate: z.string().trim(),
  inventoryCountStock: z.string().trim(),
});

export type ProductInput = z.infer<typeof productSchema>;

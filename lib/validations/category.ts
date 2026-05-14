import { z } from "zod";

export const categorySchema = z.object({
  name: z.string().trim().min(2, "Kategori adi gerekli.").max(120),
  slug: z
    .string()
    .trim()
    .min(2, "Slug gerekli.")
    .max(120)
    .regex(/^[a-z0-9-]+$/, "Slug yalnizca kucuk harf, rakam ve tire icermelidir."),
  description: z.string().trim().max(2000),
  parentId: z.string().trim(),
});

export type CategoryInput = z.infer<typeof categorySchema>;

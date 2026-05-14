import { z } from "zod";

export const createCampaignSchema = z.object({
  productId: z.string().optional(),
  categoryId: z.string().optional(),
  message: z.string().min(1, "Mesaj boş olamaz.").max(4000),
  offerText: z.string().max(500).optional(),
  price: z.string().optional(),
  currency: z.string().default("TRY"),
  selectedCustomerIds: z.array(z.string()).min(1, "En az bir müşteri seçilmelidir."),
  customerPhones: z.record(z.string(), z.string().optional()),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

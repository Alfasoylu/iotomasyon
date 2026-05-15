import { z } from "zod";

import { CUSTOMER_STATUS_OPTIONS, CUSTOMER_TYPE_OPTIONS } from "@/types/customers";

const optionalEmail = z
  .string()
  .trim()
  .max(160)
  .refine((value) => value.length === 0 || z.email().safeParse(value).success, {
    message: "Gecerli bir e-posta girin.",
  });

export const customerSchema = z.object({
  name:      z.string().trim().min(2, "Musteri adi gerekli.").max(160),
  company:   z.string().trim().max(160),
  phone:     z.string().trim().max(40),
  whatsapp:  z.string().trim().max(40),
  email:     optionalEmail,
  taxNumber: z.string().trim().max(40),
  address:   z.string().trim().max(1000),
  city:      z.string().trim().max(120),
  district:  z.string().trim().max(120),
  notes:     z.string().trim().max(2000),
  status:                z.enum(CUSTOMER_STATUS_OPTIONS),
  source:                z.string().trim().max(80),
  ownedById:             z.string().trim().max(40),
  customerType:          z.string().trim().max(40),
  monthlySalesPotential: z.string().trim().max(20),
  platformNotes:         z.string().trim().max(2000),
});

export type CustomerInput = z.infer<typeof customerSchema>;

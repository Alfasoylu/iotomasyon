import { z } from "zod";

/** PDKS personel formu — tenant-admin paneli. */
export const personnelSchema = z.object({
  fullName: z.string().trim().min(2, "Ad soyad gerekli.").max(120),
  phone: z
    .string()
    .trim()
    .min(10, "Geçerli bir telefon girin.")
    .max(20, "Telefon çok uzun."),
  // "08:30" — boş bırakılabilir (hatırlatma istenmeyen personel).
  expectedCheckIn: z
    .string()
    .trim()
    .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "Saat HH:MM biçiminde olmalı.")
    .or(z.literal("")),
});

export type PersonnelInput = z.infer<typeof personnelSchema>;

/** PDKS şantiye formu (Step 9c). */
export const worksiteSchema = z.object({
  name: z.string().trim().min(2, "Şantiye adı gerekli.").max(120),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radiusMeters: z.coerce.number().int().min(20, "En az 20 m.").max(5000, "En fazla 5000 m."),
  // Kabul edilen azami GPS doğruluğu. Boş bırakılırsa 100 m varsayılır.
  maxAccuracyMeters: z.coerce
    .number()
    .int()
    .min(20, "En az 20 m.")
    .max(1000, "En fazla 1000 m.")
    .default(100),
});

export type WorksiteInput = z.infer<typeof worksiteSchema>;

"use server";

import { z } from "zod";

import { createTenantWithDefaults, SLUG_RE } from "@/lib/pdks/tenant-provision";

export type RegisterResult =
  | { ok: true; slug: string }
  | { ok: false; message: string; field?: string };

const schema = z.object({
  companyName: z.string().trim().min(2, "Şirket adı en az 2 karakter olmalı."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(SLUG_RE, "Kullanıcı adı 3-30 karakter; küçük harf, rakam ve tire olabilir."),
  adminFullName: z.string().trim().min(2, "Ad soyad gerekli."),
  adminPhone: z.string().trim().min(10, "Geçerli bir telefon girin."),
  ownerEmail: z.string().trim().email("Geçerli bir e-posta girin.").optional().or(z.literal("")),
  password: z.string().min(6, "Şifre en az 6 karakter olmalı."),
});

/**
 * Self-servis tenant kaydı. Başarılıysa tenant + tenant-admin + 30 gün deneme
 * + varsayılan program/tatiller oluşturulur; çağıran `slug`'a yönlendirir.
 */
export async function registerTenantAction(input: {
  companyName: string;
  slug: string;
  adminFullName: string;
  adminPhone: string;
  ownerEmail?: string;
  password: string;
}): Promise<RegisterResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, message: first.message, field: String(first.path[0] ?? "") };
  }

  const data = parsed.data;
  const result = await createTenantWithDefaults({
    companyName: data.companyName,
    slug: data.slug,
    adminFullName: data.adminFullName,
    adminPhone: data.adminPhone,
    password: data.password,
    ownerEmail: data.ownerEmail || null,
  });

  if (!result.ok) {
    if (result.reason === "slug_taken") {
      return { ok: false, message: "Bu kullanıcı adı alınmış, başka bir tane deneyin.", field: "slug" };
    }
    return { ok: false, message: "Kullanıcı adı geçersiz.", field: "slug" };
  }

  return { ok: true, slug: result.slug };
}

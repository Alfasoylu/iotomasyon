"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { createTenantWithDefaults, SLUG_RE } from "@/lib/pdks/tenant-provision";
import { pdksRegisterLimiter } from "@/lib/pdks/rate-limit";
import { formatRetryAfter } from "@/lib/rate-limit";
import { captchaErrorMessage, verifyCaptchaAnswer } from "@/lib/captcha";
import { isTurnstileEnabled, verifyTurnstileToken } from "@/lib/turnstile";

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
  // Tenant-admin şifresi: tüm şirket verisine erişir → en az 8 karakter.
  password: z.string().min(8, "Şifre en az 8 karakter olmalı.").max(64, "Şifre çok uzun."),
  captchaToken: z.string().max(2048).optional(),
  captchaAnswer: z.string().max(16).optional(),
});

async function getClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Self-servis tenant kaydı. Başarılıysa tenant + tenant-admin + 30 gün deneme
 * + varsayılan program/tatiller oluşturulur; çağıran `slug`'a yönlendirir.
 *
 * Koruma: IP başına saatte 5 kayıt denemesi (şemayı geçen istekler sayılır) +
 * Turnstile CAPTCHA (yalnız anahtarlar tanımlıysa; sayfa `captchaSiteKey`'i
 * o zaman iletir). Token tek kullanımlık; istemci her başarısız denemede widget'ı sıfırlar.
 */
export async function registerTenantAction(input: {
  companyName: string;
  slug: string;
  adminFullName: string;
  adminPhone: string;
  ownerEmail?: string;
  password: string;
  captchaToken?: string;
  captchaAnswer?: string;
}): Promise<RegisterResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, message: first.message, field: String(first.path[0] ?? "") };
  }

  const ip = await getClientIp();

  // 1) Kötüye kullanım sınırı — DB'ye dokunmadan önce.
  const limit = pdksRegisterLimiter.check(ip);
  if (!limit.allowed) {
    return {
      ok: false,
      message: `Çok fazla kayıt denemesi. ${formatRetryAfter(limit.retryAfterSec)} sonra tekrar deneyin.`,
    };
  }
  pdksRegisterLimiter.record(ip);

  // 2) CAPTCHA — Turnstile anahtarları varsa o, yoksa yerleşik resim CAPTCHA'sı (her zaman).
  if (!isTurnstileEnabled()) {
    const captcha = verifyCaptchaAnswer(parsed.data.captchaToken, parsed.data.captchaAnswer);
    if (!captcha.ok) {
      return { ok: false, field: "captchaAnswer", message: captchaErrorMessage(captcha.reason) };
    }
  } else {
    const captcha = await verifyTurnstileToken(parsed.data.captchaToken, ip === "unknown" ? null : ip);
    if (!captcha.ok) {
      return {
        ok: false,
        field: "captchaToken",
        message:
          captcha.reason === "missing-token"
            ? "Lütfen robot olmadığınızı doğrulayın."
            : captcha.reason === "network"
              ? "Doğrulama servisine ulaşılamadı. Lütfen tekrar deneyin."
              : "Doğrulama başarısız. Lütfen tekrar deneyin.",
      };
    }
  }

  const data = parsed.data;
  let result;
  try {
    result = await createTenantWithDefaults({
      companyName: data.companyName,
      slug: data.slug,
      adminFullName: data.adminFullName,
      adminPhone: data.adminPhone,
      password: data.password,
      ownerEmail: data.ownerEmail || null,
    });
  } catch (e) {
    // Beklenmeyen DB hatası (ör. migration henüz uygulanmadıysa kolon eksikliği,
    // yarış durumunda slug çakışması). Kullanıcıya 500 yerine nazik mesaj.
    console.error("registerTenantAction failed:", e);
    return { ok: false, message: "Kayıt şu an tamamlanamadı, lütfen birazdan tekrar deneyin." };
  }

  if (!result.ok) {
    if (result.reason === "slug_taken") {
      return { ok: false, message: "Bu kullanıcı adı alınmış, başka bir tane deneyin.", field: "slug" };
    }
    return { ok: false, message: "Kullanıcı adı geçersiz.", field: "slug" };
  }

  return { ok: true, slug: result.slug };
}

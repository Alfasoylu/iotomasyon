"use server";

import { headers } from "next/headers";

import type { ActionResult } from "@/types/actions";
import { authenticateWithPassword, clearUserSession, createUserSession } from "@/lib/auth";
import {
  checkLoginRateLimit,
  recordLoginFailure,
  recordLoginSuccess,
} from "@/lib/login-rate-limit";
import { captchaErrorMessage, verifyCaptchaAnswer } from "@/lib/captcha";
import { isTurnstileEnabled, verifyTurnstileToken } from "@/lib/turnstile";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";

async function getClientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return h.get("x-real-ip")?.trim() || "unknown";
}

function formatRetry(sec: number) {
  const min = Math.ceil(sec / 60);
  return min > 1 ? `${min} dakika` : `${sec} saniye`;
}

export async function loginAction(values: LoginInput): Promise<ActionResult<keyof LoginInput>> {
  const parsed = loginSchema.safeParse(values);

  if (!parsed.success) {
    return {
      ok: false,
      message: "Form alanlarını kontrol edin.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const { email, password, captchaToken, captchaAnswer } = parsed.data;
  const ip = await getClientIp();

  // 1) Brute-force sınırı — şifre karşılaştırmasından ÖNCE, bcrypt maliyetini de korur.
  const limit = checkLoginRateLimit(ip, email);
  if (!limit.allowed) {
    return {
      ok: false,
      message: `Çok fazla başarısız deneme. ${formatRetry(limit.retryAfterSec)} sonra tekrar deneyin.`,
    };
  }

  // 2) CAPTCHA — Turnstile anahtarları varsa o, yoksa yerleşik resim CAPTCHA'sı (her zaman).
  if (!isTurnstileEnabled()) {
    const captcha = verifyCaptchaAnswer(captchaToken, captchaAnswer);
    if (!captcha.ok) {
      recordLoginFailure(ip, email);
      return {
        ok: false,
        message: captchaErrorMessage(captcha.reason),
        fieldErrors: { captchaAnswer: ["captcha"] },
      };
    }
  } else {
    const captcha = await verifyTurnstileToken(captchaToken, ip === "unknown" ? null : ip);

    if (!captcha.ok) {
      recordLoginFailure(ip, email);
      return {
        ok: false,
        message:
          captcha.reason === "missing-token"
            ? "Lütfen robot olmadığınızı doğrulayın."
            : captcha.reason === "network"
              ? "Doğrulama servisine ulaşılamadı. Lütfen tekrar deneyin."
              : "Doğrulama başarısız. Lütfen tekrar deneyin.",
        fieldErrors: { captchaToken: ["captcha"] },
      };
    }
  }

  // 3) Şifre.
  const user = await authenticateWithPassword(email, password);

  if (!user) {
    recordLoginFailure(ip, email);
    return {
      ok: false,
      message: "E-posta veya şifre hatalı.",
      // CAPTCHA token'ı tek kullanımlık — istemci widget'ı sıfırlasın.
      fieldErrors: { captchaToken: ["reset"] },
    };
  }

  recordLoginSuccess(email);

  await createUserSession({
    userId: user.id,
    email: user.email,
    role: user.role as string,
  });

  return {
    ok: true,
    redirectTo: "/dashboard",
  };
}

export async function logoutAction() {
  await clearUserSession();
}

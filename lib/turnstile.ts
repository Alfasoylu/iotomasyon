import "server-only";

import { getTurnstileSecretKey, getTurnstileSiteKey } from "@/lib/env";

/**
 * Cloudflare Turnstile — /login sayfası CAPTCHA'sı.
 *
 * OPSİYONEL: NEXT_PUBLIC_TURNSTILE_SITE_KEY + TURNSTILE_SECRET_KEY env'leri.
 * İkisi de tanımlıysa widget render edilir ve sunucu tarafında token doğrulanır.
 * Tanımlı değilse varsayılan olan yerleşik resim CAPTCHA'sı (lib/captcha.ts) kullanılır.
 *
 * Geliştirme için Cloudflare test anahtarları (.env.example'a bakın) her zaman
 * geçer; gerçek anahtarlar https://dash.cloudflare.com → Turnstile'dan alınır.
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function isTurnstileEnabled(): boolean {
  // Anahtar yoksa formlar yerleşik resim CAPTCHA'sına (lib/captcha.ts) düşer.
  return Boolean(getTurnstileSiteKey() && getTurnstileSecretKey());
}

export type TurnstileResult =
  | { ok: true }
  | { ok: false; reason: "missing-token" | "invalid" | "network" };

type SiteVerifyResponse = {
  success: boolean;
  "error-codes"?: string[];
  hostname?: string;
  action?: string;
};

/**
 * Token'ı Cloudflare'a doğrulatır. Token tek kullanımlıktır — doğrulama sonrası
 * istemci widget'ı sıfırlamalıdır. Ağ hatasında kapalı davranır (fail-closed):
 * CAPTCHA açıksa doğrulanamayan giriş reddedilir.
 */
export async function verifyTurnstileToken(
  token: string | undefined,
  remoteIp: string | null,
): Promise<TurnstileResult> {
  const secret = getTurnstileSecretKey();

  if (!secret) {
    return { ok: true };
  }

  if (!token || token.length === 0 || token.length > 2048) {
    return { ok: false, reason: "missing-token" };
  }

  const body = new URLSearchParams({ secret, response: token });
  if (remoteIp) {
    body.set("remoteip", remoteIp);
  }

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) {
      console.error("[turnstile] siteverify HTTP", res.status);
      return { ok: false, reason: "network" };
    }

    const data = (await res.json()) as SiteVerifyResponse;

    if (!data.success) {
      console.warn("[turnstile] doğrulama başarısız:", data["error-codes"] ?? []);
      return { ok: false, reason: "invalid" };
    }

    return { ok: true };
  } catch (error) {
    console.error("[turnstile] siteverify hatası:", error);
    return { ok: false, reason: "network" };
  }
}

import "server-only";

import { createRateLimiter, type RateLimitDecision } from "@/lib/rate-limit";

/**
 * /login için brute-force sınırlayıcı (bellek içi, sabit pencere).
 *
 * İki anahtar birlikte izlenir:
 *   - IP başına   : 15 dakikada en fazla 20 başarısız deneme
 *   - e-posta başına: 15 dakikada en fazla 5 başarısız deneme (hesap kilidi değil,
 *                    yalnız geçici bekletme — başarılı girişte sayaç sıfırlanır)
 *
 * Uygulama `lib/rate-limit.ts` fabrikasına devredildi; bu modül yalnız CRM
 * login'e özgü sabitleri ve geriye dönük dışa aktarımları taşır. Sınırlar ve
 * bellek/örnek notları için oraya bakın.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_PER_IP = 20;
const MAX_PER_EMAIL = 5;

const limiter = createRateLimiter({
  prefix: "crm-login",
  windowMs: WINDOW_MS,
  maxPerIp: MAX_PER_IP,
  maxPerKey: MAX_PER_EMAIL,
  normalizeKey: (email) => email.trim().toLowerCase(),
});

export type { RateLimitDecision };

/** Deneme öncesi çağrılır. Sınır aşıldıysa kalan bekleme süresini döner. */
export function checkLoginRateLimit(ip: string, email: string): RateLimitDecision {
  return limiter.check(ip, email);
}

/** Başarısız (yanlış şifre / CAPTCHA) denemeden sonra çağrılır. */
export function recordLoginFailure(ip: string, email: string) {
  limiter.record(ip, email);
}

/** Başarılı girişte e-posta sayacı sıfırlanır; IP sayacı korunur. */
export function recordLoginSuccess(email: string) {
  limiter.clear(email);
}

/** Yalnız testler için. */
export function _resetLoginRateLimitForTests() {
  limiter.reset();
}

export const LOGIN_RATE_LIMIT = { WINDOW_MS, MAX_PER_IP, MAX_PER_EMAIL } as const;

import "server-only";

import { createRateLimiter } from "@/lib/rate-limit";

/**
 * PDKS brute-force / kötüye kullanım sınırlayıcıları (bellek içi).
 *
 * - `pdksLoginLimiter` — /api/pdks/auth/login: telefon başına 15 dk'da 5,
 *   IP başına 15 dk'da 20 başarısız deneme. Başarılı girişte telefon sayacı
 *   sıfırlanır. bcrypt ve DB sorgusundan ÖNCE kontrol edilir.
 * - `pdksRegisterLimiter` — /kayit self-servis tenant kaydı: IP başına saatte 5
 *   kayıt denemesi (şema doğrulamasını geçen her istek sayılır; başarılı kayıtlar
 *   dahil). Yalnız IP anahtarı kullanılır.
 *
 * Telefon anahtarı çağıran tarafından `normalizePhone` ile kanonikleştirilmiş
 * olmalıdır (aynı numaranın farklı yazımları tek sayaçta toplansın).
 */

export const PDKS_LOGIN_RATE_LIMIT = {
  WINDOW_MS: 15 * 60 * 1000,
  MAX_PER_IP: 20,
  MAX_PER_PHONE: 5,
} as const;

export const pdksLoginLimiter = createRateLimiter({
  prefix: "pdks-login",
  windowMs: PDKS_LOGIN_RATE_LIMIT.WINDOW_MS,
  maxPerIp: PDKS_LOGIN_RATE_LIMIT.MAX_PER_IP,
  maxPerKey: PDKS_LOGIN_RATE_LIMIT.MAX_PER_PHONE,
});

export const PDKS_REGISTER_RATE_LIMIT = {
  WINDOW_MS: 60 * 60 * 1000,
  MAX_PER_IP: 5,
} as const;

export const pdksRegisterLimiter = createRateLimiter({
  prefix: "pdks-register",
  windowMs: PDKS_REGISTER_RATE_LIMIT.WINDOW_MS,
  maxPerIp: PDKS_REGISTER_RATE_LIMIT.MAX_PER_IP,
  // Yalnız IP izlenir; anahtar verilmez.
  maxPerKey: Number.MAX_SAFE_INTEGER,
});

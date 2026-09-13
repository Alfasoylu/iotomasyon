import "server-only";

/**
 * Genel amaçlı bellek içi sabit-pencere sınırlayıcı (fabrika).
 *
 * İki anahtar birlikte izlenir:
 *   - IP başına        : `maxPerIp`  deneme / `windowMs`
 *   - hesap/anahtar başına: `maxPerKey` deneme / `windowMs` (hesap kilidi değil,
 *                        geçici bekletme — `clear(key)` ile sıfırlanır)
 *
 * Kullanım: `lib/login-rate-limit.ts` (CRM /login), `lib/pdks/rate-limit.ts`
 * (PDKS personel girişi + /kayit). Her çağıran KENDİ örneğini oluşturur; sayaçlar
 * örnekler arasında paylaşılmaz (ön ek ile de ayrışır).
 *
 * NOT: Vercel Fluid Compute örnekleri istekler arasında paylaşıldığı için sayaçlar
 * büyük ölçüde korunur, ancak örnekler arası paylaşım YOKTUR. Bu katman
 * CAPTCHA'nın (lib/turnstile.ts) yedeğidir, tek başına yeterli sayılmamalıdır.
 * Kalıcı sınırlama istenirse sayaçlar DB/KV'ye taşınmalıdır.
 */

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSec: number };

export type RateLimiterOptions = {
  /** Pencere süresi (ms). */
  windowMs: number;
  /** IP başına pencere içinde izin verilen deneme sayısı. */
  maxPerIp: number;
  /** Anahtar (e-posta/telefon/…) başına izin verilen deneme sayısı. */
  maxPerKey: number;
  /** Bellek tavanı — aşılırsa en eski kayıtlar atılır. */
  maxEntries?: number;
  /** Anahtar kanonikleştirme (ör. e-posta küçük harf). Varsayılan: trim. */
  normalizeKey?: (key: string) => string;
  /** Aynı süreçte birden çok limiter'ın Map anahtarları çakışmasın diye ön ek. */
  prefix?: string;
};

export type RateLimiter = {
  /** Deneme ÖNCESİ çağrılır. Sınır aşıldıysa kalan bekleme süresini döner. */
  check(ip: string, key?: string): RateLimitDecision;
  /** Sayılacak deneme (başarısız giriş, kayıt isteği vb.) SONRASI çağrılır. */
  record(ip: string, key?: string): void;
  /** Anahtar sayacını sıfırlar (ör. başarılı giriş); IP sayacı korunur. */
  clear(key: string): void;
  /** Yalnız testler için: tüm sayaçları temizler. */
  reset(): void;
  readonly config: Readonly<{ windowMs: number; maxPerIp: number; maxPerKey: number }>;
};

type Bucket = { count: number; resetAt: number };

export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const { windowMs, maxPerIp, maxPerKey } = opts;
  const maxEntries = opts.maxEntries ?? 10_000;
  const normalizeKey = opts.normalizeKey ?? ((k: string) => k.trim());
  const prefix = opts.prefix ? `${opts.prefix}:` : "";

  const buckets = new Map<string, Bucket>();

  const now = () => Date.now();
  const ipKey = (ip: string) => `${prefix}ip:${ip.trim()}`;
  const keyKey = (key: string) => `${prefix}key:${normalizeKey(key)}`;

  function getBucket(k: string): Bucket | undefined {
    const bucket = buckets.get(k);
    if (!bucket) return undefined;
    if (bucket.resetAt <= now()) {
      buckets.delete(k);
      return undefined;
    }
    return bucket;
  }

  function bump(k: string) {
    const current = getBucket(k);
    if (current) {
      current.count += 1;
      return;
    }
    if (buckets.size >= maxEntries) {
      // Map ekleme sırasını korur → ilk anahtar en eskidir.
      const oldest = buckets.keys().next().value;
      if (oldest !== undefined) buckets.delete(oldest);
    }
    buckets.set(k, { count: 1, resetAt: now() + windowMs });
  }

  return {
    check(ip, key) {
      const ipBucket = getBucket(ipKey(ip));
      const keyBucket = key ? getBucket(keyKey(key)) : undefined;

      const blockedBy =
        ipBucket && ipBucket.count >= maxPerIp
          ? ipBucket
          : keyBucket && keyBucket.count >= maxPerKey
            ? keyBucket
            : null;

      if (!blockedBy) return { allowed: true };
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((blockedBy.resetAt - now()) / 1000)),
      };
    },
    record(ip, key) {
      bump(ipKey(ip));
      if (key) bump(keyKey(key));
    },
    clear(key) {
      buckets.delete(keyKey(key));
    },
    reset() {
      buckets.clear();
    },
    config: { windowMs, maxPerIp, maxPerKey },
  };
}

/** "Çok fazla deneme" mesajları için kalan süreyi Türkçe biçimler. */
export function formatRetryAfter(sec: number): string {
  const min = Math.ceil(sec / 60);
  return min > 1 ? `${min} dakika` : `${sec} saniye`;
}

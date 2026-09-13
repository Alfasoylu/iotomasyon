/**
 * Meta webhook imza doğrulaması — bağımlılıksız, saf `node:crypto`.
 *
 * NEDEN AYRI DOSYA: Doğrulama route dosyasının içindeydi; route `@/lib/prisma`
 * üzerinden `server-only`'yi çekiyor ve dosya Next sunucu bağlamı dışında
 * import edilemiyor. Yani imza mantığı `npx tsx` ile TEST EDİLEMİYORDU —
 * güvenliğin tek kritik noktası testsiz kalıyordu. Burada Prisma/Next yok.
 */

import crypto from "node:crypto";

/**
 * Gövdenin App Secret ile üretilmiş HMAC-SHA256 imzasını doğrular.
 *
 * `raw` HAM gövde olmalı: JSON.parse sonrası yeniden serialize edilmiş metin
 * byte düzeyinde farklıdır ve imza tutmaz.
 *
 * `timingSafeEqual` kullanılır — düz `===` karşılaştırması zamanlama
 * sızıntısına açıktır.
 */
export function signatureValid(
  raw: string,
  header: string | null,
  secret: string
): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", secret).update(raw, "utf8").digest("hex");
  const got = header.slice("sha256=".length);
  // Uzunluk farkliysa timingSafeEqual FIRLATIR; once esitligi garantile,
  // yoksa bozuk imzali her istek 500 doner ve Meta saatlerce yeniden dener.
  if (got.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(got, "hex"), Buffer.from(expected, "hex"));
}

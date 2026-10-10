// Görselin gerçek türü (magic byte) — public bucket'a yalnız JPEG/PNG/WebP/GIF; SVG ve diğer her tür reddedilir.
// Ortak: lib/actions/product-image-actions.ts, lib/actions/olu-stok-actions.ts.
export type DetectedImage = { mime: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; ext: "jpg" | "png" | "webp" | "gif" };

/**
 * Dosyanın gerçek türünü magic byte'lardan tespit eder. SVG ve diğer her tür
 * reddedilir (public bucket'ta script içeren SVG barındırmamak için).
 *
 *   JPEG : FF D8 FF
 *   PNG  : 89 50 4E 47
 *   WebP : "RIFF" .... "WEBP"
 *   GIF  : "GIF8"
 */
export function detectImageType(buf: Buffer): DetectedImage | null {
  if (buf.length < 12) return null;

  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { mime: "image/jpeg", ext: "jpg" };
  }
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { mime: "image/png", ext: "png" };
  }
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return { mime: "image/webp", ext: "webp" };
  }
  if (buf.toString("ascii", 0, 4) === "GIF8") {
    return { mime: "image/gif", ext: "gif" };
  }
  return null;
}

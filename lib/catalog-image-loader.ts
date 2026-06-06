import "server-only";

import sharp from "sharp";
import type { PDFDocument, PDFImage } from "pdf-lib";

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 5 * 1024 * 1024; // 5MB cap per source image
const CONCURRENCY = 6;

/**
 * Catalog PDF görsel hedef boyutu.
 *
 * Slot ~80×80px PDF'te. Yazdırma + retina için 2.5x = 200px yeterli.
 * Sharp ile JPEG q=72 çıktı tipik 8-15 KB / görsel.
 *
 * 60 ürünlü katalog × 12KB = ~720KB toplam görsel — eski "orijinal embed"
 * yaklaşımında 60 × 500KB+ = 30MB+ idi. WhatsApp limit 100MB ama paylaşım
 * kullanılabilirliği için <5MB hedefliyoruz.
 */
const PDF_IMAGE_MAX_PX = 280;
const PDF_JPEG_QUALITY = 72;

async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "iotomasyon-catalog/1.0" },
    });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > MAX_BYTES) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return null;
    return new Uint8Array(buf);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Sharp ile resize + JPEG compress.
 *  - PNG → JPEG (transparency catalog'da gerekmez)
 *  - max 280px (en uzun kenar)
 *  - quality 72, progressive, mozjpeg
 *  - flatten white background (PNG transparency için)
 *  - chrome-subsampling 4:2:0 (default, sharp halleder)
 */
async function compressForPdf(bytes: Uint8Array): Promise<Uint8Array | null> {
  try {
    const out = await sharp(Buffer.from(bytes), { failOn: "none" })
      .rotate() // EXIF orientation
      .resize(PDF_IMAGE_MAX_PX, PDF_IMAGE_MAX_PX, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .jpeg({
        quality: PDF_JPEG_QUALITY,
        progressive: true,
        mozjpeg: true,
      })
      .toBuffer();
    return new Uint8Array(out);
  } catch {
    return null;
  }
}

async function embedOne(pdf: PDFDocument, url: string): Promise<PDFImage | null> {
  const sourceBytes = await fetchImageBytes(url);
  if (!sourceBytes) return null;
  const compressed = await compressForPdf(sourceBytes);
  if (!compressed) return null;
  try {
    return await pdf.embedJpg(compressed);
  } catch {
    return null;
  }
}

/**
 * Fetches, compresses (sharp resize+JPEG) and embeds all unique image URLs
 * into the given PDF document. Returns a Map<url, PDFImage|null> for lookup
 * during page rendering.
 *
 * Failed/timed-out fetches map to null so the renderer can fall back to a
 * placeholder block.
 */
export async function loadCatalogImages(
  pdf: PDFDocument,
  urls: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, PDFImage | null>> {
  const unique = Array.from(new Set(urls.filter((u): u is string => !!u)));
  const cache = new Map<string, PDFImage | null>();
  let idx = 0;

  async function worker() {
    while (idx < unique.length) {
      const i = idx++;
      const url = unique[i];
      const img = await embedOne(pdf, url);
      cache.set(url, img);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, unique.length) }, worker));
  return cache;
}

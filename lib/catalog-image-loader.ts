import "server-only";

import type { PDFDocument, PDFImage } from "pdf-lib";

const FETCH_TIMEOUT_MS = 5000;
const MAX_BYTES = 5 * 1024 * 1024; // 5MB cap per image
const CONCURRENCY = 6;

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

function detectType(bytes: Uint8Array): "jpg" | "png" | null {
  if (bytes.length < 4) return null;
  // PNG signature: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "png";
  }
  // JPEG signature: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpg";
  }
  return null;
}

async function embedOne(pdf: PDFDocument, url: string): Promise<PDFImage | null> {
  const bytes = await fetchImageBytes(url);
  if (!bytes) return null;
  const type = detectType(bytes);
  if (!type) return null;
  try {
    return type === "jpg" ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
  } catch {
    return null;
  }
}

/**
 * Fetches and embeds all unique image URLs into the given PDF document,
 * returning a Map<url, PDFImage|null> for lookup during page rendering.
 * Failed/timed-out fetches map to null so the renderer can fall back to a placeholder.
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

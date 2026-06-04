import "server-only";

import QRCode from "qrcode";
import type { PDFDocument, PDFImage } from "pdf-lib";

/**
 * Faz 3 — QR kod üretimi
 *
 * Müşteri telefonla taradığında dijital quote sayfasına gider.
 * Public quote sayfası henüz yok — şimdilik linki göster, Faz 2'de
 * (sonraki ürün döngüsünde) gerçek sayfa eklenecek.
 *
 * QR kod parametreleri:
 *   - width: 240 px (yüksek çözünürlük — küçük boyutta yazdırıldığında
 *     bile telefon taraması başarılı)
 *   - errorCorrectionLevel: "M" (logoya yer açmak için %15 hata düzeltimi)
 *   - margin: 1 modül
 *   - color: koyu kare = ink, açık zemin = paper
 */

export interface QrEmbedOptions {
  url: string;
  size?: number; // default 240px
}

/**
 * QR kodu PNG olarak üretir, PDF document'a embed eder, PDFImage döner.
 */
export async function embedQrCode(
  pdf: PDFDocument,
  options: QrEmbedOptions,
): Promise<PDFImage | null> {
  const { url, size = 240 } = options;
  if (!url.trim()) return null;

  try {
    const buffer = await QRCode.toBuffer(url, {
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
      color: {
        dark: "#111111", // ink
        light: "#ffffff", // paper
      },
    });
    return await pdf.embedPng(buffer);
  } catch {
    return null;
  }
}

/**
 * Quote için public preview URL'i üretir.
 * Faz 5'te public quote sayfası eklendiğinde token-based path olacak.
 */
export function quotePublicUrl(quoteNumber: string, baseUrl?: string): string {
  const base = baseUrl ?? "https://iotomasyon.com";
  return `${base}/q/${encodeURIComponent(quoteNumber)}`;
}

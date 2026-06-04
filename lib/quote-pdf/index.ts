import "server-only";

import { createQuotePdfDocument } from "./document";
import { renderContentPages } from "./layout/content-pages";
import { renderCoverPage } from "./layout/cover-page";
import type { QuotePdfOptions } from "./types";

export type { QuotePdfData, QuotePdfItem, QuotePdfCustomer, QuotePdfOptions } from "./types";

/**
 * Quote PDF generator public API.
 *
 * Faz 3 — Cover sayfası + content pages ayrıştırıldı.
 *
 *   Page 1: Cover (logo, brand mark, "Fiyat Teklifi" H1, müşteri kartı,
 *           opsiyonel ön söz, QR kod + KAPSAM + GEÇERLİLİK stat'ları)
 *   Page 2+: Content (items table, totals, terms, bank info, sticky chrome)
 *
 * Faz 4'te:
 *   - Genel Toplam'ın sol şeridi accent yellow olacak (Faz 3 ink)
 *   - Acceptance section + imza alanı eklenecek
 *   - Sayfa numarası "Sayfa X / Y" (iki geçişli render)
 */
export async function buildQuotePdf(options: QuotePdfOptions): Promise<Uint8Array> {
  const { pdf, fonts, logo } = await createQuotePdfDocument();

  await renderCoverPage({ pdf, fonts, logo, quote: options.quote });
  renderContentPages({ pdf, fonts, logo, quote: options.quote });

  return pdf.save();
}

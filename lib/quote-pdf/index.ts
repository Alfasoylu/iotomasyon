import "server-only";

import { createQuotePdfDocument } from "./document";
import { renderContentPages } from "./layout/content-pages";
import { renderCoverPage } from "./layout/cover-page";
import { stampPageNumbers } from "./primitives/page-numbers";
import type { QuotePdfOptions } from "./types";

export type { QuotePdfData, QuotePdfItem, QuotePdfCustomer, QuotePdfOptions } from "./types";

/**
 * Quote PDF generator public API.
 *
 * Faz 4 — Cover + content pages + iki-geçişli sayfa numaralandırma + acceptance.
 *
 *   Page 1: Cover (logo, brand mark, "Fiyat Teklifi" H1, müşteri kartı,
 *           opsiyonel ön söz, QR kod + KAPSAM + GEÇERLİLİK stat'ları)
 *   Page 2+: Content (items table, totals, terms, bank info, acceptance,
 *           sticky chrome, "Sayfa X / Y" footer)
 *
 * Render sırası:
 *   1. Document setup (font, logo)
 *   2. Cover page
 *   3. Content pages (items + totals + terms + bank + acceptance)
 *   4. Stamp page numbers (iki-geçişli — total page count bilindikten sonra)
 */
export async function buildQuotePdf(options: QuotePdfOptions): Promise<Uint8Array> {
  const { pdf, fonts, logo } = await createQuotePdfDocument();
  const { quote } = options;

  // PDF metadata — PDF viewer'lar başlık çubuğunda gösterir, arama motoru indexler
  pdf.setTitle(`Fiyat Teklifi ${quote.quoteNumber} — ${quote.customer.company ?? quote.customer.name}`);
  pdf.setAuthor("Alfa Soylu Elektronik");
  pdf.setSubject(`B2B Fiyat Teklifi — ${quote.items.length} kalem`);
  pdf.setKeywords([
    "fiyat teklifi",
    "alfa soylu",
    "soylu elektronik",
    quote.quoteNumber,
    "güvenlik kamerası",
    "elektronik sistemler",
  ]);
  pdf.setProducer("iotomasyon CRM — quote-pdf v2");
  pdf.setCreator("iotomasyon CRM");
  pdf.setCreationDate(quote.createdAt);
  pdf.setModificationDate(quote.createdAt);

  await renderCoverPage({ pdf, fonts, logo, quote });
  renderContentPages({ pdf, fonts, logo, quote });

  // İki-geçiş — tüm sayfalar çizildikten sonra "Sayfa X / Y" stamp
  stampPageNumbers(pdf, fonts);

  return pdf.save();
}

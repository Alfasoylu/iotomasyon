import "server-only";

import { createQuotePdfDocument } from "./document";
import { renderCurrentLayout } from "./layout/current-layout";
import type { QuotePdfOptions } from "./types";

export type { QuotePdfData, QuotePdfItem, QuotePdfCustomer, QuotePdfOptions } from "./types";

/**
 * Quote PDF generator public API.
 *
 * Faz 2 — Modüler yapı + Geist Sans/Mono fontlar + yeni neutral palet.
 *         Layout yapısı aynı (Faz 1'le birebir), sadece tipografi ve renkler değişti.
 *
 * Faz 3-4'te bu fonksiyon yeni cover/items/totals layout'larını çağıracak.
 */
export async function buildQuotePdf(options: QuotePdfOptions): Promise<Uint8Array> {
  const { pdf, fonts, logo } = await createQuotePdfDocument();

  renderCurrentLayout({ pdf, fonts, logo, quote: options.quote });

  return pdf.save();
}

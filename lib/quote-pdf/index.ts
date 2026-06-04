import "server-only";

import { createQuotePdfDocument } from "./document";
import { renderCurrentLayout } from "./layout/current-layout";
import type { QuotePdfOptions } from "./types";

export type { QuotePdfData, QuotePdfItem, QuotePdfCustomer, QuotePdfOptions } from "./types";

/**
 * Quote PDF generator public API.
 *
 * Faz 1 — Modüler yapı + mevcut görsel layout (görsel değişiklik yok).
 * Faz 2-4'te bu fonksiyon yeni cover/items/totals layout'larını çağıracak.
 *
 * Çağıran tarafın sorumluluğu: auth, permission check, quote fetch.
 * Bu fonksiyon saf: input → Uint8Array PDF bytes.
 */
export async function buildQuotePdf(options: QuotePdfOptions): Promise<Uint8Array> {
  const { pdf, font, logo } = await createQuotePdfDocument();

  renderCurrentLayout({ pdf, font, logo, quote: options.quote });

  return pdf.save();
}

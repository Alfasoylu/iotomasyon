import "server-only";

import type { QuotePdfData } from "./types";

/**
 * Faz 1 — Para birimi format helper'ları
 *
 * Mevcut route.ts'teki `pdfAmt` ve `pdfLines` mantığı buraya taşındı.
 *
 * - `pdfAmt`: tek bir tutarı `TL 1.234,56` veya `USD 99,00` formatına çevirir.
 * - `pdfLines`: quote'un currencyMode'una göre tek satır veya BOTH için iki satır.
 *
 * BOTH mode kuralı:
 *  - Item USD ise → [USD, TRY] (rate ile çevrilmiş)
 *  - Item TRY ise → [TRY, USD]
 *  - Rate yoksa → tek satır
 */

export interface CurrencyContext {
  /** Quote.currencyMode — "TRY" | "USD" | "BOTH" */
  mode: string;
  /** Quote.exchangeRate (USD/TRY) — null ise döviz dönüşümü atlanır */
  rate: number | null;
}

export function makeCurrencyContext(quote: QuotePdfData): CurrencyContext {
  return {
    mode: quote.currencyMode ?? "TRY",
    rate: quote.exchangeRate != null ? Number(quote.exchangeRate) : null,
  };
}

export function pdfAmt(value: number, currency: string): string {
  const n = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  return `${currency.toUpperCase() === "USD" ? "USD" : "TL"} ${n}`;
}

/**
 * Quote'un currencyMode'una göre 1 veya 2 satır döner.
 *
 * - mode "USD" → her zaman USD; item TRY ise rate ile çevrilir
 * - mode "TRY" → her zaman TRY; item USD ise rate ile çevrilir
 * - mode "BOTH" → her item için 2 satır (ana satır + diğer paritedeki karşılığı)
 */
export function pdfLines(
  ctx: CurrencyContext,
  value: number,
  itemCurrency: string,
): string[] {
  const isUsd = itemCurrency.toUpperCase() === "USD";
  const r = ctx.rate && ctx.rate > 0 ? ctx.rate : null;

  if (ctx.mode === "USD") {
    return [pdfAmt(isUsd ? value : r ? value / r : value, "USD")];
  }
  if (ctx.mode === "TRY") {
    return [pdfAmt(isUsd && r ? value * r : value, "TRY")];
  }
  // BOTH — iki bağımsız satır
  if (isUsd && r) return [pdfAmt(value, "USD"), pdfAmt(value * r, "TRY")];
  if (!isUsd && r) return [pdfAmt(value, itemCurrency), pdfAmt(value / r, "USD")];
  return [pdfAmt(value, itemCurrency)];
}

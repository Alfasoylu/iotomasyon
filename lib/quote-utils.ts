import type { QuoteCurrencyMode, QuoteStatus } from "@/types/quotes";

export function formatQuoteStatus(status: QuoteStatus) {
  return (
    {
      DRAFT: "Taslak",
      SENT: "Gönderildi",
      VIEWED: "Görüntülendi",
      WON: "Kazanıldı",
      LOST: "Kaybedildi",
      ACCEPTED: "Onaylandı",
      DECLINED: "Reddedildi",
    }[status] ?? status
  );
}

export function getQuoteStatusTone(status: QuoteStatus) {
  if (status === "WON" || status === "ACCEPTED") {
    return "success" as const;
  }

  if (status === "LOST" || status === "DECLINED") {
    return "danger" as const;
  }

  if (status === "SENT" || status === "VIEWED") {
    return "warning" as const;
  }

  return "default" as const;
}

export function formatCurrencyAmount(value: string | number, currency: string) {
  const numeric = typeof value === "number" ? value : Number(value);

  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

export function formatPercentValue(value: string | number) {
  const numeric = typeof value === "number" ? value : Number(value);
  return `%${Number.isFinite(numeric) ? numeric : 0}`;
}

export function formatQuoteCurrencyMode(mode: QuoteCurrencyMode) {
  return {
    USD: "Sadece USD",
    TRY: "Sadece TL",
    BOTH: "USD + TL",
  }[mode];
}

/**
 * Returns display strings for an amount given the quote's currency mode.
 * itemCurrency: the currency the price was entered in (e.g. "USD" or "TRY")
 * exchangeRate: TRY per 1 USD (e.g. 39.25). null means no conversion available.
 */
export function resolveDisplayAmounts(
  value: number,
  itemCurrency: string,
  mode: QuoteCurrencyMode,
  exchangeRate: number | null,
): { primary: string; secondary?: string } {
  const isUsd = itemCurrency.toUpperCase() === "USD";
  const rate = exchangeRate && exchangeRate > 0 ? exchangeRate : null;

  if (mode === "USD") {
    const usdValue = isUsd ? value : rate ? value / rate : value;
    return { primary: formatCurrencyAmount(usdValue, "USD") };
  }

  if (mode === "TRY") {
    const tryValue = isUsd && rate ? value * rate : value;
    return { primary: formatCurrencyAmount(tryValue, "TRY") };
  }

  // BOTH
  if (isUsd && rate) {
    return {
      primary: formatCurrencyAmount(value, "USD"),
      secondary: formatCurrencyAmount(value * rate, "TRY"),
    };
  }
  if (!isUsd && rate) {
    return {
      primary: formatCurrencyAmount(value, itemCurrency),
      secondary: formatCurrencyAmount(value / rate, "USD"),
    };
  }
  return { primary: formatCurrencyAmount(value, itemCurrency) };
}

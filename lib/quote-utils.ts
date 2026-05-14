import type { QuoteStatus } from "@/types/quotes";

type QuoteCurrencyMode = "USD" | "TRY" | "BOTH";

type DisplayAmountOptions = {
  currencyMode?: string | null;
  exchangeRate?: string | number | { toString(): string } | null;
};

export function formatQuoteStatus(status: QuoteStatus) {
  return (
    {
      DRAFT: "Taslak",
      SENT: "Gonderildi",
      VIEWED: "Goruntulendi",
      WON: "Kazanildi",
      LOST: "Kaybedildi",
      ACCEPTED: "Onaylandi",
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

export function resolveDisplayAmounts(
  value: string | number,
  currency: string,
  options?: DisplayAmountOptions,
) {
  const amount = typeof value === "number" ? value : Number(value);
  const normalizedAmount = Number.isFinite(amount) ? amount : 0;
  const normalizedCurrency = currency.toUpperCase() === "USD" ? "USD" : "TRY";
  const mode = normalizeCurrencyMode(options?.currencyMode);
  const exchangeRate = normalizeExchangeRate(options?.exchangeRate);

  const tryAmount =
    normalizedCurrency === "TRY"
      ? normalizedAmount
      : exchangeRate
        ? normalizedAmount * exchangeRate
        : null;
  const usdAmount =
    normalizedCurrency === "USD"
      ? normalizedAmount
      : exchangeRate
        ? normalizedAmount / exchangeRate
        : null;

  if (mode === "BOTH") {
    const usdLabel =
      usdAmount !== null
        ? `USD: ${formatCurrencyAmount(usdAmount, "USD")}`
        : `USD: ${fallbackCurrencyAmount(normalizedAmount, normalizedCurrency)}`;
    const tryLabel =
      tryAmount !== null
        ? `TRY: ${formatCurrencyAmount(tryAmount, "TRY")}`
        : `TRY: ${fallbackCurrencyAmount(normalizedAmount, normalizedCurrency)}`;

    return `${usdLabel} | ${tryLabel}`;
  }

  if (mode === "USD") {
    return usdAmount !== null
      ? formatCurrencyAmount(usdAmount, "USD")
      : fallbackCurrencyAmount(normalizedAmount, normalizedCurrency);
  }

  return tryAmount !== null
    ? formatCurrencyAmount(tryAmount, "TRY")
    : fallbackCurrencyAmount(normalizedAmount, normalizedCurrency);
}

function normalizeCurrencyMode(mode?: string | null): QuoteCurrencyMode {
  if (mode === "USD" || mode === "BOTH") {
    return mode;
  }

  return "TRY";
}

function normalizeExchangeRate(value?: string | number | { toString(): string } | null) {
  if (value === null || value === undefined) {
    return null;
  }

  const numeric =
    typeof value === "number" ? value : Number.parseFloat(value.toString().replace(",", "."));

  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

function fallbackCurrencyAmount(value: number, currency: string) {
  return formatCurrencyAmount(value, currency === "USD" ? "USD" : "TRY");
}

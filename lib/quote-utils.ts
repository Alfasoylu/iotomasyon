import type { QuoteCurrencyMode, QuoteStatus } from "@/types/quotes";

export const DEFAULT_QUOTE_TAX_RATE = 20;

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

export function normalizeDecimalInput(value: string | number | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (!value) {
    return 0;
  }

  const normalized = Number.parseFloat(String(value).replace(",", "."));
  return Number.isFinite(normalized) ? normalized : 0;
}

export function normalizeTaxRate(value: string | number | null | undefined) {
  const parsed = normalizeDecimalInput(value);
  return parsed >= 0 ? parsed : DEFAULT_QUOTE_TAX_RATE;
}

export function calculateQuoteLine(
  quantity: number,
  unitPrice: string | number,
  discount: string | number,
  taxRate: string | number,
) {
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  const safeUnitPrice = normalizeDecimalInput(unitPrice);
  const safeDiscount = Math.max(0, normalizeDecimalInput(discount));
  const safeTaxRate = Math.max(0, normalizeTaxRate(taxRate));
  const subtotal = safeQuantity * safeUnitPrice;
  const discountedBase = Math.max(0, subtotal - safeDiscount);
  const taxAmount = discountedBase * (safeTaxRate / 100);
  const total = discountedBase + taxAmount;

  return {
    quantity: safeQuantity,
    unitPrice: safeUnitPrice,
    discount: safeDiscount,
    taxRate: safeTaxRate,
    subtotal,
    discountedBase,
    taxAmount,
    total,
  };
}

export function calculateQuoteTotals(
  items: Array<{
    quantity: number;
    unitPrice: string | number;
    discount: string | number;
    tax: string | number;
  }>,
) {
  return items.reduce(
    (acc, item) => {
      const line = calculateQuoteLine(item.quantity, item.unitPrice, item.discount, item.tax);

      acc.subtotal += line.subtotal;
      acc.discountTotal += line.discount;
      acc.taxTotal += line.taxAmount;
      acc.total += line.total;

      return acc;
    },
    {
      subtotal: 0,
      discountTotal: 0,
      taxTotal: 0,
      total: 0,
    },
  );
}

export function inferTaxRateFromStored(
  quantity: number,
  unitPrice: string | number,
  discount: string | number,
  storedTaxAmount: string | number,
) {
  const safeQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  const subtotal = safeQuantity * normalizeDecimalInput(unitPrice);
  const safeDiscount = Math.max(0, normalizeDecimalInput(discount));
  const taxAmount = Math.max(0, normalizeDecimalInput(storedTaxAmount));
  const discountedBase = Math.max(0, subtotal - safeDiscount);

  if (discountedBase <= 0 || taxAmount <= 0) {
    return 0;
  }

  return Number(((taxAmount / discountedBase) * 100).toFixed(2));
}

export function getStoredTaxRateDisplay(
  quantity: number,
  unitPrice: string | number,
  discount: string | number,
  storedTaxAmount: string | number,
) {
  const taxAmount = Math.max(0, normalizeDecimalInput(storedTaxAmount));

  if (taxAmount === 0) {
    return "%0";
  }

  const inferredRate = inferTaxRateFromStored(quantity, unitPrice, discount, storedTaxAmount);
  const roundedRate = Math.round(inferredRate);

  if (
    Number.isFinite(inferredRate) &&
    roundedRate >= 0 &&
    roundedRate <= 100 &&
    Math.abs(inferredRate - roundedRate) <= 0.001
  ) {
    return formatPercentValue(roundedRate);
  }

  return null;
}

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

export function formatDisplayPair(result: { primary: string; secondary?: string }) {
  return result.secondary ? `${result.primary} / ${result.secondary}` : result.primary;
}

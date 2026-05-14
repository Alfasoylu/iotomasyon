export const QUOTE_STATUS_OPTIONS = [
  "DRAFT",
  "SENT",
  "VIEWED",
  "WON",
  "LOST",
  "ACCEPTED",
  "DECLINED",
] as const;

export type QuoteStatus = (typeof QUOTE_STATUS_OPTIONS)[number];

export const QUOTE_CURRENCY_MODE_OPTIONS = ["USD", "TRY", "BOTH"] as const;
export type QuoteCurrencyMode = (typeof QUOTE_CURRENCY_MODE_OPTIONS)[number];

export type QuoteItemFormValues = {
  productId: string;
  description: string;
  quantity: number;
  unitPrice: string;
  currency: string;
  discount: string;
  tax: string;
};

export type QuoteFormValues = {
  currencyMode: QuoteCurrencyMode;
  exchangeRate: string;
  notes: string;
  validityDate?: string;
  items: QuoteItemFormValues[];
};

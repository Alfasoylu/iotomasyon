import type { QuoteStatus } from "@/types/quotes";

export function formatQuoteStatus(status: QuoteStatus) {
  return {
    DRAFT: "Draft",
    SENT: "Sent",
    ACCEPTED: "Accepted",
    DECLINED: "Declined",
  }[status];
}

export function getQuoteStatusTone(status: QuoteStatus) {
  if (status === "ACCEPTED") {
    return "success" as const;
  }

  if (status === "DECLINED") {
    return "danger" as const;
  }

  if (status === "SENT") {
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

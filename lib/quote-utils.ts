import type { QuoteStatus } from "@/types/quotes";

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

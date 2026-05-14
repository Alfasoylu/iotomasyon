"use client";

import { useTransition } from "react";

import { updateQuoteStatusAction } from "@/lib/actions/quote-actions";
import type { QuoteStatus } from "@/types/quotes";

const TRANSITIONS: Record<QuoteStatus, Array<"SENT" | "VIEWED" | "WON" | "LOST">> = {
  DRAFT: ["SENT"],
  SENT: ["VIEWED", "WON", "LOST"],
  VIEWED: ["WON", "LOST"],
  WON: [],
  LOST: [],
  ACCEPTED: ["WON"],
  DECLINED: ["LOST"],
};

const LABELS: Record<string, string> = {
  SENT: "Gönderildi olarak işaretle",
  VIEWED: "Görüntülendi olarak işaretle",
  WON: "Kazanıldı",
  LOST: "Kaybedildi",
};

const STYLES: Record<string, string> = {
  SENT: "bg-amber-50 text-amber-900 ring-amber-200 hover:bg-amber-100",
  VIEWED: "bg-blue-50 text-blue-900 ring-blue-200 hover:bg-blue-100",
  WON: "bg-emerald-50 text-emerald-900 ring-emerald-200 hover:bg-emerald-100",
  LOST: "bg-red-50 text-red-900 ring-red-200 hover:bg-red-100",
};

export function QuoteStatusButtons({
  quoteId,
  currentStatus,
}: {
  quoteId: string;
  currentStatus: QuoteStatus;
}) {
  const [isPending, startTransition] = useTransition();
  const actions = TRANSITIONS[currentStatus] ?? [];

  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((next) => (
        <button
          key={next}
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await updateQuoteStatusAction(quoteId, next);
            })
          }
          className={`inline-flex h-9 items-center justify-center rounded-xl px-4 text-sm font-semibold ring-1 transition disabled:opacity-50 ${STYLES[next]}`}
        >
          {isPending ? "..." : LABELS[next]}
        </button>
      ))}
    </div>
  );
}

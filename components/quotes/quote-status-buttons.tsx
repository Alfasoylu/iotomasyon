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
  SENT:
    "bg-[var(--warn-dim)] text-[var(--warn)] border-[var(--warn-border)] hover:brightness-110",
  VIEWED:
    "bg-[var(--info-dim)] text-[var(--info)] border-[var(--info-border)] hover:brightness-110",
  WON:
    "bg-[var(--ok-dim)] text-[var(--ok)] border-[var(--ok-border)] hover:brightness-110",
  LOST:
    "bg-[var(--danger-dim)] text-[var(--danger)] border-[var(--danger-border)] hover:brightness-110",
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
          className={`inline-flex h-9 items-center justify-center rounded-md border px-4 text-sm font-semibold transition disabled:opacity-50 ${STYLES[next]}`}
        >
          {isPending ? "..." : LABELS[next]}
        </button>
      ))}
    </div>
  );
}
